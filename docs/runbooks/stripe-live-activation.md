# Stripe live-mode activation runbook

> Cuts Kloel over from `sk_test_*` to `sk_live_*` for production payments via Stripe Connect (card) per ADR-0003.

**Owner:** Daniel
**Last update:** 2026-05-26 — W28 Tier 1 wave
**Related:** [ADR-0003 Stripe Connect marketplace model](../adr/0003-stripe-connect-marketplace-model.md), [MercadoPago PIX deploy runbook](mercadopago-pix-deploy.md), [secrets-rotation](secrets-rotation.md)

## Pre-checks (run from terminal)

```sh
# 1. Confirm sentry has no STARTUP FATAL (current secrets must already be set in prod)
# Use mcp__sentry-bridge__sentry_recent_issues since_minutes=60 — must NOT show
# STARTUP FATAL events.

# 2. Confirm production-startup-guard has the sk_live_ assertion wired
grep "sk_live_" backend/src/config/production-startup-guard.ts

# 3. Confirm Kloel Tecnologia LTDA passed Stripe KYC
#    https://dashboard.stripe.com/settings/account — should say "Verified"

# 4. Confirm webhook endpoint NOT yet created
#    https://dashboard.stripe.com/webhooks — should be empty for live mode
```

## Step 1 — Enable live mode in Stripe dashboard

1. Sign in to https://dashboard.stripe.com with the Kloel owner account
2. Toggle "Live mode" in the top-right (was "Test mode")
3. Verify the account name = "Kloel Tecnologia LTDA" and CNPJ is correct
4. Note the live publishable key (`pk_live_*`) — not needed in this runbook but useful for frontend `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` later

## Step 2 — Create the live webhook endpoint

1. Go to https://dashboard.stripe.com/webhooks (in live mode)
2. Click "Add endpoint"
3. Endpoint URL: `https://api.kloel.com/webhook/payment`
4. Description: `kloel-backend payment webhook (Stripe Connect)`
5. Events to send: at minimum
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.created` / `customer.updated`
   - `customer.subscription.created` / `customer.subscription.updated` / `customer.subscription.deleted`
   - `invoice.payment_succeeded` / `invoice.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`
   - `account.updated` (Stripe Connect)
   - `payout.paid` / `payout.failed`
6. Save → reveal the signing secret (`whsec_*`) and copy it.

## Step 3 — Reveal the live secret key

1. https://dashboard.stripe.com/apikeys (live mode)
2. Reveal the standard live secret key (`sk_live_*`) and copy it.

## Step 4 — Push the secrets to Railway

```sh
# Authenticate Railway CLI first (interactive, one-time)
railway login

# Link to the kloel backend project
railway link

# Push the 2 new live values + 0 changes to others
railway variables set \
  STRIPE_SECRET_KEY="sk_live_xxxxxxxxxxxxxxxxxxxxxxx" \
  STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxxxxxxxxxxx" \
  --service backend

# Railway will redeploy automatically
```

## Step 5 — Verify boot

After redeploy (3-5 min):

```sh
# Backend should boot WITHOUT STARTUP FATAL
# Watch Sentry for any new boot-time errors
# Use mcp__sentry-bridge__sentry_recent_issues since_minutes=10

# Backend should be reachable
curl -fsSL https://api.kloel.com/health
```

If `production-startup-guard` rejects (because `sk_live_` prefix check), Railway log will show:

```
[STARTUP] FATAL: production secrets must use live-mode prefixes: STRIPE_SECRET_KEY (expected prefix sk_live_)
```

That means a `sk_test_*` value was pushed by mistake — re-run the railway variables set with the correct value.

## Step 6 — Smoke test a real charge

1. Create a real test Stripe customer via the production API (POST `/billing/customers` from a curl + admin JWT)
2. Use a real consumer credit card (Daniel's own) to make a R$ 1,00 charge
3. Verify in Stripe dashboard the payment shows
4. Verify webhook fires — check `connect_ledger_entries` table:

```sql
SELECT id, type, amount_cents, created_at
FROM connect_ledger_entries
ORDER BY created_at DESC
LIMIT 5;
```

5. Confirm a CREDIT_PENDING row appears within seconds of the charge.

## Step 7 — Refund the test charge

1. https://dashboard.stripe.com/payments → find the R$1 charge → Refund
2. Confirm `connect_ledger_entries` gets a DEBIT_REFUND row.

## Rollback

If anything fails:

```sh
railway variables set \
  STRIPE_SECRET_KEY="sk_test_xxxxxxxxxxxxxxxxxxx" \
  STRIPE_WEBHOOK_SECRET="whsec_test_xxxxxxxxxxxxxxx" \
  --service backend
```

Stripe live charges already taken before rollback continue to flow webhooks to the production endpoint — they will fail signature verification once the secret is reverted. Process them manually via the Stripe dashboard if needed.

## Post-checks (24h later)

- `mcp__sentry-bridge__sentry_top_issues window_hours=24` — confirm no spike in payment-related errors
- `mcp__codecov__codecov_status` — confirm no coverage regression in payments module
- Datadog monitor `kloel.stripe.webhook_error_rate > 5%` is NOT firing
- Stripe dashboard "Failed payments" remains at baseline

## Related

- [docs/adr/0003-stripe-connect-marketplace-model.md](../adr/0003-stripe-connect-marketplace-model.md)
- [docs/runbooks/secrets-rotation.md](secrets-rotation.md) — quarterly key rotation cadence
- [docs/runbooks/mercadopago-pix-deploy.md](mercadopago-pix-deploy.md) — sister runbook for PIX
- [scripts/ops/prod-secrets/apply.sh](../../scripts/ops/prod-secrets/apply.sh) — initial secrets wiring
- [scripts/ops/stripe-bootstrap-plans.mjs](../../scripts/ops/stripe-bootstrap-plans.mjs) — must run AFTER this runbook to create the 3-plan ladder
- [scripts/ops/check-stripe-products.mjs](../../scripts/ops/check-stripe-products.mjs) — CI gate
