# Round 058 Verdict

- Status: rejected_scope_runaway_timeout
- Complexity tier: unified-agent-service-refactor-repeat
- Task intended: extract only `formatPromptValue` from `backend/src/kloel/unified-agent.service.ts` into `backend/src/kloel/unified-agent-runtime.helpers.ts`.
- Normal worktree: `/private/tmp/kloel-ab058-normal-20260517091600`
- Atomic worktree: `/private/tmp/kloel-ab058-atomic-20260517091600`

## Functional Validation

Both lanes passed external validation after timeout:

- Jest focused suite: `13/13` passed in both.
- Backend typecheck: exit 0 in both.
- `git diff --check -- backend/src/kloel`: exit 0 in both.
- Protected diff: empty in both.
- Suppression scan on touched files: exit 1 with no matches in both.

This is not accepted as a benchmark win because both lanes exceeded the intended atomic task surface.

## Scope Failure

- NORMAL touched 6 Kloel source files and changed `43 insertions / 585 deletions` in `backend/src/kloel/unified-agent.service.ts`.
- ATOMIC touched 5 Kloel source files and changed `60 insertions / 588 deletions` in `backend/src/kloel/unified-agent.service.ts`.
- Both lanes timed out under the watchdog `max-ms=600000`.
- The intended task should have touched only:
  - `backend/src/kloel/unified-agent.service.ts`
  - `backend/src/kloel/unified-agent-runtime.helpers.ts`

## Benchmark Result

- The audit now records touched-file count and source churn.
- NORMAL wins:
  - Service line count: `195` vs `209`.
  - Source churn: `628` vs `648`.
  - Shell command count: `11` vs `25`.
  - Output tokens: `4,003` vs `4,651`.
- ATOMIC wins:
  - Event rows: `78` vs `80`.
  - Input tokens: `55,818` vs `67,403`.
  - Reasoning tokens: `8,962` vs `9,550`.
  - Touched file count: `5` vs `6`.
  - Traceability: `13` worktree traces, trace isolation `ok=true`.
- ATOMIC loses atomic discipline:
  - `atomicModeClean=false`.
  - `nativeShellReadCommands=2`.
  - `maskedAtomicFailurePipelineCommands=1`.

## Atomic Losses Formalized

- Used `head` to read `docs/ai/atomic-os-benchmark/tools/atomic-call.cjs`.
- Used `atomic-call.cjs ... | head -5`, which masks atomic-call exit status without `pipefail`.
- Used `specifier` where `code_read_symbol` needed `selector`.
- Used `importName` where `atomic_add_import` needed `name`.
- Passed `expectedSha256` to `atomic_create_file` for a new file and caused avoidable mismatch.
- Expanded beyond the requested two-file extraction.

## Tool Updates Applied

- `round-audit.cjs`
  - Detects shell reads over benchmark/tooling code paths, not only `backend/src/kloel`.
  - Detects atomic-call pipelines piped into `head/tail/sed/awk/nl`.
  - Adds touched Kloel file count and source churn metrics from validation logs.
  - `atomicModeClean` now fails when masked atomic-call pipelines are present.
- `atomic-call.cjs`
  - Adds tool-aware alias normalization:
    - `code_read_symbol`: `specifier -> selector`
    - `atomic_add_import`: `specifier -> module`, `importName -> name`
    - existing generic aliases: `filePath -> file`, `action -> op`
  - Removes `expectedSha256` from `atomic_create_file` wrapper calls, relying on the create-file operation existence guard.
  - Keeps worktree escape refusal; `/dev/null` remains rejected.

## Decision

Do not escalate complexity.

Repeat the same tier with a tighter scope contract: exactly two touched source files, no broad service decomposition, no shell reads/pipelines in ATOMIC, and timeout counts as rejection even if external tests pass.
