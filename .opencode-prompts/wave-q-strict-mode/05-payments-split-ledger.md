# Wave Q / Slice 5 — Strict-Mode Sweep — Payments/Split + Ledger

## Mission

Eliminate TS errors in `backend/src/payments/split/**` and
`backend/src/payments/ledger/**`. ~17 errors total (11 split + 6 ledger).

FINANCIAL surface — ledger is APPEND-ONLY, split engines are deterministic.

## Ownership set

- `backend/src/payments/split/**/*.ts`
- `backend/src/payments/ledger/**/*.ts`
- Their `.spec.ts` files if affected by fix

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE PAGAMENTOS sections fully.
2. `AGENTS.md`.
3. `docs/adr/0003-stripe-connect-platform-model.md`.
4. `.opencode-prompts/wave-q-strict-mode/01-dto-sweep-checkout.md` (pattern).
5. Every file in scope.

## Financial invariants to preserve

- `LedgerEntry` is APPEND-ONLY. Never `update` an entry. If the fix touches
  any ledger update code, that's a P0 violation — STOP, report.
- Split engines must satisfy: `sum(allocations) === gross - fees` exactly
  (bigint). If a fix accidentally widens a number to allow rounding, STOP.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | grep -E "src/payments/(split|ledger)" | wc -l
# Expected: 0
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
# Should decrease

npx eslint src/payments/{split,ledger}/**/*.ts
npx jest --testPathPattern="payments/(split|ledger)"
```

## Definition of done

- Zero TS errors in split + ledger dirs.
- Whole-repo TS decreases by ≥15.
- Specs still pass.
- No bypass, no `any`, no commits.
- Coverage minimum 80% on these files maintained.

## Hard stop conditions

- Any ledger code path that mutates an existing entry — STOP, report.
- Any split engine math that goes through `Number()` — STOP, report.
- Any fix that requires Prisma schema change — STOP, report.
