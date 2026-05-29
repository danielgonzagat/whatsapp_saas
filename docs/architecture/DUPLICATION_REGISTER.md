# Kloel Duplication Register

> **PI Task K24** — Cross-file duplicate symbols with severity classification.
> Generated from `tools/canonicalize/scan.mjs`. 313 total duplicates.

---

## Severity Classification

| Severity | Criteria | Count |
|---|---|---|
| **P0 — Critical** | Core business logic duplicated (payments, messaging, auth). Cross-boundary (backend↔worker↔frontend). Risk of divergent behavior. | ~15 |
| **P1 — High** | Shared utility duplicated (formatting, parsing, math). Multiple consumers. Easy to consolidate. | ~40 |
| **P2 — Medium** | Type/interface duplication (DTO shapes, API contracts). Same shape across packages. | ~80 |
| **P3 — Low** | Route boilerplate (`GET`/`POST`/`DELETE` exports), test-only helpers. Not behavioral. | ~178 |

---

## P0 — Critical Duplications

| Symbol | # files | Impact | Canonical candidate |
|---|---|---|---|
| `sendMessage` | 4 | ⚠️ 4 different send pipelines (marketing, partnerships, worker, flow-sender) | `MessageDispatchService.send()` |
| `normalizePhone` | 3 | ⚠️ backend/checkout, backend/common, worker — 3 identical implementations | `backend/src/common/phone/phone-normalization.util.ts` |
| `extractAsciiDigits` | 3 | ⚠️ backend/common, marketing, worker | `backend/src/common/phone/phone-normalization.util.ts` |
| `extractPhoneFromChatId` | 3 | ⚠️ backend/common, marketing, worker | `backend/src/common/phone/phone-normalization.util.ts` |
| `toPrismaJsonValue` | 3 | ⚠️ backend/common, webhooks, worker | `backend/src/common/prisma/prisma-json.util.ts` |
| `forEachSequential` | 3 | ⚠️ backend, frontend, worker — 3 identical copies | `backend/src/common/async-sequence.ts` |
| `findFirstSequential` | 3 | ⚠️ backend, frontend, worker | `backend/src/common/async-sequence.ts` |
| `clamp` | 4 | ⚠️ common/math, evol/types, frontend, +1 | `backend/src/common/math.ts` |
| `clampScore` | 3 | ⚠️ common/math, healthy-money/types, payments/fraud | `backend/src/common/math.ts` |
| `formatBRL` / `formatCurrency` / `formatMoney` | 9 total | ⚠️ 9 formatting functions across 3 packages | `frontend/src/lib/common/money.ts` → shared package |
| `resolveRedisUrl` | 2 | ⚠️ backend ↔ worker drift | `backend/src/common/redis/` |
| `resolveBackendOrigin` | 3 | ⚠️ checkout, sales, wallet | `backend/src/common/` |
| `generateOpaqueToken` / `hashOpaqueToken` | 2 each | ⚠️ auth ↔ partnerships | `backend/src/common/crypto.ts` |

---

## P1 — High (Shared Utilities)

| Symbol | # files | Notes |
|---|---|---|
| `readText` | 5 | Parse helper duplicated across modules |
| `isRecord` | 5 | Type guard — consistent but duplicated |
| `readRecord` | 4 | Parse helper |
| `toJsonValue` | 3 | checkout, checkout-social-lead, unified-actions |
| `extractProductName` | 3 | checkout, guest-chat ×2 |
| `getErrorMessage` | 3 | frontend/conta, frontend/marketing, worker |
| `ChannelSendResult` | 2 | common/channel-dispatch, kloel/channel-transport |
| `ChannelCapability` | 2 | common/channel-dispatch, kloel/channel-transport |
| `pollUntil` | 2 | backend/common, worker/utils |
| `phonesMatch` | 2 | backend/common, worker/utils |
| `NormalizedPhone` | 2 | backend/common, worker/utils |

---

## P2 — Medium (Type/DTO shapes)

Backend ↔ frontend/admin DTO shape duplication (shared API contract but defined twice):
`AdminAccountRow`, `AdminProductRow`, `AdminTransactionRow`, `SendMessageInput`, `ListAccountsResponse`, `CalendarEvent`, `PipelineStage`, `PipelineDeal`, `Campaign`, `ChatMessage`, `CreatePlanDto`, `CreateProductDto`, `ValidateCouponDto`, `ToolResult`, `Tool*Args` family (~10 types), `FeedbackInput`, `SessionStatus`, `AuthenticatedSession`, `LoginStateResponse`, `MfaSetupPayload`.

All ~80 are backend ↔ frontend-admin type mirrors. Canonical solution: extract to shared `contracts/` package.

---

## P3 — Low (Boilerplate / Test)

- `GET` (35), `POST` (48), `DELETE` (3) — Next.js route handlers; expected boilerplate.
- `Badge` (4), `Card` (3), `Toggle` (3), `Ticker` (3), `EmptyState` (3), `StatCard` (3), `Fmt` (3), `ProductCard` (3) — UI components across frontend + frontend-admin; dedup target is `frontend/components/kloel/Primitives.tsx`.
- `makePrismaStub` (3), `objectContaining` (3) — test helpers; low priority.

---

## Top 100 duplicated exports

| Exported name | # files | Files |
|---|---:|---|
| `POST` | 48 | `frontend/src/app/api/auth/anonymous/route.ts`<br>`frontend/src/app/api/auth/callback/apple/route.ts`<br>`frontend/src/app/api/auth/check-email/route.ts`<br>… +45 more |
| `GET` | 35 | `frontend/src/app/api/auth/apple/start/route.ts`<br>`frontend/src/app/api/auth/callback/apple/route.ts`<br>`frontend/src/app/api/auth/callback/tiktok/route.ts`<br>… +32 more |
| `readText` | 5 | `backend/src/common/utils.ts`<br>`backend/src/kloel/mind/cia/cia.service.helpers.ts`<br>`backend/src/kloel/unified-agent-actions-messaging.helpers.ts`<br>… +2 more |
| `isRecord` | 5 | `backend/src/kloel/kloel-tool-dispatcher.high-risk.helpers.ts`<br>`backend/src/kloel/unified-agent-actions-crm.helpers.ts`<br>`backend/src/kloel/unified-agent-actions-messaging.helpers.ts`<br>… +2 more |
| `clamp` | 4 | `backend/src/common/math.ts`<br>`backend/src/kloel/evol/types.ts`<br>`frontend/src/components/kloel/AgentCursor.helpers.ts`<br>… +1 more |
| `ChannelKey` | 4 | `backend/src/kloel/channel-repertoire.config.ts`<br>`frontend/src/components/kloel/landing/thanos-section.const.ts`<br>`frontend/src/components/kloel/marketing/OfficialMarketingChannelPage.helpers.ts`<br>… +1 more |
| `readRecord` | 4 | `backend/src/kloel/mind/cia/cia.service.helpers.ts`<br>`backend/src/kloel/mind/coordination/mind-runtime.helpers.ts`<br>`backend/src/marketing/channels/whatsapp/providers/provider-registry-session.ts`<br>… +1 more |
| `sendMessage` | 4 | `backend/src/marketing/channels/whatsapp/providers/provider-registry-messaging.ts`<br>`backend/src/marketing/channels/whatsapp/providers/provider-send-message.helpers.ts`<br>`backend/src/partnerships/partnerships.chat.helpers.ts`<br>… +1 more |
| `Badge` | 4 | `frontend/src/components/kloel/Primitives.tsx`<br>`frontend/src/components/kloel/sites/SitesViewAtoms.tsx`<br>`frontend/src/components/kloel/vendas/Badge.tsx`<br>… +1 more |
| `toJsonValue` | 3 | `backend/src/checkout/checkout-payment.helpers.ts`<br>`backend/src/checkout/checkout-social-lead.util.ts`<br>`backend/src/kloel/unified-agent-actions-sales.helpers.ts` |
| `resolveBackendOrigin` | 3 | `backend/src/checkout/checkout-payment.helpers.ts`<br>`backend/src/sales/sales.helpers.ts`<br>`backend/src/wallet/wallet.service.helpers.ts` |
| `extractProductName` | 3 | `backend/src/checkout/checkout-payment.helpers.ts`<br>`backend/src/kloel/guest-chat.action-intent.product-args.helpers.ts`<br>`backend/src/kloel/guest-chat.product-args.helpers.ts` |
| `normalizePhone` | 3 | `backend/src/checkout/checkout-social-lead.util.ts`<br>`backend/src/common/phone/phone-normalization.util.ts`<br>`worker/utils/phone-normalization.util.ts` |
| `forEachSequential` | 3 | `backend/src/common/async-sequence.ts`<br>`frontend/src/lib/async-sequence.ts`<br>`worker/utils/async-sequence.ts` |
| `findFirstSequential` | 3 | `backend/src/common/async-sequence.ts`<br>`frontend/src/lib/async-sequence.ts`<br>`worker/utils/async-sequence.ts` |
| `clampScore` | 3 | `backend/src/common/math.ts`<br>`backend/src/kloel/healthy-money/healthy-money.types.ts`<br>`backend/src/payments/fraud/fraud.engine.helpers.ts` |
| `formatBRL` | 3 | `backend/src/common/money.ts`<br>`frontend/src/app/(checkout)/order/[orderId]/upsell/upsell.helpers.ts`<br>`frontend/src/lib/common/money.ts` |
| `extractAsciiDigits` | 3 | `backend/src/common/phone/phone-normalization.util.ts`<br>`backend/src/marketing/channels/whatsapp/whatsapp-digits.util.ts`<br>`worker/utils/phone-normalization.util.ts` |
| `extractPhoneFromChatId` | 3 | `backend/src/common/phone/phone-normalization.util.ts`<br>`backend/src/marketing/channels/whatsapp/whatsapp-normalization.util.ts`<br>`worker/utils/phone-normalization.util.ts` |
| `toPrismaJsonValue` | 3 | `backend/src/common/prisma/prisma-json.util.ts`<br>`backend/src/webhooks/webhooks.service.helpers.ts`<br>`worker/utils/prisma-json.util.ts` |
| `FeedbackInput` | 3 | `backend/src/kloel/clarity/clarity.types.ts`<br>`backend/src/kloel/incent/user-feedback-correction.service.ts`<br>`backend/src/kloel/team/team.types.ts` |
| `ToolChangePlanArgs` | 3 | `backend/src/kloel/kloel-business-config-plan.helpers.ts`<br>`backend/src/kloel/kloel-business-config-tools.helpers.ts`<br>`backend/src/kloel/kloel-tool-executor.types.ts` |
| `ToolResult` | 3 | `backend/src/kloel/kloel-business-config-tools.helpers.ts`<br>`backend/src/kloel/kloel-tool-dispatcher.receipt.helpers.ts`<br>`backend/src/kloel/kloel-tool-executor.types.ts` |
| `ToolDashboardSummaryArgs` | 3 | `backend/src/kloel/kloel-chat-tools.dashboard-payments.helpers.ts`<br>`backend/src/kloel/kloel-chat-tools.types.ts`<br>`backend/src/kloel/kloel-tool-executor.types.ts` |
| `ToolSaveProductArgs` | 3 | `backend/src/kloel/kloel-chat-tools.products.helpers.ts`<br>`backend/src/kloel/kloel-chat-tools.types.ts`<br>`backend/src/kloel/kloel-tool-executor.types.ts` |
| `ToolDeleteProductArgs` | 3 | `backend/src/kloel/kloel-chat-tools.products.helpers.ts`<br>`backend/src/kloel/kloel-chat-tools.types.ts`<br>`backend/src/kloel/kloel-tool-executor.types.ts` |
| `ToolToggleAutopilotArgs` | 3 | `backend/src/kloel/kloel-chat-tools.settings-policy.helpers.ts`<br>`backend/src/kloel/kloel-chat-tools.types.ts`<br>`backend/src/kloel/kloel-tool-executor.types.ts` |
| `ToolSetBrandVoiceArgs` | 3 | `backend/src/kloel/kloel-chat-tools.settings-policy.helpers.ts`<br>`backend/src/kloel/kloel-chat-tools.types.ts`<br>`backend/src/kloel/kloel-tool-executor.types.ts` |
| `ToolRememberUserInfoArgs` | 3 | `backend/src/kloel/kloel-chat-tools.settings-policy.helpers.ts`<br>`backend/src/kloel/kloel-chat-tools.types.ts`<br>`backend/src/kloel/kloel-tool-executor.types.ts` |
| `ChatMessage` | 3 | `backend/src/kloel/kloel-thinker.types.ts`<br>`frontend/src/components/kloel/home/HomeScreen.types.ts`<br>`frontend/src/components/kloel/landing/FloatingChat.helpers.ts` |
| `objectContaining` | 3 | `backend/src/kloel/kloel-tool-dispatcher.service.chat-tools.spec-setup.ts`<br>`backend/src/kloel/kloel-tool-dispatcher.service.dotted-alias.test-bed.ts`<br>`backend/src/kloel/mind/policy/mind-policy.service.spec-helpers.ts` |
| `JsonRecord` | 3 | `backend/src/kloel/mind/cia/cia.service.helpers.ts`<br>`frontend/src/components/kloel/dashboard/KloelDashboard.helpers.ts`<br>`frontend/src/components/kloel/products/product-nerve-center.shared.tsx` |
| `SessionStatus` | 3 | `backend/src/marketing/channels/whatsapp/providers/provider-registry.types.ts`<br>`backend/src/marketing/channels/whatsapp/providers/waha-types.ts`<br>`backend/src/marketing/channels/whatsapp/providers/whatsapp-api.provider.types.ts` |
| `makePrismaStub` | 3 | `backend/src/payments/fraud/fraud.engine.spec-helpers.ts`<br>`backend/src/payments/ledger/ledger.service.spec-helpers.ts`<br>`backend/src/wallet/__test-support__/prepaid-wallet.controller.spec-helpers.ts` |
| `Fmt` | 3 | `frontend/src/app/(main)/analytics/analytics.design-tokens.ts`<br>`frontend/src/components/kloel/anuncios/AnunciosShared.tsx`<br>`frontend/src/components/kloel/carteira/carteira.helpers.ts` |
| `EmptyState` | 3 | `frontend/src/app/(main)/analytics/shared/Components.tsx`<br>`frontend/src/components/kloel/Cards.tsx`<br>`frontend/src/components/kloel/sites/SitesViewAtoms.tsx` |
| `StatCard` | 3 | `frontend/src/app/(main)/autopilot/page.ui.tsx`<br>`frontend/src/components/kloel/Cards.tsx`<br>`frontend-admin/src/components/ui/stat-card.tsx` |
| `statusTone` | 3 | `frontend/src/app/(main)/autopilot/page.ui.tsx`<br>`frontend/src/components/kloel/autopilot/AutopilotSafetyBrakesHelpers.tsx`<br>`frontend-admin/src/app/(admin)/produtos/page.helpers.ts` |
| `formatCurrency` | 3 | `frontend/src/app/(main)/autopilot/page.ui.tsx`<br>`frontend/src/components/kloel/settings/brain-settings-section.helpers.ts`<br>`frontend-admin/src/app/(admin)/_components/admin-formatters.ts` |
| `Toggle` | 3 | `frontend/src/app/(main)/checkout/[planId]/checkout-editor-shared.tsx`<br>`frontend/src/components/kloel/primitives/Toggle.tsx`<br>`frontend/src/components/kloel/sites/SitesViewControls.tsx` |
| `DELETE` | 3 | `frontend/src/app/api/kyc/[...path]/route.ts`<br>`frontend/src/app/api/marketing/[...path]/route.ts`<br>`frontend/src/app/api/whatsapp-api/session/disconnect/route.ts` |
| `Card` | 3 | `frontend/src/components/kloel/Card.tsx`<br>`frontend/src/components/kloel/sites/SitesViewAtoms.tsx`<br>`frontend-admin/src/components/ui/card.tsx` |
| `Ticker` | 3 | `frontend/src/components/kloel/anuncios/AnunciosShared.tsx`<br>`frontend/src/components/kloel/marketing/MarketingShared.canvas.tsx`<br>`frontend/src/components/kloel/produtos/ProdutosView.shared.tsx` |
| `Campaign` | 3 | `frontend/src/components/kloel/anuncios/anuncios-types.ts`<br>`frontend/src/components/products/ProductCampaignsTab.constants.ts`<br>`frontend/src/lib/api/campaigns.ts` |
| `Message` | 3 | `frontend/src/components/kloel/chat-message.types.ts`<br>`frontend/src/components/kloel/landing/FloatingChatRows.tsx`<br>`frontend/src/lib/api/conversations.ts` |
| `getErrorMessage` | 3 | `frontend/src/components/kloel/conta/ContaHelpers.ts`<br>`frontend/src/components/kloel/marketing/WhatsAppExperience.helpers.ts`<br>`worker/utils/error-message.ts` |
| `ProductCard` | 3 | `frontend/src/components/kloel/marketing/WhatsAppExperience.dashboard-cards.tsx`<br>`frontend/src/components/kloel/settings/product-card.tsx`<br>`frontend-admin/src/app/(admin)/produtos/ProductCard.tsx` |
| `formatMoney` | 3 | `frontend/src/components/kloel/marketing/WhatsAppExperience.helpers.ts`<br>`frontend/src/components/kloel/settings/crm-settings-section.helpers.ts`<br>`frontend-admin/src/app/(admin)/produtos/page.helpers.ts` |
| `PipelineStage` | 3 | `frontend/src/components/kloel/vendas/types.ts`<br>`frontend/src/hooks/useSalesPipeline.ts`<br>`frontend/src/lib/api/pipeline.ts` |
| `PipelineDeal` | 3 | `frontend/src/components/kloel/vendas/types.ts`<br>`frontend/src/hooks/useSalesPipeline.ts`<br>`frontend/src/lib/api/pipeline.ts` |
| `ListAccountsResponse` | 2 | `backend/src/admin/accounts/admin-accounts.service.ts`<br>`frontend-admin/src/lib/api/admin-accounts-api.ts` |
| `AdminAccountDetail` | 2 | `backend/src/admin/accounts/queries/detail-account.query.ts`<br>`frontend-admin/src/lib/api/admin-accounts-api.ts` |
| `AdminAccountRow` | 2 | `backend/src/admin/accounts/queries/list-accounts.query.ts`<br>`frontend-admin/src/lib/api/admin-accounts-api.ts` |
| `LoginStateResponse` | 2 | `backend/src/admin/auth/admin-auth.service.ts`<br>`frontend-admin/src/lib/auth/admin-session-types.ts` |
| `MfaSetupPayload` | 2 | `backend/src/admin/auth/admin-auth.service.ts`<br>`frontend-admin/src/lib/auth/admin-session-types.ts` |
| `AuthenticatedSession` | 2 | `backend/src/admin/auth/admin-auth.service.ts`<br>`frontend-admin/src/lib/auth/admin-session-types.ts` |
| `SendMessageInput` | 2 | `backend/src/admin/chat/admin-chat.service.ts`<br>`frontend-admin/src/lib/api/admin-chat-api.ts` |
| `AdminClientRow` | 2 | `backend/src/admin/clients/admin-client.types.ts`<br>`frontend-admin/src/lib/api/admin-clients-api.ts` |
| `ListClientsResponse` | 2 | `backend/src/admin/clients/admin-client.types.ts`<br>`frontend-admin/src/lib/api/admin-clients-api.ts` |
| `AdminConfigWorkspaceRow` | 2 | `backend/src/admin/config/admin-config.service.ts`<br>`frontend-admin/src/lib/api/admin-config-api.ts` |
| `AdminConfigOverviewResponse` | 2 | `backend/src/admin/config/admin-config.service.ts`<br>`frontend-admin/src/lib/api/admin-config-api.ts` |
| `KpiRateValue` | 2 | `backend/src/admin/dashboard/admin-dashboard.service.ts`<br>`frontend-admin/src/lib/api/admin-dashboard-api.ts` |
| `KpiMoneyValue` | 2 | `backend/src/admin/dashboard/kpi-math.util.ts`<br>`frontend-admin/src/lib/api/admin-dashboard-api.ts` |
| `KpiNumberValue` | 2 | `backend/src/admin/dashboard/kpi-math.util.ts`<br>`frontend-admin/src/lib/api/admin-dashboard-api.ts` |
| `GatewayBreakdownRow` | 2 | `backend/src/admin/dashboard/queries/breakdowns.query.ts`<br>`frontend-admin/src/lib/api/admin-dashboard-api.ts` |
| `MethodBreakdownRow` | 2 | `backend/src/admin/dashboard/queries/breakdowns.query.ts`<br>`frontend-admin/src/lib/api/admin-dashboard-api.ts` |
| `GmvDailyPoint` | 2 | `backend/src/admin/dashboard/queries/series.query.ts`<br>`frontend-admin/src/lib/api/admin-dashboard-api.ts` |
| `RevenueDailyPoint` | 2 | `backend/src/admin/dashboard/queries/series.query.ts`<br>`frontend-admin/src/lib/api/admin-dashboard-api.ts` |
| `AdminHomePeriod` | 2 | `backend/src/admin/dashboard/range.util.ts`<br>`frontend-admin/src/lib/api/admin-dashboard-api.ts` |
| `AdminHomeCompare` | 2 | `backend/src/admin/dashboard/range.util.ts`<br>`frontend-admin/src/lib/api/admin-dashboard-api.ts` |
| `DestructiveIntentView` | 2 | `backend/src/admin/destructive/destructive-intent.types.ts`<br>`frontend-admin/src/lib/api/admin-destructive-api.ts` |
| `NotConfiguredException` | 2 | `backend/src/admin/destructive/handlers/cache-purge.handler.ts`<br>`backend/src/integrations/exceptions/not-configured.exception.ts` |
| `AdminProductDetail` | 2 | `backend/src/admin/products/queries/detail-product.query.ts`<br>`frontend-admin/src/lib/api/admin-products-api.ts` |
| `AdminProductRow` | 2 | `backend/src/admin/products/queries/list-products.query.ts`<br>`frontend-admin/src/lib/api/admin-products-api.ts` |
| `AdminTransactionRow` | 2 | `backend/src/admin/transactions/queries/list-transactions.types.ts`<br>`frontend-admin/src/lib/api/admin-transactions-api.ts` |
| `CreateAdminUserInput` | 2 | `backend/src/admin/users/admin-users.service.ts`<br>`frontend-admin/src/lib/api/admin-iam-api.ts` |
| `UpdateAdminUserInput` | 2 | `backend/src/admin/users/admin-users.service.ts`<br>`frontend-admin/src/lib/api/admin-iam-api.ts` |
| `asJsonObject` | 2 | `backend/src/auth/auth-service.helpers.ts`<br>`worker/autopilot-scanner.helpers.ts` |
| `buildAuthLogMessage` | 2 | `backend/src/auth/auth-service.helpers.ts`<br>`backend/src/auth/auth.helpers.ts` |
| `hashOpaqueToken` | 2 | `backend/src/auth/auth-service.helpers.ts`<br>`backend/src/partnerships/partnerships.crypto.helpers.ts` |
| `generateOpaqueToken` | 2 | `backend/src/auth/auth-service.helpers.ts`<br>`backend/src/partnerships/partnerships.crypto.helpers.ts` |
| `checkEmail` | 2 | `backend/src/auth/auth-service.register-login.ts`<br>`backend/src/health/system-health-external-probes.ts` |
| `AuthController` | 2 | `backend/src/auth/auth.controller.ts`<br>`backend/src/common/throttler/route-class.decorator.ts` |
| `CalendarEvent` | 2 | `backend/src/calendar/calendar.service.ts`<br>`frontend/src/lib/api/calendar.ts` |
| `formatMercadoPagoQrImage` | 2 | `backend/src/checkout/checkout-payment.helpers.ts`<br>`backend/src/wallet/wallet.service.helpers.ts` |
| `normalizeEmail` | 2 | `backend/src/checkout/checkout-social-lead.util.ts`<br>`backend/src/common/string.ts` |
| `CreatePlanDto` | 2 | `backend/src/checkout/dto/create-plan.dto.ts`<br>`backend/src/plans/plan.service.ts` |
| `CreateProductDto` | 2 | `backend/src/checkout/dto/create-product.dto.ts`<br>`backend/src/products/product.types.ts` |
| `ValidateCouponDto` | 2 | `backend/src/checkout/dto/validate-coupon.dto.ts`<br>`backend/src/kloel/dto/product-sub-resources.dto.ts` |
| `pollUntil` | 2 | `backend/src/common/async-sequence.ts`<br>`worker/utils/async-sequence.ts` |
| `ChannelSendResult` | 2 | `backend/src/common/channel-dispatch/channel-dispatch.port.ts`<br>`backend/src/kloel/channel-transport.types.ts` |
| `ChannelCapability` | 2 | `backend/src/common/channel-dispatch/channel-dispatch.port.ts`<br>`backend/src/kloel/channel-transport.types.ts` |
| `ObservabilityModule` | 2 | `backend/src/common/observability/observability.module.ts`<br>`backend/src/kloel/observability/observability.module.ts` |
| `readString` | 2 | `backend/src/common/parse.ts`<br>`backend/src/marketing/tiktok-marketing.helpers.ts` |
| `readStringArray` | 2 | `backend/src/common/parse.ts`<br>`backend/src/marketing/tiktok-marketing.helpers.ts` |
| `NormalizedPhone` | 2 | `backend/src/common/phone/phone-normalization.util.ts`<br>`worker/utils/phone-normalization.util.ts` |
| `phonesMatch` | 2 | `backend/src/common/phone/phone-normalization.util.ts`<br>`worker/utils/phone-normalization.util.ts` |
| `RedisConfigurationError` | 2 | `backend/src/common/redis/resolve-redis-url.ts`<br>`worker/resolve-redis-url.ts` |
| `maskRedisUrl` | 2 | `backend/src/common/redis/resolve-redis-url.ts`<br>`worker/resolve-redis-url.ts` |
| `resolveRedisUrl` | 2 | `backend/src/common/redis/resolve-redis-url.ts`<br>`worker/resolve-redis-url.ts` |

---

## Divergent forks (same filename, different implementation)

Forks with identical filenames whose source diverges meaningfully. These are not exporter-duplicates — they are independent reimplementations of the same concept and must be reconciled or one must be retired.

### `pulse-truth-snapshot.service.ts` — confirmed divergent fork

| Location | LOC | `PulseTruthSnapshot` shape | Constructor DI token | Snapshot logic |
|---|---:|---|---|---|
| `backend/src/kloel/abi/pulse-truth-snapshot.service.ts` | 31 | Imports `AbiPulseTruth` from `./abi-schema` (single `snapshot: () => AbiPulseTruth` member) | `ABI_PULSE_TRUTH_STATE` | Returns a shallow clone of an injected `AbiPulseTruth` state. No computation. |
| `backend/src/kloel/pulse-gates/pulse-truth-snapshot.service.ts` | 95 | Declares inline `PulseTruthSnapshot`, `GateSnapshotEntry`, `CertificationVerdict`, `GateDescriptor` (5 members, including `noOverclaimStatus`, `capabilityHealthScore`, `gates`, `certificationVerdict`, `overclaimRisk`) | `PULSE_TRUTH_SNAPSHOT_DESCRIPTORS` | Computes verdict, score, overclaim risk from an injected `GateDescriptor[]`. |

`diff` summary: only 2 of 31 lines from the abi/ variant align with the pulse-gates/ variant (the `Injectable` decorator and `@Optional() @Inject(...)` line). The pulse-gates/ variant is a 3× larger, fully different service — it derives the snapshot from a descriptor list rather than reading injected pre-computed state.

| Decision question | Status |
|---|---|
| Are they true duplicates? | No — divergent forks. |
| Canonical owner | Undecided. `abi/` matches the ABI schema contract (`AbiPulseTruth`); `pulse-gates/` matches PULSE gate semantics directly. |
| Risk if both stay | Two services with the same class name `PulseTruthSnapshotService` registered in different modules → DI ambiguity if both modules ever imported into the same context. |
| Recommended next step | Rename one (e.g., `AbiPulseTruthSnapshotService` for the schema-driven variant) and decide which produces the authoritative truth surface. Track via `CANONICAL_MOVES.md`. |

---

## Helper function clusters by name family

Grouped helpers that share a verb stem and a domain concern. The scan exporter is exact-name-only; this section captures the family overlap that exact-name dedup misses.

### Phone normalization family

`rg -l 'function (normalize|format|clean)Phone'` produces 6 hits. The signatures diverge — same name, different return type.

| File | Symbol | Signature (return) | Notes |
|---|---|---|---|
| `backend/src/common/phone/phone-normalization.util.ts:150` | `normalizePhone` | `NormalizedPhone \| null` | Canonical, exported, used by guards. |
| `worker/utils/phone-normalization.util.ts:171` | `normalizePhone` | `NormalizedPhone \| null` | Worker mirror — already flagged P0. |
| `backend/src/checkout/checkout-social-lead.util.ts:34` | `normalizePhone` | `string \| null` | Different return type — drops country code metadata. |
| `worker/providers/checkout-social-lead-enrichment.ts:212` | `normalizePhone` (private) | unannotated | File-local; identical body to checkout-social-lead util. |
| `backend/src/prisma/checkout-paid-effects/whatsapp.ts:21` | `normalizePhone` (private) | unannotated | File-local; trims and strips non-digits only. |
| `frontend/src/app/(main)/followups/followups.helpers.ts:31` | `formatPhone` | `string` | Display-only; not a normalizer despite related domain. |

Canonical move: collapse the three string-returning private `normalizePhone` implementations onto `backend/src/common/phone/phone-normalization.util.ts` (or a `digits-only` thin sibling). `formatPhone` belongs in `frontend/src/lib/format/phone.ts` and is not part of this cluster.

### Workspace resolver family

`rg -l 'function (resolveWorkspace|getWorkspace|findWorkspace)'` produces 15 hits. Five name variants on the same concept (resolve the workspace for a request/lead/payload).

| File | Symbol | Concern |
|---|---|---|
| `backend/src/auth/workspace-access.ts:119` | `resolveWorkspaceId` | Auth/JWT-driven resolution from session. Canonical. |
| `backend/src/email/email-inbound.service.ts:87` | `resolveWorkspaceAlias` | Map inbound email alias → workspace+username. |
| `backend/src/kloel/guards/kloel-security.guard.ts:45` | `getWorkspaceId` | Reads workspaceId off the request shape used by the Kloel guard. |
| `worker/processors/autopilot/autopilot-utils.ts:28` | `findWorkspaceProductMatches` | Different concern (product matching). Not a true variant. |
| `worker/processors/autopilot/identity-resolve.ts:41` | `resolveWorkspaceSelfIdentity` | Worker-side resolution of the workspace's own identity. |

Canonical move: name-only normalisation (`resolveWorkspaceId` for request → id; `resolveWorkspaceAlias` for alias → workspace; `resolveWorkspaceSelfIdentity` for worker self-identity). No code dedup necessary — they are distinct concerns sharing only a verb stem. Flagged here to prevent a future agent from inventing a fourth synonym.

### Webhook parser family

`rg -l 'function (parseWebhook|extractWebhook)'` returns zero hits — no symbol-level cluster. Webhook parsing is owned per-provider (`backend/src/webhooks/webhooks.service.helpers.ts`, `backend/src/marketing/channels/whatsapp/providers/waha-webhook-handler.helpers.ts`, etc.) and does not need consolidation. Recorded as a negative result so a future scan does not re-investigate.

---

## Services with overlapping responsibilities

Method-signature overlap across three top-level orchestrator services. Each owns parts of the lead-conversation-payment loop; methods named identically across the three risk silent divergence.

| Method | `KloelService` (442 LOC) | `UnifiedAgentService` (475 LOC) | `LeadMindCoordinator` (434 LOC) |
|---|---|---|---|
| `processWhatsAppMessage(...)` | line 342 | — | line 227 |
| `processWhatsAppMessageWithPayment(...)` | line 356 | — | line 386 |
| `generatePaymentForLead(...)` | line 370 | — | line 195 |
| `processIncomingMessage(...)` | — | line 88 | — |
| `processMessage(...)` | — | line 125 | — |
| `think(...)` | line 121 | — | — |
| `thinkSync(...)` | line 174 | — | — |
| `executeTool(...)` | — | line 404 | — |
| `getOrCreateLead(...)` | — | — | line 83 |
| `saveLeadMessage(...)` | — | — | line 119 |
| `updateLeadFromConversation(...)` | — | — | line 141 |
| `extractProductFromMessage(...)` | — | — | line 160 |

**Verified overlap (semantic):**

- `KloelService.processWhatsAppMessage` and `LeadMindCoordinator.processWhatsAppMessage` — same name, same arg shape (`{ workspaceId, contactPhone, content, ... }`). Two different message-ingestion entry points.
- `KloelService.processWhatsAppMessageWithPayment` and `LeadMindCoordinator.processWhatsAppMessageWithPayment` — same.
- `KloelService.generatePaymentForLead` and `LeadMindCoordinator.generatePaymentForLead` — same.

**Probable overlap (semantic, different names):**

- `UnifiedAgentService.processIncomingMessage` / `UnifiedAgentService.processMessage` against the two `processWhatsAppMessage` variants above — three services with four entry-points for "message arrived, run the agent loop".

---

## `sendMessage` family — full classification audit (Wave W5, 2026-05-29)

> **Supersedes the P0 row at line 23** (`sendMessage | 4 | … | MessageDispatchService.send()`)
> and extends `SEND_MESSAGE_CANONICAL.md` (Wave 21, 9-impl scan). A direct
> source-level audit of EVERY `sendMessage` declaration in `backend/src` (33
> declaration sites; `worker/src` has zero) was performed via grep +
> `code_read_symbol`. Each is classified **A** (canonical dispatch), **B**
> (legitimate per-channel adapter / transport leaf / controller / DI interface /
> DB-only / copilot — SUPPOSED to be distinct), or **C** (true duplicate that
> should route through the canonical dispatch).
>
> **Result: ZERO remaining class-C duplicates.** Waves 21/22 already migrated
> every cross-channel send onto the canonical `ChannelDispatchRegistry`. No new
> merge was performed in W5 — the conservative correct action is audit +
> document. The legacy fan-in layers that remain (`provider-registry*`,
> `provider-send-message.helpers`) are intentional facade/leaf layers behind the
> canonical port, carry `@canonical-status delegate` JSDoc, and are NOT
> duplicates of the dispatch surface.

### Canonical send path (the front door higher-order callers SHOULD target)

```
caller
  -> ChannelMessageDispatchService.dispatch(ws, channel, to, msg, opts)   [marketing/channel-message-dispatch.service.ts]   (A: ergonomic facade)
      | (or .sendMessage(prebuiltInput) / .dispatchTool(args))
  -> ChannelDispatchRegistry.send(ChannelSendInput) / .sendMessage(...)    [common/channel-dispatch/channel-dispatch.registry.ts]   (A: registry, resolves by ChannelKind)
  -> <ChannelKind>DispatchAdapter.send(input) / .sendMessage(input)        [marketing/channels/<ch>/*-dispatch.adapter.ts]   (B: per-channel adapter, sendMessage = thin alias to send)
  -> per-channel transport leaf                                           (B: WhatsappService / FacebookMessengerService / InstagramService / Email providers ...)
```

A second, OLDER parallel dispatch system exists at `kloel/channel-transport.*`
(`ChannelTransportProvider.send(workspaceId, request)` + `*ChannelTransport`
classes + `channel-transport.registry.ts`). It is also class A "canonical
dispatch" infrastructure but uses `send(...)`, **not** `sendMessage`, so it
contributes no rows to this `sendMessage` family. The `whatsapp.service.ts` /
`provider-*` JSDoc names it the "long-term" target — the two registries are a
documented in-flight convergence (see `CHANNEL_DISPATCH_CANONICAL.md`), out of
scope for this `sendMessage`-name audit.

### A — Canonical dispatch (2)

| # | Symbol | File:line | Why canonical |
|---|---|---|---|
| A1 | `ChannelDispatchRegistry.sendMessage` | `common/channel-dispatch/channel-dispatch.registry.ts:81` | Registry alias of `send`; resolves adapter by `input.channelKind`, prefers adapter's own `sendMessage` else `send`. The single front door. |
| A2 | `ChannelMessageDispatchService.sendMessage` | `marketing/channel-message-dispatch.service.ts:135` | Low-level pass-through to `registry.sendMessage(input)`; companion to the ergonomic `dispatch(ws,channel,to,msg,opts)`. |
| — | `ChannelDispatchPort.sendMessage?` | `common/channel-dispatch/channel-dispatch.port.ts:176` | The *contract* declaration (optional alias) — not an impl. Definitional, kept here for completeness. |

### B — Legitimate, distinct (DO NOT MERGE) (28)

**B.1 — Per-channel `ChannelDispatchPort` adapters (sendMessage = thin alias to `send`).** Each is a distinct `ChannelKind`; merging them would collapse the discriminated union.

| Symbol | File:line | ChannelKind | Delegates to |
|---|---|---|---|
| `WhatsAppDispatchAdapter.sendMessage` | `marketing/channels/whatsapp/whatsapp-dispatch.adapter.ts:47` | WHATSAPP | `WhatsappService.sendMessage` |
| `InstagramDispatchAdapter.sendMessage` | `marketing/channels/instagram/instagram-dispatch.adapter.ts:64` | INSTAGRAM | `InstagramService.sendMessage` |
| `MessengerDispatchAdapter.sendMessage` | `marketing/channels/messenger/messenger-dispatch.adapter.ts:72` | MESSENGER | `MessengerService.sendTextMessage` |
| `FacebookDispatchAdapter.sendMessage` | `marketing/channels/facebook/facebook-dispatch.adapter.ts:55` | FACEBOOK | `FacebookMessengerService.sendMessage` |
| `EmailDispatchAdapter.sendMessage` | `marketing/channels/email/email-dispatch.adapter.ts:79` | EMAIL | gmail / microsoft / imapSmtp providers |
| `TikTokDispatchAdapter.sendMessage` | `marketing/channels/tiktok/tiktok-dispatch.adapter.ts:43` | TIKTOK | honest blocked (no outbound API) |
| `InternalPartnershipDispatchAdapter.sendMessage` | `marketing/channels/internal-partnership/internal-partnership-dispatch.adapter.ts:61` | INTERNAL_PARTNERSHIP | `partnerships.chat.helpers#sendMessage` (DB insert) |

**B.2 — Per-channel transport leaves (the real API/DB calls the adapters wrap).** Distinct provider surfaces with channel-specific arg shapes.

| Symbol | File:line | Surface |
|---|---|---|
| `WhatsappService.sendMessage` | `marketing/channels/whatsapp/whatsapp.service.ts:436` | Rate-guarded WA facade -> `messageDispatcher.sendMessage` |
| `WhatsappMessageDispatcherService.sendMessage` | `marketing/channels/whatsapp/whatsapp-message-dispatcher.service.ts:49` | WA queue/direct routing, opt-in, plan limits, presence sim, persistence |
| `WhatsAppProviderRegistry.sendMessage` | `marketing/channels/whatsapp/providers/provider-registry.ts:154` | `@canonical-status delegate` -> `provider-registry-messaging#sendMessage` |
| `provider-registry-messaging#sendMessage` (fn) | `.../providers/provider-registry-messaging.ts:31` | `@canonical-status delegate` thin wrapper -> companion leaf |
| `provider-send-message.helpers#sendMessage` (fn) | `.../providers/provider-send-message.helpers.ts:25` | Leaf: WAHA-vs-MetaCloud routing + ops alerting |
| `WhatsAppApiProvider.sendMessage` | `.../providers/whatsapp-api.provider.ts:145` | Meta Cloud leaf -> `metaWhatsApp.sendTextMessage` |
| `FacebookMessengerService.sendMessage` | `marketing/facebook-messenger.service.ts:41` | Graph `${pageId}/messages` (RESPONSE) + `fbMessage` persistence |
| `InstagramService.sendMessage` | `marketing/channels/instagram/instagram.service.ts:12` | Graph `${igAccountId}/messages` |
| `TikTokInboxService.sendMessage` | `marketing/tiktok-inbox.service.ts:98` | Honest `channel_pending` (no fake enqueue) |
| `partnerships.chat.helpers#sendMessage` (fn) | `partnerships/partnerships.chat.helpers.ts:98` | DB-only `partnerMessage.create` (senderType OWNER) |
| `PartnershipsService.sendMessage` | `partnerships/partnerships.service.ts:431` | `@canonical-status delegate` -> the helper above |

**B.3 — HTTP controllers (`@Post ... sendMessage`).** Thin route handlers; each delegates to its channel service. Same method name is expected REST boilerplate, not behavioral duplication.

| Symbol | File:line | Route -> service |
|---|---|---|
| `PublicApiController.sendMessage` | `public-api/public-api.controller.ts:40` | `POST` -> `inbox.saveMessageByPhone` (OUTBOUND) |
| `AdminChatController.sendMessage` | `admin/chat/admin-chat.controller.ts:44` | -> `AdminChatService.sendMessage` |
| `TikTokInboxController.sendMessage` | `marketing/tiktok-inbox.controller.ts:52` | -> `TikTokInboxService.sendMessage` |
| `PartnershipsController.sendMessage` | `partnerships/partnerships.controller.ts:168` | -> `PartnershipsService.sendMessage` |
| `FacebookMessengerController.sendMessage` | `marketing/facebook-messenger.controller.ts:33` | -> `FacebookMessengerService.sendMessage` |
| `MessengerController.sendMessage` | `marketing/channels/messenger/messenger.controller.ts:32` | -> `MessengerService.sendText/Media` |
| `InstagramController.sendMessage` | `marketing/channels/instagram/instagram.controller.ts:170` | -> `InstagramService.sendMessage` |

**B.4 — Copilot / not a channel send.**

| Symbol | File:line | Why distinct |
|---|---|---|
| `AdminChatService.sendMessage` | `admin/chat/admin-chat.service.ts:82` | Admin copilot: tool invocation + NLU intent + `ChatToolRegistry`; returns `ChatSessionView`, not `ChannelSendResult`. Wrapping in a `ChannelDispatchPort` adapter would be lossy (R5 of `SEND_MESSAGE_CANONICAL.md`). KEEP-LOCAL. |

**B.5 — DI structural interfaces (declarations, not impls).** Minimal `sendMessage(...)` shapes a consumer requires of its injected WhatsApp service. They constrain types only; collapsing them would couple unrelated modules.

| Symbol | File:line |
|---|---|
| `IWhatsappMessaging.sendMessage` | `marketing/channels/whatsapp/whatsapp.interfaces.ts:2` |
| `MinimalWhatsappService.sendMessage` | `marketing/channels/whatsapp/inbound-processor.inline-autopilot.ts:11` |
| `...deps.sendMessage` (stripe webhook) | `webhooks/payment-webhook-stripe.deps.ts:16` |
| `...deps.sendMessage` (billing webhook) | `billing/billing-webhook.types.ts:26` |

### C — True duplicates to migrate

**None.** Every cross-channel send already routes through the canonical
`ChannelDispatchRegistry`; the WhatsApp fan-in (`provider-registry` ->
`provider-registry-messaging` -> `provider-send-message.helpers` ->
`whatsapp-api.provider`) is an intentional, JSDoc-tagged delegate chain that
the canonical adapter wraps, not a parallel reimplementation. Worker-side send
(`worker/.../flow-message-sender.helpers.ts#sendMessage`, the Wave-21 impl #9)
bundles persistence + Redis realtime pub/sub and is correctly KEEP-LOCAL — a
port migration would silently drop those concerns (R1 of
`SEND_MESSAGE_CANONICAL.md`). No W5 source edit was made.

### Migrations done (W5)

None — audit-and-document only, per the conservative rule. Migration of the
class-C set was completed in Waves 21/22 (adapters created + callers rewired).
This entry records the post-migration steady state and supersedes the stale P0
row.

### Follow-ups (tracked elsewhere, NOT W5 scope)

- Converge the two canonical registries (`common/channel-dispatch` <-> `kloel/channel-transport`) — see `CHANNEL_DISPATCH_CANONICAL.md`. Until then, `send()` (transport) and `sendMessage()` (dispatch-port alias) coexist by design.
- Delete the deprecated WhatsApp delegate wrappers (`provider-registry-messaging#sendMessage`, `provider-registry.sendMessage`) once all callers target the port — deletion deadline policy in `SEND_MESSAGE_CANONICAL.md` §4. Owner-gated; do not delete while callers remain.

**Decision question:** which orchestrator is canonical for "message → agent → action → payment"? Today the dispatch path goes through `kloel-tool-dispatcher.service.ts` → `unified-agent.service.ts`; the legacy `KloelService` and the M5 `LeadMindCoordinator` both still expose the same surface area. Track resolution via `MIND_SERVICE_CONSOLIDATION.md`.
