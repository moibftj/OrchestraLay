# Model Routing Engine

> **Status:** Pre-implementation. This document describes how the 6-gate routing engine will work.

---

## How Model Selection Works

Every task runs through a 6-gate decision pipeline. Each gate **eliminates** candidates — no gate ever adds a model back. The first model still standing after all gates wins.

```
Input: task type, prompt tokens, budget, preferred models
                │
     ┌──────────▼──────────┐
     │  Gate 1: Preference │  Use --model flag or default ranking
     └──────────┬──────────┘
     ┌──────────▼──────────┐
     │  Gate 2: Budget     │  Remove models that would exceed budget
     └──────────┬──────────┘
     ┌──────────▼──────────┐
     │  Gate 3: Health     │  Remove circuit-broken models
     └──────────┬──────────┘
     ┌──────────▼──────────┐
     │  Gate 4: Concurrency│  Remove models at max concurrent requests
     └──────────┬──────────┘
     ┌──────────▼──────────┐
     │  Gate 5: Select     │  First remaining candidate wins
     └──────────┬──────────┘
     ┌──────────▼──────────┐
     │  Gate 6: Return     │  Output: selected model + fallback chain
     └────────────────────┘
```

### Safety nets

Gates 2, 3, and 4 each have a safety net: if **all** candidates are eliminated, the gate keeps the best option anyway rather than failing the task entirely.

- **Budget gate:** Keeps the cheapest model if all exceed budget
- **Health gate:** Keeps the first model even if circuit-broken (fail gracefully, not silently)
- **Concurrency gate:** Keeps the first model even if at limit

---

## Supported Models

| Model | Provider | Best For | Input $/1M | Output $/1M |
|---|---|---|---|---|
| claude-3-5-sonnet | Anthropic | Code generation, refactoring, review | $3.00 | $15.00 |
| claude-3-haiku | Anthropic | Fast debugging, low-cost tasks | $0.25 | $1.25 |
| gpt-4o | OpenAI | Analysis, debugging, review | $2.50 | $10.00 |
| gpt-4o-mini | OpenAI | Budget analysis | $0.15 | $0.60 |
| perplexity-sonar-pro | Perplexity | Web-grounded analysis | $3.00 | $15.00 |
| perplexity-sonar | Perplexity | Budget analysis | $0.80 | $0.80 |

Each model has a `strengths[]` list. The default ranking per task type is:

| Task Type | Default Model Order |
|---|---|
| `code_generation` | claude-3-5-sonnet → gpt-4o → claude-3-haiku |
| `debugging` | claude-3-haiku → gpt-4o → claude-3-5-sonnet |
| `refactoring` | claude-3-5-sonnet → gpt-4o → gpt-4o-mini |
| `analysis` | gpt-4o → perplexity-sonar-pro → gpt-4o-mini |
| `review` | claude-3-5-sonnet → gpt-4o → claude-3-haiku |

---

## Influencing Model Selection

### Explicit model preference
```bash
orchestralay submit --model claude-3-5-sonnet --prompt "..."
```
This sets Gate 1 to use your specified model first. It can still be overridden by budget, health, or concurrency gates.

### Budget cap
```bash
orchestralay submit --budget 50 --prompt "..."
```
Budget is in cents. Gate 2 removes any model whose estimated cost exceeds this. Cost estimation uses pre-measured average output token counts per task type.

### No preference (default)
Without `--model` or `--budget`, the engine uses the default ranking for your task type and selects the top-ranked available model.

---

## Failover

If the selected model fails mid-execution (timeout, API error, rate limit), the engine automatically retries with the next model in the fallback chain.

```
Selected: claude-3-5-sonnet
Fallback chain: [gpt-4o, claude-3-haiku]

claude-3-5-sonnet fails (timeout)
  → circuit breaker records failure
  → try gpt-4o
  → gpt-4o succeeds → task completes

If all models in fallback chain fail → task status = 'failed'
```

The dashboard and CLI both show which model ultimately ran the task and why.

---

## Circuit Breaker

Each model has an in-memory circuit breaker:
- **Threshold:** 3 consecutive failures opens the circuit
- **Cooldown:** 60 seconds before the model is tried again
- **Reset:** Resets on server restart (state is not persisted)

When a circuit is open, Gate 3 removes that model from candidates. A success at any point resets the failure count.

---

## Viewing Routing Decisions

Every routing decision is stored in `tasks.metadata.reasoning[]`. You can see it:

- **Dashboard:** Task detail view shows the reasoning array
- **CLI:** `orchestralay status --task-id <id>` prints routing reasoning
- **API:** `tasks.getStatus` returns `metadata.reasoning`

Example reasoning:
```json
[
  "Gate 1: Using default ranking for code_generation",
  "Gate 2: All 3 candidates within budget (50¢)",
  "Gate 3: gpt-4o circuit open, removed",
  "Gate 4: All candidates below concurrency limit",
  "Gate 5: Selected claude-3-5-sonnet",
  "Fallback chain: [claude-3-haiku]"
]
```

---

## Cost Estimation vs Actual Cost

- **Estimated cost** is calculated before the model call using average output token counts per task type. Used by Gate 2 and budget guard.
- **Actual cost** is calculated after the model call using real token counts from the API response. This is what's stored in `cost_logs` and shown in the dashboard.

Both are in integer cents, using `Math.ceil()` to avoid rounding down.
