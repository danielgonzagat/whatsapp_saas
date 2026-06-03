# Wave H / Coverage-CHECKOUT-A — 6 service specs

## Mission

Create specs for 6 Checkout services lacking coverage.

## Services

1. `checkout-catalog-config.service.ts`
2. `checkout-catalog.service.ts`
3. `checkout-order-query.service.ts`
4. `checkout-order.service.ts`
5. `checkout-post-payment-effects.service.ts`
6. `checkout-product-config.service.ts`

(All under `backend/src/checkout/`.)

## Ownership set

Per service: spec file `backend/src/checkout/<name>.service.spec.ts` (CREATE).
Do NOT modify the service implementation.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE BANCO DE DADOS + REGRA DE PAGAMENTOS.
2. `AGENTS.md`.
3. Each target service in full.
4. An existing passing checkout spec.
5. `backend/prisma/schema.prisma` — CheckoutOrder/CheckoutProductPlan sections.

## Special rules for Checkout specs

- Money fields use `bigint` cents — assertions on amounts MUST be bigint
  (`expect(result.amount).toBe(1000n)` not `1000`).
- Tenant isolation is CRITICAL — cross-workspace order leak is a P0 bug.
- Idempotency on order submit: replay same idempotency-key → same order, no
  duplicate.
- Post-payment effects: spec covers webhook ordering invariant (payment ID
  before idempotency check).

## Spec template

See `.opencode-prompts/wave-h-coverage/01-kloel-A.md` for canonical template.

## Forbidden moves

- Use `number` for money. Use `bigint`.
- Mock Prisma without asserting workspaceId in where clause.
- Bypass tokens, new `any`.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/checkout/{checkout-catalog-config,checkout-catalog,checkout-order-query,checkout-order,checkout-post-payment-effects,checkout-product-config}.service.spec.ts
npx jest --testPathPattern="checkout/(checkout-catalog|checkout-order|checkout-post-payment|checkout-product-config)" --coverage --collectCoverageFrom="backend/src/checkout/{checkout-catalog-config,checkout-catalog,checkout-order-query,checkout-order,checkout-post-payment-effects,checkout-product-config}.service.ts"
```

Coverage ≥70% lines, ≥65% branches per file.

## Definition of done

- 6 new specs.
- Each covers tenant-isolation explicitly.
- Money assertions use bigint.
- Idempotency test where applicable.
- `npx tsc` no regress.
- `npx eslint` clean.
- No bypass, no protected files, no commits.

## Hard stop conditions

- Service has FINANCIAL bug visible during spec writing — STOP, report (P0).
- Service uses `number` for money internally — STOP, report (financial-integrity
  violation requiring ADR before patch).
