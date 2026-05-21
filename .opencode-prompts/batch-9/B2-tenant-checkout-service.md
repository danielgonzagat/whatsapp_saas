# Wave B/2 — TenantSweep CheckoutService (41 entries)

## Mission

Eliminate ALL 41 tenant-isolation allowlist entries for `backend/src/checkout/checkout.service.ts`. Each entry is a Prisma query missing `workspaceId` filter (`checkoutOrder.findMany`, `.count`, `.aggregate`, etc).

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE BANCO DE DADOS + REGRA DE PAGAMENTOS / STRIPE / MARKETPLACE
3. `AGENTS.md`
4. `backend/src/checkout/checkout.service.ts` (full)
5. `scripts/ops/tenant-filter-allowlist.json` (entries with file=checkout.service.ts)

## Pattern

Same as Wave B/1 (see B1-tenant-product-sub-resources.md). For financial code, additionally:

- Money in `bigint` cents always (never float)
- Ledger entries append-only (no .update calls; correct via compensating entries)
- Idempotency on webhook handlers via (provider, externalId) unique

## Ownership set

- `backend/src/checkout/checkout.service.ts`
- `backend/src/checkout/checkout.service.spec.ts`
- Cross-workspace spec for the service

## Constraints + DoD + Hard stops

Same as Wave B/1. Specific gates:
- `grep -c "checkout.service.ts" scripts/ops/tenant-filter-allowlist.json` returns 0
- 0 new tsc errors in checkout/
- `npx jest src/checkout/` no regression
