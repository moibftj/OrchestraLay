// modelCallers.ts — callModel() for Anthropic, OpenAI, Perplexity

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { env } from './env.js'
import type { ModelId, Provider } from './modelRegistry.js'

export type ModelCallResult = {
  content: string
  inputTokens: number
  outputTokens: number
  durationMs: number
}

type CallInput = {
  modelId: ModelId
  provider: Provider
  prompt: string
  systemPrompt?: string
}

const TIMEOUT_MS = 120_000

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`MODEL_TIMEOUT: exceeded ${ms}ms`)), ms),
  )
  return Promise.race([promise, timeout])
}

async function callAnthropic(input: CallInput): Promise<ModelCallResult> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const start = Date.now()
  const modelMap: Record<string, string> = {
    'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
    'claude-3-haiku': 'claude-3-haiku-20240307',
  }
  const response = await withTimeout(
    client.messages.create({
      model: modelMap[input.modelId] ?? 'claude-3-5-sonnet-20241022',
      max_tokens: 8096,
      system: input.systemPrompt ?? 'You are an expert software engineer.',
      messages: [{ role: 'user', content: input.prompt }],
    }),
    TIMEOUT_MS,
  )
  const content = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs: Date.now() - start,
  }
}

async function callOpenAI(input: CallInput): Promise<ModelCallResult> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  const start = Date.now()
  const modelMap: Record<string, string> = { 'gpt-4o': 'gpt-4o', 'gpt-4o-mini': 'gpt-4o-mini' }
  const response = await withTimeout(
    client.chat.completions.create({
      model: modelMap[input.modelId] ?? 'gpt-4o',
      messages: [
        { role: 'system', content: input.systemPrompt ?? 'You are an expert software engineer.' },
        { role: 'user', content: input.prompt },
      ],
    }),
    TIMEOUT_MS,
  )
  const content = response.choices[0]?.message?.content ?? ''
  const usage = response.usage!
  return {
    content,
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    durationMs: Date.now() - start,
  }
}

async function callPerplexity(input: CallInput): Promise<ModelCallResult> {
  if (!env.PERPLEXITY_API_KEY) throw new Error('PERPLEXITY_API_KEY not set')
  const start = Date.now()
  const modelMap: Record<string, string> = {
    'perplexity-sonar-large': 'sonar-pro',
    'perplexity-sonar-small': 'sonar',
  }
  const response = await withTimeout(
    fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelMap[input.modelId] ?? 'sonar-pro',
        messages: [
          { role: 'system', content: input.systemPrompt ?? 'You are an expert software engineer.' },
          { role: 'user', content: input.prompt },
        ],
      }),
    }).then((r) => r.json()),
    TIMEOUT_MS,
  )
  const content = response.choices?.[0]?.message?.content ?? ''
  const usage = response.usage ?? {}
  return {
    content,
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    durationMs: Date.now() - start,
  }
}

export async function callModel(input: CallInput): Promise<ModelCallResult> {
  switch (input.provider) {
    case 'anthropic': return callAnthropic(input)
    case 'openai': return callOpenAI(input)
    case 'perplexity': return callPerplexity(input)
    default: throw new Error(`Unknown provider: ${input.provider}`)
  }
}
