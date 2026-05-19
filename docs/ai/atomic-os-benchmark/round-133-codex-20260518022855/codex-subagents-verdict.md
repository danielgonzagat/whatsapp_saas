# Round 133 - Codex Normal vs Atomic OS

## Summary

Both lanes completed the same `UnifiedAgentService` split and passed the
external gates. Atomic improved over Round 132 on facade surface, source-count
surface, first write, private-method surface, and validation runtime.

Do not scale complexity yet. Normal still won material product-economy surfaces:
changed inventory, largest changed source, raw churn, and net churn.

## Atomic OS Wins

- Facade size: `177` lines vs Normal `199`.
- Changed source count: `2` files vs Normal `3`.
- First durable code write: Atomic `2026-05-18T05:40:00.645Z` vs Normal
  `2026-05-18T05:40:21Z`.
- Focused Jest wall time: `15.41s` vs Normal `15.70s`.
- Typecheck-impact runtime: `9021ms` vs Normal `9026ms`.
- Facade private surface: `0` private methods vs Normal `1`.
- Traceability: raw `5`, effective `2`, macro coverage pass; Normal `0`.

## Normal Wins

- Changed inventory: `878` lines vs Atomic `890`.
- Largest changed source: `445` lines vs Atomic `713`.
- Raw churn total: `1297` vs Atomic `1439`.
- Net churn: `+141` vs Atomic `+153`.

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

Atomic is winning more operational surfaces than before, but the single runtime
module got too large. Normal split tool routing into a sibling module and
reduced largest-module pressure and inventory despite using one extra source
file.

The planner had the right measured data available: `dependency_split_modules`
had lower worst-family pressure than `single_runtime_module` in the Round 133
fastpath artifact. The defect was that operational tradeoff debt could still
behave like an early veto in the execution interpretation. The Atomic selector
must treat tradeoff debt as candidate metadata and a late tie-breaker after
measured family pressure, not as a pre-pressure veto.

## Validation Evidence

- Normal Jest: `13/13`, `14.311s`, wall `15.70s`.
- Atomic Jest: `13/13`, `14.05s`, wall `15.41s`.
- Normal scorecard: `ok=true`.
- Atomic scorecard: `ok=true`.
- Normal typecheck-impact: `ok=true`, `9026ms`, `0` in-scope diagnostics.
- Atomic typecheck-impact: `ok=true`, `9021ms`, `0` in-scope diagnostics.
- Diff checks: exit `0` for both.
- Suppression scans over changed non-spec files: exit `1` for both, meaning no
  matches.
