# Kloel Canonical Domains

> **PI Task K24** — Canonical domain map with boundaries, sub-services, and status.
> Raw inventory also available: 179 source modules, 3377 files, 590 injectable services (see [SERVICE_CATALOG.md](./SERVICE_CATALOG.md)).

This document defines the **16 canonical business domains** (bold) and 4 **infrastructure cross-cuts** (italic). Each domain owns one or more backend source modules; each lists key sub-services found in the codebase.

---

## 1. Identity / Auth

**Boundary**: Authentication, authorization, session management, OAuth flows. Does NOT own user profiles or contact records.

| Sub-service | Source path | Status |
|---|---|---|
| `AuthService` | `backend/src/auth/auth.service.ts` | ✅ Active |
| `AuthTokenService` | `backend/src/auth/auth.token.service.ts` | ✅ Active |
| `JwtAuthGuard` | `backend/src/auth/jwt-auth.guard.ts` | ✅ Active |
| `AdminAuthService` | `backend/src/admin/auth/admin-auth.service.ts` | ✅ Active |
| `AdminMfaService` | `backend/src/admin/auth/admin-mfa.service.ts` | ✅ Active |
| `ApiKeyGuard` | `backend/src/public-api/api-key.guard.ts` | ✅ Active |

**Event surface**: `auth.*` family (AsyncAPI). Workspace-scoped guards (`@UseGuards(JwtAuthGuard, WorkspaceGuard)`).

---

## 2. Tenant / Workspace

**Boundary**: Multi-tenant isolation unit. Workspace CRUD, provider status, membership. Maps to `Workspace` model.

| Sub-service | Source path | Status |
|---|---|---|
| `WorkspaceService` | `backend/src/workspaces/workspace.service.ts` | ✅ Active |
| `KloelWorkspaceContextService` | `backend/src/kloel/kloel-workspace-context.service.ts` | ✅ Active |
| `TeamService` | `backend/src/team/team.service.ts` | ✅ Active |

**Event surface**: `workspace.*` family.

---

## 3. Channel

**Boundary**: Channel provisioning, session lifecycle, transport abstraction, health monitoring, ban-risk detection. Multi-channel (WhatsApp, Instagram, Messenger, Email, TikTok).

| Sub-service | Source path | Status |
|---|---|---|
| `ChannelTransportRegistry` | `backend/src/kloel/channel-transport.registry.ts` | ✅ Active |
| `WhatsAppSessionService` | `backend/src/marketing/channels/whatsapp/whatsapp-session.service.ts` | ✅ Active |
| `MetaConnectionStateService` | `backend/src/meta/meta-connection-state.service.ts` | ✅ Active |
| `ChannelHealthMonitorService` | `backend/src/kloel/channel-survival/channel-health.monitor.service.ts` | ✅ Active |
| `BanRiskDetector` | `backend/src/kloel/channel/ban-risk.detector.ts` | ✅ Active |
| `ChannelPolicyRegistry` | `backend/src/kloel/channel-policy/channel-policy.registry.ts` | ✅ Active |
| `ChannelSetupService` | `backend/src/kloel/channel-setup.service.ts` | ✅ Active |

**Module locations**: `backend/src/meta/`, `backend/src/marketing/channels/`, `backend/src/omnichannel/`, `backend/src/kloel/channel*/`.

---

## 4. Conversation

**Boundary**: Inbound message reception, routing, inbox, thread management, reply engine.

| Sub-service | Source path | Status |
|---|---|---|
| `ChannelInboundHookService` | `backend/src/omnichannel/channel-inbound-hook.service.ts` | ✅ Active |
| `InboxService` | `backend/src/inbox/inbox.service.ts` | ✅ Active |
| `SmartRoutingService` | `backend/src/inbox/smart-routing.service.ts` | ✅ Active |
| `KloelReplyEngineService` | `backend/src/kloel/kloel-reply-engine.service.ts` | ✅ Active |
| `KloelThreadService` | `backend/src/kloel/kloel-thread.service.ts` | ✅ Active |
| `GuestChatService` | `backend/src/kloel/guest-chat.service.ts` | ✅ Active |

**Event surface**: `commerce.whatsapp.message_received`, `commerce.whatsapp.message_replied`, `commerce.lead.replied`.

---

## 5. Message

**Boundary**: Message dispatch, delivery tracking, channel-agnostic send pipeline. Distinct from Conversation (which handles routing/threading).

| Sub-service | Source path | Status |
|---|---|---|
| `MessageDispatchService` | `backend/src/common/channel-dispatch/` | ✅ Active |
| `MetaWhatsAppService` | `backend/src/meta/meta-whatsapp.service.ts` | ✅ Active |
| `OutboundDispatcher` | `worker/outbound-dispatcher.ts` | ✅ Active |
| `WhatsAppEngine` | `worker/whatsapp-engine.ts` | ✅ Active |

**Event surface**: `commerce.whatsapp.sent`, `commerce.whatsapp.failed`.

---

## 6. Campaign

**Boundary**: Marketing campaigns, mass messaging, audience segmentation, campaign analytics, TikTok/Facebook marketing.

| Sub-service | Source path | Status |
|---|---|---|
| `CampaignsService` | `backend/src/campaigns/campaigns.service.ts` | ✅ Active |
| `CampaignEventEmitterService` | `backend/src/kloel/campaign-emitter/campaign-event-emitter.service.ts` | ✅ Active |
| `MassSendService` | `backend/src/mass-send/mass-send.service.ts` | ✅ Active |
| `TikTokMarketingService` | `backend/src/marketing/tiktok-marketing.service.ts` | ✅ Active |
| `FacebookMessengerService` | `backend/src/marketing/facebook-messenger.service.ts` | ✅ Active |

**Event surface**: `commerce.campaign.clicked`, `commerce.campaign.conversion_associated`, `commerce.campaign.audience_reached`, `commerce.campaign.creative_swapped`, `commerce.campaign.performance_drop_detected`.

---

## 7. Product

**Boundary**: Product/plan catalog, pricing, product lifecycle.

| Sub-service | Source path | Status |
|---|---|---|
| `ProductService` | `backend/src/products/product.service.ts` | ✅ Active |
| `PlanService` | `backend/src/plans/plan.service.ts` | ✅ Active |

**Event surface**: `product.created`, `product.updated`, `product.deleted`, `product.published`, `plan.created`, `plan.updated`, `plan.deleted`.

---

## 8. Checkout

**Boundary**: Checkout experience, order creation, payment method selection, cart lifecycle, social-lead enrichment.

| Sub-service | Source path | Status |
|---|---|---|
| `CheckoutService` | `backend/src/checkout/checkout.service.ts` | ✅ Active |
| `CheckoutPaymentService` | `backend/src/checkout/checkout-payment.service.ts` | ✅ Active |
| `CheckoutEventEmitterService` | `backend/src/kloel/checkout-emitter/checkout-event-emitter.service.ts` | ✅ Active |
| `CartRecoveryService` | `backend/src/kloel/cart-recovery.service.ts` | ✅ Active |

**Event surface**: `commerce.cart.created`, `commerce.cart.abandoned`, `commerce.cart.checkout_initiated`, `commerce.checkout.created`, `commerce.checkout.updated`, `commerce.lead.converted`.

---

## 9. Payment

**Boundary**: Payment processing, provider routing (Stripe/MercadoPago), fraud, chargebacks, refunds, prepaid wallet.

| Sub-service | Source path | Status |
|---|---|---|
| `PaymentService` | `backend/src/kloel/payment.service.ts` | ✅ Active |
| `StripeChargeService` | `backend/src/payments/stripe/stripe-charge.service.ts` | ✅ Active |
| `FraudEngine` | `backend/src/payments/fraud/fraud.engine.ts` | ✅ Active |
| `LedgerService` | `backend/src/payments/ledger/ledger.service.ts` | ✅ Active |
| `WalletService` | `backend/src/wallet/wallet.service.ts` | ✅ Active |
| `SmartPaymentService` | `backend/src/kloel/smart-payment.service.ts` | ✅ Active |
| `MarketplaceTreasuryService` | `backend/src/marketplace-treasury/marketplace-treasury.service.ts` | ✅ Active |

**Event surface**: `commerce.payment.initiated`, `commerce.payment.approved`, `commerce.payment.declined`, `commerce.payment.refunded`, `commerce.payment.charged_back`.

---

## 10. Affiliate

**Boundary**: Affiliate discovery, commission, angle suggestion, offer quality, budget protection.

| Sub-service | Source path | Status |
|---|---|---|
| `AffilDiscoveryLoopService` | `backend/src/kloel/affil/affil-discovery.loop.ts` | ✅ Active |
| `CommissionComparatorService` | `backend/src/kloel/affil/commission.comparator.ts` | ✅ Active |

---

## 11. CRM

**Boundary**: Sales pipeline, deal tracking, lead scoring, CRM automation.

| Sub-service | Source path | Status |
|---|---|---|
| `CrmService` | `backend/src/crm/crm.service.ts` | ✅ Active |
| `NeuroCrmService` | `backend/src/crm/neuro-crm.service.ts` | ✅ Active |
| `CrmEventEmitterService` | `backend/src/kloel/crm-emitter/crm-event-emitter.service.ts` | ✅ Active |
| `PipelineService` | `backend/src/pipeline/pipeline.service.ts` | ✅ Active |

**Event surface**: `commerce.crm.deal_won`, `commerce.crm.deal_lost`, `commerce.crm.stage_changed`.

---

## 12. Autopilot

**Boundary**: Autonomous agent execution loops, segmentation, decision cycles, budget-aware automation.

| Sub-service | Source path | Status |
|---|---|---|
| `AutopilotCycleExecutorService` | `backend/src/autopilot/autopilot-cycle-executor.service.ts` | ✅ Active |
| `AutopilotCycleMoneyService` | `backend/src/autopilot/autopilot-cycle-money.service.ts` | ✅ Active |
| `SegmentationService` | `backend/src/autopilot/segmentation.helpers.ts` | ✅ Active |

**Worker counterpart**: `worker/autopilot-processor.ts`, `worker/autopilot-scanner.helpers.ts`.

---

## 13. Commercial Intelligence (Mind/Cognition)

**Boundary**: Cognitive loop (perception → prediction → surprise → decision), belief tracking, bandit optimization, policy evaluation, simulation.

| Sub-service | Source path | Status |
|---|---|---|
| `MindService` | `backend/src/kloel/mind.service.ts` | ✅ Active (M5 migration pending) |
| `MindBeliefService` | `backend/src/kloel/mind-belief.service.ts` | ✅ Active |
| `MindPolicyService` | `backend/src/kloel/mind-policy.service.ts` | ✅ Active |
| `MindBanditService` | `backend/src/kloel/mind-bandit.service.ts` | ✅ Active |
| `MindPredictionService` | `backend/src/kloel/mind/mind-prediction.service.ts` | ✅ Active |
| `MindSurpriseService` | `backend/src/kloel/mind-surprise.service.ts` | ✅ Active |
| `MindPerceptionService` | `backend/src/kloel/mind-perception.service.ts` | ✅ Active |
| `MindSimulatorService` | `backend/src/kloel/mind-simulator.service.ts` | ✅ Active |
| `MindEventProcessorService` | `backend/src/kloel/mind-event-processor.service.ts` | ✅ Active |

**Canonical path**: 47 Mind services — 23 already under `kloel/mind/`, 23 pending M5 move from `kloel/` top-level (see [MIND_SERVICES_CANONICAL.md](./MIND_SERVICES_CANONICAL.md)).

**Event surface**: `cognition.decision_made`, `cognition.belief_updated`, `mind.decision.*`, `mind.prediction.*`, `mind.surprise.recorded`.

---

## 14. Analytics

**Boundary**: Dashboard aggregation, queue stats, agent performance, ABI validation, observability metrics.

| Sub-service | Source path | Status |
|---|---|---|
| `AnalyticsService` | `backend/src/analytics/analytics.service.ts` | ✅ Active |
| `DashboardService` | `backend/src/dashboard/dashboard.service.ts` | ✅ Active |
| `AdvancedAnalyticsService` | `backend/src/analytics/advanced-analytics.service.ts` | ✅ Active |
| `MindObservabilityService` | `backend/src/kloel/mind-observability.service.ts` | ✅ Active |
| `MindLiftReportService` | `backend/src/kloel/mind-lift-report.service.ts` | ✅ Active |

---

## 15. Billing

**Boundary**: Subscription plans, Stripe billing, payment methods, checkout webhooks.

| Sub-service | Source path | Status |
|---|---|---|
| `BillingSubscriptionService` | `backend/src/billing/billing-subscription.service.ts` | ✅ Active |
| `BillingCheckoutHelperService` | `backend/src/billing/billing-checkout-helper.service.ts` | ✅ Active |
| `BillingCheckoutWebhookService` | `backend/src/billing/billing-checkout-webhook.service.ts` | ✅ Active |
| `PaymentMethodService` | `backend/src/billing/payment-method.service.ts` | ✅ Active |

---

## 16. Infrastructure (cross-cut)

*Italicized — not domains, but cross-cutting infrastructure.*

| Cross-cut | Modules | Key services |
|---|---|---|
| *Webhooks* | `backend/src/webhooks/` | `WebhooksService` (inbound webhook fan-out), `PaymentWebhookStripeController` |
| *GDPR/Compliance* | `backend/src/gdpr/`, `backend/src/compliance/` | `GdprService`, `ComplianceService` |
| *Queue* | `backend/src/queue/`, `worker/queue.ts` | BullMQ-based job dispatch; `QueueHealthService` |
| *Health* | `backend/src/health/` | `SystemHealthService`, infra probes (Redis, DB, external) |

---

## Domain Coverage Summary

| Domain | Backend src modules | Status |
|---|---|---|
| Identity / Auth | `auth/`, `admin/auth/`, `public-api/` | ✅ |
| Tenant / Workspace | `workspaces/`, `team/` | ✅ |
| Channel | `meta/`, `marketing/channels/`, `omnichannel/`, `kloel/channel*/` | ✅ |
| Conversation | `inbox/`, `kloel/guest-chat*`, `kloel/kloel-reply-engine*`, `kloel/kloel-thread*` | ✅ |
| Message | `common/channel-dispatch/`, `meta/meta-whatsapp*`, `worker/` | ✅ |
| Campaign | `campaigns/`, `mass-send/`, `marketing/` | ✅ |
| Product | `products/`, `plans/`, `product-categories/` | ✅ |
| Checkout | `checkout/` | ✅ |
| Payment | `payments/`, `wallet/`, `marketplace-treasury/` | ✅ |
| Affiliate | `affiliate/`, `kloel/affil/` | ✅ |
| CRM | `crm/`, `pipeline/` | ✅ |
| Autopilot | `autopilot/`, `worker/autopilot*` | ✅ |
| Commercial Intelligence | `kloel/mind*/`, `kloel/mind-*`, `kloel/hypproof/`, `kloel/capability-registry*/` | ✅ |
| Analytics | `analytics/`, `dashboard/`, `kloel/mind/observability/` | ✅ |
| Billing | `billing/` | ✅ |
| Infrastructure | `webhooks/`, `gdpr/`, `compliance/`, `queue/`, `health/`, `config/` | ✅ |

---

## Raw Inventory (Appendices)

<details>
<summary>Full scan table (179 raw modules from `tools/canonicalize/scan.mjs`)</summary>

| Domain | Files | Services | Controllers | Modules | Events |
|---|---:|---:|---:|---:|---:|
| `kloel` | 859 | 318 | 38 | 42 | 4 |
| `frontend/components/kloel` | 551 | 0 | 0 | 0 | 0 |
| `frontend/page/(main)` | 202 | 0 | 0 | 0 | 0 |
| `admin` | 160 | 35 | 25 | 24 | 0 |
| `marketing` | 154 | 49 | 18 | 0 | 5 |
| `frontend/lib` | 128 | 0 | 0 | 0 | 11 |
| `common` | 78 | 21 | 2 | 4 | 2 |
| `frontend/page/api` | 78 | 0 | 0 | 0 | 0 |
| `frontend/page/(checkout)` | 74 | 0 | 0 | 0 | 0 |
| `checkout` | 61 | 14 | 2 | 0 | 0 |
| `worker/autopilot` | 54 | 0 | 0 | 0 | 0 |
| `auth` | 53 | 15 | 2 | 0 | 1 |
| `admin/app` | 47 | 0 | 0 | 0 | 0 |
| `worker/root` | 47 | 0 | 0 | 0 | 9 |
| `payments` | 42 | 15 | 3 | 1 | 0 |
| `frontend/hooks` | 40 | 0 | 0 | 0 | 4 |
| `frontend/page/(public)` | 34 | 0 | 0 | 0 | 0 |
| `frontend/components/products` | 32 | 0 | 0 | 0 | 0 |
| `admin/components` | 32 | 0 | 0 | 0 | 0 |
| `admin/lib` | 29 | 0 | 0 | 0 | 0 |
| `frontend/components/canvas` | 25 | 0 | 0 | 0 | 1 |
| `frontend/components/plans` | 25 | 0 | 0 | 0 | 0 |
| `billing` | 23 | 5 | 2 | 0 | 0 |
| `frontend/components/flow` | 21 | 0 | 0 | 0 | 0 |
| `meta` | 20 | 4 | 4 | 0 | 0 |
| `webhooks` | 20 | 3 | 6 | 0 | 0 |
| `worker/cia` | 20 | 0 | 0 | 0 | 0 |
| `integrations` | 19 | 7 | 0 | 0 | 2 |
| `health` | 17 | 11 | 2 | 0 | 0 |
| `autopilot` | 15 | 10 | 2 | 0 | 0 |
| `flows` | 15 | 3 | 3 | 0 | 3 |
| `gdpr` | 12 | 2 | 3 | 1 | 3 |
| `kyc` | 12 | 2 | 1 | 1 | 0 |
| `pulse` | 12 | 2 | 1 | 1 | 0 |
| `crm` | 11 | 2 | 2 | 0 | 0 |
| `inbox` | 11 | 4 | 1 | 0 | 1 |
| `prisma` | 10 | 1 | 0 | 1 | 0 |
| `analytics` | 9 | 5 | 1 | 0 | 0 |
| `wallet` | 9 | 1 | 1 | 1 | 0 |
| `dashboard` | 8 | 1 | 1 | 0 | 0 |
| `member-area` | 8 | 1 | 5 | 1 | 0 |
| `partnerships` | 8 | 1 | 1 | 1 | 0 |
| `lib` | 7 | 0 | 0 | 0 | 0 |
| `media` | 7 | 2 | 2 | 1 | 0 |
| `reports` | 7 | 3 | 1 | 1 | 0 |
| `sites` | 7 | 1 | 1 | 1 | 0 |
| `workspaces` | 7 | 1 | 1 | 1 | 0 |
| `frontend/components/ui` | 7 | 0 | 0 | 0 | 0 |
| `calendar` | 6 | 1 | 1 | 1 | 0 |
| `marketplace-treasury` | 6 | 4 | 0 | 0 | 0 |
| `metrics` | 6 | 4 | 1 | 1 | 0 |
| `frontend/components/webinarios` | 6 | 0 | 0 | 0 | 0 |
| `campaigns` | 5 | 1 | 1 | 0 | 0 |
| `chat` | 5 | 1 | 1 | 1 | 0 |
| `compliance` | 5 | 2 | 1 | 0 | 0 |
| `contacts` | 5 | 3 | 0 | 0 | 0 |
| `scrapers` | 5 | 5 | 1 | 1 | 0 |
| `voice` | 5 | 1 | 1 | 1 | 0 |
| `affiliate` | 4 | 0 | 2 | 1 | 0 |
| `api-keys` | 4 | 1 | 1 | 1 | 0 |
| `audit` | 4 | 2 | 1 | 0 | 0 |
| `copilot` | 4 | 1 | 1 | 1 | 2 |
| `growth` | 4 | 1 | 2 | 1 | 0 |
| `launch` | 4 | 1 | 1 | 1 | 0 |
| `notifications` | 4 | 2 | 1 | 1 | 2 |
| `observability` | 4 | 1 | 0 | 1 | 0 |
| `pipeline` | 4 | 1 | 1 | 1 | 0 |
| `products` | 4 | 1 | 0 | 1 | 4 |
| `queue` | 4 | 0 | 0 | 0 | 1 |
| `team` | 4 | 1 | 1 | 1 | 0 |
| `frontend/page/auth` | 4 | 0 | 0 | 0 | 0 |
| `anuncios` | 3 | 1 | 1 | 0 | 0 |
| `audio` | 3 | 1 | 1 | 1 | 0 |
| `config` | 3 | 0 | 0 | 0 | 0 |
| `cookie-consent` | 3 | 1 | 1 | 1 | 0 |
| `followup` | 3 | 1 | 1 | 1 | 0 |
| `marketplace` | 3 | 1 | 1 | 1 | 0 |
| `mass-send` | 3 | 1 | 1 | 1 | 0 |
| `omnichannel` | 3 | 2 | 0 | 1 | 0 |
| `product-categories` | 3 | 1 | 1 | 1 | 0 |
| `public-api` | 3 | 1 | 1 | 1 | 0 |
| `sales` | 3 | 1 | 0 | 1 | 0 |
| `unsubscribe` | 3 | 1 | 1 | 1 | 0 |
| `video` | 3 | 1 | 1 | 1 | 0 |
| `frontend/page/e2e` | 3 | 0 | 0 | 0 | 0 |
| `frontend/page/integrations` | 3 | 0 | 0 | 0 | 0 |
| `contracts` | 2 | 0 | 0 | 0 | 0 |
| `email` | 2 | 1 | 0 | 1 | 0 |
| `i18n` | 2 | 1 | 0 | 1 | 0 |
| `ops` | 2 | 0 | 1 | 1 | 0 |
| `plans` | 2 | 1 | 0 | 1 | 3 |
| `tiktok-ads` | 2 | 0 | 1 | 1 | 0 |
| `alerts` | 1 | 0 | 0 | 0 | 2 |
| `app.controller.ts` | 1 | 0 | 1 | 0 | 0 |
| `app.module.ts` | 1 | 0 | 0 | 0 | 0 |
| `app.service.ts` | 1 | 1 | 0 | 0 | 0 |
| `bootstrap.ts` | 1 | 0 | 0 | 0 | 0 |
| `google-ads` | 1 | 0 | 1 | 0 | 0 |
| `instrument.ts` | 1 | 0 | 0 | 0 | 1 |
| `logging` | 1 | 0 | 0 | 0 | 0 |
| `main.ts` | 1 | 0 | 0 | 0 | 0 |
| `post-sale` | 1 | 0 | 0 | 1 | 0 |
| `frontend/page/fonts.ts` | 1 | 0 | 0 | 0 | 0 |
| `frontend/page/global-error.tsx` | 1 | 0 | 0 | 0 | 0 |
| `frontend/page/layout.tsx` | 1 | 0 | 0 | 0 | 0 |
| `frontend/page/loading.tsx` | 1 | 0 | 0 | 0 | 0 |
| `frontend/page/not-found.tsx` | 1 | 0 | 0 | 0 | 0 |
| `frontend/page/robots.ts` | 1 | 0 | 0 | 0 | 0 |
| `frontend/page/sitemap.ts` | 1 | 0 | 0 | 0 | 0 |
| `frontend/components/icons` | 1 | 0 | 0 | 0 | 0 |
| `frontend/components/login` | 1 | 0 | 0 | 0 | 0 |
| `frontend/data` | 1 | 0 | 0 | 0 | 0 |
| `frontend/i18n` | 1 | 0 | 0 | 0 | 0 |
| `frontend/middleware.ts` | 1 | 0 | 0 | 0 | 0 |
| `frontend/test-setup.ts` | 1 | 0 | 0 | 0 | 0 |
| `frontend/types` | 1 | 0 | 0 | 0 | 0 |
| `admin/proxy.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/sales-templates.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/autopilot-jobs.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/colors.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/autopilot-processor.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/crm-processor.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/mass-send-processor.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/memory-processor.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/silent-24h-resolver-processor.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/webhook-processor.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/agent-events.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/ai-provider.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/anti-ban.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/auto-provider.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/campaigns.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/channel-dispatcher.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/checkout-social-lead-enrichment.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/commercial-intelligence.core.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/commercial-intelligence.persistence.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/commercial-intelligence.signals.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/commercial-intelligence.tasks.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/commercial-intelligence.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/commercial-intelligence.types.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/crm.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/email-config.helper.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/email-provider.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/fact-extractor.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/health-monitor.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/lead-scorer.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/mind-client.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/openai-models.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/outbound-dispatcher.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/plan-limits.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/prepaid-wallet-errors.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/prepaid-wallet-settlement.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/rag-provider.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/rate-limiter.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/registry.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/semantic-memory.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/stripe-runtime.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/timezone.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/tools-registry.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/unified-agent-integrator.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/unified-whatsapp-provider.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/watchdog.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/whatsapp-api-provider.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/whatsapp-engine.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/whatsapp-provider-resolver.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/auto-trigger.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/google-maps.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/instagram.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/utils` | 1 | 0 | 0 | 0 | 0 |
| `worker/scan-contact.cases.sweep.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/scan-contact.setup.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/async-sequence.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/error-message.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/memory-text-splitter.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/phone-normalization.util.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/prisma-json.util.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/prompt-sanitizer.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/safe-eval.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/signed-storage-url.ts` | 1 | 0 | 0 | 0 | 0 |
| `worker/ssrf-protection.ts` | 1 | 0 | 0 | 0 | 0 |

</details>
