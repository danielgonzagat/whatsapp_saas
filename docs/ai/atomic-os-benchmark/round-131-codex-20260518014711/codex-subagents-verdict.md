# Round 131 - Codex Normal vs Atomic OS

## Summary

Both lanes completed the same service-split task and passed the external gates.
Atomic OS also passed the new fast-path policy adherence gate: `processMessage`
remained in the facade with `210` lines against the dynamic floor of `208`.

The new gate worked, but the selected policy was too expensive. Atomic did not
win the round with a large material margin, so complexity must not scale.

## Normal Wins

- Facade size: `203` lines vs Atomic `358`.
- Changed inventory: `895` lines vs Atomic `1015`.
- Net churn: `+158` vs Atomic `+278`.
- First durable write: `04:58:29Z` vs Atomic `04:59:05.885Z`.
- Typecheck-impact runtime: `6907ms` vs Atomic `6938ms`.

## Atomic OS Wins

- Largest changed source: `407` lines vs Normal `446`.
- Raw churn total: `1240` vs Normal `1314`.
- Focused Jest wall time: `13.39s` vs Normal `13.55s`.
- Facade private methods: `0` vs Normal `1`.
- Traceability: raw `8`, effective `3`, macro coverage pass; Normal `0`.
- Fast-path policy adherence: pass; retained root `processMessage` had `210`
  lines against dynamic floor `208`.

## Ties / Shared Gates

- Focused Jest: `13/13` in both.
- Scorecard: `ok=true` in both.
- Public API audit: pass in both.
- Changed source count: `3` in both.
- In-scope typecheck diagnostics: `0` in both.
- Out-of-scope typecheck diagnostics: `11` in both.
- Diff check: pass in both.
- Suppression scan over changed non-spec files: no matches in both.

## A/B Decision

No scale. Atomic fixed the R130 policy-adherence failure, but the retained-root
policy created a larger facade and larger final inventory than Normal. The loss
is now in the policy selector, not in the worker's obedience.

Next Atomic OS update: add facade pressure as a first-class dynamic ranking
surface in the macro-refactor selector, so a dominant-root retention shape cannot
win only by reducing largest-module pressure while losing facade and inventory
economy.

## Validation Evidence

- Normal Jest: `13/13`, `12.452s`, wall `13.55s`.
- Atomic Jest: `13/13`, `12.319s`, wall `13.39s`.
- Normal scorecard: `ok=true`.
- Atomic scorecard: `ok=true`.
- Normal typecheck-impact: `ok=true`, `6907ms`, `0` in-scope diagnostics.
- Atomic typecheck-impact: `ok=true`, `6938ms`, `0` in-scope diagnostics.
- Diff checks: exit `0` for both.
- Suppression scans over changed non-spec files: exit `1` for both, meaning no
  matches.
