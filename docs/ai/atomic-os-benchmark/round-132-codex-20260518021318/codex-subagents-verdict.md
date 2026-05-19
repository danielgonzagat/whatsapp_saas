# Round 132 - Codex Normal vs Atomic OS

## Summary

Both lanes completed the same service-split task and passed the external gates.
The Round 131 selector update worked: Atomic selected `single_runtime_module`
instead of retaining the dominant public root, and regained the facade/inventory
wins.

Atomic is now close to a full material win, but not enough to scale complexity.

## Atomic OS Wins

- Facade size: `153` lines vs Normal `183`.
- Changed inventory: `845` lines vs Normal `848`.
- Net churn: `+108` vs Normal `+111`.
- Focused Jest wall time: `13.80s` vs Normal `13.96s`.
- Traceability: raw `5`, effective `2`, macro coverage pass; Normal `0`.
- Same changed source count as Normal: `2`.
- Same facade private/type surface as Normal: `0` private helpers, `0` facade
  type declarations.

## Normal Wins

- Largest changed source: `665` lines vs Atomic `692`.
- Raw churn total: `1313` vs Atomic `1326`.
- Typecheck-impact runtime: `7495ms` vs Atomic `7566ms`.
- First durable write: Normal `2026-05-18T02:22:09-0300` vs Atomic
  `2026-05-18T05:20:36.502Z`.

## Shared Gates

- Focused Jest: `13/13` in both.
- Scorecard: `ok=true` in both.
- Public API audit: pass in both.
- In-scope typecheck diagnostics: `0` in both.
- Out-of-scope typecheck diagnostics: `11` in both.
- Diff check: pass in both.
- Suppression scan over changed non-spec files: no matches in both.

## A/B Decision

No scale yet. Atomic won the most important product-economy surfaces, but it
still lost largest-module pressure, raw churn total, and a small typecheck
runtime margin.

The remaining loss is now more precise: Atomic used a runtime owner class with
private methods, while Normal used exported functions and produced a smaller
runtime module. The next update should make runtime owner classes require a
strict dependency-surface win; dependency-surface ties should prefer direct
functions to avoid class/private-method bloat.

## Validation Evidence

- Normal Jest: `13/13`, `12.874s`, wall `13.96s`.
- Atomic Jest: `13/13`, `12.634s`, wall `13.80s`.
- Normal scorecard: `ok=true`.
- Atomic scorecard: `ok=true`.
- Normal typecheck-impact: `ok=true`, `7495ms`, `0` in-scope diagnostics.
- Atomic typecheck-impact: `ok=true`, `7566ms`, `0` in-scope diagnostics.
- Diff checks: exit `0` for both.
- Suppression scans over changed non-spec files: exit `1` for both, meaning no
  matches.
