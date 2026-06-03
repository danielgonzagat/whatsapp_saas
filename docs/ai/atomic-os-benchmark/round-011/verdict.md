# Atomic OS A/B Benchmark - Round 011

Date: 2026-05-16

## Task

Fix real worker ESLint debt in isolated worktrees, with identical functional scope:

- Baseline: `npm --prefix worker run lint:check` failed with 88 errors.
- Target: worker lint, typecheck, diff check, tests, and build green.

## Worktrees

- Normal: `/private/tmp/kloel-ab11-normal-20260516163615`
- Atomic: `/private/tmp/kloel-ab11-atomic-20260516163615`
- Base HEAD: `565b0f84daa9f20b33a174374191a9f1f519a26e`

## External Validation

Both lanes passed the same external validation ladder:

- `npm --prefix worker run lint:check`
- `npm --prefix worker run typecheck`
- `git diff --check -- worker`
- `npm --prefix worker test` - 45 files / 431 tests
- `npm --prefix worker run build`

## Quantitative Results

| Metric | Normal | Atomic | Winner |
| --- | ---: | ---: | --- |
| Worker duration | 235s | 271s | Normal |
| Event lines | 68 | 96 | Normal |
| Command items | 50 | 54 | Normal |
| Failed command items | 2 | 1 | Atomic |
| MCP tool items | 0 | 28 | Normal on overhead / Atomic on traceability |
| Input tokens | 2,331,698 | 2,198,235 | Atomic |
| Output tokens | 5,716 | 8,961 | Normal |
| Reasoning tokens | 2,027 | 4,422 | Normal |
| Direct file_change items | 4 | 0 | Atomic |
| Worker files changed | 24 | 24 | Tie |
| Insertions | 255 | 251 | Atomic |
| Deletions | 126 | 119 | Atomic |
| Total changed lines | 381 | 370 | Atomic |
| Atomic traces in worktree | n/a | 28 | Atomic |
| New traces leaked to main repo | n/a | 0 | Atomic |

## Quality Findings

Atomic wins:

- Used shared `atomic-edit` MCP for all code writes.
- Produced 28 worktree-local trace files after the trace-root fix.
- Avoided direct `file_change` writes.
- Produced smaller total code churn: 370 changed lines vs 381.
- Deleted less code: 119 deletions vs 126.
- Preserved the `emptyDemographics` fixture and converted it into behavior proof with an assertion.
- Followed the preservation-topology principle better for the unused fixture residue.

Normal wins:

- Finished faster: 235s vs 271s.
- Used fewer event lines and fewer command items.
- Used much less output and reasoning budget.
- Solved the task with fewer moving parts.

Tie / neutral:

- Both passed lint, typecheck, diff check, worker tests, and worker build.
- Both only changed `worker/**` for the measured product diff.
- Both worktrees showed an ambient `AGENTS.md` memory-context diff. This was excluded from the measured worker diff and should be treated as harness/governance noise, not a task change.

## Verdict

Atomic OS improved on the dimensions that matter for verified atomic action:

- less deletion,
- lower total mutation surface,
- no direct coarse writes,
- local traces,
- better preservation of a reusable test fixture.

But it did not beat the normal CLI by a large enough margin to scale complexity. Normal still wins too much operational efficiency:

- speed,
- output tokens,
- reasoning tokens,
- event volume,
- simplicity of execution.

## Required Atomic OS Update Before Next Round

Do not scale complexity yet.

Update the Atomic OS to reduce the remaining overhead and improve local-anchor handling:

1. Add local identifier/fixture discovery so `code_read_symbol` can find constants declared inside `describe` callbacks, such as `emptyDemographics`.
2. Add a direct residue-fix operation for known lint residues returned by `atomic_apply_eslint_dry_run_fixes`, especially:
   - unused `mailEnvBackup` -> add minimal afterEach restoration using existing helper when available;
   - unused `envBackup` -> add minimal afterEach scoped env restoration;
   - unused fixture constants -> add behavior assertion when the fixture expresses an expected value.
3. Preserve the trace-root behavior proven in this round: traces must stay in the target worktree, not the main repo.

Complexity remains at the same level for the next loop.
