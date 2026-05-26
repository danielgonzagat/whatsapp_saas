# Atomic OS Benchmark - Round 014 Verdict

Date: 2026-05-16

## Task

Both workers received the same real workspace task:

- Fix the current `worker` ESLint debt without touching governance/protected
  surfaces.
- Validate with worker lint, typecheck, diff-check, tests, and build.
- Preserve existing behavior and avoid fake bypasses.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab14-normal-20260516171454`
- Atomic OS: `/private/tmp/kloel-ab14-atomic-20260516171454`

## External Validation

Both results passed the same external validation from outside the workers:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed test result:

- Normal: 45 files passed, 431 tests passed, test duration 27.02s.
- Atomic: 45 files passed, 431 tests passed, test duration 27.33s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Internal duration | 141s | 144s | Normal by 3s |
| JSONL event rows | 51 | 39 | Atomic by 12 events |
| Unique shell commands | 18 | 13 | Atomic by 5 commands |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 2 | 0 | Atomic |
| Input tokens | 1,172,645 | 910,807 | Atomic by 261,838 |
| Cached input tokens | 1,078,912 | 828,800 | Atomic by 250,112 |
| Output tokens | 4,341 | 3,728 | Atomic by 613 |
| Reasoning tokens | 1,522 | 1,734 | Normal by 212 |
| Worker diff shortstat | 24 files, +235/-134 | 24 files, +251/-119 | Mixed |
| Raw changed lines | 369 | 370 | Normal by 1 |
| Deleted lines | 134 | 119 | Atomic by 15 |
| External validation | pass | pass | Tie |

## Qualitative Evidence

The normal worker passed validation, but it removed preservation anchors that
the task did not require deleting:

- `worker/test/channel-dispatcher.spec.ts`: removed `mailEnvBackup`.
- `worker/test/openai-models.spec.ts`: removed `envBackup`.
- `worker/test/opportunity-heuristic.spec.ts`: removed `emptyDemographics`.

The Atomic worker preserved those anchors and converted them into behavior
proof:

- Added `afterEach` mail environment restoration using `mailEnvBackup`.
- Added `afterEach` OpenAI environment restoration using `envBackup`.
- Added a `demographics` assertion using `emptyDemographics`.

This is closer to the Atomic principle: preserve what does not belong to the
change intention, mutate the smallest necessary surface, and turn questionable
unused fixtures into explicit behavior proof instead of deleting them.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This is the
ambient worktree governance file inherited by the benchmark setup, not part of
the `worker` task result. Neither worker changed protected worker governance
files such as `worker/eslint.config.mjs`.

## Verdict

Atomic OS won most operational and trust metrics:

- fewer events;
- fewer commands;
- fewer input/output tokens;
- fewer deletions;
- zero built-in file-change items;
- 24 structured traces;
- better preservation of existing behavioral anchors.

Normal CLI still won or tied enough important categories to block escalation:

- internal duration was 3 seconds faster;
- reasoning-token usage was lower by 212 tokens;
- raw changed-line total was 1 line smaller;
- external product validation was tied.

Formal conclusion: Atomic OS is better in preservation, traceability, command
surface, output surface, input tokens, and qualitative behavior proof, but it
did not beat the normal CLI in every measurable category, and the positive
margin is not "muito superior" across all dimensions.

Decision: do not scale task complexity after round 014. Continue the loop at
the same complexity and update Atomic OS to reduce remaining latency,
reasoning overhead, and raw diff overhead while keeping the preservation win.
