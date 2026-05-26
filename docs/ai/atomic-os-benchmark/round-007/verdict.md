# Atomic OS A/B Benchmark - Round 007

Date: 2026-05-16

## Task

Same-complexity repeat of the worker lint-debt mission after the Round 006
Atomic OS proof-discipline update.

Both agents ran in isolated worktrees from the same repository HEAD.

## Worktrees

- Normal CLI: `/private/tmp/kloel-ab7-normal-20260516154632`
- Atomic OS: `/private/tmp/kloel-ab7-atomic-20260516154632`

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
| Wall-clock worker time | 184s | 245s | Normal CLI |
| Event log lines | 99 | 120 | Normal CLI |
| Command executions | 76 | 74 | Atomic OS |
| MCP calls | 0 | 30 | Normal CLI on overhead, Atomic OS on traceability |
| Input tokens | 2,199,627 | 3,836,276 | Normal CLI |
| Cached input tokens | 2,113,152 | 3,682,560 | Normal CLI |
| Output tokens | 9,499 | 12,189 | Normal CLI |
| Reasoning tokens | 4,886 | 6,491 | Normal CLI |
| Files changed | 24 | 24 | Tie |
| Insertions | 252 | 235 | Atomic OS |
| Deletions | 126 | 134 | Normal CLI |
| Total changed lines | 378 | 369 | Atomic OS |
| Final verification | Pass | Pass | Tie |

## What Atomic OS Won

- Slightly lower command-execution count: `74` versus `76`.
- Slightly lower changed-line surface: `369` versus `378`.
- Lower insertion count: `235` versus `252`.
- All code writes stayed on the atomic surface: analyzer dry-run transactions,
  `code_outline`, `code_read_symbol`, `atomic_edit_symbol`, and
  `atomic_replace_text`.
- The Atomic worker did follow full proof discipline in its own lane this time:
  lint, typecheck, diff-check, tests, and build were all run before final.

## What Normal CLI Won

- Faster completion: `184s` versus `245s` (`33.2%` faster).
- Lower input token surface: `2,199,627` versus `3,836,276` (`42.7%` lower).
- Lower output token surface: `9,499` versus `12,189` (`22.1%` lower).
- Lower reasoning token surface: `4,886` versus `6,491` (`24.7%` lower).
- Lower event/log surface: `99` versus `120`.
- Better preservation of test intent in the env-related specs:
  - Normal used the existing `mailEnvBackup` to restore mail env in `afterEach`.
  - Normal used the existing `envBackup` to restore `process.env` in
    `openai-models.spec.ts`.
  - Atomic removed those backups to satisfy lint. Tests still passed, but the
    edit was less faithful to the original isolation intent.

## Atomic OS Defects Observed

1. `atomic_apply_eslint_dry_run_fixes` recommended package proof from `cwd`.
   In this round the Atomic worker used `cwd=/private/tmp/...` and
   `args=["worker", "--fix-dry-run", "--format", "json"]`. The tool therefore
   recommended root commands:
   - `npm run lint:check`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`

   The correct package proof for this mission was the worker-prefixed form:
   - `npm --prefix worker run lint:check`
   - `npm --prefix worker run typecheck`
   - `npm --prefix worker test`
   - `npm --prefix worker run build`

   The worker recovered because the prompt also required those commands, but
   the tool guidance itself was wrong.

2. The analyzer transaction summary printed every trace path into the human
   summary and JSON payload. For 23 files this created large output and likely
   contributed to Atomic's token loss.

3. The Atomic lane optimized by deletion in two env tests where preserving and
   using the existing backup variables would have better matched the original
   intent.

## Formal Verdict

Normal CLI wins Round 007 overall.

Atomic OS retained stronger write governance and slightly smaller diff surface,
but it lost the decisive practical benchmarks: speed, input tokens, output
tokens, reasoning tokens, event surface, and qualitative preservation of env
test intent.

## Loop Decision

Do not scale task complexity.

Remain at the current complexity level and update Atomic OS before the next
round. The required updates are:

- infer recommended package verification from the affected package path, not
  only from `cwd`;
- compact trace output in the analyzer transaction summary;
- bias lint-residue guidance toward preserving existing test fixtures/backups
  when they reveal an isolation intent.
