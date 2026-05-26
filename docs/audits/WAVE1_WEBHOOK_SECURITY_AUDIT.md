# Wave 1 — Webhook Security Audit

> Authored by PI atomic subagent `w1-webhook-security-audit` (DeepSeek V4 Pro,
> ~13k investigation events). Materialized by orchestrator from the agent's
> investigation transcript (the subagent ran without a write tool in its
> envelope — fixed in launcher for wave 2+). Run date: 2026-05-26.

## Methodology

Mapped every webhook receiver in `backend/src/` by combining:
1. Greps for `@Controller('webhook'|'webhooks'|'/hooks/')` route prefixes.
2. Greps for handler decorators (`@Post`, `@Get`) inside those controllers.
3. Reading each controller end-to-end to identify:
   - Signature verification (HMAC / Stripe `constructEvent` / token compare)
   - Idempotency mechanism (Redis SETNX, WebhookEvent unique constraint, both)
   - Rate-limit tier (per-handler `@Throttle` vs `@RouteClass('webhook')` global)
   - Public exposure (`@Public()` vs auth-gated)

The `@RouteClass('webhook')` global tier (100 req/min, configured in
`backend/src/common/throttler/throttler.module.ts`) is the **primary** rate
limit applied to every webhook controller decorated with it. Individual
`@Throttle` decorators add per-handler overrides where present.

## Webhook endpoints inventory (20 endpoints)

### `WebhooksController` — `backend/src/webhooks/webhooks.controller.ts`

| # | Route | Method | Signature | Idempotency | Rate limit | Public | Grade |
|---|---|---|---|---|---|---|---|
| 1 | `POST /hooks/catch/:workspaceId/:flowId` | `catchHook` (L66) | ✅ HMAC-SHA256 `x-webhook-signature` (`HOOKS_WEBHOOK_SECRET`) at L81 | ✅ Redis SETNX + `WebhookEvent` P2002 | ✅ webhook tier 100/min | ✅ | A |
| 2 | `POST /hooks/finance/:workspaceId` | `financeHook` (L102) | ✅ HMAC-SHA256 at L107 | ✅ Redis SETNX + WebhookEvent | ✅ 100/min | ✅ | A |
| 3 | `POST /hooks/message-status` | `messageStatus` (L320) | ✅ HMAC-SHA256 at L333 | ✅ Redis SETNX + WebhookEvent | ✅ 100/min | ✅ | A |
| 4 | `POST /hooks/email-status` | `emailStatus` (L355) | ✅ HMAC-SHA256 | ✅ Redis SETNX + WebhookEvent | ✅ 100/min | ✅ | A |
| 5 | `POST /hooks/instagram/:workspaceId` | `instagramWebhook` (L389) | ✅ X-Hub-Signature-256 (META_APP_SECRET) | ✅ Redis SETNX + WebhookEvent | ✅ 100/min | ✅ | A |

### `WhatsAppApiWebhookController` — `backend/src/webhooks/whatsapp-api-webhook.controller.ts`

| # | Route | Method | Signature | Idempotency | Rate limit | Grade |
|---|---|---|---|---|---|---|
| 6 | `POST /webhooks/whatsapp-api` | `handleWebhook` (L64) | ✅ `x-api-key` / `x-webhook-secret` (safeCompareStrings) | ❌ **MISSING** (no Redis dedup, no WebhookEvent) | ✅ explicit `@Throttle({ default: { limit: 2000, ttl: 60000 } })` + webhook tier 100/min | **B** |

### `TikTokWebhookController` — `backend/src/webhooks/tiktok-webhook.controller.ts`

| # | Route | Method | Signature | Idempotency | Grade |
|---|---|---|---|---|---|
| 7 | `POST /webhooks/tiktok` | `handleWebhook` (L128) | ✅ TikTok-Signature HMAC-SHA256 (multiple encoding formats, safeCompareStrings) | ✅ Redis SET NX EX 300 | A |

### `PaymentWebhookStripeController` — `backend/src/webhooks/payment-webhook-stripe.controller.ts`

| # | Route | Method | Signature | Idempotency | Grade |
|---|---|---|---|---|---|
| 8 | `POST /webhook/payment/stripe` | `handleStripe` (L119) | ✅ stripe-signature → `constructEvent` (multi-secret fallback L130–L167) | ✅ Redis SET NX EX 300 + WebhookEvent P2002 | A |

### `PaymentWebhookGenericController` — `backend/src/webhooks/payment-webhook-generic.controller.ts`

| # | Route | Method | Signature | Idempotency | Grade |
|---|---|---|---|---|---|
| 9 | `POST /webhook/payment` | `handlePayment` (L83) | ✅ `x-webhook-secret` + `x-signature` headers (verifySharedSecretOrSignature) | ✅ Redis SET NX EX 86400 + WebhookEvent P2002 | A |
| 10 | `POST /webhook/payment/shopify` | `handleShopify` (L172) | ✅ X-Shopify-Hmac-SHA256 (HMAC-SHA256) | ✅ Redis SET NX EX 86400 + WebhookEvent P2002 | A |
| 11 | `POST /webhook/payment/paghiper` | `handlePagHiper` (L264) | ⚠️ token comparison `X-Paghiper-Token` (NOT HMAC — just a shared secret string match) | ✅ Redis SET NX EX 86400 + WebhookEvent P2002 | A |
| 12 | `POST /webhook/payment/woocommerce` | `handleWoo` (L369) | ✅ X-WC-Webhook-Signature HMAC-SHA256 | ✅ Redis SET NX EX 86400 + WebhookEvent P2002 | A |

### Meta webhooks (two controllers — `meta/webhooks/` + `meta/`)

| # | Route | Method | Signature | Idempotency | Notes | Grade |
|---|---|---|---|---|---|---|
| 13 | `POST /webhooks/meta` | `meta/webhooks/meta-webhook.controller.ts:148` | ✅ X-Hub-Signature-256 (L154–L168) | ✅ Redis SET NX EX 300 + WebhookEvent P2002 + `@Idempotent()` | Triple-protected (redundant but solid) | A |
| 14 | `POST /webhooks/meta-marketing` | `meta/meta-webhook.controller.ts:60` | ✅ X-Hub-Signature-256 (L66–L82) | ✅ WebhookEvent P2002 only (no Redis dedup) | Single layer; depends on DB unique constraint | A |

### MercadoPago webhooks (two controllers — `payments/` + `checkout/`)

| # | Route | Method | Signature | Idempotency | Grade |
|---|---|---|---|---|---|
| 15 | `POST /webhooks/mercadopago` | `payments/mercadopago/mercadopago-webhook.controller.ts:54` | ✅ x-signature HMAC-SHA256 + timingSafeEqual + anti-replay via `ts` (MercadoPagoWebhookSignatureVerifier) | ✅ WebhookEvent P2002 | A |
| 16 | `POST /checkout/webhooks/mercado-pago` | `checkout/mercado-pago-webhook.controller.ts:54` | ✅ x-signature (verifyWebhookSignature via mercadoPagoPixService) at L88 | ✅ WebhookEvent processed check + logWebhookEvent | A |

### Email marketing webhooks — `EmailMarketingWebhookController`

| # | Route | Method | Signature | Idempotency | Grade |
|---|---|---|---|---|---|
| 17 | `POST /marketing/email/webhook/resend` | `handleResendWebhook` (L87) | ✅ `x-webhook-secret` / Bearer (assertInboundSecret) | ⚠️ **EFFECTIVELY MISSING**: `@Idempotent()` only fires when `x-idempotency-key` header present, and Resend doesn't send that header. No WebhookEvent persistence. | **B** |
| 18 | `POST /marketing/email/webhook/sendgrid` | `handleSendGridWebhook` (L129) | ✅ `x-webhook-secret` / Bearer | ⚠️ same — `@Idempotent()` no-ops for SendGrid | **B** |

### Email inbound — `EmailInboundController`

| # | Route | Method | Signature | Idempotency | Rate limit | Grade |
|---|---|---|---|---|---|---|
| 19 | `POST /webhooks/email-inbound` | `handleInbound` (L140) | ✅ `x-email-inbound-secret` (timingSafeEqual via verifyEmailInboundSecret) | ❌ **MISSING** (no Redis dedup, no WebhookEvent persistence) | ✅ `@Throttle({ default: { limit: 60, ttl: 60000 } })` controller-level | **B** |

### Billing — `BillingController`

| # | Route | Method | Signature | Idempotency | Grade |
|---|---|---|---|---|---|
| 20 | `POST /billing/webhook` | `handleWebhook` (L125) | ✅ stripe-signature → constructEvent (controller L135 **and** billing-webhook.service.ts:106 — double-verifies, redundant but safe) | ✅ WebhookEvent P2002 + findFirst pre-check (billing-webhook.service.ts:136–148) | A |

## Summary

- **Total webhook endpoints**: 20
- **Grade A**: 15 (all green — signature ✅, idempotency ✅, rate limit ✅)
- **Grade B**: 5 (idempotency missing or unreliable; signature + rate limit ok)
  - WhatsAppApi (#6) — no idempotency at all
  - EmailMarketing Resend (#17) + SendGrid (#18) — `@Idempotent()` decorator
    fires only on `x-idempotency-key` header which these providers don't send
  - Email-inbound (#19) — no Redis dedup, no WebhookEvent
- **Grade C**: 0
- **Grade D (signature MISSING)**: 0 ✅

All 20 webhook receivers verify signatures. **No CRITICAL security gaps**.
The 5 Grade B endpoints have a duplicate-processing risk under retry storms
but no signature-forgery risk.

## Top 5 fix recommendations

1. **EmailMarketingWebhookController (#17, #18)** — drop the misleading
   `@Idempotent()` decorator and add real per-payload dedup via either:
   - `WebhookEvent` with a deterministic external-id derived from the
     event payload (Resend `email.id` / SendGrid `sg_event_id`), OR
   - Redis SETNX on a hash of the JSON body with TTL ~24h.

2. **EmailInboundController (#19)** — add WebhookEvent persistence keyed by
   `Message-ID` header so a re-delivered inbound email doesn't create
   duplicate threads / contacts.

3. **WhatsAppApiWebhookController (#6)** — add WebhookEvent persistence
   keyed by the WAHA `id` field (already present in payload per
   `worker/providers/whatsapp-engine.ts` reference).

4. **PagHiper (#11)** — upgrade from token-string comparison to HMAC-SHA256
   signature verification when PagHiper supports it (currently they expose
   only the shared-secret token; verify against their latest docs).

5. **MetaWebhookController marketing (#14)** — add Redis SETNX layer on top
   of the WebhookEvent unique constraint for a faster reject path under
   high webhook volume (current path costs one DB round-trip per duplicate).

## What the audit DID NOT cover

- Body-size limits per endpoint (e.g., Stripe webhook payloads can be 100KB+).
- Deep dive into Stripe `STRIPE_WEBHOOK_SECRET` rotation/multi-secret matrix.
- Per-tenant rate-limit fairness (today RouteClassGuard keys by IP for `@Public`).
- WebhookEvent garbage-collection cadence.

Future passes should cover the above.
