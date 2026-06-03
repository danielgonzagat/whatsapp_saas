# Atomic OS A/B Benchmark - Round 006

Date: 2026-05-16

## Task

Same-complexity repeat of the worker lint-debt mission after the Round 005
Atomic OS path-contract fix.

Both agents started from isolated worktrees created from the same repository
HEAD and were asked to fix the same real worker lint debt while preserving
existing repository governance boundaries.

## Worktrees

- Normal CLI: `/private/tmp/kloel-ab6-normal-20260516153315`
- Atomic OS: `/private/tmp/kloel-ab6-atomic-20260516153315`

## Outcome

Both lanes completed the task and passed the same external verification:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test` (`45` files / `431` tests)
- `npm --prefix worker run build`

## Metrics

| Metric | Normal CLI | Atomic OS | Winner |
| --- | ---: | ---: | --- |
| Wall-clock worker time | 240s | 175s | Atomic OS |
| Event log lines | 96 | 90 | Atomic OS |
| Command executions | 74 | 58 | Atomic OS |
| MCP calls | 0 | 18 | Normal CLI on call count, Atomic OS by required trace surface |
| Input tokens | 1,703,945 | 1,113,464 | Atomic OS |
| Cached input tokens | 1,622,784 | 1,031,936 | Atomic OS |
| Output tokens | 9,137 | 8,617 | Atomic OS |
| Reasoning tokens | 4,288 | 4,344 | Normal CLI |
| Files changed | 24 | 24 | Tie |
| Insertions | 259 | 246 | Atomic OS |
| Deletions | 119 | 119 | Tie |
| Total changed lines | 378 | 365 | Atomic OS |
| Final verification | Pass | Pass | Tie |

## What Atomic OS Won

- Faster completion: `175s` versus `240s` (`27.1%` faster).
- Lower input surface: `1,113,464` versus `1,703,945` input tokens (`34.7%`
  lower).
- Lower output surface: `8,617` versus `9,137` output tokens (`5.7%` lower).
- Lower orchestration surface: `58` command-execution items versus `74`
  (`21.6%` lower).
- Lower changed-line surface: `365` changed lines versus `378` (`3.4%` lower).
- The Round 005 absolute `allowedPaths` defect was fixed: the Atomic worker
  successfully used absolute `cwd` and absolute `allowedPaths` in
  `atomic_apply_eslint_dry_run_fixes` with no refusal.
- All manual code writes went through `atomic_replace_text`, preserving the
  Atomic OS write contract.

## What Normal CLI Still Won

- Reasoning tokens were slightly lower: `4,288` versus `4,344` (`1.3%` lower).
- Raw mutating-tool count was lower because the normal lane could rely on
  standard shell and patch writes without MCP trace overhead.
- The normal worker executed `npm --prefix worker run build` inside its own
  lane report, while the Atomic worker did not. External validation later ran
  build successfully for both lanes, so this is a worker-proof discipline gap,
  not a product-result gap.

## Formal Verdict

Atomic OS wins Round 006 on practical result quality and most operational
benchmarks. The improvement over Round 005 is material: the previous absolute
path refusal is gone, the Atomic worker is faster, the token surface is lower,
the command surface is lower, and the diff is smaller while preserving the same
functional verification result.

However, this is not yet the user's required threshold for escalation. The
margin is strong on speed and input tokens, but not "massive in everything":
output-token and diff-surface wins are small, reasoning tokens still slightly
favor Normal CLI, and the Atomic worker did not self-run the full build proof
inside its own lane even though the external coordinator later verified it.

## Loop Decision

Do not scale task complexity yet.

Remain at the current complexity level and improve Atomic OS until it wins every
meaningful benchmark with a large margin, including worker-owned proof
discipline and reasoning/token overhead.
