# Kloel Service Catalog

> Authored by PI atomic subagent `w5-service-catalog` (DeepSeek V4 Pro,
> ~33k events) as part of the Architectural Semantic Canonicalization
> mission. Written by the subagent via atomic_author. Materialized by
> orchestrator on 2026-05-26.


> Canonical inventory of every `@Injectable()` NestJS service in `backend/src/`,
> every worker processor in `worker/`, and every SWR hook in
> `frontend/src/hooks/`. Cross-referenced with
> [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md).
>
> Generated 2026-05-26. Methodology: `search @Injectable()`, domain classification
> via file path, file-header extraction, constructor DI inspection.
> Replaces the auto-generated listing from `tools/canonicalize/scan.mjs`.

## Table of Contents

| Phase | Section | Services |
|---|---|---|
| 0 | [Infrastructure](#phase-0--infrastructure) | 13 |
| 1 | [Commerce Engine](#phase-1--commerce-engine) | 10 |
| 2 | [Communication](#phase-2--communication) | 14 |
| 3 | [Intelligence (KLOEL)](#phase-3--intelligence-kloel) | 25 |
| 4 | [Growth](#phase-4--growth) | 10 |
| 5 | [Platform Advanced](#phase-5--platform-advanced) | 6 |
| 6 | [Operations](#phase-6--operations) | 15 |
| — | [Worker Processors](#worker-processors) | 12 |
| — | [Frontend SWR Hooks](#frontend-swr-hooks) | 40 |

---

## Phase 0 — Infrastructure

Foundation services; every domain depends on these.

### `PrismaService` (backend)

- **File**: `backend/src/prisma/prisma.service.ts:32`
- **Owning domain**: prisma
- **One-line responsibility**: Singleton PrismaClient wrapper; `$transaction`, interactive transactions, checkout-paid-effects orchestration
- **Public methods**:
  - `$transaction<T>(input)` — typed interactive or batch transaction
  - `onModuleInit()` — connects PrismaClient
  - `onModuleDestroy()` / `beforeApplicationShutdown()` — graceful disconnect
- **Dependencies (DI)**: _(none — root singleton)_
- **Side effects**: Prisma writes/reads: _all models_; External APIs: none; Events: checkout-paid-effects (transactional)
- **Boundaries**: MUST NOT contain business logic; DB access + transaction orchestration only
- **Tests**: `prisma.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `AuthService` (backend)

- **File**: `backend/src/auth/auth.service.ts:42`
- **Owning domain**: auth
- **One-line responsibility**: User registration, email/password + OAuth login, JWT issuance/refresh, email verification, password reset
- **Public methods**:
  - `register(data)` — create user + workspace + send welcome flow
  - `login(data)` — email/password auth, issue JWT + refresh token
  - `refresh(token)` — rotate refresh token
  - `checkEmail(email)` — existence check
  - `oauthLogin(data)` — Google / Apple / Facebook / TikTok OAuth
  - `verifyEmail(token)` / `resendVerificationEmail(email)` — email verification
  - `forgotPassword(email)` / `resetPassword(token, newPassword)` — password reset
  - `issueTokensForAgentId(agentId)` — agent-scoped JWT
  - `createAnonymous(ip?)` — anonymous session
- **Dependencies (DI)**: PrismaService, JwtService, EmailService, ConfigService, GoogleAuthService, AppleAuthService, FacebookAuthService, TikTokAuthService, ConnectService, RateLimitService, (opt) Redis, AuditService, WelcomeAndOnboardingEmailService
- **Side effects**: Prisma writes: User, Workspace, Member, Session, RefreshToken, MagicLink; Prisma reads: User, Workspace, Session; External APIs: Google/Apple/Facebook/TikTok OAuth; Events: welcome onboarding email
- **Boundaries**: MUST NOT handle admin auth (→ AdminAuthService); MUST NOT write commerce models
- **Tests**: `auth.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `WorkspaceService` (backend)

- **File**: `backend/src/workspaces/workspace.service.ts`
- **Owning domain**: workspaces
- **One-line responsibility**: Workspace CRUD, member management, invite flow, provider status lookup
- **Public methods**: `getWorkspace(id)`, `updateWorkspace(id, data)`, `listMembers(id)`, `inviteMember(id, email, role)`
- **Dependencies (DI)**: PrismaService
- **Side effects**: Prisma writes/reads: Workspace, Member, Invite
- **Boundaries**: MUST NOT manage admin users; MUST NOT bypass workspace isolation
- **Tests**: `workspace.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `KycService` (backend)

- **File**: `backend/src/kyc/kyc.service.ts`
- **Owning domain**: kyc
- **One-line responsibility**: KYC document upload, verification workflow, connect onboarding
- **Public methods**: `submitKyc(id, data)`, `getKycStatus(id)`, `approveKyc(id)`, `rejectKyc(id, reason)`, `uploadDocument(id, file)`
- **Dependencies (DI)**: PrismaService, MediaService
- **Side effects**: Prisma writes/reads: KycRecord, KycDocument
- **Boundaries**: MUST NOT process payments before KYC approval
- **Tests**: `kyc.service.spec.ts` — ✅
- **Status**: ✅ 85%

### `AuditService` (backend)

- **File**: `backend/src/audit/audit.service.ts:54`
- **Owning domain**: audit
- **One-line responsibility**: Append-only audit logging for admin actions and sensitive operations
- **Public methods**: `log(id, action, actorId, metadata)`, `query(filters)`
- **Dependencies (DI)**: PrismaService
- **Side effects**: Prisma writes/reads: AuditLog
- **Boundaries**: log only; MUST NOT enforce policy
- **Tests**: `audit.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `ComplianceService` (backend)

- **File**: `backend/src/compliance/compliance.service.ts:124`
- **Owning domain**: compliance
- **One-line responsibility**: Compliance checks (LGPD, PCI hints), audit trail, policy enforcement
- **Public methods**: `logComplianceEvent(data)`, `checkDataRetention(id)`
- **Dependencies (DI)**: PrismaService
- **Side effects**: Prisma writes/reads: ComplianceLog
- **Boundaries**: advisory only; MUST NOT block operations
- **Tests**: `compliance.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `GdprService` (backend)

- **File**: `backend/src/gdpr/gdpr.service.ts`
- **Owning domain**: gdpr
- **One-line responsibility**: GDPR/LGPD data requests, data export, account deletion, Facebook data export
- **Public methods**: `requestDataExport(userId)`, `requestDeletion(userId)`, `getRequestStatus(id)`
- **Dependencies (DI)**: PrismaService, GdprFacebookCallbackService
- **Side effects**: Prisma writes: GdprRequest, DataExportJob; External APIs: Facebook Data Export
- **Tests**: `gdpr.service.spec.ts` — ✅
- **Status**: ✅ 90%

### `PulseService` (backend)

- **File**: `backend/src/pulse/pulse.service.ts:53`
- **Owning domain**: pulse
- **One-line responsibility**: Organism heartbeat monitoring, stale node detection, incident alerting via Redis registry
- **Public methods**: `captureBackendHeartbeat(reason)`, `captureFrontendHeartbeat(dto)`, `captureWorkerHeartbeat(dto)`, `detectStaleNodes()`, `pruneExpiredFrontendNodes()`, `getOrganismStatus()`, `getIncidents()`
- **Dependencies (DI)**: Redis (ioredis), SystemHealthService, ConfigService, PulseArtifactService
- **Side effects**: none (Redis-only, no Prisma); External APIs: alert webhook; Events: PulseSignal, PulseGate
- **Boundaries**: MUST NOT depend on any domain service
- **Tests**: `pulse.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `SystemHealthService` (backend)

- **File**: `backend/src/health/system-health.service.ts`
- **Owning domain**: health
- **One-line responsibility**: Health check aggregation (DB, Redis, queue, external probes) for K8s readiness/liveness
- **Public methods**: `checkLiveness()`, `checkReadiness()`, `checkDeep()`
- **Dependencies (DI)**: PrismaService, Redis, probe services
- **Side effects**: none (read-only)
- **Tests**: `system-health.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `OpsAlertService` (backend)

- **File**: `backend/src/observability/ops-alert.service.ts`
- **Owning domain**: observability
- **One-line responsibility**: Operational alerting via webhook + Sentry error forwarding
- **Public methods**: `alert(title, message, severity)`
- **Dependencies (DI)**: ConfigService, Sentry
- **Side effects**: External APIs: alert webhook, Sentry
- **Tests**: `ops-alert.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `I18nService` (backend)

- **File**: `backend/src/i18n/i18n.service.ts`
- **Owning domain**: i18n
- **One-line responsibility**: Locale-based string resolution, translation catalog
- **Tests**: `i18n.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `ApiKeysService` (backend)

- **File**: `backend/src/api-keys/api-keys.service.ts`
- **Owning domain**: api-keys
- **One-line responsibility**: Public API key generation, rotation, revocation
- **Tests**: `api-keys.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `CookieConsentService` (backend)

- **File**: `backend/src/cookie-consent/cookie-consent.service.ts`
- **Owning domain**: cookie-consent
- **One-line responsibility**: Cookie consent recording and preference management
- **Tests**: `cookie-consent.service.spec.ts` — ✅
- **Status**: ✅ canonical

---

## Phase 1 — Commerce Engine

Money flow: products → checkout → payments → wallet → billing.

### `CheckoutService` (backend)

- **File**: `backend/src/checkout/checkout.service.ts`
- **Owning domain**: checkout
- **One-line responsibility**: Checkout façade — delegates product/plan, catalog, and order concerns to sub-services; owns public-lookup (slug/code)
- **Public methods**:
  - `createPlan(...)` / `updatePlan(...)` / `deletePlan(...)` — plan CRUD (→ CheckoutProductService)
  - `createBump(...)` / `updateBump(...)` / `deleteBump(...)` — order bump CRUD (→ CheckoutCatalogService)
  - `createUpsell(...)` / `updateUpsell(...)` / `deleteUpsell(...)` — upsell CRUD
  - `createCoupon(...)` / `validateCoupon(...)` / `deleteCoupon(...)` — coupon CRUD
  - `createPixel(...)` / `updatePixel(...)` — tracking pixel CRUD
  - `createCheckout(...)` / `syncCheckoutLinks(...)` — checkout session
  - `findByCode(code)` — public code lookup
  - `getConfig(...)` / `updateConfig(...)` / `resetConfig(...)` — checkout config
- **Dependencies (DI)**: CheckoutProductService, CheckoutCatalogService, CheckoutOrderService (delegation pattern)
- **Side effects**: Prisma writes/reads: CheckoutOrder, CheckoutSession, CartItem, Product, ProductPlan; Events: checkout-paid-effects
- **Boundaries**: MUST NOT process payments directly (→ payments domain)
- **Tests**: `checkout.service.spec.ts` — ✅
- **Status**: ✅ 85%

### `LedgerService` (backend)

- **File**: `backend/src/payments/ledger/ledger.service.ts`
- **Owning domain**: payments
- **One-line responsibility**: Connect Ledger — dual-balance (PENDING→AVAILABLE maturation), append-only, transactional, idempotent
- **Public methods**: `creditPending(input)`, `matureCredits(id)`, `debitPayout(input)`, `debitRefund(input)`, `debitChargeback(input)`, `creditAvailableByAdjustment(input)`, `getBalance(id)`
- **Dependencies (DI)**: PrismaService
- **Side effects**: Prisma writes/reads: ConnectLedgerEntry (inside `$transaction`)
- **Boundaries**: append-only; corrections via ADJUSTMENT entries
- **Tests**: `ledger.service.spec.ts`, `ledger.service.invariants.spec.ts` — ✅
- **Status**: ✅ 80%

### `FraudEngine` (backend)

- **File**: `backend/src/payments/fraud/fraud.engine.ts`
- **Owning domain**: payments
- **One-line responsibility**: Fraud scoring — velocity checks, identifier scoring, high-amount flagging, foreign-BIN detection, blacklist
- **Public methods**: `evaluate(context)` → FraudDecision
- **Dependencies (DI)**: PrismaService, Redis (ioredis)
- **Side effects**: Prisma reads: FraudBlacklist; Redis: velocity counters
- **Tests**: `fraud.engine.spec.ts` — ✅
- **Status**: ✅ canonical

### `WalletService` (backend)

- **File**: `backend/src/wallet/wallet.service.ts`
- **Owning domain**: wallet
- **One-line responsibility**: Prepaid wallet — top-up, charge, refund, settlement via Stripe PaymentIntents
- **Public methods**: `createTopupIntent(input)`, `chargeUsage(input)`, `refundUsage(input)`, `settleUsage(input)`, `getBalance(id)`
- **Dependencies (DI)**: PrismaService, StripeService, FraudEngine
- **Side effects**: Prisma writes/reads: Wallet, WalletTransaction; External APIs: Stripe
- **Boundaries**: MUST NOT hold marketplace treasury (→ MarketplaceTreasuryService)
- **Tests**: `wallet.service.spec.ts`, `wallet.service.charge.spec.ts`, `wallet.service.settle.spec.ts` — ✅
- **Status**: ✅ 80%

### `BillingService` + `BillingSubscriptionService` + `BillingWebhookService` (backend)

- **File**: `backend/src/billing/`
- **Owning domain**: billing
- **One-line responsibility**: Stripe subscription billing — plan management, subscription lifecycle, webhook fulfillment
- **Dependencies (DI)**: PrismaService, StripeService
- **Side effects**: Prisma writes/reads: BillingPlan, BillingInvoice, BillingSubscription; External APIs: Stripe
- **Tests**: `billing.service.spec.ts`, `billing-subscription.service.spec.ts` — ✅
- **Status**: ✅ 85%

### `MarketplaceTreasuryService` (backend)

- **File**: `backend/src/marketplace-treasury/marketplace-treasury.service.ts`
- **Owning domain**: marketplace-treasury
- **One-line responsibility**: Treasury split rules, maturation, payout, reconciliation for marketplace sellers
- **Dependencies (DI)**: PrismaService, LedgerService
- **Tests**: `marketplace-treasury.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `SplitEngine` (backend)

- **File**: `backend/src/payments/split/split.engine.ts`
- **Owning domain**: payments
- **One-line responsibility**: Payment split computation — platform fee, affiliate commission, seller share (pure)
- **Dependencies (DI)**: _(none)_
- **Tests**: `split.engine.spec.ts` — ✅
- **Status**: ✅ canonical

### `ConnectService` + `ConnectPayoutService` + `ConnectReversalService` (backend)

- **File**: `backend/src/payments/connect/`
- **Owning domain**: payments
- **One-line responsibility**: Stripe Connect — seller onboarding, payout scheduling, reversal handling
- **Dependencies (DI)**: PrismaService, StripeService, LedgerService
- **Side effects**: Prisma writes/reads: ConnectLedgerEntry; External APIs: Stripe Connect
- **Tests**: `connect.service.spec.ts`, `connect-payout.service.spec.ts`, `connect-reversal.service.spec.ts` — ✅
- **Status**: ✅ 80%

### `PlanLimitsService` (backend)

- **File**: `backend/src/billing/plan-limits.service.ts`
- **Owning domain**: billing
- **One-line responsibility**: Workspace plan limit enforcement — checks feature access against billing tier
- **Dependencies (DI)**: PrismaService
- **Tests**: `plan-limits.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `ProductCategoriesService` (backend)

- **File**: `backend/src/product-categories/product-categories.service.ts`
- **Owning domain**: product-categories
- **One-line responsibility**: Product category CRUD
- **Tests**: `product-categories.service.spec.ts` — ✅
- **Status**: ✅ canonical---

## Phase 2 — Communication

Channels: WhatsApp, inbox, email, chat, flows, autopilot, voice, calendar.

### `WhatsappService` (backend)

- **File**: `backend/src/whatsapp/whatsapp.service.ts`
- **Owning domain**: whatsapp
- **One-line responsibility**: WhatsApp orchestration — session management, message dispatch, chat list, contact sync, webhook processing, reconciliation
- **Public methods**:
  - `listChats(workspaceId)` — paginated chat list with last message
  - `listMessages(chatId, workspaceId)` — message history
  - `sendMessage(payload)` — send text/media message via provider
  - `processWebhook(payload)` — inbound webhook message handling
  - `reconcileChats(workspaceId)` — sync chat state with provider
  - `getSessionStatus(workspaceId)` — current provider session status
- **Dependencies (DI)**: PrismaService, ProviderRegistryService, WhatsappSessionService, WhatsappMessageDispatcherService, WhatsappReconcilerService, (opt) OpsAlertService
- **Side effects**: Prisma writes/reads: WhatsAppSession, WhatsAppMessage, WhatsAppContact; External APIs: Meta Cloud API / WAHA legacy
- **Boundaries**: MUST NOT bypass workspace isolation on chat data
- **Tests**: `whatsapp.service.spec.ts` (part1–9) — ✅
- **Status**: ✅ 95%

### `MetaWhatsAppService` (backend)

- **File**: `backend/src/meta/meta-whatsapp.service.ts`
- **Owning domain**: meta
- **One-line responsibility**: Meta Cloud API wrapper — template messages, media upload, phone number registration, webhook verification
- **Dependencies (DI)**: PrismaService, MetaSdkService, ConfigService
- **Side effects**: External APIs: Meta Graph API (WhatsApp Business); Prisma reads: WhatsAppSession
- **Tests**: `meta-whatsapp.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `InboxService` (backend)

- **File**: `backend/src/inbox/inbox.service.ts`
- **Owning domain**: inbox
- **One-line responsibility**: Unified inbox — conversation listing, message threading, agent assignment, unread tracking
- **Public methods**: `listConversations(id)`, `getConversation(id, convId)`, `assignAgent(id, convId, agentId)`, `sendReply(id, convId, text)`
- **Dependencies (DI)**: PrismaService, SmartRoutingService, InboxEventsService
- **Side effects**: Prisma writes/reads: Conversation, Message, AssignedAgent; Events: inbox gateway (WebSocket)
- **Tests**: `inbox.service.spec.ts` — ✅
- **Status**: ✅ 85%

### `SmartRoutingService` (backend)

- **File**: `backend/src/inbox/smart-routing.service.ts`
- **Owning domain**: inbox
- **One-line responsibility**: AI-based conversation routing — assigns incoming messages to best-fit agent
- **Tests**: `smart-routing.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `OmnichannelService` (backend)

- **File**: `backend/src/inbox/omnichannel.service.ts`
- **Owning domain**: omnichannel
- **One-line responsibility**: Cross-channel conversation aggregation into unified inbox view
- **Tests**: _(spec embedded in inbox)_
- **Status**: ✅ canonical

### `ChannelInboundHookService` (backend)

- **File**: `backend/src/omnichannel/channel-inbound-hook.service.ts`
- **Owning domain**: omnichannel
- **One-line responsibility**: Generic inbound webhook handler — normalizes messages from any channel into unified format
- **Tests**: `channel-inbound-hook.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `ContactResolutionService` (backend)

- **File**: `backend/src/omnichannel/contact-resolution.service.ts`
- **Owning domain**: omnichannel
- **One-line responsibility**: Resolves contacts across channels — phone number normalization and deduplication
- **Tests**: `contact-resolution.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `FlowsService` (backend)

- **File**: `backend/src/flows/flows.service.ts`
- **Owning domain**: flows
- **One-line responsibility**: Visual flow builder — flow CRUD, node/step management, execution trigger, template management
- **Public methods**: `createFlow(id, data)`, `executeFlow(id, flowId, contactId)`, `listTemplates()`, `listFlowExecutions(id)`
- **Dependencies (DI)**: PrismaService, FlowTemplateService, FlowOptimizerService
- **Side effects**: Prisma writes/reads: Flow, FlowStep, FlowExecution; Events: queue dispatch for async execution
- **Tests**: `flows.service.spec.ts` — ✅
- **Status**: ✅ 90%

### `AutopilotService` (backend)

- **File**: `backend/src/autopilot/autopilot.service.ts`
- **Owning domain**: autopilot
- **One-line responsibility**: Autopilot orchestration — delegates to segmentation, ops, and analytics sub-services
- **Public methods**: `runAutopilot(id)`, `getAutopilotStatus(id)`, `listRuns(id)`, `configureAutopilot(id, config)`
- **Dependencies (DI)**: PrismaService, AutopilotOpsService, SegmentationService
- **Side effects**: Prisma writes/reads: AutopilotRun, AutopilotDecision; Events: queue dispatch
- **Tests**: `autopilot.service.spec.ts` — ✅
- **Status**: ✅ 90%

### `SegmentationService` (backend)

- **File**: `backend/src/autopilot/segmentation.service.ts`
- **Owning domain**: autopilot
- **One-line responsibility**: Contact segmentation — rule-based audience segmentation for autopilot campaigns
- **Tests**: `segmentation.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `EmailService` (backend)

- **File**: `backend/src/email/email-inbound.service.ts`
- **Owning domain**: email
- **One-line responsibility**: Email delivery + inbound processing — send transactional emails, receive inbound via webhook
- **Dependencies (DI)**: PrismaService, ConfigService
- **Side effects**: Prisma writes/reads: EmailLog, EmailTemplate; External APIs: email provider
- **Tests**: `email-inbound.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `ChatService` (backend)

- **File**: `backend/src/chat/chat.service.ts`
- **Owning domain**: chat
- **One-line responsibility**: Chat log persistence — store and retrieve AI chat conversations
- **Tests**: `chat.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `CalendarService` (backend)

- **File**: `backend/src/calendar/calendar.service.ts`
- **Owning domain**: calendar
- **One-line responsibility**: Calendar event management — create, list, update, delete events with recurrence support
- **Dependencies (DI)**: PrismaService
- **Side effects**: Prisma writes/reads: CalendarEvent
- **Tests**: `calendar.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `VoiceService` / `TranscriptionService` (backend)

- **File**: `backend/src/voice/voice.service.ts`, `backend/src/audio/transcription.service.ts`
- **Owning domain**: voice / audio
- **One-line responsibility**: Voice note processing + audio transcription via AI
- **Dependencies (DI)**: PrismaService, OpenAI
- **Tests**: `voice.service.spec.ts`, `transcription.service.spec.ts` — ✅
- **Status**: ✅ canonical---

## Phase 3 — Intelligence (KLOEL)

The cognitive organism — 285 services in `backend/src/kloel/`. Listed here: the top 25 architectural-entry services. For the full kloel roster, see the auto-generated listing in `_raw_domain_scan.md`.

### `KloelService` (backend)

- **File**: `backend/src/kloel/kloel.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Main KLOEL orchestrator — thin façade over focused sub-services; chat, think, reply, tool dispatch
- **Public methods**: `chat(input)`, `think(input)`, `reply(input)`, `executeTool(toolCall)`, `streamChat(input)`
- **Dependencies (DI)**: ~15 sub-services (thinker, reply-engine, tool-dispatcher, thread, composer, chat-tools, business-config-tools, etc.)
- **Side effects**: Prisma writes/reads: KloelMemory, KloelDecision, KloelEvidence, ChatLog
- **Boundaries**: MUST delegate to sub-services; MUST NOT contain domain logic directly
- **Tests**: `kloel.service.spec.ts` — ✅
- **Status**: ⚠️ god-module candidate (>500 LOC) — delegates but still owns orchestration

### `KloelThinkerService` (backend)

- **File**: `backend/src/kloel/kloel-thinker.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Orchestrates the KLOEL thinking loop — SSE streaming + sync variants with tool-call iteration
- **Tests**: `kloel-thinker.service.spec.ts` — ✅
- **Status**: ⚠️ overlaps with KloelService

### `KloelReplyEngineService` (backend)

- **File**: `backend/src/kloel/kloel-reply-engine.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Reply-building helpers — prompt assembly, expertise detection, context enrichment
- **Tests**: `kloel-reply-engine.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `KloelComposerService` (backend)

- **File**: `backend/src/kloel/kloel-composer.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Composer capabilities — web search, image generation, site generation
- **Tests**: `kloel-composer.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `KloelToolDispatcherService` (backend)

- **File**: `backend/src/kloel/kloel-tool-dispatcher.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Tool-call dispatch — routes AI tool-call requests to correct executor with approval gates
- **Tests**: `kloel-tool-dispatcher.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `KloelToolExecutorService` (backend)

- **File**: `backend/src/kloel/kloel-tool-executor.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Executes AI-chat tool calls — delegates to domain-specific executor services (WhatsApp, CRM, billing, etc.)
- **Tests**: `kloel-tool-executor.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `KloelChatToolsService` (backend)

- **File**: `backend/src/kloel/kloel-chat-tools.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Product, flow, dashboard, payment AI chat tools (~33KB, largest tool file)
- **Tests**: `kloel-chat-tools.service.spec.ts` — ✅
- **Status**: ⛔ god-service candidate (>1000 LOC)

### `KloelBusinessConfigToolsService` (backend)

- **File**: `backend/src/kloel/kloel-business-config-tools.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: CRM, business config, campaign, billing AI chat tools (~21KB)
- **Tests**: `kloel-business-config-tools.service.spec.ts` — ✅
- **Status**: ⛔ god-service candidate (>500 LOC)

### `KloelWorkspaceContextService` (backend)

- **File**: `backend/src/kloel/kloel-workspace-context.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Builds runtime workspace context strings for AI prompts
- **Tests**: `kloel-workspace-context.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `KloelThreadService` (backend)

- **File**: `backend/src/kloel/kloel-thread.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Chat thread persistence — conversation state, message history
- **Tests**: `kloel-thread.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `KloelLeadBrainService` (backend)

- **File**: `backend/src/kloel/kloel-lead-brain.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: WhatsApp autopilot lead processing — buy-intent detection, lead lifecycle
- **Tests**: `kloel-lead-brain.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `KloelLeadProcessorService` (backend)

- **File**: `backend/src/kloel/kloel-lead-processor.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: WhatsApp message processing — lead lifecycle, follow-ups
- **Tests**: `kloel-lead-processor.service.spec.ts` — ✅
- **Status**: ⚠️ overlaps with KloelLeadBrainService

### `KloelWhatsAppToolsService` (backend)

- **File**: `backend/src/kloel/kloel-whatsapp-tools.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: WhatsApp-related tool calls from AI chat — send message, list chats, media
- **Tests**: `kloel-whatsapp-tools.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `WhatsAppBrainService` (backend)

- **File**: `backend/src/kloel/whatsapp-brain.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: WhatsApp webhook → KLOEL brain pipeline — intent detection, decision outcome
- **Dependencies (DI)**: PrismaService, KloelService, DecisionOutcomeService
- **Tests**: `whatsapp-brain.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `UnifiedAgentService` (backend)

- **File**: `backend/src/kloel/unified-agent.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Unified AI Agent — single agent interface over all tool actions for WhatsApp/conversation
- **Tests**: `unified-agent.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `UnifiedAgentContextService` (backend)

- **File**: `backend/src/kloel/unified-agent-context.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: System prompt construction + lead tactical hints for Unified Agent
- **Tests**: `unified-agent-context.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `UnifiedAgentResponseService` (backend)

- **File**: `backend/src/kloel/unified-agent-response.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Response generation, reply style, fallback logic for Unified Agent
- **Tests**: `unified-agent-response.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `UnifiedAgentActionsService` (backend)

- **File**: `backend/src/kloel/unified-agent-actions.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Action routing for Unified Agent — delegates to domain action services (messaging, CRM, sales, etc.)
- **Tests**: `unified-agent-actions.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `OnboardingService` (backend)

- **File**: `backend/src/kloel/onboarding.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Conversational onboarding — guided workspace setup through AI chat
- **Tests**: `onboarding.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `MindService` (backend)

- **File**: `backend/src/kloel/mind.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: KLOEL Mind — cognitive state, belief management, decision catalog, valence tracking
- **Dependencies (DI)**: ~10 sub-services (mind-policy, mind-belief, mind-bandit, mind-event-processor, etc.)
- **Tests**: `mind.service.spec.ts` — ✅
- **Status**: ⚠️ god-module candidate (owns Mind* subdomain)

### `ValenceAggregatorService` (backend)

- **File**: `backend/src/kloel/mind/valence-aggregator.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Mood aggregator — computes workspace-level emotional valence from terminal events
- **Tests**: `valence-aggregator.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `MemoryManagementService` (backend)

- **File**: `backend/src/kloel/memory-management.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: KLOEL memory lifecycle — curation, prioritization, cleanup, stats
- **Tests**: `memory-management.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `LLMBudgetService` (backend)

- **File**: `backend/src/kloel/llm-budget.service.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Per-workspace LLM cost enforcement — token budget tracking and limit enforcement
- **Tests**: `llm-budget.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `CiaService` (backend)

- **File**: `backend/src/cia/cia.service.ts`
- **Owning domain**: cia
- **One-line responsibility**: CIA (Cognitive Intelligence Agent) — runtime state, send helpers, backlog execution
- **Tests**: `cia.service.spec.ts` — ✅
- **Status**: ✅ 75%

### `CiaRuntimeService` (backend)

- **File**: `backend/src/cia/cia-runtime.service.ts`
- **Owning domain**: cia
- **One-line responsibility**: CIA runtime execution — state machine, provider integration
- **Tests**: `cia-runtime.service.spec.ts` — ✅
- **Status**: ✅ canonical---

## Phase 4 — Growth

Acquisition + retention: marketing, campaigns, CRM, dashboard, analytics, reports.

### `CrmService` (backend)

- **File**: `backend/src/crm/crm.service.ts`
- **Owning domain**: crm
- **One-line responsibility**: CRM service — contact CRUD, deal pipeline, stage management, tag management
- **Public methods**:
  - `createContact(id, data)` / `upsertContact(id, phone, data)` — contact management
  - `getContact(id, phone)` / `listContacts(id, filters)` — contact queries
  - `createDeal(id, data)` / `updateDealStage(id, dealId, stage)` — pipeline management
  - `addTag(id, contactId, tag)` / `removeTag(id, contactId, tag)` — tag operations
- **Dependencies (DI)**: PrismaService, AuditService, (opt) CrmEventEmitterService
- **Side effects**: Prisma writes/reads: Contact, ContactTag, CrmContact, CrmStage, CrmDeal
- **Boundaries**: MUST NOT auto-advance deals without agent confirmation
- **Tests**: `crm.service.spec.ts` — ✅
- **Status**: ✅ 80%

### `DashboardService` (backend)

- **File**: `backend/src/dashboard/dashboard.service.ts`
- **Owning domain**: dashboard
- **One-line responsibility**: Dashboard aggregation — home metrics, operational health, setup checklist, time-range bucketing
- **Public methods**:
  - `getHome(id, range?)` — home dashboard with operational health
  - `getSetupChecklist(id)` — onboarding progress
  - `getRevenueMetrics(id, range)` — revenue KPIs
- **Dependencies (DI)**: PrismaService, Redis (ioredis)
- **Side effects**: Prisma reads: CheckoutOrder, various models (aggregation only)
- **Boundaries**: read-only; MUST NOT mutate data
- **Tests**: `dashboard.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `CampaignsService` (backend)

- **File**: `backend/src/campaigns/campaigns.service.ts`
- **Owning domain**: campaigns
- **One-line responsibility**: Campaign management — create, execute, monitor marketing campaigns with BullMQ worker
- **Public methods**: `create(id, data)`, `execute(id, campaignId)`, `pause(id, campaignId)`, `getStats(id, campaignId)`
- **Dependencies (DI)**: PrismaService, AuditService, SmartTimeService, CampaignEventEmitterService, (opt) OpsAlertService, MetaWhatsAppService
- **Side effects**: Prisma writes/reads: Campaign, CampaignExecution; Events: BullMQ campaign-jobs queue
- **Tests**: `campaigns.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `MarketingService` + `TikTokMarketingService` (backend)

- **File**: `backend/src/marketing/`
- **Owning domain**: marketing
- **One-line responsibility**: Marketing channel management, email campaigns, TikTok ad orchestration
- **Tests**: `marketing.controller.spec.ts`, `tiktok-marketing.service.spec.ts` — ✅
- **Status**: 🟡 (large surface area)

### `PartnershipsService` (backend)

- **File**: `backend/src/partnerships/partnerships.service.ts`
- **Owning domain**: partnerships
- **One-line responsibility**: Partnership management — partner CRUD, commission rules, payout history
- **Tests**: `partnerships.service.spec.ts` — ✅
- **Status**: 🟡

### `MemberAreaService` (backend)

- **File**: `backend/src/member-area/member-area.helpers.ts`
- **Owning domain**: member-area
- **One-line responsibility**: Member area management — enrollment, progress tracking, content gating
- **Tests**: _(spec files present)_
- **Status**: 🟡

### `AnalyticsService` (backend)

- **File**: `backend/src/analytics/analytics.service.ts`
- **Owning domain**: analytics
- **One-line responsibility**: Analytics aggregation — event tracking, agent performance metrics, queue stats
- **Tests**: `analytics.service.spec.ts` — ✅
- **Status**: ✅ 75%

### `ReportsService` (backend)

- **File**: `backend/src/reports/reports.service.ts`
- **Owning domain**: reports
- **One-line responsibility**: Report generation — order reports, affiliate reports, scheduled report runs
- **Tests**: `reports.service.spec.ts` — ✅
- **Status**: ✅ 75%

### `GrowthService` / `MoneyMachineService` (backend)

- **File**: `backend/src/growth/money-machine.service.ts`
- **Owning domain**: growth
- **One-line responsibility**: Growth experiments — A/B test framework for revenue optimization
- **Tests**: `money-machine.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `LaunchService` (backend)

- **File**: `backend/src/launch/launch.service.ts`
- **Owning domain**: launch
- **One-line responsibility**: Product launch event management — scheduling, promotion, tracking
- **Tests**: `launch.service.spec.ts` — ✅
- **Status**: ✅ canonical---

## Phase 5 — Platform Advanced

Ads + integrations: meta ads, Anúncios, TikTok ads, scrapers.

### `MetaSdkService` (backend)

- **File**: `backend/src/meta/meta-sdk.service.ts`
- **Owning domain**: meta
- **One-line responsibility**: Meta SDK wrapper — Graph API calls, token management, account provisioning
- **Dependencies (DI)**: ConfigService, PrismaService
- **Side effects**: External APIs: Meta Graph API; Prisma reads: MetaAccount
- **Tests**: ✅
- **Status**: ✅ canonical

### `MetaMarketingProvider` (backend)

- **File**: `backend/src/integrations/meta-marketing.provider.ts`
- **Owning domain**: integrations
- **One-line responsibility**: Meta Conversions API — server-side event forwarding for ad tracking
- **Tests**: `meta-marketing.provider.spec.ts` — ✅
- **Status**: ✅

### `AnunciosService` (backend)

- **File**: `backend/src/anuncios/anuncios.service.ts`
- **Owning domain**: anuncios
- **One-line responsibility**: Ad campaign management — create, edit, monitor Meta ad campaigns
- **Tests**: `anuncios.service.spec.ts` — ✅
- **Status**: 🔴 Tier 3 (shell)

### `ScrapersService` (backend)

- **File**: `backend/src/scrapers/scrapers.service.ts`
- **Owning domain**: scrapers
- **One-line responsibility**: Web scraping — Instagram, Google Maps scraping job management
- **Tests**: `scrapers.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `TikTokAdsService` (backend)

- **File**: `backend/src/marketing/tiktok-ads.service.ts`
- **Owning domain**: marketing
- **One-line responsibility**: TikTok Ads API — campaign management, event forwarding
- **Tests**: `tiktok-ads.service.spec.ts` — ✅
- **Status**: 🔴 Tier 3

### `IntegrationsService` (backend)

- **File**: `backend/src/integrations/` (7 services)
- **Owning domain**: integrations
- **One-line responsibility**: Integration token management — OAuth flows, token encryption, event APIs for Meta/TikTok/Google
- **Tests**: ✅ (per-service specs)
- **Status**: ✅---

## Phase 6 — Operations

Admin + ops: admin panel services, notifications, webhooks, marketplace.

### `AdminAuthService` (backend)

- **File**: `backend/src/admin/auth/admin-auth.service.ts:42`
- **Owning domain**: admin
- **One-line responsibility**: Admin authentication — admin login, session management, MFA, rate-limited login attempts
- **Public methods**: `login(data)`, `logout(sessionId)`, `validateSession(token)`, `setupMFA(id)`, `verifyMFA(id, code)`
- **Dependencies (DI)**: PrismaService, JwtService, AdminSessionFactory, AdminLoginAttemptsService, AdminMfaService
- **Side effects**: Prisma writes/reads: AdminUser, AdminSession
- **Boundaries**: MUST NOT authenticate regular users (→ AuthService)
- **Tests**: ✅
- **Status**: ✅ canonical

### `AdminAccountsService` (backend)

- **File**: `backend/src/admin/accounts/admin-accounts.service.ts:32`
- **Owning domain**: admin
- **One-line responsibility**: Admin user management — create, update, suspend, delete admin accounts
- **Tests**: ✅
- **Status**: ✅ canonical

### `AdminDashboardService` (backend)

- **File**: `backend/src/admin/dashboard/admin-dashboard.service.ts:109`
- **Owning domain**: admin
- **One-line responsibility**: Admin dashboard — platform-wide metrics, workspace stats, revenue overview
- **Tests**: ✅
- **Status**: ✅ canonical

### `AdminComplianceService` (backend)

- **File**: `backend/src/admin/compliance/admin-compliance.service.ts:124`
- **Owning domain**: admin
- **One-line responsibility**: Admin compliance tools — workspace audits, policy enforcement, risk review
- **Tests**: ✅
- **Status**: ✅ canonical

### `AdminConfigService` (backend)

- **File**: `backend/src/admin/config/admin-config.service.ts:44`
- **Owning domain**: admin
- **One-line responsibility**: Admin configuration — global platform settings, feature flags, limits
- **Tests**: ✅
- **Status**: ✅ canonical

### `DestructiveIntentService` (backend)

- **File**: `backend/src/admin/destructive/destructive-intent.service.ts:102`
- **Owning domain**: admin
- **One-line responsibility**: Destructive operations — cache purge, force logout, data deletion with confirmation workflow
- **Tests**: ✅
- **Status**: ✅ canonical

### `AdminKycService` (backend)

- **File**: `backend/src/admin/accounts/kyc/admin-kyc.service.ts:17`
- **Owning domain**: admin
- **One-line responsibility**: Admin KYC review — manual verification, document inspection, approval/rejection
- **Tests**: ✅
- **Status**: ✅ canonical

### `AdminAuditService` (backend)

- **File**: `backend/src/admin/audit/admin-audit.service.ts:54`
- **Owning domain**: admin
- **One-line responsibility**: Admin audit trail — append-only audit log for admin mutations with IP/UA tracking
- **Tests**: ✅
- **Status**: ✅ canonical

### `WebhooksService` (backend)

- **File**: `backend/src/webhooks/webhooks.service.ts`
- **Owning domain**: webhooks
- **One-line responsibility**: Webhook management — registration, dispatch, replay, signature verification
- **Public methods**: `register(id, url, events)`, `dispatch(event)`, `replay(webhookId)`, `verifySignature(payload, sig)`
- **Dependencies (DI)**: PrismaService, WebhookDispatcherService
- **Side effects**: Prisma writes/reads: WebhookEvent; External APIs: registered webhook URLs
- **Tests**: `webhooks.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `NotificationsService` (backend)

- **File**: `backend/src/notifications/notifications.service.ts`
- **Owning domain**: notifications
- **One-line responsibility**: Notification delivery — in-app, email, push notification dispatch
- **Tests**: `notifications.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `WelcomeOnboardingEmailService` (backend)

- **File**: `backend/src/notifications/welcome-onboarding-email.service.ts`
- **Owning domain**: notifications
- **One-line responsibility**: Onboarding email sequence — day 1, day 7 drip emails
- **Tests**: `welcome-onboarding-email.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `TeamService` (backend)

- **File**: `backend/src/team/team.service.ts`
- **Owning domain**: team
- **One-line responsibility**: Team member management — invitation, role assignment, removal
- **Tests**: `team.service.spec.ts` — ✅
- **Status**: ✅ canonical

### `MarketplaceService` (backend)

- **File**: `backend/src/marketplace/marketplace.service.ts`
- **Owning domain**: marketplace
- **One-line responsibility**: Marketplace listing management — discover, list, feature products
- **Tests**: `marketplace.service.spec.ts` — ✅
- **Status**: 🟡

### `PublicApiService` (backend)

- **File**: `backend/src/public-api/public-api.controller.ts`
- **Owning domain**: public-api
- **One-line responsibility**: Public API endpoint — read-only access via API key
- **Status**: ✅

### `UnsubscribeService` (backend)

- **File**: `backend/src/unsubscribe/unsubscribe.service.ts`
- **Owning domain**: unsubscribe
- **One-line responsibility**: Unsubscribe management — opt-out recording, compliance
- **Tests**: `unsubscribe.service.spec.ts` — ✅
- **Status**: ✅ canonical---

## Worker Processors

BullMQ queue consumers in `worker/`. Each is a self-contained worker with its own queue.

### `flowWorker` (worker)

- **File**: `worker/processor.ts`
- **Owning domain**: flows
- **One-line responsibility**: Flow execution worker — consumes `flow-jobs` queue, runs flow nodes (actions, AI, API, interactions)
- **Side effects**: Prisma writes/reads: FlowExecution; External APIs: WhatsApp, OpenAI; Events: queue dispatch
- **Tests**: `worker/test/flow-engine-*.spec.ts` — ✅
- **Status**: ✅ canonical

### `autopilotWorker` (worker)

- **File**: `worker/processors/autopilot-processor.ts`
- **Owning domain**: autopilot
- **One-line responsibility**: Autopilot worker — consumes `autopilot-jobs`, runs sweep/scan/followup/catalog/CIA cycles
- **Public jobs**: `sweep-unread-conversations`, `scan-contact`, `followup-contact`, `catalog-contacts`, `score-contact`, `cia-cycle-all`, `cycle-all`
- **Side effects**: Prisma reads: WhatsAppContact, WhatsAppMessage; Prisma writes: AutopilotDecision; External APIs: OpenAI
- **Tests**: `worker/test/autopilot-*.spec.ts` — ✅
- **Status**: ⛔ god-processor candidate (routes 12+ job types)

### `webhookWorker` (worker)

- **File**: `worker/processors/webhook-processor.ts`
- **Owning domain**: webhooks
- **One-line responsibility**: Webhook dispatch worker — consumes `webhook-jobs`, delivers webhooks to registered URLs
- **Side effects**: External APIs: registered webhook URLs
- **Tests**: `worker/test/*webhook*.spec.ts` — ✅
- **Status**: ✅ canonical

### `memoryWorker` (worker)

- **File**: `worker/processors/memory-processor.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Memory processing worker — consumes `memory-jobs`, ingests knowledge sources, embeds chunks via OpenAI
- **Public jobs**: `ingest-source`, `extract-facts`, `analyze-contact`
- **Side effects**: Prisma writes/reads: vector embeddings, KnowledgeSource; External APIs: OpenAI embeddings; wallet usage settlement
- **Tests**: `worker/test/memory-*.spec.ts` — ✅
- **Status**: ✅ canonical

### `ghostCloserWorker` (worker)

- **File**: `worker/processors/crm-processor.ts`
- **Owning domain**: crm
- **One-line responsibility**: CRM ghost closer — consumes `crm-jobs`, detects inactive conversations, auto-closes stale deals
- **Side effects**: Prisma reads/writes: Conversation, CrmDeal; Events: flow-engine trigger
- **Tests**: `worker/test/crm-*.spec.ts` — ✅
- **Status**: ✅ canonical

### `silent24hResolverWorker` (worker)

- **File**: `worker/processors/silent-24h-resolver.processor.ts`
- **Owning domain**: whatsapp
- **One-line responsibility**: Silent 24h resolver — consumes `silent-24h-resolver`, resolves conversations with no activity after 24h
- **Side effects**: Prisma reads/writes: Conversation, WhatsAppContact
- **Status**: ✅ canonical

### `campaignWorker` (worker)

- **File**: `worker/campaign-processor.ts`
- **Owning domain**: campaigns
- **One-line responsibility**: Campaign execution worker — consumes `campaign-jobs`, processes campaign sends
- **Side effects**: External APIs: WhatsApp, email provider
- **Status**: ✅ canonical

### `scraperWorker` (worker)

- **File**: `worker/scraper-processor.ts`
- **Owning domain**: scrapers
- **One-line responsibility**: Scraper execution worker — runs Instagram/Google Maps scraping jobs
- **Side effects**: External APIs: Instagram, Google Maps
- **Status**: ✅ canonical

### `mediaWorker` (worker)

- **File**: `worker/media-processor.ts`
- **Owning domain**: media
- **One-line responsibility**: Media processing worker — image/video optimization, thumbnail generation
- **Side effects**: Prisma writes: Media; External APIs: storage (S3/R2)
- **Status**: ✅ canonical

### `voiceWorker` (worker)

- **File**: `worker/voice-processor.ts`
- **Owning domain**: voice
- **One-line responsibility**: Voice processing worker — audio transcription, voice note handling
- **Side effects**: External APIs: OpenAI Whisper
- **Status**: ✅ canonical

### `decisionOutcomeResolver` (worker)

- **File**: `worker/processors/decision-outcome-resolver.ts`
- **Owning domain**: kloel
- **One-line responsibility**: Decision outcome resolver — resolves pending KLOEL decisions, updates outcome evidence
- **Side effects**: Prisma writes: KloelDecision, KloelEvidence
- **Tests**: `worker/test/decision-outcome-resolver.spec.ts` — ✅
- **Status**: ✅ canonical

### `DLQMonitor` (worker)

- **File**: `worker/dlq-monitor.ts`
- **Owning domain**: queue
- **One-line responsibility**: Dead Letter Queue monitor — alerts on DLQ buildup, auto-reprocess
- **Status**: ✅ canonical---

## Frontend SWR Hooks

React hooks in `frontend/src/hooks/` using SWR for data fetching. All are frontend-hook type.

### Commerce & Products

- **`useProducts`** — `frontend/src/hooks/useProducts.ts` — Product listing with SWR caching — **Tests**: ✅
- **`useProductTemplates`** — `frontend/src/hooks/useProductTemplates.ts` — Product template catalog — **Status**: ✅
- **`usePricingPlans`** — `frontend/src/hooks/usePricingPlans.ts` — Pricing plan data — **Status**: ✅
- **`useCheckoutPlans`** — `frontend/src/hooks/useCheckoutPlans.ts` — Checkout plan editor data (~15KB) — **Status**: ⚠️ large hook
- **`useCheckoutEditor`** — `frontend/src/hooks/useCheckoutEditor.ts` — Checkout builder state (~14KB) — **Status**: ⚠️ large hook

### Communication

- **`useWhatsAppSession`** — `frontend/src/hooks/useWhatsAppSession.ts` — WhatsApp session management, QR code, status (~18KB) — **Status**: ⚠️ large hook
- **`useFlows`** — `frontend/src/hooks/useFlows.ts` — Flow list, CRUD operations
- **`useFlowTemplates`** — `frontend/src/hooks/useFlowTemplates.ts` — Flow template catalog
- **`useFlowExecutions`** — `frontend/src/hooks/useFlowExecutions.ts` — Flow execution history
- **`useFlowOptimize`** — `frontend/src/hooks/useFlowOptimize.ts` — Flow optimization suggestions
- **`useConversationHistory`** — `frontend/src/hooks/useConversationHistory.tsx` — Chat conversation history (~11KB)
- **`useEmailPresets`** — `frontend/src/hooks/useEmailPresets.ts` — Email template presets

### CRM & Sales

- **`useCRM`** — `frontend/src/hooks/useCRM.ts` — CRM contacts, deals, pipeline
- **`useSales`** — `frontend/src/hooks/useSales.ts` — Sales order data
- **`useSalesFlow`** — `frontend/src/hooks/useSalesFlow.ts` — Sales flow management
- **`useSalesPipeline`** — `frontend/src/hooks/useSalesPipeline.ts` — Pipeline stage management

### Intelligence (KLOEL)

- **`useCiaSurface`** — `frontend/src/hooks/useCiaSurface.ts` — CIA surface data
- **`useCiaAdvanced`** — `frontend/src/hooks/useCiaAdvanced.ts` — CIA advanced settings
- **`useCiaTasks`** — `frontend/src/hooks/useCiaTasks.ts` — CIA task list
- **`useBrainDecide`** — `frontend/src/hooks/useBrainDecide.ts` — Brain decision queries
- **`useCopilotSuggestions`** — `frontend/src/hooks/use-copilot-suggestions.ts` — Copilot suggestion feed

### Growth & Marketing

- **`useAnuncios`** — `frontend/src/hooks/useAnuncios.ts` — Ad campaign data
- **`useAnunciosCampaigns`** — `frontend/src/hooks/useAnunciosCampaigns.ts` — Campaign list
- **`useMarketing`** — `frontend/src/hooks/useMarketing.ts` — Marketing channel data
- **`usePartnerships`** — `frontend/src/hooks/usePartnerships.ts` — Partnership management (~8KB)
- **`useMemberAreas`** — `frontend/src/hooks/useMemberAreas.ts` — Member area data
- **`useDashboardHome`** — `frontend/src/hooks/useDashboardHome.ts` — Home dashboard metrics
- **`useReports`** — `frontend/src/hooks/useReports.ts` — Report data
- **`useDetailedReports`** — `frontend/src/hooks/useDetailedReports.ts` — Detailed report data (~8KB)

### Operations

- **`useWallet`** — `frontend/src/hooks/useWallet.ts` — Wallet balance + transactions
- **`useKyc`** — `frontend/src/hooks/useKyc.ts` — KYC status + document upload
- **`useWorkspaceId`** — `frontend/src/hooks/useWorkspaceId.ts` — Current workspace context
- **`useConnectAccounts`** — `frontend/src/hooks/useConnectAccounts.ts` — Connected account status
- **`useScrapers`** — `frontend/src/hooks/useScrapers.ts` — Scraper job management
- **`useCanvasDesigns`** — `frontend/src/hooks/useCanvasDesigns.ts` — Canvas design data
- **`useCapabilities`** — `frontend/src/hooks/useCapabilities.ts` — Feature capability flags

### System

- **`useSocket`** — `frontend/src/hooks/useSocket.ts` — WebSocket connection management
- **`useCommandPalette`** — `frontend/src/hooks/useCommandPalette.ts` — Command palette state (~6KB)
- **`useBrazilianBanks`** — `frontend/src/hooks/useBrazilianBanks.ts` — Brazilian bank list
- **`usePersistentImagePreview`** — `frontend/src/hooks/usePersistentImagePreview.ts` — Image preview state
- **`usePrefersReducedMotion`** — `frontend/src/hooks/usePrefersReducedMotion.ts` — Accessibility preference
- **`useResponsiveViewport`** — `frontend/src/hooks/useResponsiveViewport.ts` — Responsive breakpoint detection
- **`useAppleDiagnostic`** — `frontend/src/hooks/useAppleDiagnostic.ts` — Apple Pay / device diagnostic

---

## Cross-Reference Index

- [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md) — domain boundaries
- [CANONICAL_VOCABULARY.md](CANONICAL_VOCABULARY.md) — term-level naming
- [CAPABILITY_MAP.md](CAPABILITY_MAP.md) — what each domain DOES
- [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md) — cross-domain events
- [QUEUES_CATALOG.md](QUEUES_CATALOG.md) — async work
- [PRISMA_USAGE.md](PRISMA_USAGE.md) — model ownership per domain
- [CLAUDE.md](../../CLAUDE.md) — "ORDEM DE CONSTRUÇÃO (DAG)" phase definitions
