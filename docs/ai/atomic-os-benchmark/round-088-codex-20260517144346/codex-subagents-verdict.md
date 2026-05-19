# Round 088 Codex A/B Verdict

## Mission

Repeat the macro-refactor class with `typecheck-impact` as an explicit gate for
both lanes.

## Lanes

- Normal: `Faraday` / `019e370a-88cf-7ca1-879d-accc46a97f85`
- Atomic: `Schrodinger` / `019e370a-8c1f-7062-b1d0-41175bda69a0`
- Normal worktree: `/private/tmp/kloel-ab088-normal-20260517144346`
- Atomic worktree: `/private/tmp/kloel-ab088-atomic-20260517144346`

## Result

Atomic wins the effective round again with the new dynamic typecheck-impact gate
enabled.

This is now a repeated win for the macro-refactor class: Atomic wins first
write, completion order, facade size, total inventory, largest module,
traceability, and all correctness gates. Normal only wins raw churn total by
`2` units, which comes from deleting fewer old facade lines while adding more
new source lines. That metric needs refinement before it should block
complexity scaling.

## Atomic Wins

- First observable write:
  - Atomic: `2026-05-17 14:50:11 -03`
  - Normal: `2026-05-17 14:54:13 -03`
  - Distance: Atomic first-write advantage `4m02s`.
- Completion order:
  - Atomic completed before Normal.
- Changed source inventory:
  - Atomic: `863` lines
  - Normal: `875` lines
  - Distance: Atomic `12` lines smaller.
- Facade size:
  - Atomic: `173` lines
  - Normal: `190` lines
  - Distance: Atomic facade `17` lines smaller.
- Largest changed source:
  - Atomic: `438` lines
  - Normal: `447` lines
  - Distance: Atomic largest module `9` lines smaller.
- Added product source:
  - Atomic: `722` additions
  - Normal: `727` additions
  - Distance: Atomic `5` added lines lower.
- Traceability:
  - Atomic: `10` traces
  - Normal: `0` traces.
- Trace isolation:
  - Atomic worktree trace count: `10`
  - Matching coordinator trace IDs: `0`
- Focused Jest:
  - Atomic: `13/13` pass
  - Normal: `13/13` pass
- Public API preservation:
  - Atomic: pass
  - Normal: pass
- Scorecard:
  - Atomic: pass
  - Normal: pass
- Scope discipline:
  - Atomic: pass
  - Normal: pass
- Typecheck-impact:
  - Atomic: pass, `0` in-scope diagnostics
  - Normal: pass, `0` in-scope diagnostics

## Normal Wins

- Raw source churn total:
  - Normal: `727` additions + `589` deletions = `1316`
  - Atomic: `722` additions + `596` deletions = `1318`
  - Distance: Normal `2` churn units lower.

This is not a product-quality win. Atomic added fewer lines and produced a
smaller facade/inventory; the `2`-unit raw churn loss is caused by deleting more
old service body, which is desirable in a facade extraction.

## External Validation

- `npm --prefix backend test -- unified-agent.service.spec.ts --runInBand`
  - Normal: pass, `13/13`
  - Atomic: pass, `13/13`
- `public-api-preservation-audit.cjs`
  - Normal: pass
  - Atomic: pass
- `refactor-scorecard.cjs`
  - Normal: pass
  - Atomic: pass
- `scope-discipline-check.cjs`
  - Normal: pass; `outOfScopeFiles=[]`
  - Atomic: pass; `outOfScopeFiles=[]`
- `typecheck-impact-audit.cjs`
  - Normal: pass; `inScopeDiagnosticCount=0`, `outOfScopeDiagnosticCount=11`
  - Atomic: pass; `inScopeDiagnosticCount=0`, `outOfScopeDiagnosticCount=11`
- `trace-isolation-check.cjs`
  - Atomic: pass; no matching trace IDs with coordinator workspace.
- `git diff --check -- backend/src/kloel/unified-agent*`
  - Normal: pass
  - Atomic: pass
- `git diff --exit-code -- backend/src/kloel/unified-agent.service.spec.ts`
  - Normal: pass
  - Atomic: pass
- Suppression scan on changed product files:
  - Normal: pass
  - Atomic: pass

## Diagnosis

The typecheck-impact gate changed the Normal result from the previous round:
Normal avoided the in-scope type regression this time. Atomic still completed
first and retained structural superiority.

The only remaining metric issue is that raw churn total treats deleting old
facade body as negative churn. For this refactor class, the better metric is:

- additions lower is better;
- final source inventory lower is better;
- facade size lower is better;
- largest module lower is better;
- deleted old service body is not automatically bad when public API and behavior
  are preserved.

## Loop Decision

- Treat macro-refactor service-facade class as currently won by Atomic under
  the expanded typecheck-impact benchmark.
- Before scaling complexity, update the benchmark report model to split raw
  churn into directional components so productive facade deletion is not counted
  as a loss.
- Then scale to the next complexity class.

## Atomic OS Update Applied After Verdict

- Updated `refactor-scorecard.cjs` so source churn is computed from the actual
  changed source files, not a prefix pathspec.
- Added directional churn fields:
  - `trackedAdded`
  - `untrackedAdded`
  - `deletedFromTrackedSources`
  - `finalInventoryLines`
  - `net`
- The scorecard now explicitly warns that deletions from tracked sources can be
  desirable when extracting a facade and must be interpreted alongside final
  inventory, facade size, largest module, and behavior/API proof.
- Validation:
  - `node --check docs/ai/atomic-os-benchmark/tools/refactor-scorecard.cjs`
    passed.
  - R088 Normal scorecard now reports tracked service churn
    `+42/-589`, final inventory `875`, net `138`.
  - R088 Atomic scorecard now reports tracked service churn
    `+32/-596`, final inventory `863`, net `126`.
  - Operational-hardcode inventory reports no `operational_hardcode` findings.

## Scale Decision

Atomic now wins this class on the product-relevant directional interpretation:
lower additions, lower net new code, lower final inventory, smaller facade,
smaller largest module, faster first write, faster completion, same behavior,
same public API, same typecheck-impact pass, and more traceability.

Scale the next round to a harder refactor class.
