#!/usr/bin/env node

import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { AppRouter } from '../server/routers/index.js'

// ─── Config ──────────────────────────────────────────────────────────────────

const API_URL = process.env.ORCHESTRALAY_API_URL ?? 'http://localhost:3001'
const API_KEY = process.env.ORCHESTRALAY_API_KEY ?? ''
const POLL_INTERVAL_MS = 2000

if (!API_KEY) {
  process.stderr.write('Error: ORCHESTRALAY_API_KEY is not set.\nExport it: export ORCHESTRALAY_API_KEY=olay_...\n')
  process.exit(1)
}

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      transformer: superjson,
      headers: { Authorization: `Bearer ${API_KEY}` },
    }),
  ],
})

// ─── Arg parser ──────────────────────────────────────────────────────────────

type ParsedArgs = {
  flags: Record<string, string | boolean>
  positional: string[]
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []
  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (!arg) {
      i++
      continue
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i += 2
      } else {
        flags[key] = true
        i++
      }
    } else {
      positional.push(arg)
      i++
    }
  }
  return { flags, positional }
}

function flag(flags: Record<string, string | boolean>, key: string): string | undefined {
  const val = flags[key]
  return typeof val === 'string' ? val : undefined
}

function boolFlag(flags: Record<string, string | boolean>, key: string): boolean {
  return flags[key] === true || flags[key] === 'true'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clearLine() { process.stderr.write('\r\x1b[K') }
function log(...args: unknown[]) { process.stderr.write(args.join(' ') + '\n') }
function out(obj: unknown) { process.stdout.write(JSON.stringify(obj) + '\n') }

function formatCost(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toFixed(4)}`
}

const TASK_TYPES = ['code_generation', 'debugging', 'refactoring', 'analysis', 'review'] as const
type TaskType = typeof TASK_TYPES[number]

function assertTaskType(s: string): asserts s is TaskType {
  if (!TASK_TYPES.includes(s as TaskType)) {
    log(`Error: --type must be one of: ${TASK_TYPES.join(', ')}`)
    process.exit(1)
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdSubmit(flags: Record<string, string | boolean>) {
  const prompt = flag(flags, 'prompt')
  const taskType = flag(flags, 'type')
  const preferredModel = flag(flags, 'model')
  const budgetCap = flag(flags, 'budget')

  if (!prompt) { log('Error: --prompt is required'); process.exit(1) }
  if (!taskType) { log('Error: --type is required'); process.exit(1) }
  assertTaskType(taskType)

  log(`Submitting ${taskType} task…`)

  let taskId: string
  try {
    const result = await client.tasks.submit.mutate({
      prompt,
      taskType,
      preferredModel,
      budgetCapCents: budgetCap ? parseInt(budgetCap, 10) : undefined,
    })
    taskId = result.taskId
    log(`Task submitted: ${taskId}`)
  } catch (e: unknown) {
    log('Error submitting task:', e instanceof Error ? e.message : String(e))
    process.exit(1)
  }

  // Poll until terminal state
  const terminal = new Set(['completed', 'failed', 'cancelled'])
  let dots = 0
  while (true) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    try {
      const task = await client.tasks.get.query({ taskId })
      const spinner = ['-', '\\', '|', '/'][dots % 4]
      dots++
      const modelInfo = task.modelId ? ` [${task.modelId}]` : ''
      clearLine()
      process.stderr.write(`${spinner} ${task.status}${modelInfo}`)

      if (terminal.has(task.status)) {
        clearLine()
        if (task.status === 'completed') {
          log(`✅  Completed  model=${task.modelId ?? '—'}  cost=${formatCost(task.totalCostCents)}`)
          out({ taskId, status: 'completed', modelId: task.modelId, costCents: task.totalCostCents })
          process.exit(0)
        } else {
          log(`❌  ${task.status}  ${task.errorMessage ?? ''}`)
          out({ taskId, status: task.status, error: task.errorMessage })
          process.exit(1)
        }
      }
    } catch (e: unknown) {
      clearLine()
      log('Poll error:', e instanceof Error ? e.message : String(e))
    }
  }
}

async function cmdStatus(flags: Record<string, string | boolean>) {
  const taskId = flag(flags, 'task-id')
  if (!taskId) { log('Error: --task-id is required'); process.exit(1) }

  try {
    const task = await client.tasks.get.query({ taskId })
    log(`Task ID   : ${task.id}`)
    log(`Status    : ${task.status}`)
    log(`Type      : ${task.taskType}`)
    log(`Model     : ${task.modelId ?? '—'}`)
    log(`Cost      : ${formatCost(task.totalCostCents)}`)
    log(`Created   : ${new Date(task.createdAt).toLocaleString()}`)
    if (task.errorMessage) log(`Error     : ${task.errorMessage}`)
    if (task.metadata && (task.metadata as Record<string, unknown>).routingReasoning) {
      log('\nRouting decisions:')
      const reasoning = (task.metadata as Record<string, string[]>).routingReasoning
      if (reasoning) {
        for (const line of reasoning) log(`  · ${line}`)
      }
    }
    out(task)
  } catch (e: unknown) {
    log('Error:', e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}

async function cmdApply(flags: Record<string, string | boolean>) {
  const taskId = flag(flags, 'task-id')
  const dryRun = boolFlag(flags, 'dry-run')
  const revert = boolFlag(flags, 'revert')

  if (!taskId) { log('Error: --task-id is required'); process.exit(1) }

  try {
    const diffsResult = await client.diffs.forTask.query({ taskId })

    if (revert) {
      // Revert: find applied diffs
      const applied = diffsResult.filter((d) => d.status === 'applied')
      if (applied.length === 0) { log('No applied diffs to revert.'); process.exit(0) }
      log(`Reverting ${applied.length} diff(s)…`)

      for (const d of applied) {
        if (dryRun) {
          log(`  [dry-run] would revert ${d.filePath}`)
          continue
        }
        // Mark as reverted and delete the file (for creates) or restore (from before content in unifiedDiff)
        await client.diffs.markReverted.mutate({ diffId: d.id })
        if (d.operation === 'create') {
          try { await fs.unlink(d.filePath) } catch { /* already gone */ }
          log(`  ↩  deleted ${d.filePath}`)
        } else {
          log(`  ↩  reverted ${d.filePath} (restore from backup not available in CLI — use git)`)
        }
      }

      if (!dryRun) log(`✅  Reverted ${applied.length} diff(s)`)
      process.exit(0)
    }

    // Apply: find approved diffs
    const approved = diffsResult.filter((d) => d.status === 'approved')
    const pending = diffsResult.filter((d) => d.status === 'pending')
    const blocked = diffsResult.filter((d) => d.status === 'blocked')

    if (blocked.length > 0) {
      log(`⚠️  ${blocked.length} diff(s) are blocked by safety rules and will be skipped.`)
    }
    if (pending.length > 0) {
      log(`ℹ️  ${pending.length} diff(s) are still pending approval. Approve them in the dashboard first.`)
    }
    if (approved.length === 0) {
      log('No approved diffs to apply.')
      process.exit(0)
    }

    log(`${dryRun ? '[dry-run] ' : ''}Applying ${approved.length} diff(s)…`)
    const appliedIds: string[] = []

    for (const d of approved) {
      if (dryRun) {
        log(`  [dry-run] ${d.operation.toUpperCase()} ${d.filePath}`)
        continue
      }

      try {
        if (d.operation === 'delete') {
          await fs.unlink(d.filePath)
          log(`  🗑  deleted ${d.filePath}`)
        } else {
          // Extract after-content from unified diff (lines starting with + not +++)
          if (!d.unifiedDiff) {
            log(`  ⚠️  skipped ${d.filePath}: no unified diff`)
            continue
          }
          const afterLines = d.unifiedDiff
            .split('\n')
            .filter((l: string) => l.startsWith('+') && !l.startsWith('+++'))
            .map((l: string) => l.slice(1))
          const content = afterLines.join('\n')

          await fs.mkdir(path.dirname(path.resolve(d.filePath)), { recursive: true })
          await fs.writeFile(path.resolve(d.filePath), content, 'utf-8')
          log(`  ✏️  ${d.operation === 'create' ? 'created' : 'modified'} ${d.filePath}`)
        }
        appliedIds.push(d.id)
      } catch (e: unknown) {
        log(`  ❌  failed to apply ${d.filePath}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // Mark applied in DB
    if (!dryRun && appliedIds.length > 0) {
      for (const diffId of appliedIds) {
        await client.diffs.markApplied.mutate({ diffId })
      }
      log(`✅  Applied ${appliedIds.length} diff(s)`)
    }

    out({ taskId, applied: appliedIds.length, dryRun })
    process.exit(0)
  } catch (e: unknown) {
    log('Error:', e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

const [,, command, ...rest] = process.argv
const { flags } = parseArgs(rest)

const USAGE = `
Usage: orchestralay <command> [options]

Commands:
  submit    Submit a task and poll until complete
  status    Check task status
  apply     Apply or revert approved diffs to disk

Options for submit:
  --prompt <text>     Task prompt (required)
  --type <type>       Task type: code_generation|debugging|refactoring|analysis|review (required)
  --model <id>        Preferred model (optional)
  --budget <cents>    Max cost cap in cents (optional)

Options for status:
  --task-id <id>      Task ID (required)

Options for apply:
  --task-id <id>      Task ID (required)
  --dry-run           Preview without writing files
  --revert            Revert previously applied diffs

Environment:
  ORCHESTRALAY_API_KEY    Your API key (required)
  ORCHESTRALAY_API_URL    Server URL (default: http://localhost:3001)
`.trim()

if (!command || command === '--help' || command === '-h') {
  log(USAGE)
  process.exit(0)
}

switch (command) {
  case 'submit': cmdSubmit(flags).catch((e) => { log(String(e)); process.exit(1) }); break
  case 'status': cmdStatus(flags).catch((e) => { log(String(e)); process.exit(1) }); break
  case 'apply':  cmdApply(flags).catch((e)  => { log(String(e)); process.exit(1) }); break
  default:
    log(`Unknown command: ${command}\n`)
    log(USAGE)
    process.exit(1)
}
