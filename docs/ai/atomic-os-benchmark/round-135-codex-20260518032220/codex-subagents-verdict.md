# Round 135 - Codex Normal vs Atomic OS

## Summary

Both lanes completed the same `UnifiedAgentService` split and passed the
external gates. The Round 134 cross-owner bundle update worked partially:
Atomic reduced changed inventory from `893` to `836`, raw churn from `1356` to
`1341`, net churn from `+156` to `+99`, and kept the largest-module win.

Do not scale complexity yet. Normal still won facade size, source count,
changed inventory, net churn, and first write.

## Atomic OS Wins

- Largest changed source: `430` lines vs Normal `694`.
- Raw churn total: `1341` vs Normal `1347`.
- Typecheck-impact runtime: `9148ms` vs Normal `9173ms`.
- Jest test-reported time: `13.557s` vs Normal `13.598s`; wall time tied at
  `14.61s`.
- Traceability: raw `4`, effective `3`, macro coverage pass; Normal `0`.

## Normal Wins

- First durable code write: Normal `2026-05-18T06:29:16Z` vs Atomic
  `2026-05-18T06:34:36.694Z`.
- Facade size: `132` lines vs Atomic `177`.
- Changed source count: `2` files vs Atomic `3`.
- Changed inventory: `826` lines vs Atomic `836`.
- Net churn: `+89` vs Atomic `+99`.

## Shared Gates

- Focused Jest: `13/13` in both.
- Scorecard: `ok=true` in both.
- Public API audit: pass in both.
- In-scope typecheck diagnostics: `0` in both.
- Out-of-scope typecheck diagnostics: `11` in both.
- Diff check: pass in both.
- Suppression scan over changed non-spec files: no matches in both.

## A/B Decision

No scale.

Atomic closed most of the R134 inventory gap, but the facade remained too large.
The worker correctly built a shared runtime dependency bundle, but chose an
accessor-heavy bundle with `const facade = this` and getter properties. In this
source topology, the relevant facade fields are initialized in the constructor
and not reassigned later, so direct value bundling is lower surface and still
safe.

The next update must make shared dependency bundles choose access mode
dynamically from AST evidence: direct values when facade dependencies are not
assigned after the constructor, accessors only when post-constructor writes are
observed.

## Validation Evidence

- Normal Jest: `13/13`, `13.598s`, wall `14.61s`.
- Atomic Jest: `13/13`, `13.557s`, wall `14.61s`.
- Normal scorecard: `ok=true`.
- Atomic scorecard: `ok=true`.
- Normal typecheck-impact: `ok=true`, `9173ms`, `0` in-scope diagnostics.
- Atomic typecheck-impact: `ok=true`, `9148ms`, `0` in-scope diagnostics.
- Diff checks: exit `0` for both.
- Suppression scans over changed non-spec files: exit `1` for both, meaning no
  matches.
