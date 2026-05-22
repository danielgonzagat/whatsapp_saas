# Wave Q / Slice 6 — Strict-Mode Sweep — Pulse/DTO + Common/Utils

## Mission

Eliminate TS errors in `backend/src/pulse/dto/**` and
`backend/src/common/utils/**`. ~19 errors total (10 pulse + 9 common).

## Ownership set

- `backend/src/pulse/dto/**/*.ts`
- `backend/src/common/utils/**/*.ts`
- Their `.spec.ts` files if affected

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md`.
2. `AGENTS.md`.
3. `.opencode-prompts/wave-q-strict-mode/01-dto-sweep-checkout.md` (pattern).
4. Every file in scope.

## Special note

`common/utils/**` may have shared helpers used by many modules. Tightening
their types may cascade — that's OK if consumer code becomes more correct
as a result, but if a fix creates errors in 5+ other files, STOP and report
(scope creep).

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | grep -E "src/(pulse/dto|common/utils)" | wc -l
# Expected: 0
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
# Should decrease

npx eslint src/pulse/dto/**/*.ts src/common/utils/**/*.ts
npx jest --testPathPattern="(pulse/dto|common/utils)"
```

## Definition of done

- Zero TS errors in target dirs.
- Whole-repo TS decreases by ≥15.
- Specs still pass.
- No bypass, no `any`, no commits.

## Hard stop conditions

- Fix in `common/utils/` cascades to ≥5 errors elsewhere — STOP, report.
