# Kloel Capability Map (canonical)

> What the system **does**, grouped by business capability (not by file).
> Generated 2026-05-21 from cross-reference of [CANONICAL_DOMAINS](CANONICAL_DOMAINS.md), [SERVICE_CATALOG](SERVICE_CATALOG.md), and [EVENT_TAXONOMY](EVENT_TAXONOMY.md).
>
> Each capability lists: **canonical implementation**, deprecated alternatives, related events, and owning domain.

## Phase 0 — Identity & Tenancy

### `auth.authenticate_user`
**Canonical**: `AuthService.authenticate()` (backend/src/auth/auth.service.ts)
**Events**: `auth.refresh_token_expired`
**Status**: ✅ canonical

### `auth.refresh_session`
**Canonical**: `AuthRefreshService.refresh()` (backend/src/auth/auth-refresh.service.ts)
**Status**: ✅ canonical

### `auth.send_magic_link`
**Canonical**: `MagicLinkService.send()` (backend/src/auth/magic-link.service.ts)
**Status**: 🟡 partial — magic link send works; click validation pending

### `auth.resolve_workspace`
**Canonical**: `WorkspaceAccessService.resolveWorkspaceId()` (backend/src/auth/workspace-access.ts:119)
**Deprecated alternatives**:
- `getWorkspaceId()` in `backend/src/kloel/product-sub-resources/helpers/common.helpers.ts:23` → migrate to canonical
- `resolveWorkspaceFromAuthPayload()` in `frontend/src/lib/api/core-tokens.ts:21` → frontend-equivalent, OK
**Status**: 🟡 needs migration

### `tenant.isolate_query`
**Canonical**: Every Prisma query MUST include `where: { workspaceId }` — enforced by lint rule
**Helpers**: `requireWorkspace()` decorator (backend/src/common/decorators/workspace.decorator.ts)
**Status**: ✅ canonical

### `kyc.submit_document`
**Canonical**: `KycService.submitDocument()` (backend/src/kyc/kyc.service.ts)
**Events**: `commerce.kyc.document_submitted`
**Status**: ✅ 85%

### `kyc.approve` / `kyc.reject`
**Canonical**: `KycReviewService.approve()` / `reject()`
**Events**: `commerce.kyc.approved`, `commerce.kyc.rejected`
**Status**: ✅ canonical

## Phase 1 — Commerce engine

### `product.create_or_update`
**Canonical**: `ProductService.upsert()` (backend/src/kloel/products — needs extraction)
**Events**: `commerce.product.created`, `commerce.product.updated`
**Status**: 🟡 lives inside kloel god-module

### `checkout.create_session`
**Canonical**: `CheckoutSessionService.create()` (backend/src/checkout/checkout-session.service.ts)
**Deprecated/sibling implementations (13 detected by scanner — most are helpers, not duplicates)**:
- `createCheckoutPixel` (Meta Pixel snippet)
- `buildCheckoutMarketplacePricing` (pricing calc helper)
- `buildCheckoutOrderMetadata` (metadata builder helper)
- `createCheckout` (main entry — points to canonical)
- `buildCheckoutShippingQuote` (shipping helper)
- `buildCheckoutData` (kloel-side data builder)
- `buildCheckoutFormDraftKey` ×2 (frontend draft key, different scopes)
- `createCheckoutForm` (frontend component helper)
- `createCheckoutSession` (frontend API client)
- `buildCheckoutDisplayCode`, `buildCheckoutLinksForPlan`, `buildCheckoutPricing` (frontend helpers)
**Action**: most are NOT duplicates — they're stage-specific helpers in the checkout pipeline. Audit + label each as helper vs canonical entry.
**Events**: `commerce.checkout.created`, `commerce.cart.checkout_initiated`
**Status**: ✅ 85%

### `payment.charge_card`
**Canonical**: `StripeChargeService.create()` (backend/src/payments/stripe/stripe-charge.service.ts)
**Events**: `commerce.payment.initiated`, `commerce.payment.approved`, `commerce.payment.declined`, `commerce.payment.failed`
**Provider routing**: `PaymentProviderRouterService.resolve('card')` → `'stripe'`
**Status**: ✅ wired (live mode pending — issue #412)

### `payment.charge_pix`
**Canonical**: `MercadoPagoPixChargeService.create()` (backend/src/payments/mercadopago/mercadopago-pix-charge.service.ts)
**Events**: `commerce.payment.initiated`, `commerce.payment.approved`
**Provider routing**: `PaymentProviderRouterService.resolve('pix')` → `'mercadopago'`
**Status**: ✅ LIVE 2026-05-20

### `payment.handle_webhook`
**Canonical**:
- Stripe: `StripeWebhookController` (POST /webhooks/stripe) — HMAC verify via `stripe-signature` header
- MP: `MercadoPagoWebhookController` (POST /webhooks/mercadopago) — HMAC verify via `x-signature` + `x-request-id`
**Idempotency**: `WebhookEvent` table with `@@unique([provider, externalId])`
**Status**: ✅ both wired, replay-safe

### `payment.refund`
**Canonical**: `RefundService.create()` (per provider — `StripeRefundService`, `MercadoPagoRefundService`)
**Events**: `commerce.payment.refunded`
**Status**: 🟡 stripe wired; MP refund pending implementation

### `wallet.credit` / `wallet.debit`
**Canonical**: `WalletService.applyTransaction()` (atomic via `$transaction`, balance check)
**Status**: ✅ 80%

### `wallet.withdraw`
**Canonical**: `WalletWithdrawalService.request()` — atomic balance check + WithdrawalRequest row
**Status**: ✅ canonical

### `billing.create_subscription`
**Canonical**: `BillingService.subscribe()` — Stripe Subscription wrapper
**Status**: ✅ 85%

### `billing.cancel_subscription`
**Canonical**: `BillingService.cancel()`
**Status**: ✅ canonical

### `cart.recover_abandoned`
**Canonical**: `CartRecoveryService.checkAbandonedCarts()` (backend/src/kloel/cart-recovery.service.ts:93)
**Events**: `commerce.cart.abandoned`
**Status**: ✅ canonical

## Phase 2 — Communication

### `messaging.send_text`
**Canonical**: `MessageDispatcher.dispatch({ channel, to, body })` (backend/src/messaging/* — needs consolidation; today lives across `whatsapp`, `email`, `chat`)
**Currently scattered**:
- `WhatsAppService.sendMessage()` (provider-registry-messaging.ts:28)
- `EmailService.send()` (email/email.service.ts)
- `ChatService.reply()` (chat/chat.service.ts)
- `AuthWhatsappService.sendWhatsAppCode()` (auth/auth-service.whatsapp.ts:14)
**Action**: consolidate into a single `MessageDispatcher` capability (proposed in issue #N)
**Events**: `commerce.whatsapp.message_replied`
**Status**: 🟡 not yet unified

### `messaging.send_template`
**Canonical**: `MessageDispatcher.dispatch({ template, params })` (same as above)
**Currently**: `sendWhatsappTemplate` in `frontend/src/lib/api/whatsapp.ts:444`
**Status**: 🟡

### `messaging.receive_inbound`
**Canonical**: `InboundProcessor.process()` (backend/src/whatsapp/inbound-processor.helpers.ts)
**Events**: `commerce.whatsapp.message_received`
**Status**: ✅ canonical (per-channel adapter feeds into unified Inbox)

### `messaging.handoff_to_human`
**Canonical**: `HandoffService.assign()` (backend/src/inbox/handoff.service.ts)
**Events**: `commerce.whatsapp.handoff_to_human`
**Status**: ✅ canonical

### `channel.connect`
**Canonical**: `ChannelSessionService.connect({ channel })`
**Currently scattered**:
- `WhatsappProvider.startSession()` (provider-registry-session.ts:124)
- `MetaConnector.startOAuth()` (meta/meta.service.ts)
- `InstagramConnector.connect()`
- `connectWhatsapp` in frontend API
**Action**: unify under `ChannelSessionService`
**Events**: `commerce.whatsapp.session_lifecycle`
**Status**: 🟡 partial

### `channel.disconnect`
**Canonical**: `ChannelSessionService.disconnect()`
**Status**: 🟡 mirrors connect

### `flow.run`
**Canonical**: `FlowsService.execute(flowId)` queued via `flow` BullMQ
**Status**: ✅ canonical

### `autopilot.tick`
**Canonical**: `AutopilotRunnerService.tick()` (autopilot/autopilot-runner.service.ts) — 30s interval via `mind-bg-tick`
**Status**: ✅ canonical

### `email.send`
**Canonical**: `EmailService.send()` via Resend adapter
**Status**: ✅ canonical

### `voice.transcribe`
**Canonical**: `VoiceTranscriptService.transcribe()` queued via `voice` BullMQ
**Status**: ✅ canonical

### `media.upload`
**Canonical**: `MediaUploadService.upload()` → R2 via `StorageDriversService`
**Status**: ✅ canonical

### `mass_send.dispatch_batch`
**Canonical**: `MassSendService.dispatch()` queued via `mass-send` BullMQ
**Status**: ✅ canonical

## Phase 3 — Intelligence (KLOEL)

### `cognition.observe_event`
**Canonical**: `SpineEventEmitter.emit({ eventName, ...payload })` (backend/src/kloel/spine-events.ts)
**Status**: ✅ canonical — single observation surface

### `cognition.update_belief`
**Canonical**: `BeliefService.update()` (backend/src/kloel/mind/belief.service.ts)
**Events**: `cognition.belief_updated`
**Status**: ✅ canonical

### `cognition.make_decision`
**Canonical**: `KloelDecisionService.decide()` (backend/src/kloel/decision-engine.service.ts)
**Events**: `cognition.decision_made`
**Status**: ✅ canonical

### `cognition.assign_valence`
**Canonical**: `ValenceService.assign()` (backend/src/kloel/valence.service.ts)
**Events**: `cognition.valence_assigned`
**Status**: ✅ canonical

### `cognition.run_analysis`
**Canonical**: `MindAnalysisService.run()` queued via `memory` BullMQ
**Events**: `cognition.analysis_started`, `cognition.analysis_completed`
**Status**: ✅ canonical

### `crm.assign_owner`
**Canonical**: `CrmAssignmentService.assign()` (crm/assignment.service.ts)
**Events**: `commerce.crm.owner_assigned`
**Status**: ✅ canonical

### `crm.move_stage`
**Canonical**: `CrmStageService.transition()` (crm/stage.service.ts)
**Events**: `commerce.crm.stage_changed`, `commerce.crm.deal_won`, `commerce.crm.deal_lost`
**Status**: ✅ canonical

### `lead.qualify`
**Canonical**: `LeadQualificationService.qualify()` (kloel/lead-qualification.service.ts)
**Events**: `commerce.lead.qualified`, `commerce.lead.objection_raised`
**Status**: ✅ canonical

### `lead.convert`
**Canonical**: `LeadConversionService.convert()` (kloel/lead-conversion.service.ts)
**Events**: `commerce.lead.converted`
**Status**: ✅ canonical

### `analytics.aggregate`
**Canonical**: `AnalyticsAggregator.aggregate(workspaceId, period)` (analytics/aggregator.service.ts)
**Status**: ✅ canonical

### `dashboard.compute_metrics`
**Canonical**: `DashboardService.snapshot()` (dashboard/dashboard.service.ts)
**Status**: ✅ canonical

## Phase 4 — Growth

### `campaign.schedule`
**Canonical**: `CampaignsService.schedule()` queued via `campaign` BullMQ
**Status**: ✅ canonical

### `campaign.execute`
**Canonical**: `CampaignsService.execute()` — per-channel dispatch via MessageDispatcher
**Events**: `commerce.campaign.audience_reached`, `commerce.campaign.clicked`
**Status**: ✅ canonical

### `affiliate.create_link`
**Canonical**: `AffiliateLinksService.create()`
**Events**: `commerce.affiliate.link_created`
**Status**: ✅ canonical

### `affiliate.calculate_commission`
**Canonical**: `AffiliateCommissionService.calculate()`
**Events**: `commerce.affiliate.commission_calculated`, `commerce.affiliate.commission_received`
**Status**: ✅ canonical

### `member_area.enroll`
**Canonical**: `MemberEnrollmentService.enroll()`
**Events**: `commerce.member_area.enrolled`
**Status**: 🟡

### `growth.run_experiment`
**Canonical**: `GrowthExperimentService.run()`
**Status**: ✅ canonical

## Phase 5 — Platform Advanced

### `ads.sync_meta`
**Canonical**: `MetaAdsSyncService` queued via `ads-sync-meta` BullMQ
**Jobs**: `sync-meta-accounts`, `sync-meta-campaigns`, `sync-meta-insights`, `refresh-meta-token`
**Status**: ✅ canonical

### `ads.sync_google`
**Canonical**: `GoogleAdsSyncService` queued via `ads-sync-google`
**Status**: ✅ canonical

### `scraper.run`
**Canonical**: `ScrapersService.run()` queued via `scraper` BullMQ
**Status**: ✅ canonical

### `integration.connect_oauth`
**Canonical**: `IntegrationOauthService.start()` — per-provider adapter
**Status**: ✅ canonical

## Phase 6 — Operations

### `admin.impersonate_user`
**Canonical**: `AdminImpersonationService.start()` (audit-logged)
**Status**: ✅ canonical

### `audit.log_event`
**Canonical**: `AuditService.log()` (backend/src/audit/audit.service.ts)
**Status**: ✅ canonical

### `webhook.receive_external`
**Canonical**: per-provider webhook controller, all routed through `WebhookEvent` table for idempotency
**Status**: ✅ canonical

### `notification.send`
**Canonical**: `NotificationsService.send()` — fans out to email/push/in-app
**Status**: ✅ canonical

### `gdpr.export_user_data`
**Canonical**: `GdprService.export()` queued via `webhook` BullMQ (long-running)
**Status**: ✅ canonical

### `gdpr.delete_user_data`
**Canonical**: `GdprService.delete()`
**Status**: ✅ canonical

### `pulse.report_health`
**Canonical**: `PulseService.reportLive()` → POST /pulse/live/internal
**Events**: `pulse.gate_passed`, `pulse.gate_failed`, `pulse.capability_promoted`
**Status**: ✅ canonical

## Cross-cutting capabilities

### `idempotency.guard_request`
**Canonical**: `IdempotencyGuard` (backend/src/common/idempotency.guard.ts) — applied as NestJS guard on endpoints
**Status**: ✅ canonical

### `idempotency.fingerprint`
**Canonical**: `idempotencyFingerprint()` (backend/src/common/idempotency-fingerprint.ts)
**Status**: ✅ canonical

### `phone.normalize`
**Canonical**: `digitsOnly()` / `digitsOrNull()` / `whatsappDigits()` in `backend/src/common/phone.ts`
**Deprecated alternatives** (per scanner):
- `normalizePhone` in checkout-social-lead.util.ts, kloel.autonomy-proof.helpers.ts, whatsapp/inbound-processor.helpers.ts → migrate
- `normalizePhoneExt`, `normalizeNumber` → migrate
- `formatPhone` (frontend/followups) → frontend equivalent, OK
**Status**: 🟡 canonical exists, callers not yet migrated

### `email.normalize`
**Canonical**: `normalizeEmail()` (backend/src/common/string.ts)
**Status**: ✅ canonical

### `string.safe`
**Canonical**: `safeStr()` (backend/src/common/string.ts)
**Status**: ✅ canonical

### `math.clamp` / `math.clampScore` / `math.daysSince`
**Canonical**: `clamp()`, `clampScore()`, `daysSince()` (backend/src/common/math.ts)
**Status**: ✅ canonical (migrated from 16 dups)

### `prisma.unknown_record_type`
**Canonical**: `UnknownRecord` from `backend/src/common/types.ts`
**Status**: ✅ canonical (migrated from 30 dups in Round 5.2)

### `events.filter_by_workspace`
**Canonical**: `filterByWorkspace()` (backend/src/kloel/spine-events.helpers.ts)
**Status**: ✅ canonical

### `money.cents`
**Canonical**: `bigint` cents throughout. Helpers: `centsToReais()`, `reaisToCents()` in `backend/src/common/money.ts`
**Status**: ✅ canonical — strict no-float for money

### `routing.payment_provider`
**Canonical**: `PaymentProviderRouterService.resolve(method)` (backend/src/payments/provider-router/)
**Output**: `{ provider: 'stripe' | 'mercadopago' }` per method
**Status**: ✅ canonical

## Capabilities NOT yet implemented (per scanner)

| Capability | Reason | Action |
|---|---|---|
| `parse_webhook` (generic) | Each provider has its own parser — not a canonical capability | KEEP per-provider |
| `score_intent` | Commercial intent scoring | Roadmap candidate (CIA enhancement) |
| `qualify_contact` (vs `qualify_lead`) | Lead/contact distinction | Use `lead.qualify` canonical |

## Gates

- `npm run canonical:check-capability` (planned) — flags new service that overlaps existing canonical capability
- New service MUST declare its capability in `// @capability: name.action` JSDoc

## Related

- [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md)
- [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md)
- [QUEUES_CATALOG.md](QUEUES_CATALOG.md)
- [SERVICE_CATALOG.md](SERVICE_CATALOG.md)
- [DEPRECATION_MAP.md](DEPRECATION_MAP.md)
- [DUPLICATION_REGISTER.md](DUPLICATION_REGISTER.md)
