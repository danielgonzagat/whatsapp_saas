# Wave L — PULSE 2 critical expectations (customer-whatsapp + payment-webhook)

## Mission

Implement observed evidence for 2 specific PULSE expectations (focused, achievable in single session):

1. `customer-whatsapp-and-inbox:message-persistence` — Playwright: open inbox → send message → reload → see persisted
2. `system-payment-reconciliation:payment-webhook-replay` — webhook arrives 2x same idempotency key → processed once

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE EVIDÊNCIA OBRIGATÓRIA + REGRA DE WHATSAPP/AUTOPILOT + REGRA DE PAGAMENTOS
3. `AGENTS.md`
4. `e2e/specs/customer-whatsapp-and-inbox.spec.ts` (existing, complete it)
5. `e2e/specs/system-payment-reconciliation.spec.ts` (existing, complete it)
6. `e2e/e2e-helpers.ts` for fixtures

## Method

### Expectation 1: customer-whatsapp message-persistence

Test flow:
```
1. Login as test workspace user
2. Navigate to /inbox
3. Send message via inbox composer to test contact
4. Wait for message to appear in conversation
5. Reload page (window.location.reload())
6. Verify message still visible in conversation (persisted in DB)
7. Verify message in `Message` table via API query
```

Use existing test fixtures (`/e2e/e2e-helpers.ts` `createTestWorkspace`, `createTestContact`).

### Expectation 2: payment-webhook-replay

Test flow:
```
1. Create test checkout order in DB
2. Generate Stripe-like webhook payload with idempotency_key=X
3. POST to /webhooks/stripe with header `stripe-signature` (mock signature OR set STRIPE_WEBHOOK_SECRET=test)
4. Verify 1 LedgerEntry created
5. POST same payload again
6. Verify NO new LedgerEntry (idempotency enforced)
7. Verify WebhookEvent table shows 2 receives but 1 processed
```

## Ownership set

- `e2e/specs/customer-whatsapp-and-inbox.spec.ts` (extend)
- `e2e/specs/system-payment-reconciliation.spec.ts` (extend)
- `e2e/e2e-helpers.ts` (add helpers if needed)

## Constraints

- NO bypass tokens
- NO commits
- Tests use REAL flows (mock only Stripe signature validation)
- Evidence emit must be captured by PULSE (use `pulse:scenario-evidence` helper if available)

## Definition of Done

- Both expectations now have observed evidence (test passes when run against test backend)
- `pnpm --filter e2e test specs/customer-whatsapp-and-inbox.spec.ts` exits 0
- `pnpm --filter e2e test specs/system-payment-reconciliation.spec.ts` exits 0
- Report per-expectation: spec lines added, what flow proves the expectation

## Hard stop conditions

- Requires real production DB / Stripe live key — STOP, gate test on env presence
- Test infra setup >2h — STOP, report scope
