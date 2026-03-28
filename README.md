# OrchestraLay

Route AI tasks to Claude, GPT-4o, or Perplexity. See exactly what each call costs. Approve every code change before it touches your files.

---

## The problem

AI coding agents on Replit and Vercel are unpredictable — they break things unexpectedly and burn through budgets without warning. OrchestraLay puts you back in control: it picks the right model for each task, shows you the cost down to fractions of a cent, and requires your approval on every file change before anything is applied.

---

## How it works

1. You submit a task via CLI or API with a prompt, task type, and optional budget cap
2. OrchestraLay routes to the best available model based on cost, health, and task type
3. If a model fails, it automatically fails over to the next best option
4. Every file change is shown as a diff preview — flagged if it looks dangerous
5. You approve, then run `apply` to write changes to disk

---

## Stack

Node 20 · Express · tRPC · Drizzle ORM · Supabase PostgreSQL · pg-boss · Vite · React 19 · Wouter · TailwindCSS · Railway

---

## Quick start
```bash
# 1. Clone and install
git clone https://github.com/your-org/orchestralay
cd orchestralay
npm install

# 2. Set up environment
cp .env.example .env
# Fill in SUPABASE_URL, DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY, PERPLEXITY_API_KEY

# 3. Run database migrations
npm run db:migrate

# 4. Start development server
npm run dev
```

Open `http://localhost:5173` → sign up → copy your API key.

---

## CLI
```bash
# Install globally or use npx
npm install -g @orchestralay/cli

# Submit a task
ORCHESTRALAY_API_KEY=olay_xxx orchestralay submit \
  --prompt "Refactor this function to use async/await" \
  --type refactoring

# Check task status
orchestralay status --task-id task_a3f9xx

# Apply approved diffs to disk
orchestralay apply --task-id task_a3f9xx

# Preview without writing
orchestralay apply --task-id task_a3f9xx --dry-run
```

---

## Dashboard

Three views:

**Overview** — live task feed showing status, model used, and cost per task. Updates in real time via Supabase Realtime.

**Costs** — 7-day spend chart broken down by model, month-to-date total against your plan budget, per-model token and cost breakdown.

**Diff review** — every pending file change across all projects. Approve individually or bulk-approve all safe diffs. Blocked diffs (safety rule violations) require manual review.

---

## Supported models

| Model | Best for | Cost |
|---|---|---|
| claude-3-5-sonnet | Code generation, refactoring, review | $3.00 / $15.00 per 1M tokens |
| gpt-4o | Analysis, debugging | $2.50 / $10.00 per 1M tokens |
| perplexity-sonar-pro | Web-grounded analysis | $3.00 / $15.00 per 1M tokens |
| claude-3-haiku | Fast debugging, low cost | $0.25 / $1.25 per 1M tokens |
| gpt-4o-mini | Budget analysis | $0.15 / $0.60 per 1M tokens |
| perplexity-sonar | Budget analysis | $0.80 / $0.80 per 1M tokens |

The router selects automatically. Override with `--model claude-3-5-sonnet`.

---

## Pricing

| Plan | Price | Tokens | Team seats |
|---|---|---|---|
| Starter | $29/mo | 500k | 1 |
| Pro | $99/mo | 2M | 5 |
| Enterprise | Custom | Unlimited | Unlimited |

7-day free trial. Overage billed at $0.002 per 1k tokens — no hard blocks.

---

## Safety rules

OrchestraLay blocks diffs that attempt to:

- Modify `.env` files or lockfiles
- Delete files (configurable per project)
- Change framework config files (`package.json`, `tsconfig.json`, etc.)
- Delete test files
- Match paths in your custom blocklist
- Introduce hardcoded secrets or API keys

Blocked diffs cannot be approved via API — they require a human to review and update project safety settings.

---

## Environment variables

See `.env.example` for the full list. Required to start: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `ALLOWED_ORIGINS`.

---

## Architecture

See [AGENTS.md](./AGENTS.md) for the complete architecture reference including data flow, layer boundaries, database schema, and design decisions.

For Claude Code and AI agent instructions see [CLAUDE.md](./CLAUDE.md).

---

## License

MIT
