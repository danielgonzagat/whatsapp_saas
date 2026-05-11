# Wave B / Slice 4 — TenantSweep-CheckoutService

## Mission

Eliminate cross-tenant query bugs in `backend/src/checkout/checkout.service.ts`.
The prior allowlist had `checkoutOrder count|1`, `checkoutOrder findMany|1`,
`checkoutOrder findMany|2` here. Checkout is the customer-facing order flow —
cross-tenant queries leak orders between workspaces.

## Ownership set

- `backend/src/checkout/checkout.service.ts`
- `backend/src/checkout/checkout.service.spec.ts` (create if missing)
- Direct checkout helpers in `backend/src/checkout/` (checkout-social-lead.*,
  checkout-order-state-machine, checkout-public-url.util etc) — IF they exist
  AND are imported by checkout.service.ts.

Outside this set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE PAGAMENTOS + REGRA DE BANCO DE DADOS sections.
2. `AGENTS.md` — full read.
3. `docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md` — full.
4. `backend/src/checkout/checkout.service.ts` — full read.
5. `backend/prisma/schema.prisma` — sections relevant to CheckoutOrder, Product,
   Plan, Coupon, Customer.

## Special rules for checkout

- `CheckoutOrder.workspaceId` MUST be in every `where` clause.
- Public checkout URLs (the customer-facing path) authenticate via
  `publicCheckoutToken`/slug. The workspace is INFERRED from the token. Even
  so, every internal Prisma call must explicitly include `workspaceId` once
  resolved — do not trust the URL to scope.
- `idempotency-key` must be honored on POST /checkout/submit (look at controller
  side; if missing there, note in report).

## Pattern to apply

Same as Slices 1-3: add `workspaceId` to every `where`, or wrap in
@AdminGlobalOperation if legitimately admin-level (rare in checkout).

## Forbidden moves

Same as Slice 3 (financial-grade discipline applies; checkout creates orders
that flow into wallet).

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/checkout/checkout.service.ts src/checkout/checkout.service.spec.ts \
  src/checkout/checkout-*.ts 2>/dev/null
npx jest --testPathPattern=checkout/checkout
cd ..
node scripts/ops/check-tenant-filter.mjs --path backend/src/checkout/ 2>&1 | tail -20
```

## Definition of done

- Zero tenant-filter violations in `backend/src/checkout/checkout.service.ts`.
- All Prisma calls workspace-scoped.
- Spec covers happy + cross-tenant rejection + duplicate order rejection +
  expired token rejection.
- `npx tsc` no regress.
- `npx eslint` clean.
- No bypass tokens, no new any, no protected files.
- No commits. JSON delivery report.

## Hard stop conditions

- If `CheckoutOrder` has historical entries with `workspaceId = null` — STOP,
  report (migration cleanup is a separate scope).
- If `publicCheckoutToken` is not unique-indexed — STOP, report.
- If file exceeds 600 → 800 line budget — STOP, report.
