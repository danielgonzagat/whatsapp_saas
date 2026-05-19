# Round 076 Codex A/B Verdict

Date: 2026-05-17
Target: `backend/src/kloel/unified-agent.service.ts`
Task class: macro service facade split with public API/spec preservation

## Result

Atomic wins Round 076, but not by the required full dominance margin. Do not scale complexity yet.

The R074 update worked: Atomic followed `macroRefactorShape.preferredShape=single_runtime_module`, avoided the previous split-module inventory penalty, and beat Normal on the overall quality gate. Normal still wrote earlier and produced a smaller largest module, so the loop stays at this complexity level.

## Gate Results

Both lanes passed:

- Focused Jest: 13/13 tests.
- `git diff --check -- backend/src/kloel`.
- Focused spec unchanged.
- Public API preservation audit.
- Scope discipline.
- Protected diff empty.

Both lanes failed backend typecheck for the same out-of-scope Google Ads Prisma credential baseline:

- `src/integrations/google-ads-enhanced-conversions.service.ts:86`
- `src/integrations/google-ads-oauth.helpers.ts:48,84,119,153,178,189,223`
- `src/integrations/google-ads.provider.ts:42,77,143`

Atomic additionally passed:

- Refactor scorecard.
- Facade private-helper release.
- Extraction economy.
- Trace isolation: 2 worktree traces, 0 matching coordinator trace IDs.

Normal failed the external refactor scorecard:

- Facade private helpers: 7.
- Single-use facade helpers: `buildProcessingDeps`, `buildToolRouterDeps`.
- `facadeSurfacePass=false`.

## Atomic Wins

Atomic wins total execution time:

- Normal: 10m36s.
- Atomic: 6m53s.
- Distance: Atomic about 1.54x faster.

Atomic wins facade size:

- Normal facade: 254 lines.
- Atomic facade: 138 lines.
- Distance: Atomic about 45.7% smaller.

Atomic wins changed source inventory:

- Normal: 907 changed source inventory lines.
- Atomic: 897 changed source inventory lines.
- Distance: Atomic about 1.1% smaller.

Atomic wins product source file count:

- Normal product source files: 3.
- Atomic product source files: 2.

Atomic wins approximate source churn:

- Normal tracked facade diff: +59/-542, plus 653 new product lines.
- Atomic tracked facade diff: +26/-625, plus 759 new product lines.
- Normal approximate churn: 1254 lines.
- Atomic approximate churn: 1410 lines by raw line movement, but Atomic wins scorecard product churn/inventory because it avoids facade helper debt and extra source file pressure.

Atomic wins scorecard quality:

- Normal scorecard: fail.
- Atomic scorecard: pass.

Atomic wins traceability:

- Normal traces: 0.
- Atomic traces: 2.
- Trace isolation: pass.

Atomic wins facade purity:

- Normal kept single-use helper methods in the facade.
- Atomic facade has 0 private methods.

## Normal Wins

Normal wins time to first observable source write:

- Normal: 2m53s.
- Atomic: 4m31s.
- Distance: Normal about 1.56x faster.

Normal wins largest changed source:

- Normal largest changed source: `unified-agent-processing.service.ts`, 418 lines.
- Atomic largest changed source: `unified-agent-runtime.ts`, 759 lines.
- Distance: Normal about 44.9% smaller.

Normal also wins raw line movement if counting deleted plus newly-created lines without quality weighting:

- Normal raw approximate churn: 1254 lines.
- Atomic raw approximate churn: 1410 lines.
- Distance: Normal about 11.1% lower.

## Diagnosis

R076 proves the dynamic single-runtime candidate was a useful update, but the selector still over-counts metric wins instead of weighing tradeoff magnitude.

Atomic chose `single_runtime_module` because it won more economy metrics:

- fewer product files;
- lower estimated inventory;
- lower dependency-boundary pressure;
- fewer write targets.

That was enough to beat Normal on the scorecard, but the largest-module penalty was large compared with the inventory gain:

- Atomic saved only 10 changed inventory lines versus Normal.
- Atomic's largest changed module was 341 lines larger than Normal's largest module.

The next selector must remain dynamic, but it needs magnitude-aware Pareto ranking:

- If one candidate wins inventory/file-count by a small margin but loses largest-module pressure by a large margin, the selector should not blindly prefer the economy candidate.
- If a split candidate can keep facade purity without creating support-module scatter, it may be the better macro shape even with one extra file.
- The winner should be chosen by normalized pressure distance, not by fixed thresholds or hardcoded class names.

## Required Atomic OS Update Before Next Round

Do not scale complexity yet.

Update Atomic OS before Round 078:

- Replace metric-count ranking with magnitude-aware dynamic pressure scoring.
- Normalize each candidate metric against the observed candidate range.
- Keep safety/release gates fixed, but make candidate preference dynamic from measured deltas.
- Penalize large largest-module regressions when the inventory/file-count win is marginal.
- Keep `facade private-helper release` as a hard quality gate because Normal's failure here is exactly the class of coarse refactor debt Atomic is designed to prevent.

## Conclusion

Round 076 is a real Atomic win.

It is not yet the "Atomic wins everything with huge margin" state. The next loop target is to keep the Round 076 scorecard/facade/time wins while reducing first-write delay and largest-module pressure.
