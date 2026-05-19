# Round 134 - Codex Normal vs Atomic OS

## Summary

Both lanes completed the same `UnifiedAgentService` split and passed the
external gates. The Round 133 selector update worked: Atomic selected
`dependency_split_modules` and closed the previous largest-module loss.

Do not scale complexity yet. Atomic won first write, largest module, focused
Jest wall time, typecheck-impact runtime, and traceability, but Normal still
won facade size, changed inventory, raw churn, and net churn.

## Atomic OS Wins

- First durable code write: Atomic `2026-05-18T06:08:48.896Z` vs Normal
  roughly `2026-05-18T06:12:05Z` by new-file birthtime and
  `2026-05-18T06:13:44Z` by final write mtime.
- Largest changed source: `460` lines vs Normal `617`.
- Focused Jest wall time: `14.32s` vs Normal `14.56s`.
- Typecheck-impact runtime: `7714ms` vs Normal `9190ms`.
- Traceability: raw `6`, effective `3`, macro coverage pass; Normal `0`.
- Same changed source count as Normal: `3`.
- Same facade private/type surface as Normal: `0` private helpers and `0`
  facade type declarations.

## Normal Wins

- Facade size: `165` lines vs Atomic `172`.
- Changed inventory: `835` lines vs Atomic `893`.
- Raw churn total: `1290` vs Atomic `1356`.
- Net churn: `+98` vs Atomic `+156`.

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

Atomic fixed the R133 largest-module defect, but the split paid too much
dependency-object surface across sibling owners. The Atomic facade rebuilt a
large dependency object in both delegated public methods, while the Normal lane
compressed dependency wiring through a runtime owner object. The next update
must preserve dynamic split selection while adding cross-owner dependency-bundle
economy so split modules do not lose inventory/churn just to win largest-module
pressure.

## Validation Evidence

- Normal Jest: `13/13`, `12.943s`, wall `14.56s`.
- Atomic Jest: `13/13`, `13.287s`, wall `14.32s`.
- Normal scorecard: `ok=true`.
- Atomic scorecard: `ok=true`.
- Normal typecheck-impact: `ok=true`, `9190ms`, `0` in-scope diagnostics.
- Atomic typecheck-impact: `ok=true`, `7714ms`, `0` in-scope diagnostics.
- Diff checks: exit `0` for both.
- Suppression scans over changed non-spec files: exit `1` for both, meaning no
  matches.
