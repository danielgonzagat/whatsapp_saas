# W27 — Tier 1 production-readiness plan (file-level)

**Date:** 2026-05-26
**Author:** Claude Plan agent
**Companion to:** [`MACHINE_STATE.md`](../../architecture/MACHINE_STATE.md), [`COGNITIVE_INTERFACE_LAYER.md`](../../architecture/COGNITIVE_INTERFACE_LAYER.md), [`adr/0009-mercadopago-pix-stripe-card-split.md`](../../adr/0009-mercadopago-pix-stripe-card-split.md), [`runbooks/mercadopago-pix-deploy.md`](../../runbooks/mercadopago-pix-deploy.md)

Tier 0 closed (prod-secrets script shipped + Stripe customer guard already in main + lsp-mesh + cognitive-hub wired). This document scopes **Tier 1** to file-level changes so each item can be executed without re-discovery.

**Legend:**

- **PI-doable** = autonomous AI agent can fully execute
- **Human-required** = external dashboard / DNS / capability flag — agent can prepare PR but not flip the bit
- **Hybrid** = agent does code + IaC; human signs off

**Sequencing:** S0 → S1 (parallel) → S2 (after S1) → S3 (final validation)

---

## 1. Smoke E2E for 5 golden flows

**Goal:** 1 Playwright spec per golden flow, runs against `staging.api.kloel.com` in CI nightly + on every PR.

**Files (NEW unless noted):**

- `e2e/specs/golden-signup-workspace-whatsapp.spec.ts`
- `e2e/specs/golden-product-checkout-payment.spec.ts`
- `e2e/specs/golden-message-aireply-handoff.spec.ts`
- `e2e/specs/golden-affiliate-signup-commission.spec.ts`
- `e2e/specs/golden-kyc-submit-approve.spec.ts`
- `e2e/specs/e2e-helpers.ts` (EXTEND: `seedAffiliateProgram`, `triggerAdminKycApproval`, `injectAiBotReply`)
- `e2e/playwright.config.ts` (EXTEND: `golden` project group with `retries: 0`, `expect.timeout: 60_000`)
- `.github/workflows/nightly-ops-audit.yml` (EXTEND: add `npm run e2e:golden`)
- `package.json` root (EXTEND: `e2e:golden` script)

Reuse templates: `customer-product-and-checkout.spec.ts`, `whatsapp-message-flow.spec.ts`, `settings-kyc.spec.ts`, `auth-flows.spec.ts`.

**Diff size:** Large (5 specs × ~150 lines + helpers + CI). **Type:** PI-doable. **Sequence:** S2.

---

## 2. Stripe live keys + webhook endpoint

**Goal:** Stripe account in live mode, `STRIPE_SECRET_KEY` rotated to `sk_live_*`, webhook endpoint at `https://api.kloel.com/webhook/payment` registered, secret synced to Railway.

**Files:**

- `docs/deployment/env-vars.md` (EXTEND)
- `docs/runbooks/stripe-live-activation.md` (NEW)
- `backend/src/config/production-startup-guard.ts` (EXTEND: assert `STRIPE_SECRET_KEY` starts with `sk_live_` when `NODE_ENV=production`)
- `scripts/ops/check-stripe-live.mjs` (NEW: CI gate)
- `.github/workflows/deploy-production.yml` (EXTEND: wire `check-stripe-live`)

**Diff size:** Small. **Type:** Human-required (Stripe dashboard activation + KYC of Kloel legal entity) + PI for code. **Sequence:** S0 — blocks 1, 8, 11.

---

## 3. MercadoPago PIX capability live activation

**Goal:** Flip `MERCADOPAGO_SANDBOX=false` in production with a verified live PIX charge per ADR-0009.

**Files:**

- `docs/runbooks/mercadopago-pix-deploy.md` (EXTEND: `## 5. Live cutover checklist`)
- `scripts/ops/verify-mercadopago-live.mjs` (NEW)
- `docs/audits/W27/mercadopago-live-evidence.md` (NEW: signed test-payment receipt)

**Diff size:** Small. **Type:** Human-required (MP capability request) + PI for verification. **Sequence:** S1.

---

## 4. Webhook dedup — MercadoPago (2→1) and Meta (2→1)

**Goal:** Consolidate 4 controllers into 2 canonical per [W27-B webhook security audit](webhook-security-audit-2026-05-26.md).

**Meta dedup:**

- KEEP: `backend/src/meta/webhooks/meta-webhook.controller.ts` (A-grade, signature + Redis + DB unique constraint)
- DELETE: `backend/src/meta/meta-webhook.controller.ts` + spec
- EDIT: `backend/src/meta/meta.module.ts` (drop top-level registration)

**MercadoPago dedup:**

- KEEP: `backend/src/payments/mercadopago/mercadopago-webhook.controller.ts` (A-grade, matches ADR-0009)
- DELETE: `backend/src/checkout/mercado-pago-webhook.controller.ts` (B-grade, optional signature)
- MIGRATE: `mapMercadoPagoStatus` + `TERMINAL_ORDER_STATUSES` into `backend/src/payments/mercadopago/mercadopago-pix-charge.service.ts`
- EDIT: `backend/src/checkout/checkout.module.ts` (drop controller registration)

**Diff size:** Medium. **Type:** PI-doable. **Sequence:** S1, must precede item 1.

---

## 5. pay.kloel.com deploy + DNS + cert

**Goal:** `pay.kloel.com` resolves to frontend Vercel project, serves `/pay/[id]`, `/pay/[token]`, valid TLS.

Current: domain already in CORS allow-list (`backend/src/main.ts:353`), route exists at `(public)/pay/page.tsx`. Gap is Vercel domain attach + DNS.

**Files:**

- `frontend/next.config.ts` (EXTEND `rewrites()` if needed)
- `frontend/src/middleware.ts` (EXTEND if exists: rewrite `pay.kloel.com/*` → `/pay/*`)
- `docs/runbooks/pay-kloel-domain-setup.md` (NEW — uses `cf-wire-domain` skill pattern)

**Diff size:** Small. **Type:** Human-required for DNS + Vercel domain attach, PI for verification. **Sequence:** S1, blocks item 1's payment golden flow.

---

## 6. Datadog + Sentry alerting wired

**Goal:** Active monitors firing to on-call channel.

**Files:**

- `docs/monitoring/datadog-monitors.json` (NEW: monitor-as-code)
- `docs/monitoring/sentry-alert-rules.json` (NEW)
- `scripts/ops/sync-datadog-monitors.mjs` (NEW: idempotent DD API sync)
- `scripts/ops/sync-sentry-alerts.mjs` (NEW)
- `.github/workflows/deploy-production.yml` (EXTEND post-deploy: sync + `sentry-cli releases new $SHA`)
- `docs/runbooks/oncall-paging.md` (NEW)

**Diff size:** Medium. **Type:** Hybrid (agent writes JSON + scripts; human provides DD/Sentry tokens). **Sequence:** S1.

---

## 7. Postgres backup + restore drill

**Goal:** Promote `docs/RESTORE.md` from "documented" to "drill-passing" — fresh restore against current schema + nightly automated drill.

**Files:**

- `scripts/backup/db-restore-verify.mjs` (NEW: downloads latest backup → ephemeral Postgres container → `prisma migrate diff` → sentinel query → appends `.dr-test.log`)
- `.github/workflows/nightly-ops-audit.yml` (EXTEND: weekly `restore-drill` job)
- `docs/RESTORE.md` (EXTEND: `## Automated Drill Schedule`)

**Diff size:** Medium. **Type:** PI-doable. **Sequence:** S1.

---

## 8. Top 20 endpoint specs (OpenAPI ~22% → 70%)

**Target endpoints** (golden-flow + money paths):

1-3. auth — `backend/src/auth/auth.controller.ts`
4-5. workspaces — `backend/src/workspaces/workspace.controller.ts`
6. products — `backend/src/products/`
7. checkout — `backend/src/checkout/`
8-9. payment webhooks — `backend/src/webhooks/payment-webhook-stripe.controller.ts`, `backend/src/payments/mercadopago/mercadopago-webhook.controller.ts`
10-12. whatsapp — `backend/src/whatsapp/`, `backend/src/meta/webhooks/meta-webhook.controller.ts`
13-14. affiliate — `backend/src/affiliate/affiliate.controller.ts`
15-16. kyc — `backend/src/kyc/kyc.controller.ts`
17-18. gdpr — `backend/src/gdpr/data-delete.controller.ts`, `data-export.controller.ts`
19. health — `backend/src/health/`
20. billing — `backend/src/billing/billing.controller.ts`

**Action per file:** add `@ApiTags`, `@ApiOperation`, `@ApiBody`, `@ApiResponse`; DTOs gain `@ApiProperty`.

**Additional:**

- `scripts/cognitive/openapi-extract.mjs` re-run after edits
- `scripts/ops/check-openapi-coverage.mjs` (NEW: CI gate, fails if <70% for top-20)
- `.github/workflows/ci-cd.yml` (EXTEND)

**Diff size:** Large (~40 files). **Type:** PI-doable. **Sequence:** S1, independent except for item 4 (consolidated controllers).

---

## 9. Onboarding E2E (signup → workspace → whatsapp)

Same as golden flow #1 from item 1; here it gets a `@onboarding` Playwright tag + dedicated CI job on every backend deploy.

**Files:**

- `e2e/specs/golden-signup-workspace-whatsapp.spec.ts` (from item 1, add tag)
- `.github/workflows/deploy-production.yml` (EXTEND: post-deploy `npx playwright test --grep @onboarding` against prod with read-only test workspace)

**Diff size:** Small. **Type:** PI-doable. **Sequence:** S3 (depends on 1, 2, 5).

---

## 10. KYC E2E (real backend, not mocked)

Existing `e2e/specs/settings-kyc.spec.ts` uses mocked routes (`installKycMocks`). Need real-backend variant.

**Files:**

- `e2e/specs/golden-kyc-submit-approve.spec.ts` (from item 1)
- `e2e/specs/e2e-helpers.ts` (EXTEND: `triggerAdminKycApproval(workspaceId)`)
- Optionally `backend/src/kyc/kyc.controller.ts` (NEW endpoint: `/kyc/test/approve` guarded by `E2E_BYPASS_TOKEN`, staging only)

**Diff size:** Small/Medium. **Type:** PI-doable. **Sequence:** S3.

---

## 11. Stripe live products + pricing live

**Goal:** Production Stripe has the canonical 3-plan ladder (Starter/Pro/Scale) as live products, `Plan.stripePriceId` in DB points to them.

**Files:**

- `scripts/ops/stripe-bootstrap-plans.mjs` (NEW: idempotent — list products, create if missing, emit JSON map)
- `backend/prisma/seed.ts` (EXTEND: read map, upsert `Plan.stripePriceId`)
- `docs/audits/W27/stripe-live-pricing-evidence.md` (NEW)
- `scripts/ops/check-stripe-products.mjs` (NEW: fail prod deploy if `Plan.stripePriceId IS NULL` or starts with `price_test_`)

**Diff size:** Medium. **Type:** Hybrid. **Sequence:** S2 (after item 2).

---

## 12. Landing kloel.com + terms/privacy

Current: landing component + routes exist (`(public)/page.tsx`, `(public)/{terms,privacy,cookies,data-deletion}/page.tsx`). Gap: apex domain attach.

**Files:**

- `frontend/next.config.ts` (EXTEND: `redirects()` for `www.kloel.com` → `kloel.com`)
- `frontend/src/app/sitemap.ts` (NEW)
- `frontend/src/app/robots.ts` (NEW)
- `frontend/src/components/kloel/landing/FooterSection.tsx` (VERIFY: all 4 legal links)
- `docs/runbooks/kloel-com-domain-setup.md` (NEW)

**Diff size:** Medium. **Type:** Hybrid (code PI-doable, DNS human-required). **Sequence:** S2.

---

## 13. LGPD data-deletion flow (authenticated user)

Backend complete (`backend/src/gdpr/{data-delete,data-export}.controller.ts` + `gdpr.service.ts` + BullMQ pipeline). Gap: authenticated UI in `(main)/settings/`.

**Files:**

- `frontend/src/app/(main)/settings/privacy/page.tsx` (NEW)
- `frontend/src/components/kloel/settings/PrivacyDataActions.tsx` (NEW: double-confirm modal)
- `frontend/src/lib/api/privacy.ts` (EXTEND: `requestDeletion`, `requestExport`, `getDeletionStatus`)
- `frontend/src/app/api/gdpr/{delete,export}/route.ts` (VERIFY/NEW: Next.js proxies)
- `e2e/specs/golden-lgpd-data-deletion.spec.ts` (NEW)
- `docs/LEGAL_AND_FINANCIAL_COMPLIANCE.md` (EXTEND: LGPD Art. 18 section)

**Diff size:** Medium. **Type:** PI-doable. **Sequence:** S2.

---

## Sequencing summary

```
S0 (blocks all):
  - 2: Stripe live keys

S1 (parallel after S0):
  - 3: MercadoPago live
  - 4: Webhook dedup
  - 6: Datadog + Sentry alerting
  - 7: Postgres restore drill
  - 8: Top-20 OpenAPI specs
  - 11: Stripe live products
  - 12: kloel.com landing + DNS
  - 13: LGPD UI

S2 (depends on S1):
  - 5: pay.kloel.com DNS + middleware
  - 1: Golden E2E suite

S3 (final):
  - 9: Onboarding E2E in prod pipeline
  - 10: KYC E2E with admin approval
```

## Critical files quickref

- `e2e/specs/e2e-helpers.ts`
- `backend/src/payments/mercadopago/mercadopago-webhook.controller.ts`
- `backend/src/meta/webhooks/meta-webhook.controller.ts`
- `backend/src/config/production-startup-guard.ts`
- `.github/workflows/deploy-production.yml`
- `frontend/src/app/(main)/settings/privacy/page.tsx`
- `scripts/ops/stripe-bootstrap-plans.mjs`

## Related

- [[../../architecture/MACHINE_STATE.md]]
- [[../../adr/0003-stripe-connect-marketplace-model.md]]
- [[../../adr/0009-mercadopago-pix-stripe-card-split.md]]
- [[../../runbooks/mercadopago-pix-deploy.md]]
- [[webhook-security-audit-2026-05-26.md]]
- [[prisma-maturation-diagnosis.md]]
