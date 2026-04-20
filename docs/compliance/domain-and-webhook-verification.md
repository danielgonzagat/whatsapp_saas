# Kloel Domain Verification and Webhook Verification

## 1. Google Search Console domain verification

Goal: prove ownership of `kloel.com` before Google OAuth Verification.

Recommended method: DNS TXT on the apex domain.

1. In Google Search Console, add a `Domain` property for `kloel.com`.
2. Copy the TXT record Google provides.
3. Add the TXT record in Cloudflare DNS for the root domain.
4. Wait for propagation.
5. Click `Verify` in Search Console.

Do not use a temporary subdomain-only verification. OAuth reviewers want the actual production domain.

## 2. Meta Business Manager domain verification

Goal: prove ownership of `kloel.com` inside Meta Business Manager.

Recommended method: DNS TXT in Cloudflare.

1. In Meta Business Manager, open Brand Safety → Domains.
2. Add `kloel.com`.
3. Choose DNS verification.
4. Copy the TXT value from Meta.
5. Add it in Cloudflare DNS.
6. Verify the domain in Meta.

If Meta forces HTML tag verification instead, place the meta tag on the marketing site root layout and redeploy. DNS remains the cleaner long-term option.

## 3. Meta webhook public endpoint

Backend controller path:

- `GET /webhooks/meta`
- `POST /webhooks/meta`

Recommended public URL if `app.kloel.com` proxies `/api/*` to the backend:

- `https://app.kloel.com/api/webhooks/meta`

### Verification flow

Meta calls the GET endpoint with:

- `hub.mode=subscribe`
- `hub.verify_token=<token>`
- `hub.challenge=<challenge>`

Kloel compares `hub.verify_token` with `META_WEBHOOK_VERIFY_TOKEN` and echoes the sanitized `hub.challenge` as plain text.

### Signed POST flow

Meta sends real events with `X-Hub-Signature-256`.

Kloel:

- recalculates the HMAC SHA-256 with `META_APP_SECRET`
- compares it using constant-time string comparison
- processes the webhook envelope by `object`
- returns `200 OK` quickly

## 4. Meta event subscriptions to enable

### WhatsApp Business Account

- messages
- message template status updates
- phone number quality / status updates
- account updates

### Facebook Page / Messenger

- messages
- messaging postbacks
- messaging reads
- feed events if the product flow requires them

### Instagram

- messages
- messaging postbacks
- comments
- mentions

## 5. Google Cross-Account Protection registration

Controller path in code:

- `POST /auth/google/risc-events`

Recommended public URL if `app.kloel.com` proxies `/api/*` to the backend:

- `https://app.kloel.com/api/auth/google/risc-events`

Register it with the Google RISC API after the service account with the `risc` scope is ready.

## 6. Smoke test command

The repository now contains `scripts/smoke-test-prod.ts`.

Because `package.json` is governance-protected, no new root `npm run` alias was added automatically. Run it with:

```bash
npm --prefix frontend exec -- tsx scripts/smoke-test-prod.ts
```

Useful environment variables for the smoke test:

- `SMOKE_SITE_URL=https://kloel.com`
- `SMOKE_APP_URL=https://app.kloel.com`
- `SMOKE_API_URL=https://app.kloel.com/api`
- `SMOKE_META_VERIFY_TOKEN=...`
- `SMOKE_META_APP_SECRET=...`
- `SMOKE_FACEBOOK_TEST_USER_ID=...`
- `SMOKE_GOOGLE_RISC_JWT=...` for a valid SET replay
- `SMOKE_CHECKOUT_URL=https://pay.kloel.com/seu-checkout`
