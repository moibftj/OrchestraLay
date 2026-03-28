# CLI Guide

> **Status:** Pre-implementation. This documents the planned CLI commands.

---

## Installation

```bash
npm install -g @orchestralay/cli
```

---

## Configuration

Set your API key as an environment variable:

```bash
export ORCHESTRALAY_API_KEY=olay_your_key_here
```

Get your API key from the dashboard: sign in → Auth → Create API Key → copy the key (shown once).

By default the CLI connects to `http://localhost:3001`. Set `ORCHESTRALAY_URL` to point at a different server.

---

## Commands

### `submit` — Submit a Task

```bash
orchestralay submit \
  --prompt "Add error handling to the fetchUser function" \
  --type refactoring
```

**Flags:**

| Flag | Required | Description |
|---|---|---|
| `--prompt` | Yes | The task prompt |
| `--type` | Yes | One of: `code_generation`, `debugging`, `refactoring`, `analysis`, `review` |
| `--model` | No | Preferred model (e.g., `claude-3-5-sonnet`, `gpt-4o`) |
| `--budget` | No | Max cost in cents |
| `--timeout` | No | Model call timeout in seconds |

**Behavior:**
1. Submits the task via `tasks.submit`
2. Polls `tasks.getStatus` every 2 seconds
3. Prints the final result: model used, cost, and diff count

**Example output:**
```
✓ Task task_a3f9xx submitted
  Routing... selected claude-3-5-sonnet
  Executing...
  Completed in 4.2s

  Model:  claude-3-5-sonnet
  Cost:   12¢
  Diffs:  2 file(s) changed

  Run 'orchestralay status --task-id task_a3f9xx' for details
  Run 'orchestralay apply --task-id task_a3f9xx' to apply changes
```

---

### `status` — Check Task Status

```bash
orchestralay status --task-id task_a3f9xx
```

**Output includes:**
- Current status (`submitted`, `routing`, `executing`, `completed`, `failed`, `cancelled`)
- Model used
- Cost in cents
- Number of pending diffs
- Routing reasoning (which gates passed/failed, why the model was chosen)

---

### `apply` — Apply or Revert Diffs

```bash
# Apply approved diffs to disk
orchestralay apply --task-id task_a3f9xx

# Preview changes without writing
orchestralay apply --task-id task_a3f9xx --dry-run

# Revert previously applied changes
orchestralay apply --task-id task_a3f9xx --revert
```

**Flags:**

| Flag | Description |
|---|---|
| `--task-id` | The task to apply diffs from |
| `--dry-run` | Print what would change without writing files |
| `--revert` | Restore original file contents and mark diffs as reverted |

**Apply behavior:**
1. Fetches all approved, non-applied diffs for the task via `diffs.getForTask`
2. For each diff, fetches full content via `diffs.getContent`
3. Writes files to the current working directory (create/modify/delete)
4. Marks diffs as applied via `diffs.markApplied`

**Important:** Only approved diffs are applied. If a diff is still pending or blocked, it's skipped. Approve diffs first in the dashboard or via the API.

---

## Common Workflows

### Submit → Review → Apply

```bash
# 1. Submit a task
orchestralay submit --prompt "Refactor auth middleware to use async/await" --type refactoring

# 2. Review diffs in the dashboard at http://localhost:5173/diffs
#    Approve or reject each file change

# 3. Apply approved changes
orchestralay apply --task-id task_a3f9xx
```

### Budget-Constrained Task

```bash
# Limit cost to 10 cents — the router will prefer cheaper models
orchestralay submit \
  --prompt "Analyze this error log and suggest fixes" \
  --type debugging \
  --budget 10
```

### Specific Model

```bash
# Force claude-3-5-sonnet for code generation
orchestralay submit \
  --prompt "Add unit tests for the UserService class" \
  --type code_generation \
  --model claude-3-5-sonnet
```

### Dry Run Before Applying

```bash
# See what files would change
orchestralay apply --task-id task_a3f9xx --dry-run

# If it looks good, apply for real
orchestralay apply --task-id task_a3f9xx
```

### Undo Applied Changes

```bash
# Revert all applied diffs back to their original content
orchestralay apply --task-id task_a3f9xx --revert
```

---

## Error Messages

| Error | Cause | Fix |
|---|---|---|
| `UNAUTHORIZED` | Missing or invalid API key | Check `ORCHESTRALAY_API_KEY` is set and valid |
| `TOO_MANY_REQUESTS` | Rate limit exceeded | Wait for `retryAfter` seconds |
| `FORBIDDEN: Budget exceeded` | Team or project budget cap hit | Increase budget in dashboard settings |
| `No approved diffs to apply` | No diffs are approved for this task | Review and approve diffs in the dashboard first |
