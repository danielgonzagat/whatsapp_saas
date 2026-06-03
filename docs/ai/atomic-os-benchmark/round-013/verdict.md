# Round 013 Verdict - Worker ESLint Debt Repeat

Date: 2026-05-16

Task: repeat the same worker ESLint debt cleanup after the Round 012 Atomic OS update.

## Result

Both lanes passed the same external validation gate:

- `npm --prefix worker run lint:check`: passed
- `npm --prefix worker run typecheck`: passed
- `git diff --check -- worker`: passed
- `npm --prefix worker test`: passed, 45 files / 431 tests
- `npm --prefix worker run build`: passed

## Benchmark

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Worker duration | 146s | 121s | Atomic, 17.1% faster |
| Event rows | 62 | 42 | Atomic, 32.3% fewer |
| Unique shell commands | 23 | 14 | Atomic, 39.1% fewer |
| Unique atomic MCP calls | 0 | 1 | Atomic, single transaction |
| Input tokens | 1,054,008 | 536,288 | Atomic, 49.1% fewer |
| Output tokens | 5,590 | 3,737 | Atomic, 33.1% fewer |
| Reasoning tokens | 2,563 | 2,047 | Atomic, 20.1% fewer |
| Direct `file_change` events | 2 | 0 | Atomic |
| Worker diff | 24 files, +246/-126 | 24 files, +251/-119 | Atomic by total lines |
| Total raw diff lines | 372 | 370 | Atomic, 2 fewer |
| Deletions | 126 | 119 | Atomic, 7 fewer |
| Trace proof | 0 | 24 worktree traces | Atomic |

## Quality Comparison

Atomic wins quality:

- Preserved `emptyDemographics` by asserting empty-message demographics instead of deleting the fixture.
- Preserved `mailEnvBackup` with `afterEach` restoration.
- Preserved `envBackup` with targeted OpenAI/voice env restoration.
- Produced 24 trace artifacts in the atomic worktree.
- Avoided direct file-write events.

Normal reached green but still lost quality:

- Deleted `emptyDemographics`.
- Used a broader `Object.assign(process.env, envBackup)` restore in `openai-models.spec.ts`.
- Required manual post-autofix inspection and direct file changes.

## Decision

Atomic OS won every measured category in Round 013, including the categories it previously lost: reasoning tokens and raw diff total.

Do not scale complexity yet. The user's loop requires a very large superiority margin before escalation. The Atomic win on raw diff size is real but small: 2 total lines. Continue at this complexity once more after tightening Atomic output/transaction reporting, then escalate only if the margin is broadly large and repeatable.
