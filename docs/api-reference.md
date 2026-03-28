# tRPC API Reference

> **Status:** Pre-implementation. This documents the planned tRPC procedures.

---

## Connection

The tRPC endpoint is at `/trpc` on the server (default `http://localhost:3001/trpc`).

All procedures use superjson for serialization. The frontend uses `@trpc/react-query`, the CLI uses `@trpc/client` directly.

---

## Authentication

Every request must include an `Authorization: Bearer <token>` header.

- **Dashboard users:** Token is a Supabase JWT (starts with `eyJ`)
- **CLI / SDK:** Token is an API key (starts with `olay_`)

See [Authentication](./auth.md) for details on both flows.

---

## Procedures

### Tasks

#### `tasks.submit`
Submit a new AI task for processing.

- **Guard:** `apiKeyProcedure('tasks:write')`
- **Caller:** CLI / SDK only

**Input:**
```typescript
{
  prompt: string              // The task prompt
  taskType: 'code_generation' | 'debugging' | 'refactoring' | 'analysis' | 'review'
  preferredModels?: string[]  // Optional model preference order
  budgetCents?: number        // Optional max cost in cents
  timeoutSeconds?: number     // Optional model call timeout (default varies by model)
  safetyOverrides?: {         // Optional per-task safety rule overrides
    allowFileDeletion?: boolean
    allowFrameworkChanges?: boolean
  }
}
```

**Response:**
```typescript
{
  taskId: string
  realtimeChannel: string     // Supabase Realtime channel for live updates
}
```

**Errors:**
- `TOO_MANY_REQUESTS` — Rate limit exceeded (includes `retryAfter` seconds)
- `FORBIDDEN` — Budget cap exceeded

---

#### `tasks.getStatus`
Get current status and metadata for a task.

- **Guard:** `authedProcedure`
- **Caller:** Both

**Input:** `{ taskId: string }`

**Response:**
```typescript
{
  id: string
  status: 'submitted' | 'routing' | 'executing' | 'completed' | 'failed' | 'cancelled'
  taskType: string
  prompt: string
  modelUsed?: string
  costCents?: number
  metadata?: {
    reasoning: string[]       // Routing decision log
  }
  diffCount: number
  createdAt: string
  completedAt?: string
}
```

---

#### `tasks.list`
List tasks for the team with pagination.

- **Guard:** `dashboardProcedure`
- **Caller:** Dashboard only

**Input:**
```typescript
{
  limit?: number              // Default 50
  offset?: number             // Default 0
  status?: string             // Filter by status
}
```

---

#### `tasks.cancel`
Cancel a task that is still in progress.

- **Guard:** `authedProcedure`
- **Caller:** Both

**Input:** `{ taskId: string }`

Only works for tasks in `submitted`, `routing`, or `executing` status. Completed and failed tasks cannot be cancelled.

---

### Diffs

#### `diffs.getForTask`
Get all diffs for a specific task.

- **Guard:** `authedProcedure`
- **Caller:** Both

**Input:** `{ taskId: string }`

**Response:** Array of diff summaries (path, operation, line counts, safety violations, status).

---

#### `diffs.getPendingForTeam`
Get all pending (unapproved) diffs across the team.

- **Guard:** `dashboardProcedure`
- **Caller:** Dashboard only

---

#### `diffs.getContent`
Get full diff content including before/after file content and unified diff hunks.

- **Guard:** `authedProcedure`
- **Caller:** Both

**Input:** `{ diffId: string }`

---

#### `diffs.approve`
Approve a single diff for application.

- **Guard:** `authedProcedure`
- **Caller:** Both

**Input:** `{ diffId: string }`

**Errors:**
- `FORBIDDEN` — Diff is blocked by safety rules. Change project settings to unblock.

---

#### `diffs.reject`
Reject a diff.

- **Guard:** `authedProcedure`
- **Input:** `{ diffId: string }`

---

#### `diffs.approveAll`
Approve all non-blocked diffs for a task.

- **Guard:** `authedProcedure`
- **Input:**
```typescript
{
  taskId: string
  skipFlagged?: boolean       // If true, skip warned diffs too
}
```

---

#### `diffs.markApplied`
Mark diffs as applied after writing to disk (called by CLI).

- **Guard:** `apiKeyProcedure('tasks:write')`
- **Caller:** CLI / SDK only

**Input:** `{ diffIds: string[] }`

---

#### `diffs.revert`
Mark diffs as reverted (called after CLI revert).

- **Guard:** `authedProcedure`
- **Input:** `{ diffIds: string[] }`

---

### Dashboard

#### `dashboard.getOverview`
Aggregated metrics for the team dashboard.

- **Guard:** `dashboardProcedure`

**Response:**
```typescript
{
  tasksToday: number
  costToday: number           // cents
  pendingDiffs: number
  failedToday: number
  recentTasks: Task[]         // Last 50 tasks
}
```

---

#### `dashboard.getCosts`
Cost breakdown for the costs page.

- **Guard:** `dashboardProcedure`

**Input:**
```typescript
{
  billingPeriod?: string      // YYYY-MM format, defaults to current month
}
```

**Response:**
```typescript
{
  monthToDate: number         // cents
  budgetCents: number
  dailyBreakdown: { date: string, model: string, costCents: number }[]
  modelBreakdown: { model: string, requests: number, tokens: number, costCents: number }[]
}
```

---

### Auth (API Key Management)

#### `auth.createApiKey`
Create a new API key for a project.

- **Guard:** `dashboardProcedure`

**Input:**
```typescript
{
  projectId: string
  name: string
  scopes: string[]
  expiresAt?: string          // ISO date, optional
}
```

**Response:**
```typescript
{
  keyId: string
  rawKey: string              // Shown ONCE — not stored, not retrievable
}
```

---

#### `auth.listApiKeys`
List API keys for the team (hashes only, never raw keys).

- **Guard:** `dashboardProcedure`

---

#### `auth.revokeApiKey`
Revoke an API key immediately.

- **Guard:** `dashboardProcedure`
- **Input:** `{ keyId: string }`

---

## Error Codes

| Code | Meaning |
|---|---|
| `UNAUTHORIZED` | Missing or invalid token |
| `FORBIDDEN` | Valid token but insufficient permissions (e.g., blocked diff approval, budget exceeded) |
| `NOT_FOUND` | Resource doesn't exist **or** caller doesn't own it |
| `TOO_MANY_REQUESTS` | Rate limit exceeded (check `retryAfter` in error data) |
| `BAD_REQUEST` | Zod validation failed on input |
| `INTERNAL_SERVER_ERROR` | Unexpected server error |

Note: `NOT_FOUND` is returned instead of `FORBIDDEN` when the resource exists but the caller doesn't own it. This prevents confirming resource existence to unauthorized callers.

---

## Rate Limiting

Rate limits are per API key, with two buckets:
- **Per-minute:** Short burst protection
- **Per-day:** Total daily usage cap

When exceeded, the error response includes `retryAfter` (seconds until the bucket resets). Rate limit state is stored in PostgreSQL (`rate_limit_buckets` table).
