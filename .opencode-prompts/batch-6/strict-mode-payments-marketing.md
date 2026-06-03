# Wave Q/8 — Strict-mode sweep payments + marketing + webhooks (~50 errors)

## Mission

Eliminate strict-mode tsc errors in `backend/src/payments/`, `backend/src/marketing/`, and `backend/src/webhooks/`.

## Pre-read mandatory

1. `CLAUDE.md` — REGRA DE PAGAMENTOS / STRIPE / MARKETPLACE (critical for payments files)
2. `AGENTS.md`
3. `docs/plans/STRIPE_MIGRATION_PLAN.md`
4. `scripts/decomp/opencode-subagent-delegation-rules.md`

## Target files

- `backend/src/payments/**/*.ts` (excluding `.spec.ts`)
- `backend/src/marketing/email-marketing.service.ts` (14 errors)
- `backend/src/marketing/marketing.controller.ts` (7 errors)
- `backend/src/webhooks/payment-webhook-stripe.handlers2.ts` (10 errors)
- `backend/src/webhooks/payment-webhook-stripe.handlers2.helpers.ts` (7 errors)
- `backend/src/webhooks/**/*.ts` (other)

Ownership: ONLY these files + their spec peers.

## Method

Same as Wave Q/7 (see batch-6/strict-mode-kloel.md for full TS error patterns and fix recipes).

## Financial-code special rules

- **Money in `bigint` cents always.** If you see `number` for an amount, that's a real bug — STOP and report.
- **Append-only ledger.** If you encounter `ledger.update` or any mutation of historical entries, STOP and report.
- **Webhook idempotency.** All webhook handlers must have idempotency via WebhookEvent unique constraint. If you find a handler that lacks it, STOP and report.
- **No fallback for missing config.** If Stripe SDK isn't configured, throw a real config error — don't substitute a fake response.

## Constraints (CLAUDE.md)

Same as Wave Q/7 — no bypass tokens, no commits, no protected files.

## Definition of Done

- `cd backend && npx tsc --noEmit 2>&1 | grep -E 'src/(payments|marketing|webhooks)' | wc -l` returns 0
- `npx eslint src/payments src/marketing src/webhooks` (touched files) clean
- `npx jest --testPathPatterns="(payments|marketing|webhooks)"` no regression
- Report: file count, error count per error code

## Hard stop conditions

- Real bug in payment processing logic — STOP, report P0
- Missing webhook secret env causes test failure — STOP, report
