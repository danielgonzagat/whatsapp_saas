# W27-B — Webhook security audit

**Date:** 2026-05-26
**Auditor:** Claude Explore agent
**Scope:** all webhook receivers in `backend/src/`

## Executive summary

| Controller | Grade | Signature | Idempotency | Replay | Audit |
|---|:-:|---|---|---|---|
| `meta/webhooks/meta-webhook.controller.ts` | **A** | HMAC-SHA256 + constant-time | Redis SET NX 300s + DB unique | Both layers | full |
| `payments/mercadopago/mercadopago-webhook.controller.ts` | **A** | Custom signature verifier | DB `@@unique([provider, externalId])` | DB-enforced | full |
| `meta/meta-webhook.controller.ts` (marketing) | **B+** | HMAC-SHA256 conditional on `META_APP_SECRET` | Redis SET NX 300s only | Redis-only (ephemeral) | partial |
| `checkout/mercado-pago-webhook.controller.ts` | **B** | **Optional** signature verification | `WebhooksService.logWebhookEvent` | DB-based | partial |

**Top risk:** `checkout/mercado-pago-webhook.controller.ts` allows production deployment without signature verification if `MERCADOPAGO_WEBHOOK_SECRET` env var is missing — silent degradation to "anyone can spoof webhooks" mode.

**Recommendation:** consolidate to the **A-grade** controllers (Meta + MercadoPago canonical) and deprecate the **B/B+** variants. See [W27-D — webhook dedup plan](#related).

---

## Detail per controller

### 1. `backend/src/meta/webhooks/meta-webhook.controller.ts` — **A**

- **Route:** `POST /webhooks/meta`
- **Decorator:** `@Public()` (signature-based auth)
- **Signature:** HMAC-SHA256 over body, header `x-hub-signature-256`, comparison via `safeCompareStrings()` (constant-time)
  - Lines 162-177
- **Idempotency double-layer:**
  - Redis SET NX with 300s TTL (lines 181-185)
  - DB unique constraint on `WebhookEvent.(provider, externalId)` (lines 192-206)
- **Audit:** Full `WebhookEvent` row with `status`, `provider`, `externalId`, payload digest
- **Response policy:** Always 200 (per Meta spec — signature failures logged but not exposed)

### 2. `backend/src/payments/mercadopago/mercadopago-webhook.controller.ts` — **A**

- **Route:** `POST /webhooks/mercadopago`
- **Decorator:** `@Public()` + signature verifier
- **Signature:** `verifyMercadoPagoWebhookSignature()` checks `x-signature` header (lines 61-71)
- **Idempotency:** `WebhookEvent.create()` with `@@unique([provider, externalId])`; P2002 caught and treated as already-processed (lines 78-101)
- **Replay protection:** DB unique-constraint enforces one-time semantics
- **Logging discipline:** CLAUDE.md compliance — logs `requestId` + `externalId` only, never the body
- **ADR alignment:** Matches ADR-0009 MercadoPago PIX pattern

### 3. `backend/src/meta/meta-webhook.controller.ts` (marketing) — **B+**

- **Route:** `POST /webhooks/meta-marketing`
- **Signature:** HMAC-SHA256, header `x-hub-signature-256`, **conditional on `META_APP_SECRET` being set** (lines 88-105). If missing, signature step is skipped.
- **Idempotency:** Redis SET NX with 300s TTL per entry (lines 107-121). **No permanent DB row.**
- **Replay protection:** Redis-only — if Redis is flushed, replays succeed.
- **Audit:** Limited; logs to webhook-event log table (lines 129-135)

**Gap to A grade:** Add `WebhookEvent` DB row with unique constraint mirroring receiver #1's pattern.

### 4. `backend/src/checkout/mercado-pago-webhook.controller.ts` — **B**

- **Route:** `POST /checkout/webhooks/mercado-pago`
- **Decorator:** `@Public()`
- **Signature:** OPTIONAL — `if (MERCADOPAGO_WEBHOOK_SECRET)` (lines 76-92). Logs a production warning when missing (line 90-91) but **does not refuse the request**.
- **Idempotency:** `webhooksService.logWebhookEvent()` writes status — depends on `WebhooksService` dedup logic
- **Replay protection:** DB-side via `WebhooksService`
- **Auth:** Public + optional signature → effectively unauthenticated in misconfigured envs

**Gap to A grade:** Make signature **mandatory** in production (throw 403 if `MERCADOPAGO_WEBHOOK_SECRET` missing AND `NODE_ENV=production`).

---

## Common patterns observed

All four controllers correctly:

- Decorate as `@Public()` (signature replaces JWT)
- Return HTTP 200 on signature failure (correct anti-enumeration pattern)
- Log selectively (no PII/payload exposure)
- Catch P2002 as idempotent (duplicate-event handling)

## Weaknesses across the surface

1. **Optional signatures in production envs** — `checkout/mercado-pago-webhook.controller.ts`
2. **Redis-only idempotency** — `meta/meta-webhook.controller.ts` (marketing)
3. **Duplicate receivers** — MercadoPago and Meta both have 2 controllers each, doubling the surface area and forcing every change to be applied twice

## Recommendations

1. **Immediate** (no breaking change):
   - Add `production-startup-guard` assertion: refuse boot if `NODE_ENV=production` AND `MERCADOPAGO_WEBHOOK_SECRET` empty
   - Add `WebhookEvent` DB row to the marketing-meta controller (15-line change)

2. **Short-term** (per W27-D plan):
   - Delete `checkout/mercado-pago-webhook.controller.ts` after migrating its `mapMercadoPagoStatus` logic into `mercadopago-pix-charge.service.ts`
   - Delete `meta/meta-webhook.controller.ts` after consolidating into `meta/webhooks/meta-webhook.controller.ts`

3. **Medium-term:**
   - Extract a `WebhookSecurityModule` providing a `@VerifiedWebhook(provider)` decorator that bundles signature verification + idempotency + audit logging — every receiver should opt in instead of re-implementing

## Related

- [[CANONICAL_DOMAINS]] — webhooks domain
- [[../../adr/0009-mercadopago-pix-stripe-card-split.md]] — MercadoPago canonical pattern
- [[../../security/SECURITY.md]] — repo-level security policy
- W27-D webhook-dedup plan (this audit feeds the dedup decision)
