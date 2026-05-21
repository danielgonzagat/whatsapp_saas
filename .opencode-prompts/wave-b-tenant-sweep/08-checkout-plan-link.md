# Wave B / Slice 8 — TenantSweep-CheckoutPlanLink + CheckoutWebhook

## Mission

Eliminate cross-tenant query bugs in `backend/src/checkout/checkout-plan-link.manager.ts`
(17 entries) AND `backend/src/checkout/checkout-webhook.controller.ts` (11 entries).

PlanLink is the public-facing affiliate-link surface. Webhook is the
payment-provider callback. Both have CUSTOMER-FACING tenant boundaries.

## Ownership set

- `backend/src/checkout/checkout-plan-link.manager.ts`
- `backend/src/checkout/checkout-plan-link.manager.spec.ts` (create if missing)
- `backend/src/checkout/checkout-webhook.controller.ts`
- `backend/src/checkout/checkout-webhook.controller.spec.ts` (create if missing)
- `backend/src/checkout/checkout-webhook.helpers.ts` if it exists AND used
  by checkout-webhook.controller (verify in report).

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE PAGAMENTOS + REGRA DE INTEGRAÇÕES EXTERNAS.
2. `AGENTS.md`.
3. Both target files in full.
4. `backend/src/common/decorators/admin-global-operation.decorator.ts`.

## Special rules for public-facing checkout

- PlanLink uses `slug`/`referenceCode` as unique key. Workspace context is
  INFERRED from these. After lookup, internal calls MUST include workspaceId.
- Webhook controller receives from external provider (Stripe/Asaas/MP). The
  external payload's `externalId` MUST be persisted with both `workspaceId`
  AND `provider` to be tenant-safe.
- Idempotency: webhook delivery is retried. Same `externalId+provider` must
  return same response — verify the WebhookEvent unique constraint covers this.

## Pattern to apply

Same as Wave B/4 (CheckoutService): workspaceId in every where, transitive
via product relation when needed. For webhook side, ensure `WebhookEvent`
unique on `(provider, externalId)` is enforced.

## Forbidden moves

- Skip signature verification on webhook (it might already exist).
- Bypass tokens, new `any`, protected files.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/checkout/{checkout-plan-link.manager,checkout-webhook.controller}.{ts,spec.ts}
npx jest --testPathPattern="checkout/(checkout-plan-link|checkout-webhook)"

cd ..
node scripts/ops/check-tenant-filter.mjs --path backend/src/checkout/checkout-plan-link 2>&1 | tail -10
node scripts/ops/check-tenant-filter.mjs --path backend/src/checkout/checkout-webhook 2>&1 | tail -10
```

## Definition of done

- Zero tenant-filter violations.
- Specs cover happy + cross-tenant + webhook idempotency.
- `npx tsc` no regress.
- `npx eslint` clean.
- No bypass, no `any`, no commits.

## Hard stop conditions

- If `WebhookEvent` schema lacks `(provider, externalId)` unique constraint —
  STOP, report (schema fix separate slice).
- If webhook signature verification is missing entirely — STOP, report P0.
