# Round 012 Verdict - Worker ESLint Debt

Date: 2026-05-16

Task: fix real `worker/**` ESLint debt from the same isolated HEAD using two simultaneous Codex workers.

## Result

Both lanes reached the same external acceptance gate:

- `npm --prefix worker run lint:check`: passed
- `npm --prefix worker run typecheck`: passed
- `git diff --check -- worker`: passed
- `npm --prefix worker test`: passed, 45 files / 431 tests
- `npm --prefix worker run build`: passed

## Benchmark

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Worker duration | 141s | 108s | Atomic, 23.4% faster |
| Event rows | 56 | 41 | Atomic, 26.8% fewer |
| Unique shell commands | 21 | 14 | Atomic, 33.3% fewer |
| Unique atomic MCP calls | 0 | 1 | Atomic, single transaction |
| Input tokens | 618,211 | 573,845 | Atomic, 7.2% fewer |
| Output tokens | 4,611 | 4,151 | Atomic, 10.0% fewer |
| Reasoning tokens | 2,097 | 2,116 | Normal, 19 fewer |
| Direct `file_change` events | 2 | 0 | Atomic |
| Worker diff | 24 files, +245/-126 | 24 files, +255/-119 | Mixed |
| Total raw diff lines | 371 | 374 | Normal, 3 fewer |
| Deletions | 126 | 119 | Atomic, 7 fewer |
| Trace proof | 0 | 24 worktree traces | Atomic |

## Quality Comparison

Atomic wins preservation quality:

- Preserved `emptyDemographics` by adding a behavior assertion in the empty-message test.
- Preserved `mailEnvBackup` with an `afterEach` restore.
- Preserved `envBackup` without replacing the whole `process.env` object.
- Produced 24 local trace files for the transaction.
- Performed no direct Codex file writes.

Normal wins two narrow raw metrics:

- 19 fewer reasoning tokens.
- 3 fewer raw diff lines, but this came from deleting `emptyDemographics` and using broader environment restoration.

## Decision

Atomic OS won the important product and operational fronts in this round: speed, commands, event volume, input/output tokens, direct-write avoidance, traceability, deletion reduction, and semantic preservation.

Do not scale complexity yet. The loop rule requires a very large Atomic win in every meaningful measurable category. Round 012 still has a tiny Normal win in reasoning tokens and raw diff size.

## Atomic OS Update Applied After Verdict

The Atomic OS fixer was updated to reduce generated diff surface while preserving the same intent:

- `scripts/mcp/atomic-edit/server.ts`: `applyOpenAiEnvBackupResidueFix` now emits a shorter `Object.entries(envBackup).forEach(...)` restore.
- `scripts/mcp/atomic-edit/smoke.ts`: smoke now asserts the concise form and rejects reintroducing the `value === undefined` branch.

Validation after the update:

- `node scripts/mcp/atomic-edit/build.mjs`: passed
- `npx tsx scripts/mcp/atomic-edit/smoke.ts`: 98 passed, 0 failed
- `git diff --check -- scripts/mcp/atomic-edit/server.ts scripts/mcp/atomic-edit/smoke.ts scripts/mcp/atomic-edit/symbols.ts scripts/mcp/atomic-edit/trace.ts`: passed

Next loop action: repeat the same complexity level before escalating.
