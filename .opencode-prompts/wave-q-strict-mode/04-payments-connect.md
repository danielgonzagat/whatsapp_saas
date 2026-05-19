# Wave Q / Slice 4 — Strict-Mode Sweep — Payments/Connect

## Mission

Eliminate ALL TypeScript errors in `backend/src/payments/connect/**/*.ts`
caused by `exactOptionalPropertyTypes: true`. ~15 errors expected.

This is FINANCIAL surface — Stripe Connect operations. Every fix must
preserve runtime behavior; type tightening only.

## Ownership set

- `backend/src/payments/connect/**/*.ts` (all files in this dir + subdirs)
- `backend/src/payments/connect/**/*.spec.ts` (if affected by fix)

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE PAGAMENTOS / STRIPE / MARKETPLACE.
2. `AGENTS.md`.
3. `docs/adr/0003-stripe-connect-platform-model.md`.
4. `.opencode-prompts/wave-q-strict-mode/01-dto-sweep-checkout.md` (pattern).
5. Every file in `backend/src/payments/connect/`.

## Financial-specific rules

- Money fields are `bigint` cents — DO NOT loosen them to `number | undefined`.
- Use the omit-when-undefined helper pattern for optional Stripe params, not
  the null-friendly DTO pattern (Stripe APIs don't accept null for many fields).
- Idempotency-Key fields MUST remain typed as `string` (required), not optional.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | grep "src/payments/connect" | wc -l
# Expected: 0

npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
# Should decrease

npx eslint src/payments/connect/**/*.ts
npx jest --testPathPattern=payments/connect
```

## Definition of done

- Zero TS errors in `backend/src/payments/connect/`.
- Whole-repo TS decreases by ≥13.
- Specs still pass (or pre-existing failure documented).
- No bypass, no `any`, no commits.

## Hard stop conditions

- If fix requires Prisma schema change — STOP, report.
- If fix would change Stripe API contract — STOP, report.
