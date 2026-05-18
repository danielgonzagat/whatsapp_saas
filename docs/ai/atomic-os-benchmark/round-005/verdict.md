# Atomic OS Benchmark - Round 005 Verdict

Date: 2026-05-16
Coordinator workspace: `/Users/danielpenin/whatsapp_saas`

## Task

Same mission for both workers: fix real `worker` package lint debt from an isolated checkout, then prove package health.

Baseline in both lanes:

- `npm --prefix worker run lint:check`: failed with 88 errors.
- Initial dirty state included pre-existing `AGENTS.md`; workers were instructed not to touch it.

## Worktrees

- Normal CLI lane: `/private/tmp/kloel-ab5-normal-20260516152342`
- Atomic OS lane: `/private/tmp/kloel-ab5-atomic-20260516152342`

## Fresh Coordinator Validation

Both lanes passed the same external validation after worker completion:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`

External Vitest result in both lanes:

- 45 test files passed.
- 431 tests passed.

## Completion Metrics

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Worker elapsed time | 141s | 210s | Normal |
| Event lines | 64 | 87 | Normal |
| Parsed JSON event lines | 62 | 85 | Normal |
| Command items | 44 | 42 | Atomic |
| Completed command items | 20 | 19 | Atomic |
| MCP tool calls | 0 | 28 | Normal on overhead, Atomic on proof trail |
| Input tokens | 651,153 | 1,664,225 | Normal |
| Cached input tokens | 560,512 | 1,575,168 | Normal |
| Output tokens | 6,068 | 7,992 | Normal |
| Reasoning tokens | 2,885 | 4,204 | Normal |
| Files changed under `worker/**` | 24 | 24 | Tie |
| Diff shortstat | 235 insertions / 134 deletions | 246 insertions / 119 deletions | Mixed |
| Total changed lines | 369 | 365 | Atomic by 4 lines |
| Worker diff hash | `7530d88c249010adad97c0af8f38e89a3ee6b2032be0412a10e1ca9be903bb69` | `925b8ce48678a58f3117c0eb94fba0202c2c437260aab7491e12a6ff99e67327` | Different semantic choices |

## Quality Comparison

Normal CLI:

- Completed faster.
- Used fewer tokens.
- Produced fewer event lines.
- Used `eslint --fix` and direct patching for the remaining unused declarations.
- Removed the env backup and demographics fixture variables to satisfy lint.

Atomic OS:

- Completed successfully using only atomic MCP writes.
- Recovered from an initial tool refusal without coordinator interference.
- Preserved useful test fixture intent:
  - `mailEnvBackup` became an `afterEach` restore path.
  - `envBackup` became an `afterEach` restore path.
  - `emptyDemographics` became an explicit assertion.
- Produced exact MCP traces and protected-file checks for write operations.
- Used fewer command items, but only by a small margin and with much higher token/tool overhead.

## Atomic Tool Defects Observed

1. `atomic_apply_eslint_dry_run_fixes` rejected absolute `allowedPaths`.
   - Worker used `cwd` as absolute worktree path.
   - ESLint proposals were normalized as repo-relative `worker/...`.
   - The tool compared those proposals against absolute `allowedPaths` and refused the transaction.
   - Worker recovered by retrying with `allowedPaths: ["worker"]`.

2. `code_read_symbol` could not target the nested `emptyDemographics` variable.
   - Worker used `code_outline` full text plus `atomic_replace_text` instead.
   - This is not fatal, but it increases navigation cost for nested/local symbols.

## Formal Winners

Normal CLI wins:

- Speed: 141s vs 210s.
- Token economy: about 2.56x less input tokens and 1.32x less output tokens.
- Reasoning economy: about 1.46x fewer reasoning tokens.
- Log compactness: 64 event lines vs 87.
- Operational simplicity for this lint cleanup class.

Atomic OS wins:

- Write-path discipline: all code mutations went through atomic MCP.
- Traceability and exact operation proof.
- Protection behavior: tool refused an unsafe/ambiguous path condition.
- Semantic cleanup quality in tests: preserved state restoration intent instead of deleting fixture variables.
- Slightly lower total changed-line count: 365 vs 369.
- Slightly fewer shell command items.

Ties:

- Final behavior proof: both passed lint, typecheck, diff-check, and tests.
- File count under `worker/**`: 24 each.
- Protected file preservation by each worker: `AGENTS.md` remained pre-existing and untouched by the workers.

## Verdict

Atomic OS did not beat Normal CLI with a large margin. It won on safety, traceability, and semantic preservation, but lost the main efficiency benchmarks: elapsed time, token cost, event volume, and overall operational overhead.

Per the loop rule, complexity must not be increased.

## Required Atomic OS Update Before Next Round

Fix the analyzer transaction path contract:

- `atomic_apply_eslint_dry_run_fixes` must accept absolute `allowedPaths` inside the resolved repo/worktree.
- It should normalize both absolute and repo-relative `allowedPaths` to the same internal comparison domain.
- The smoke suite must cover this exact case.

Secondary improvement candidate:

- Improve local/nested symbol discovery so `code_read_symbol` can find block-scoped variable declarations such as `emptyDemographics`, or provide a narrower local-symbol browse operation.

## Next Loop Action

Do not scale difficulty. Repeat the same worker lint mission after the `allowedPaths` fix and measure again.
