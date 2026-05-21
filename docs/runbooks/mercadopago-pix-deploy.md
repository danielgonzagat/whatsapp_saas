# Mercado Pago PIX — deploy + activation runbook

> Companion to [ADR-0009](../adr/0009-mercadopago-pix-stripe-card-split.md).
> This runbook tells you exactly what to set, where, in what order, to
> light up PIX in production.

## Prerequisites

- Mercado Pago application "Kloel pix" created at
  https://www.mercadopago.com.br/developers/panel/applications
- Railway project `production` exists (`a30c8458-fd36-4b01-a13d-ee342a276865`)
- Vercel project for the frontend domains is connected
- Branch `feat/kloel-cognitive-organism` (or `main` after merge) deployed

## 1. Local development setup

Edit `.env.pulse.local` (gitignored — never committed) and add:

```bash
MERCADOPAGO_PUBLIC_KEY=APP_USR-...            # from MP dashboard, public, safe to embed
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...          # SECRET, never log
MERCADOPAGO_CLIENT_ID=...                     # safe to embed
MERCADOPAGO_CLIENT_SECRET=...                 # SECRET, never log
MERCADOPAGO_WEBHOOK_SECRET=                   # set after step 3
MERCADOPAGO_SANDBOX=true                      # 'false' switches to live
```

Then:

```sh
cd backend && npm run build
npm run dev  # or your usual run script
```

The boot log shows one of:
- `MercadoPago adapter READY (sandbox=true, webhookSecretSet=true)` ← good
- `MercadoPago adapter UNAVAILABLE — ...` ← fix env first

## 2. Railway env (production backend + worker)

Use Railway dashboard → project `production` → service `backend` → Variables:

```
MERCADOPAGO_PUBLIC_KEY=<from MP dashboard>
MERCADOPAGO_ACCESS_TOKEN=<from MP dashboard, SECRET>
MERCADOPAGO_CLIENT_ID=<from MP dashboard>
MERCADOPAGO_CLIENT_SECRET=<from MP dashboard, SECRET>
MERCADOPAGO_WEBHOOK_SECRET=<set in step 3>
MERCADOPAGO_SANDBOX=false
```

Repeat for the `worker` service (same vars; worker doesn't process PIX
charges directly but may schedule notifications).

After saving, Railway redeploys automatically. Wait for green check.

## 3. Configure the webhook in MP dashboard

1. Go to https://www.mercadopago.com.br/developers/panel/notifications/webhooks
2. Click "Configurar notificações"
3. URL: `https://api.kloel.com/webhooks/mercadopago`
   (replace `api.kloel.com` with your production backend host)
4. Events: select **only** `Pagamentos` (or `payment` if shown as code)
5. Click "Salvar". MP shows the **Webhook Secret** — copy it.
6. Set `MERCADOPAGO_WEBHOOK_SECRET=<that value>` in Railway (step 2 vars)
7. Redeploy backend so the new secret loads

## 4. Vercel env (frontend — only public key)

In Vercel dashboard → project → Settings → Environment Variables:

```
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=<MP public key>
```

The `NEXT_PUBLIC_` prefix is required for the frontend SDK to see it.
**Never** put `MERCADOPAGO_ACCESS_TOKEN` here — it would leak to every
browser. Access Token is backend-only.

## 5. Smoke test (sandbox)

With `MERCADOPAGO_SANDBOX=true` set:

```sh
# 1. Boot the backend (or hit the deployed sandbox URL)
# 2. POST to PIX charge:
curl -X POST http://localhost:3000/payments/pix/charge \
  -H 'Content-Type: application/json' \
  -d '{
    "idempotencyKey": "test-001",
    "amountCents": 10000,
    "payerEmail": "test_user_123@testuser.com",
    "description": "Smoke test",
    "externalReference": "test-001",
    "expiresAtMinutes": 30
  }'
```

Expected response includes:
- `qrCode` (the copia-e-cola string)
- `qrCodeBase64` (PNG, base64)
- `externalId` (MP payment id, numeric)
- `status: 'pending'`

Then in MP dashboard → Test users, simulate payment approval. Within
seconds, MP fires a webhook to `/webhooks/mercadopago`. Backend logs:

```
mp_webhook_processed externalId=... status=approved
```

And the `Payment` row updates to `status='APPROVED'`.

## 6. Going live

Once sandbox flow works:

1. Switch `MERCADOPAGO_SANDBOX=false` on Railway
2. Replace test credentials with production credentials (use MP dashboard
   "Production credentials" tab)
3. Trigger a redeploy
4. Verify boot log says `MercadoPago adapter READY (sandbox=false, ...)`
5. Run one small real PIX (R$ 1,00 to yourself) end-to-end
6. Verify Ledger entry posted with `provider='mercadopago'`

## Monitoring + alerting

Backend logs key events:
- `mp_pix_charge_created externalRef=X externalId=Y status=Z` (success)
- `mp_pix_charge_error ...` (network/4xx)
- `mp_webhook_rejected reason=Z requestId=W` (signature failed — investigate)
- `mp_webhook_duplicate externalId=Z` (normal — MP retries are expected)
- `mp_webhook_processed externalId=Z status=approved`

Set up Datadog/Railway log filters on `mp_webhook_rejected` — any spike
indicates either MP credential rotation or active probing.

## Rollback

If MP starts misbehaving:

1. Unset `MERCADOPAGO_ACCESS_TOKEN` in Railway → adapter becomes
   `UNAVAILABLE` → PIX charges fail with `mercadopago_not_configured` (no
   silent fallback to Stripe per ADR-0009)
2. Stripe + cartão keep working independently
3. Investigate; redeploy MP only after fix

## Credential rotation (planned)

When you decide to rotate the credentials that were exposed during the
2026-05-20 session (see [ADR-0010](../adr/0010-credential-risk-acceptance-2026-05-20.md)):

1. MP dashboard → "Kloel pix" → renew Access Token + Client Secret
2. Update Railway env vars (step 2) with new values
3. Backend auto-redeploys; verify boot log still says READY
4. Old token gets invalidated by MP within minutes
5. Update ADR-0010 status to `Mitigated (rotated YYYY-MM-DD)`

No code changes needed — the env-based config picks up new values on
boot.
