# Kloel Capability Map

> **PI Task K24** — Canonical capability inventory with implementation counts, domain ownership, and dedup targets.
> Generated from `tools/canonicalize/scan.mjs` + manual curation.

**Summary**: 25 capabilities cataloged. 13 duplicated (⚠️), 5 single-implementation (✅), 2 not implemented (⚪). 71 capabilities in raw capability registry lack `domainService` — focus for P1.

Each capability with **>1 implementation** is a candidate for canonicalization (pick one canonical name, route through a single `domainService`).

---

## Capability Summary by Domain

| Domain | Capabilities | Duplicated | Status |
|---|---|---|---|
| Channel / Message | `send_message`, `connect_channel`, `resolve_tenant`, `normalize_phone` | 4/4 ⚠️ | P0 |
| Checkout / Payment | `create_checkout`, `process_payment`, `fraud_check`, `ledger_entry`, `idempotency_check` | 4/5 ⚠️ | P0 |
| Auth / Identity | `authenticate_user`, `kyc_verify` | 1/2 ⚠️ | P1 |
| CRM / Lead | `qualify_contact`, `score_intent` | 0/2 ⚪ | P2 |
| Commerce | `recover_cart`, `parse_webhook`, `verify_webhook_signature`, `split_payment` | 1/4 | P2 |

---

## CAPABILITY: `send_message` (7 implementations ⚠️ duplicated)

- `SendMessageDto` (class) — `backend/src/admin/chat/dto/send-message.dto.ts:4`
- `sendWhatsAppCode` (function) — `backend/src/auth/auth-service.whatsapp.ts:13`
- `SendWhatsAppCodeDto` (class) — `backend/src/auth/dto/whatsapp-auth.dto.ts:4`
- `sendMessage` (function) — `backend/src/marketing/channels/whatsapp/providers/provider-registry-messaging.ts:38`
- `sendMessage` (function) — `backend/src/marketing/channels/whatsapp/providers/provider-send-message.helpers.ts:28`
- `sendMessage` (function) — `backend/src/partnerships/partnerships.chat.helpers.ts:98`
- `sendMessage` (function) — `worker/flow-message-sender.helpers.ts:13`

## CAPABILITY: `normalize_phone` (5 implementations ⚠️ duplicated)

- `normalizePhone` (function) — `backend/src/checkout/checkout-social-lead.util.ts:34`
- `normalizePhone` (function) — `backend/src/common/phone/phone-normalization.util.ts:150`
- `normalizeNumber` (function) — `backend/src/marketing/channels/whatsapp/whatsapp-service.helpers.ts:15`
- `formatPhone` (function) — `frontend/src/app/(main)/followups/followups.helpers.ts:31`
- `normalizePhone` (function) — `worker/utils/phone-normalization.util.ts:171`

## CAPABILITY: `resolve_tenant` (6 implementations ⚠️ duplicated)

- `resolveWorkspaceId` (function) — `backend/src/auth/workspace-access.ts:119`
- `getWorkspaceId` (function) — `backend/src/kloel/product-sub-resources/helpers/common.helpers.ts:20`
- `resolveWorkspaceHeader` (function) — `frontend/src/app/api/_lib/bearer-from-request.ts:71`
- `resolveWorkspaceFromAuthPayload` (function) — `frontend/src/lib/api/core-tokens.ts:21`
- `resolveWorkspaceSelfIdentity` (function) — `worker/processors/autopilot/identity-resolve.ts:41`
- `resolveWorkspaceTimezone` (function) — `worker/providers/timezone.ts:33`

## CAPABILITY: `parse_webhook` (0 implementations ⚪ not implemented)

No implementation detected. May not be a feature of this codebase.

## CAPABILITY: `idempotency_check` (3 implementations ⚠️ duplicated)

- `IdempotencyService` (class) — `backend/src/common/idempotency/idempotency.service.ts:11`
- `IdempotencyGuard` (class) — `backend/src/common/idempotency.guard.ts:106`
- `IdempotencyInterceptor` (class) — `backend/src/common/idempotency.interceptor.ts:49`

## CAPABILITY: `recover_cart` (1 implementations)

- `CartRecoveryService` (class) — `backend/src/kloel/cart-recovery.service.ts:102`

## CAPABILITY: `score_intent` (0 implementations ⚪ not implemented)

No implementation detected. May not be a feature of this codebase.

## CAPABILITY: `qualify_contact` (0 implementations ⚪ not implemented)

No implementation detected. May not be a feature of this codebase.

## CAPABILITY: `authenticate_user` (6 implementations ⚠️ duplicated)

- `AdminAuthController` (class) — `backend/src/admin/auth/admin-auth.controller.ts:41`
- `AdminAuthModule` (class) — `backend/src/admin/auth/admin-auth.module.ts:26`
- `AdminAuthService` (class) — `backend/src/admin/auth/admin-auth.service.ts:43`
- `AdminAuthGuard` (class) — `backend/src/admin/auth/guards/admin-auth.guard.ts:59`
- `AuthService` (class) — `backend/src/auth/auth.service.ts:45`
- `JwtAuthGuard` (class) — `backend/src/auth/jwt-auth.guard.ts:34`

## CAPABILITY: `connect_channel` (6 implementations ⚠️ duplicated)

- `startSession` (function) — `backend/src/marketing/channels/whatsapp/providers/provider-registry-session.ts:119`
- `WhatsappSessionService` (class) — `backend/src/marketing/channels/whatsapp/whatsapp-session.service.ts:21`
- `MetaConnectService` (class) — `backend/src/marketing/marketing-connect/meta-connect.service.ts:10`
- `MetaConnectionStateService` (class) — `backend/src/meta/meta-connection-state.service.ts:37`
- `WhatsAppSessionHarness` (function) — `frontend/src/app/e2e/_components/whatsapp-session-harness.tsx:11`
- `MetaConnectSection` (function) — `frontend/src/components/kloel/conta/ContaMetaConnectSection.tsx:12`

## CAPABILITY: `process_payment` (2 implementations ⚠️ duplicated)

- `PaymentService` (class) — `backend/src/kloel/payment.service.ts:121`
- `StripeChargeService` (class) — `backend/src/payments/stripe/stripe-charge.service.ts:27`

## CAPABILITY: `create_checkout` (19 implementations ⚠️ duplicated)

- `createCheckoutPixel` (function) — `backend/src/checkout/checkout-catalog.operations.ts:8`
- `buildCheckoutMarketplacePricing` (function) — `backend/src/checkout/checkout-marketplace-pricing.util.ts:40`
- `buildCheckoutOrderMetadata` (function) — `backend/src/checkout/checkout-order-metadata.util.ts:48`
- `buildCheckoutPaymentCreatedAuditPayload` (function) — `backend/src/checkout/checkout-payment.helpers.ts:443`
- `buildCheckoutPaymentResult` (function) — `backend/src/checkout/checkout-payment.helpers.ts:510`
- `CheckoutPaymentService` (class) — `backend/src/checkout/checkout-payment.service.ts:52`
- `createCheckout` (function) — `backend/src/checkout/checkout-product.create.ts:13`
- `buildCheckoutShippingQuote` (function) — `backend/src/checkout/checkout-shipping-profile.util.ts:88`
- `buildCheckoutSlug` (function) — `backend/src/checkout/checkout.controller.helpers.ts:43`
- `buildCheckoutConfigUpdateInput` (function) — `backend/src/checkout/checkout.controller.helpers.ts:94`
- `buildCheckoutData` (function) — `backend/src/kloel/product-sub-resources/helpers/plan.serialize-helpers.ts:4`
- `CheckoutPaymentSection` (function) — `frontend/src/app/(checkout)/components/CheckoutPaymentSection.tsx:47`
- `buildCheckoutFormDraftKey` (function) — `frontend/src/app/(checkout)/hooks/useCheckoutExperience.utils.ts:37`
- `buildCheckoutFormDraftKey` (function) — `frontend/src/app/(checkout)/hooks/useCheckoutExperienceSocial.draft.ts:15`
- `createCheckoutForm` (function) — `frontend/src/components/products/ProductCheckoutsTab.helpers.ts:80`
- `createCheckoutSession` (function) — `frontend/src/lib/api/workspace.ts:128`
- `buildCheckoutDisplayCode` (function) — `frontend/src/lib/checkout-links.ts:57`
- `buildCheckoutLinksForPlan` (function) — `frontend/src/lib/checkout-links.ts:136`
- `buildCheckoutPricing` (function) — `frontend/src/lib/checkout-pricing.ts:2`

## CAPABILITY: `verify_webhook_signature` (0 implementations ⚪ not implemented)

No implementation detected. May not be a feature of this codebase.

## CAPABILITY: `split_payment` (0 implementations ⚪ not implemented)

No implementation detected. May not be a feature of this codebase.

## CAPABILITY: `ledger_entry` (1 implementations)

- `LedgerService` (class) — `backend/src/payments/ledger/ledger.service.ts:40`

## CAPABILITY: `fraud_check` (3 implementations ⚠️ duplicated)

- `RiskClassModule` (class) — `backend/src/kloel/risk-class/risk-class.module.ts:17`
- `RiskClassService` (class) — `backend/src/kloel/risk-class/risk-class.service.ts:31`
- `FraudEngine` (class) — `backend/src/payments/fraud/fraud.engine.ts:44`

## CAPABILITY: `kyc_verify` (1 implementations)

- `KycService` (class) — `backend/src/kyc/kyc.service.ts:39`

---

## Additional Capabilities (from codebase scan)

### `resolve_backend_url` (3 implementations ⚠️ duplicated)

- `resolveBackendOrigin` — `backend/src/checkout/checkout-payment.helpers.ts`
- `resolveBackendOrigin` — `backend/src/sales/sales.helpers.ts`
- `resolveBackendOrigin` — `backend/src/wallet/wallet.service.helpers.ts`

### `format_money` (6 implementations ⚠️ duplicated)

- `formatBRL` — `backend/src/common/money.ts`
- `formatBRL` — `frontend/src/app/(checkout)/order/[orderId]/upsell/upsell.helpers.ts`
- `formatBRL` — `frontend/src/lib/common/money.ts`
- `formatCurrency` — `frontend/src/app/(main)/autopilot/page.ui.tsx`
- `formatCurrency` — `frontend/src/components/kloel/settings/brain-settings-section.helpers.ts`
- `formatCurrency` — `frontend-admin/src/app/(admin)/_components/admin-formatters.ts`
- `formatMoney` — `frontend/src/components/kloel/marketing/WhatsAppExperience.helpers.ts`
- `formatMoney` — `frontend/src/components/kloel/settings/crm-settings-section.helpers.ts`
- `formatMoney` — `frontend-admin/src/app/(admin)/produtos/page.helpers.ts`

### `async_iteration` (3 implementations ⚠️ duplicated)

- `forEachSequential` — `backend/src/common/async-sequence.ts`
- `forEachSequential` — `frontend/src/lib/async-sequence.ts`
- `forEachSequential` — `worker/utils/async-sequence.ts`
- `findFirstSequential` — `backend/src/common/async-sequence.ts`
- `findFirstSequential` — `frontend/src/lib/async-sequence.ts`
- `findFirstSequential` — `worker/utils/async-sequence.ts`

### `prisma_json` (3 implementations ⚠️ duplicated)

- `toPrismaJsonValue` — `backend/src/common/prisma/prisma-json.util.ts`
- `toPrismaJsonValue` — `backend/src/webhooks/webhooks.service.helpers.ts`
- `toPrismaJsonValue` — `worker/utils/prisma-json.util.ts`

### `token_generation` (2 implementations ⚠️ duplicated)

- `generateOpaqueToken` — `backend/src/auth/auth-service.helpers.ts`
- `generateOpaqueToken` — `backend/src/partnerships/partnerships.crypto.helpers.ts`
- `hashOpaqueToken` — `backend/src/auth/auth-service.helpers.ts`
- `hashOpaqueToken` — `backend/src/partnerships/partnerships.crypto.helpers.ts`

### `error_message` (2 implementations ⚠️ duplicated)

- `getErrorMessage` — `frontend/src/components/kloel/conta/ContaHelpers.ts`
- `getErrorMessage` — `frontend/src/components/kloel/marketing/WhatsAppExperience.helpers.ts`
- `getErrorMessage` — `worker/utils/error-message.ts`

### `redis_config` (2 implementations ⚠️ duplicated)

- `resolveRedisUrl` — `backend/src/common/redis/resolve-redis-url.ts`
- `resolveRedisUrl` — `worker/resolve-redis-url.ts`

### `signed_storage_url` (1 implementation ✅)

- `generateSignedStorageUrl` — `backend/src/common/storage/signed-storage-url.ts`

### `contact_resolution` (1 implementation ✅)

- `ContactResolutionService` — `backend/src/omnichannel/contact-resolution.service.ts`

### `invoice_generation` (1 implementation ✅)

- `SalesService.generateInvoice` — `backend/src/sales/sales.service.ts`

---

## Dedup Priority

| Priority | Capabilities | Rationale |
|---|---|---|
| **P0** | `send_message`, `normalize_phone`, `resolve_tenant`, `create_checkout`, `process_payment`, `fraud_check` | Core payment/messaging paths — duplication = risk of inconsistent behavior |
| **P1** | `authenticate_user`, `connect_channel`, `idempotency_check`, `format_money`, `async_iteration`, `prisma_json`, `token_generation` | Shared utilities — consolidate into `common/` barrel |
| **P2** | `resolve_backend_url`, `error_message`, `redis_config` | Low blast-radius dupes — backend ↔ worker drift |
| **P3** | `qualify_contact`, `score_intent`, `parse_webhook`, `verify_webhook_signature`, `split_payment` | Not yet implemented — define canonical interface before first implementation |

---

## Registry Gap: 71 Capabilities Without `domainService`

`CapabilityRegistryV2Service` defines 71 capabilities in tier partitions. Many lack `domainService` — meaning no single service owns the capability. Key gaps:

- `sales.create_pix` / `sales.create_boleto` → `SalesService` (partially wired)
- `marketing.create_campaign` → `CampaignsService`
- `crm.move_stage` → `CrmService` / `PipelineService`
- `commerce.recover_cart` → `CartRecoveryService` ✅ (wired)

See `backend/src/kloel/capability-registry-v2/partitions/` for the full tiered capability catalog.
