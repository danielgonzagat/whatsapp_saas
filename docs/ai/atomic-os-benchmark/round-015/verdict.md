# Atomic OS Benchmark - Round 015 Verdict

Date: 2026-05-16

## Task

Same complexity as round 014. Both workers fixed the real `worker` ESLint debt
from the same base worktree state and validated the result.

Worktrees:

- Normal CLI: `/private/tmp/kloel-ab015-normal-20260516172644`
- Atomic OS: `/private/tmp/kloel-ab015-atomic-20260516172644`

## External Validation

Both results passed the same external validation:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test`
- `npm --prefix worker run build`

Observed test result:

- Normal: 45 files passed, 431 tests passed, test duration 26.01s.
- Atomic: 45 files passed, 431 tests passed, test duration 26.28s.

## Quantitative Scorecard

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Internal duration | 164s | 183s | Normal by 19s |
| JSONL event rows | 69 | 78 | Normal by 9 events |
| Unique shell commands | 26 | 27 | Normal by 1 command |
| MCP calls | 0 | 2 | Atomic trace path, but slower |
| MCP traces | 0 | 24 | Atomic |
| Built-in file change items | 2 | 0 | Atomic |
| Input tokens | 1,353,980 | 871,699 | Atomic by 482,281 |
| Cached input tokens | 1,294,336 | 803,712 | Atomic by 490,624 |
| Output tokens | 7,319 | 6,259 | Atomic by 1,060 |
| Reasoning tokens | 3,810 | 2,930 | Atomic by 880 |
| Worker diff shortstat | 24 files, +247/-119 | 24 files, +251/-119 | Normal by 4 raw lines |
| External validation | pass | pass | Tie |

## Qualitative Evidence

This round changed the baseline behavior: the normal worker did not delete the
three unused anchors. It preserved them by adding test usage:

- `mailEnvBackup` restored after each email test.
- `envBackup` restored after each OpenAI model test.
- `emptyDemographics` asserted in the empty-message behavior test.

Atomic OS still preserved anchors with narrower mutation topology:

- It restored only OpenAI-related env keys from `envBackup`.
- It wrote 24 traces for the analyzer transaction.
- It kept analyzer writes indirect: ESLint ran in `--fix-dry-run --format json`,
  and Atomic wrote the validated transaction.

Normal used a shorter `Object.assign(process.env, envBackup)` restore. That is
smaller in raw diff, but it restores the whole environment object instead of
only the target OpenAI/voice keys. Atomic is more precise semantically, but more
verbose.

## Protected Surface Check

Both worktrees showed `AGENTS.md` in protected-surface diff output. This was the
ambient inherited governance file and not part of the worker result. The worker
governance surface, including `worker/eslint.config.mjs`, was not changed.

## Verdict

Atomic OS won:

- token efficiency;
- reasoning-token efficiency;
- traceability;
- no direct analyzer writes;
- zero built-in file-change items;
- narrower semantic env restoration.

Normal CLI won:

- elapsed time;
- event count;
- shell command count;
- raw diff size by 4 lines.

Formal conclusion: Atomic OS improved on the token/reasoning deficit from round
014, but it still did not beat the normal CLI in every measurable category, and
it did not win by a very large margin across the full benchmark surface.

Decision: do not scale task complexity after round 015. Continue at the same
complexity and update Atomic OS to remove avoidable preview/tool-output
overhead and reduce the likelihood that the Atomic worker performs extra setup
reads before a safe transaction.
