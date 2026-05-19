# Wave Q/8 — Backend strict-mode payments + marketing + webhooks (~50 errors)

## Mission

Eliminate strict-mode tsc errors in `backend/src/payments/`, `backend/src/marketing/`, and `backend/src/webhooks/`.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE PAGAMENTOS/STRIPE/MARKETPLACE (CRITICAL for payments files) + REGRA DE SEGREDOS + REGRA DE WEBHOOK
3. `docs/plans/STRIPE_MIGRATION_PLAN.md`
4. `docs/adr/0003-stripe-connect-platform-model.md`
5. `AGENTS.md`

## Target files

- `backend/src/payments/**/*.ts` (excluding `.spec.ts`)
- `backend/src/marketing/email-marketing.service.ts` (14 errors)
- `backend/src/marketing/marketing.controller.ts` (7 errors)
- `backend/src/webhooks/payment-webhook-stripe.handlers2.ts` (10 errors)
- `backend/src/webhooks/payment-webhook-stripe.handlers2.helpers.ts` (7 errors)
- All other `backend/src/webhooks/**/*.ts`

## Method

Same patterns as Wave Q/7 (see batch-7/wave-q-backend-kloel.md). Plus financial-code special rules:

## Financial-code special rules (NON-NEGOTIABLE)

- **Money in `bigint` cents always.** If you see `number` for an amount, that's a real bug — STOP and report.
- **Append-only ledger.** If you encounter `ledger.update` or any mutation of historical entries, STOP and report.
- **Webhook idempotency.** All webhook handlers must verify `(provider, externalId)` unique constraint in WebhookEvent before processing. If you find a handler missing this guard, STOP and report.
- **Signature verification.** Stripe handlers must verify `stripe-signature` header via STRIPE_WEBHOOK_SECRET. Do not bypass.
- **No fallback for missing config.** If Stripe SDK isn't configured, throw a real config error.
- **Centavos calculation.** No floats in money math. Use `BigInt` arithmetic.
- **PII hashing in CAPI.** Email/phone must be SHA-256 hashed before transmission.

## Constraints (CLAUDE.md)

- NO bypass tokens
- NO commits — orchestrator commits after Tier-3 validation
- NO modifying protected files
- NO logging tokens, secrets, raw payloads (only first-4 + last-4 masked for tokens)

## Definition of Done

- `cd backend && npx tsc --noEmit 2>&1 | grep -E "src/(payments|marketing|webhooks)" | wc -l` returns 0
- `npx eslint` on touched files clean
- `npx jest --testPathPatterns="(payments|marketing|webhooks)"` no regression
- Report file count, error count per error code, financial-code special-rule audits

## Hard stop conditions

- Real bug in payment processing logic discovered — STOP, report P0
- Missing webhook secret env causes test failure — STOP, report
- A ledger.update or float-money pattern found — STOP, report immediately
