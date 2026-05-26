# Kloel Canonical Vocabulary

> Authored by PI atomic subagent `w5-canonical-vocabulary` (DeepSeek V4 Pro,
> ~51k events). Artifact #2 of the Architectural Semantic Canonicalization
> mission. Materialized 2026-05-26.


> The single official name for every recurring concept in the Kloel codebase.
> New code MUST use the canonical name. Aliases listed are deprecated or
> context-specific. PT-BR/EN bilingual mapping is noted where relevant.
>
> **Anti-regression**: `scripts/ops/check-canonical-duplicates.mjs` and
> `scripts/ops/check-canonical-events.mjs` flag new implementations that
> look like aliases or non-canonical event names.
>
> **Methodology**: Terms are extracted from the running codebase only —
> Prisma models, service class names, event taxonomy, and in-code
> identifiers. Every alias is cited with at least one `file:line` reference.
>
> **How to read**:
> - **Canonical** = the one name you MUST use in new code
> - **Aliases observed** = names found in the codebase that should converge
> - **Do NOT use for** = semantic boundaries — nearby concepts that are distinct
> - **Migration status**: ✅ enforced / ⏳ aliases still in code / ⛔ duplicate definitions
>
> Generated 2026-05-26. 47 terms + 17 canonical events + 5 canonical providers.

---

## Workspace

- **Canonical**: `Workspace` (PascalCase entity / Prisma model `RAC_Workspace`)
- **One-line meaning**: Multi-tenant isolation unit — every record in the system is scoped to one Workspace.
- **Owning domain**: `workspaces` (Phase 0 — Infrastructure)
- **Aliases observed in code**:
  - `Tenant` — `backend/src/admin/products/queries/detail-product.query.ts:152-155` (tenant scoping)
  - `Org` — legacy (superseded by `RAC_` prefix)
  - `Account` — collision avoided (`ConnectAccountBalance` in payments/connect/)
- **Use when**: Scoping data, enforcing isolation, resolving auth context.
- **Do NOT use for**: Stripe Connect accounts, user accounts, bank accounts.
- **Migration status**: ✅ enforced

## User

- **Canonical**: `User` (conceptual) / `Agent` (Prisma model `RAC_Agent`)
- **One-line meaning**: Person with login credentials; `displayRole` distinguishes admin/agent/member.
- **Owning domain**: `auth` (Phase 0)
- **Aliases observed in code**:
  - `Agent` — `backend/prisma/schema.prisma:310` (canonical Prisma entity)
  - `Operator` — `backend/src/admin/` (admin context: `AdminUser`)
  - `Member` — `backend/prisma/schema.prisma` (workspace membership)
  - `userId` — `backend/src/kloel/brain-runtime.service.ts:203` (JWT payload)
- **Use when**: Referring to an authenticated human with a session.
- **Do NOT use for**: CRM contacts (Contact), system accounts (ApiKey).
- **Migration status**: ✅ enforced

## Contact

- **Canonical**: `Contact` (Prisma model `RAC_Contact`)
- **PT-BR mapping**: `Lead` (funnel-stage label only, not synonym)
- **One-line meaning**: CRM/Inbox entity — person reachable via messaging channels.
- **Owning domain**: `contacts` (Phase 3)
- **Aliases observed in code**:
  - `Lead` — `backend/src/autopilot/segmentation.service.ts:96-110` (HOT_LEADS/WARM_LEADS/COLD_LEADS)
  - `lead` — `backend/src/autopilot/autopilot-cycle-executor.service.ts:328` (`lead_unlocker`)
  - `kloelLead` — `backend/src/analytics/analytics.service.ts:320` (Prisma model)
  - `checkoutSocialLead` — `backend/src/admin/marketing/admin-marketing.service.ts:75`
  - `capturedLeadId` — `backend/src/checkout/checkout-order-metadata.util.ts:5`
  - `Prospect` — `backend/src/kloel/defens/case-library.builder.ts:11`
  - `Customer` — `backend/src/admin/transactions/queries/list-transactions.types.ts:14-18`
  - `buyer` — `backend/src/checkout/mercado-pago-pix.service.ts:12-16`
- **Use when**: Referring to a person in CRM, inbox, or checkout funnel.
- **Do NOT use for**: Authenticated users (User/Agent).
- **Migration status**: ⏳ Lead/Customer/Buyer entrenched

## Channel

- **Canonical**: `Channel` (enum: WHATSAPP, INSTAGRAM, MESSENGER, EMAIL, TIKTOK)
- **One-line meaning**: Communication medium for Contact interactions.
- **Owning domain**: `omnichannel` / `whatsapp` (Phase 2)
- **Aliases observed in code**:
  - `ChannelIdentifier` — `backend/prisma/schema.prisma:300`
  - `channel` — `backend/prisma/schema.prisma:301` (field)
- **Use when**: Classifying the medium.
- **Do NOT use for**: Provider implementation (Provider), session (ChannelSession).
- **Migration status**: ✅ enforced

## Provider

- **Canonical**: `Provider` — the SDK/wrapper connecting to a Channel
- **One-line meaning**: Concrete API integration (MetaCloud, WAHA, Stripe).
- **Owning domain**: `whatsapp` / `payments` / `integrations` (cross-cutting)
- **Aliases observed in code**:
  - `whatsappProvider` — `backend/src/whatsapp/provider-settings.types.ts:136`
  - `Provider` (config) — `backend/src/whatsapp/providers/whatsapp-api.provider.types.ts:114`
  - `Integration` — `backend/prisma/schema.prisma:738` (overlapping)
- **Use when**: Referring to SDK/API client.
- **Do NOT use for**: Channel itself, NestJS providers (Service).
- **Migration status**: ⏳ Integration model overlaps

## ChannelSession

- **Canonical**: `ChannelSession` — runtime connection to messaging channel
- **One-line meaning**: Per-workspace WhatsApp/Instagram session (QR, status, metadata).
- **Owning domain**: `whatsapp` (Phase 2)
- **Aliases observed in code**:
  - `providerSettings` — `backend/prisma/schema.prisma:122` (JSON field)
  - `whatsappApiSession` — `backend/src/whatsapp/whatsapp-catchup.service.pagination.spec.ts:231`
  - `whatsappSession`, `waSession`, `connection`, `instance`, `botSession`, `WAHASession` (legacy)
- **Use when**: Referring to live connection to messaging provider.
- **Do NOT use for**: Auth sessions, Conversation context.
- **Migration status**: ⏳ no dedicated table yet

## Conversation

- **Canonical**: `Conversation` (Prisma model `RAC_Conversation`)
- **One-line meaning**: Ordered Messages between one Contact and the system on one Channel.
- **Owning domain**: `inbox` (Phase 2)
- **Aliases observed in code**:
  - `Thread` — `backend/src/chat/chat.service.ts:48` (`threadId`)
  - `chatThread` — `backend/src/chat/chat.service.spec.ts:14`
  - `thread` — `backend/src/kloel/agent-runtime/agent-runtime.types.ts:75`
  - `Chat` — `backend/src/chat/` (separate module)
  - `kloelConversation` — `backend/src/kloel/kloel-lead-brain.service.ts:70`
- **Use when**: Referring to message history between Contact and system.
- **Do NOT use for**: chatThread/chatMessage, kloelConversation, agent sessions.
- **Migration status**: ⛔ 3 overlapping conversation models exist

## Message

- **Canonical**: `Message` (Prisma model `RAC_Message`)
- **One-line meaning**: Atomic conversation unit; `direction` = INBOUND|OUTBOUND.
- **Owning domain**: `inbox` (Phase 2)
- **Aliases observed in code**:
  - `ChatMessage` — `backend/src/kloel/kloel-thinker.types.ts:3` (interface)
  - `chatMessage` — `backend/src/chat/chat.service.ts:63` (Prisma model)
  - `KloelMessage` — `backend/prisma/schema.prisma:217` (AI-internal)
  - `inboundMessage`, `outboundMessage` (legacy)
- **Use when**: Referring to a single message.
- **Do NOT use for**: SpineEvent, Notification, KloelMessage.
- **Migration status**: ⛔ 4 distinct message concepts

## Event

- **Canonical**: `SpineEvent` (form: `domain.entity.verb-past-participle`)
- **One-line meaning**: Cross-domain async signal via Spine event bus.
- **Owning domain**: `kloel` / `spine` (Phase 3)
- **Aliases observed in code**:
  - `WebhookEvent` — external inbound events
  - `action` — `backend/src/kloel/brain-event-taxonomy.ts:5-7`
  - `eventType` — `backend/src/kloel/brain-event-spine.service.ts:394`
- **Use when**: Emitting/consuming cross-domain signals.
- **Do NOT use for**: WebhookEvent, Notification, Message.
- **Migration status**: ✅ enforced (scanner)

## Notification

- **Canonical**: `Notification` (Prisma model)
- **One-line meaning**: User-facing alert (in-app or push).
- **Owning domain**: `notifications` (Phase 6)
- **Aliases observed in code**:
  - `notification_url` — `backend/src/checkout/mercado-pago-pix.service.ts:186` (MP callback)
  - `alert` — informal (`FinancialAlertService`)
- **Use when**: Referring to user-facing alerts.
- **Do NOT use for**: Webhook callbacks (Webhook), system events (SpineEvent).
- **Migration status**: ✅ enforced

## Webhook

- **Canonical**: `Webhook` / `WebhookEvent` (inbound) / `WebhookSubscription` (outbound)
- **One-line meaning**: External provider → internal event boundary.
- **Owning domain**: `webhooks` (Phase 6)
- **Aliases observed in code**:
  - `Callback` — `backend/src/auth/apple-auth.service.spec.ts:148`
  - `notification_url` — `backend/src/checkout/mercado-pago-pix.service.ts:186`
  - `Hook`, `IncomingEvent` (legacy)
- **Use when**: Referring to HTTP callbacks from/to external systems.
- **Do NOT use for**: SpineEvent, Notification.
- **Migration status**: ✅ enforced

## Worker

- **Canonical**: `Worker` / `Processor` (file naming: `*-processor.ts`)
- **One-line meaning**: Background BullMQ job consumer.
- **Owning domain**: `queue` / `worker` (cross-cutting)
- **Aliases observed in code**:
  - `Processor` — `worker/processors/autopilot-processor.ts`, `crm-processor.ts`, `memory-processor.ts`
  - `Consumer`, `Subscriber` (conceptual only)
  - `Job` — `worker/job-id.ts`
- **Use when**: Referring to async job execution.
- **Do NOT use for**: Controllers, cron jobs, webhook handlers.
- **Migration status**: ✅ enforced

## Capability

- **Canonical**: `Capability` — discrete brain-executable action
- **One-line meaning**: Registered in `OPERATOR_CAPABILITIES`, exposed via ABI.
- **Owning domain**: `kloel` (Phase 3)
- **Aliases observed in code**:
  - `Tool` — `backend/src/kloel/kloel-chat-tools.definition-extras.ts:123`
  - `Action` — `backend/src/kloel/brain-event-taxonomy.ts:5-7`
  - `Operation` — `backend/src/kloel/brain-commercial-graph.service.ts:94`
  - `toolName` — `backend/src/kloel/agent-runtime/agent-runtime.memory-curator.ts:27`
- **Use when**: Referring to brain-executable action.
- **Do NOT use for**: UI actions, MCP tools, DB operations.
- **Migration status**: ✅ enforced

## Checkout

- **Canonical**: `Checkout` / `CheckoutOrder` (Prisma model)
- **One-line meaning**: Pre-payment purchase intent; becomes sale after payment.
- **Owning domain**: `checkout` (Phase 1)
- **Aliases observed in code**:
  - `Order` — `backend/src/checkout/checkout-order.service.ts:30`
  - `checkoutOrder` — Prisma model
  - `Purchase` — `backend/src/integrations/meta-conversions-api.service.spec.ts:101`
  - `Sale` — `backend/src/analytics/analytics.service.ts` (`kloelSale`)
- **Use when**: Referring to pre-payment checkout flow.
- **Do NOT use for**: Post-payment records (KloelSale), subscriptions, cart.
- **Migration status**: ✅ enforced

## Payment

- **Canonical**: `Payment` (Prisma: `RAC_Payment` / `CheckoutPayment`)
- **One-line meaning**: Money-movement event — atomic financial record.
- **Owning domain**: `payments` (Phase 1)
- **Aliases observed in code**:
  - `Charge` — `backend/src/payments/connect/connect-reversal.service.ts:286`
  - `Transaction` — `backend/src/payments/ledger/ledger-audit.helper.ts:10-11`
  - `paymentIntent` — `backend/src/checkout/checkout-payment.service.ts` (Stripe)
- **Use when**: Referring to money-movement record.
- **Do NOT use for**: LedgerEntry, WalletTransaction, Invoice.
- **Migration status**: ⏳ Charge/Transaction overloaded## Wallet

- **Canonical**: `Wallet` / `KloelWallet` (Prisma model)
- **One-line meaning**: Prepaid balance scoped to Workspace.
- **Owning domain**: `wallet` (Phase 1)
- **Aliases observed in code**:
  - `Balance` — `backend/src/payments/connect/connect-payout.service.ts:91`
  - `Account` — collision (`ConnectAccountBalance`)
  - `kloelWallet` — `backend/src/analytics/analytics.service.spec.ts:28`
- **Use when**: Referring to prepaid wallet.
- **Do NOT use for**: Stripe Connect balances, bank accounts.
- **Migration status**: ✅ enforced

## LedgerEntry

- **Canonical**: `LedgerEntry` / `ConnectLedgerEntry` (Prisma model)
- **One-line meaning**: Append-only financial record. NEVER UPDATE.
- **Owning domain**: `payments` (Phase 1)
- **Aliases observed in code**:
  - `ledgerEntry` — `backend/src/payments/ledger/ledger.service.ts:27`
  - `entry` — `backend/src/payments/ledger/ledger.service.ts:138`
  - `Movement`, `Posting`, `JournalEntry` (legacy)
- **Use when**: Referring to financial ledger record.
- **Do NOT use for**: Payment, WalletTransaction.
- **Migration status**: ✅ enforced

## Plan

- **Canonical**: `Plan` / `CheckoutProductPlan` (Prisma model)
- **One-line meaning**: Product variant with billing semantics.
- **Owning domain**: `billing` / `checkout` (Phase 1)
- **Aliases observed in code**:
  - `plan` — `backend/src/billing/billing-checkout-webhook.service.ts:241`
  - `checkoutProductPlan` — `backend/src/checkout/checkout-order-support.ts:374`
  - `BillingPlan` — `backend/prisma/schema.prisma` (separate model)
  - `Tier`, `SubscriptionTier`, `Pricing` (legacy)
- **Use when**: Referring to purchasable plan with pricing.
- **Do NOT use for**: Product, Subscription, campaigns.
- **Migration status**: ⛔ CheckoutProductPlan vs BillingPlan overlap

## Subscription

- **Canonical**: `Subscription` (Prisma model `RAC_Subscription`)
- **One-line meaning**: Active billing relationship for Workspace on Plan.
- **Owning domain**: `billing` (Phase 1)
- **Aliases observed in code**:
  - `customerSubscription` — `backend/src/admin/dashboard/admin-dashboard.service.ts:236`
  - `stripeId` — `backend/prisma/schema.prisma:875`
- **Use when**: Referring to active billing subscription.
- **Do NOT use for**: Plan definition, one-time purchases.
- **Migration status**: ✅ enforced

## Product

- **Canonical**: `Product` (Prisma model `RAC_Product`)
- **One-line meaning**: Catalog entity — something sellable.
- **Owning domain**: `products` / `checkout` (Phase 1)
- **Aliases observed in code**:
  - `Item` — `backend/src/checkout/checkout-order-support.ts:8` (CheckoutLineItem)
  - `Offer` — `backend/src/marketing/` (marketing wrapper)
- **Use when**: Referring to sellable catalog entry.
- **Do NOT use for**: Plan, LineItem.
- **Migration status**: ✅ enforced

## DTO

- **Canonical**: `Dto` suffix — class-validator request/response shape
- **One-line meaning**: Data Transfer Object with validation decorators.
- **Owning domain**: `common` (cross-cutting convention)
- **Aliases observed in code**:
  - `Type` — `backend/src/admin/transactions/queries/list-transactions.types.ts:12-18`
  - `Model` — `@prisma/client` generated (not DTO)
  - `Schema` — `backend/src/config/` (Joi, not DTO)
  - `Input` — `backend/src/payments/connect/connect-payout.service.ts:89`
  - `Query` — `backend/src/admin/transactions/queries/list-transactions.query.ts`
  - `Body` — `backend/src/webhooks/payment-webhook-types.ts:22`
- **Use when**: Defining HTTP request/response shapes with validation.
- **Do NOT use for**: Domain types (.types.ts), Prisma types, Joi schemas.
- **Migration status**: ⏳ Dto/Input/Query/Body/Type coexist

## Service

- **Canonical**: `Service` — NestJS `@Injectable()` with `*Service` suffix
- **One-line meaning**: Business logic layer — one per bounded capability.
- **Owning domain**: Cross-cutting (NestJS convention)
- **Aliases observed in code**:
  - `Provider` — `backend/src/whatsapp/providers/` (SDK wrappers)
  - `Strategy` — `backend/src/kloel/abi/abi-stability.spec.ts:17`
  - `Adapter` — `backend/src/kloel/spine/spine-emitter.service.ts:94`
  - `Helper` — `backend/src/checkout/checkout-order-payment.helpers.ts`
  - `Handler` — `backend/src/admin/products/handlers/` (CQRS)
- **Use when**: Naming NestJS injectable with business logic.
- **Do NOT use for**: SDK wrappers (Provider), pure functions (Helper), CQRS (Handler).
- **Migration status**: ✅ enforced

## Pipeline

- **Canonical**: `Pipeline` (Prisma model `RAC_Pipeline`)
- **One-line meaning**: Visual Kanban sales pipeline with Stages and Deals.
- **Owning domain**: `pipeline` (Phase 4)
- **Aliases observed in code**:
  - `Funnel` — `backend/src/admin/chat/admin-chat.service.ts:22`
  - `CRM` — `backend/src/crm/` (separate domain: `CrmContact`, `CrmStage`)
- **Use when**: Referring to Kanban sales board.
- **Do NOT use for**: CI/CD, data pipelines (Flow), CRM domain models.
- **Migration status**: ⛔ Pipeline vs CrmStage/CrmDeal overlap

## Flow

- **Canonical**: `Flow` (Prisma model `RAC_Flow`)
- **One-line meaning**: Declarative automation — nodes + edges against Contact.
- **Owning domain**: `flows` (Phase 2)
- **Aliases observed in code**:
  - `Sequence`, `Automation`, `Workflow` (legacy/informal)
  - `Funnel` — `backend/src/admin/chat/admin-chat.service.ts:22` (UX wrapper)
- **Use when**: Referring to node-and-edge Flow editor/execution.
- **Do NOT use for**: Pipeline, Campaign, AutopilotEvent.
- **Migration status**: ✅ enforced

## Campaign

- **Canonical**: `Campaign` (Prisma model `RAC_Campaign`)
- **One-line meaning**: Outbound message wave with audience selector.
- **Owning domain**: `campaigns` (Phase 4)
- **Aliases observed in code**:
  - `Broadcast`, `Blast`, `Outreach` (legacy)
  - `mass-send` — `backend/src/mass-send/` (separate domain)
  - `EmailCampaign` — Prisma (separate model)
- **Use when**: Referring to scheduled outbound messaging.
- **Do NOT use for**: Ad campaigns, email campaigns (EmailCampaign), autopilot.
- **Migration status**: ⛔ Campaign vs EmailCampaign overlap

## Affiliate

- **Canonical**: `Affiliate` / `AffiliatePartner` (Prisma model)
- **One-line meaning**: Commission-earning referrer via affiliate links.
- **Owning domain**: `affiliate` (Phase 4)
- **Aliases observed in code**:
  - `Partner` — `backend/prisma/schema.prisma` (AffiliatePartner model)
  - `Reseller`, `Referrer` (legacy)
  - `affiliateId` — `backend/src/checkout/checkout-order.service.ts:92`
- **Use when**: Referring to commission-based referral tracking.
- **Do NOT use for**: Partnerships (Partnership model), creators.
- **Migration status**: ✅ enforced

## Identity

- **Canonical**: `Identity` / `ContactIdentityLink` (Prisma model)
- **One-line meaning**: Cross-channel contact deduplication.
- **Owning domain**: `contacts` (Phase 3)
- **Aliases observed in code**:
  - `identityLink` — `backend/prisma/schema.prisma:275`
  - `matchReason` — `backend/prisma/schema.prisma:284`
  - `merged` — `backend/prisma/schema.prisma:285`
- **Use when**: Referring to contact identity resolution.
- **Do NOT use for**: Auth identity (User/Agent), OAuth identity.
- **Migration status**: ✅ enforced

## KYC

- **Canonical**: `KYC` / `KycRecord` (Prisma model)
- **One-line meaning**: Identity verification for sellers/agents.
- **Owning domain**: `kyc` (Phase 0)
- **Aliases observed in code**:
  - `kycStatus` — `backend/prisma/schema.prisma:157`
  - `documentType` — `backend/prisma/schema.prisma:158`
  - `fiscalData` — `backend/prisma/schema.prisma:235`
- **Use when**: Referring to identity verification workflows.
- **Do NOT use for**: GDPR, ComplianceLog.
- **Migration status**: ✅ enforced

## Autopilot

- **Canonical**: `Autopilot` / `AutopilotRun` (Prisma model)
- **One-line meaning**: Autonomous agent scanning conversations, executing actions.
- **Owning domain**: `autopilot` (Phase 2)
- **Aliases observed in code**:
  - `autopilot` — `backend/src/autopilot/autopilot-cycle.service.ts:175`
  - `autopilotEvent` — Prisma model
  - `autonomy` — `backend/src/autopilot/autopilot-ops.service.spec.ts:97`
  - `segmentation` — `backend/src/autopilot/segmentation.service.ts:96`
- **Use when**: Referring to automated conversation scanning/action execution.
- **Do NOT use for**: Manual agent actions, FlowExecution, Campaign.
- **Migration status**: ✅ enforced

## Memory

- **Canonical**: `Memory` / `KloelMemory` (Prisma model)
- **One-line meaning**: Structured cognitive memory for the Kloel agent.
- **Owning domain**: `kloel` (Phase 3)
- **Aliases observed in code**:
  - `kloelMemory` — `backend/prisma/schema.prisma:216`
  - `memory` — `backend/src/kloel/agent-runtime/agent-runtime.memory-manager.ts:380`
  - `context` — `backend/src/kloel/agent-runtime/agent-runtime.context.ts:30`
  - `knowledge` — `backend/prisma/schema.prisma:683` (separate: KnowledgeBase)
- **Use when**: Referring to agent cognitive memory storage.
- **Do NOT use for**: KnowledgeBase, Conversation, CIAContext.
- **Migration status**: ✅ enforced

## ABI

- **Canonical**: `ABI` / `AbiState` (Prisma model)
- **One-line meaning**: Machine-readable self-description of Kloel cognitive organism.
- **Owning domain**: `kloel` (Phase 3)
- **Aliases observed in code**:
  - `abi` — `backend/src/kloel/abi/abi-builder.service.ts:112`
  - `cognitiveSubstrate` — `backend/src/kloel/brain-capability-executor.substrate.ts:23`
  - `selfModel` — `backend/src/kloel/agent-runtime/agent-runtime.context.ts:56`
- **Use when**: Referring to machine-readable capability/state manifest.
- **Do NOT use for**: UI component API, REST API.
- **Migration status**: ✅ enforced

## Spine

- **Canonical**: `Spine` / `SpineEmitterService`
- **One-line meaning**: Internal event bus connecting domains via typed events.
- **Owning domain**: `kloel` (Phase 3)
- **Aliases observed in code**:
  - `spine` — `backend/src/kloel/spine/spine-emitter.service.ts`
  - `events` — `backend/src/kloel/brain-event-spine.service.ts:394`
  - `eventBus` — informal
- **Use when**: Emitting/subscribing to cross-domain events.
- **Do NOT use for**: WebhookEvent, BullMQ jobs, NestJS EventEmitter.
- **Migration status**: ✅ enforced

## UnifiedAgent

- **Canonical**: `UnifiedAgent` / `UnifiedAgentService`
- **One-line meaning**: Single agent entry-point routing to KLOEL/CIA/Autopilot.
- **Owning domain**: `cia` (Phase 3)
- **Aliases observed in code**:
  - `CIA` — `backend/src/cia/` (Central de Inteligência Artificial)
  - `cia` — `backend/src/cia/cia-bootstrap.service.spec.ts:60`
  - `agent` — `backend/src/kloel/agent-runtime/`
  - `brain` — `backend/src/kloel/brain-runtime.service.ts:117`
- **Use when**: Referring to unified agent entry-point.
- **Do NOT use for**: Human agents (Agent), Autopilot, individual Capabilities.
- **Migration status**: ⏳ cia→unified-agent rename pending

## Session

- **Canonical**: `Session` (conceptual) — domain-prefixed: `RefreshToken` (auth), `CIASession` (agent), `ChannelSession` (messaging)
- **One-line meaning**: Stateful interaction context — distinguished by domain prefix.
- **Owning domain**: `auth` / `cia` / `whatsapp`
- **Aliases observed in code**:
  - `sessionId` — `backend/src/kloel/agent-runtime/agent-runtime.types.ts:74`
  - `threadId` — `backend/src/kloel/agent-runtime/agent-runtime.types.ts:227`
  - `refreshToken` — `backend/prisma/schema.prisma:928`
  - `deviceToken` — `backend/prisma/schema.prisma:943`
- **Use when**: Referring to interaction context with state.
- **Do NOT use for**: ChannelSession, Conversation, CheckoutSession.
- **Migration status**: ⛔ session heavily overloaded

## Audit

- **Canonical**: `Audit` / `AuditLog` (Prisma model)
- **One-line meaning**: Immutable record of sensitive action.
- **Owning domain**: `audit` (Phase 0)
- **Aliases observed in code**:
  - `auditLog` — `backend/prisma/schema.prisma:195`
  - `adminAuditLog` — `backend/src/payments/connect/connect.controller.ts:333`
  - `log` — `backend/src/audit/audit.controller.spec.ts:55`
- **Use when**: Recording sensitive operations for traceability.
- **Do NOT use for**: Logger (Pino), WebhookEvent, AnalyticsEvent.
- **Migration status**: ✅ enforced

## Marketplace

- **Canonical**: `Marketplace` / `MarketplaceTreasuryService`
- **One-line meaning**: Multi-vendor marketplace with treasury and split rules.
- **Owning domain**: `marketplace-treasury` (Phase 1)
- **Aliases observed in code**:
  - `marketplaceTreasury` — `backend/src/payments/connect/connect-reversal.service.ts:286`
  - `connect` — `backend/src/payments/connect/`
  - `split` — `backend/src/checkout/checkout-split-e2e.spec.ts:155`
  - `stakeholder` — `backend/src/payments/connect/connect-reversal.service.ts:186`
- **Use when**: Referring to marketplace split-payment logic.
- **Do NOT use for**: Simple checkout, Affiliate, MarketplaceListing.
- **Migration status**: ✅ enforced

## Compliance

- **Canonical**: `Compliance` / `ComplianceLog` (Prisma model)
- **One-line meaning**: Regulatory compliance record (LGPD, GDPR).
- **Owning domain**: `compliance` (Phase 0)
- **Aliases observed in code**:
  - `gdpr` — `backend/src/gdpr/` (separate domain)
  - `cookieConsent` — `backend/prisma/schema.prisma:167`
  - `unsubscribe` — `backend/src/unsubscribe/`
- **Use when**: Referring to regulatory compliance.
- **Do NOT use for**: GDPR-specific (GdprRequest), cookie (CookieConsent), KYC.
- **Migration status**: ✅ enforced

## Integration (OAuth)

- **Canonical**: `Integration` (Prisma model `RAC_Integration`)
- **One-line meaning**: OAuth-connected external platform.
- **Owning domain**: `integrations` (Phase 5)
- **Aliases observed in code**:
  - `integrationCredentials` — `backend/prisma/schema.prisma:243`
  - `connection` — `backend/prisma/schema.prisma:246` (MetaConnection)
  - `provider` — SDK is Provider, Integration is OAuth connection
- **Use when**: Referring to OAuth-connected external service.
- **Do NOT use for**: Provider SDKs, Webhook, Channel.
- **Migration status**: ⏳ Integration/IntegrationCredential/MetaConnection overlap

## RateLimit

- **Canonical**: `Throttle` / `ThrottlerModule`
- **One-line meaning**: Request rate limiting with per-route-class tiers.
- **Owning domain**: `common` (Phase 0)
- **Aliases observed in code**:
  - `throttler` — `backend/src/app.module.ts:170-172`
  - `rateLimit` — informal
  - `RouteClass` — `backend/src/webhooks/payment-webhook-stripe.controller.ts:62`
- **Use when**: Configuring request rate limiting.
- **Do NOT use for**: Message send limits, worker concurrency.
- **Migration status**: ✅ enforced

## Queue (async jobs)

- **Canonical**: `Queue` — BullMQ job queues
- **One-line meaning**: Async job processing via Redis-backed BullMQ.
- **Owning domain**: `queue` (Phase 6)
- **Aliases observed in code**:
  - `queue` — `backend/src/queue/`, `worker/queue.ts`
  - `job` — `worker/job-id.ts`
  - `dlq` — `worker/queue-dlq-notifier.ts`
  - `processor` — `worker/processors/`
- **Use when**: Referring to async job infrastructure.
- **Do NOT use for**: Inbox queues (Queue model), event bus (Spine).
- **Migration status**: ✅ enforced

## Idempotency

- **Canonical**: `IdempotencyGuard` + `IdempotencyInterceptor` / `buildCacheKey`
- **One-line meaning**: Guarantee replay produces same result without side effects.
- **Owning domain**: `common` (Phase 0)
- **Aliases observed in code**:
  - `idempotencyKey` — `backend/src/billing/billing-checkout-webhook.service.ts:104`
  - `correlationId` — `backend/src/checkout/checkout-order.service.ts:223`
  - `fingerprint` — `backend/src/common/idempotency-fingerprint.ts:56`
  - `duplicate` — `backend/src/webhooks/payment-webhook.controller.idempotency.spec.ts:11`
- **Use when**: Ensuring safe replay of financial/mutating operations.
- **Do NOT use for**: General cache keys.
- **Migration status**: ✅ enforced

## Pagination

- **Canonical**: `PaginationLimitPipe` / `PaginationPagePipe`
- **One-line meaning**: Standardized pagination with clamped limits (1–200).
- **Owning domain**: `common` (Phase 0)
- **Aliases observed in code**:
  - `limit` — `backend/src/common/pagination-clamp.pipe.ts:86`
  - `page` — `backend/src/common/pagination-clamp.pipe.ts:91`
  - `cursor` — `backend/src/chat/chat.service.ts:36`
  - `take` — `backend/src/checkout/checkout-product.service.spec.ts:112`
- **Use when**: Adding list endpoints with pagination.
- **Do NOT use for**: Cursor-based pagination.
- **Migration status**: ⏳ 16 endpoints use hand-rolled clamp

## FinancialAlert

- **Canonical**: `FinancialAlertService`
- **One-line meaning**: Financial monitoring and alert thresholds.
- **Owning domain**: `common` (Phase 0)
- **Aliases observed in code**:
  - `financialAlert` — `backend/src/webhooks/payment-webhook-stripe.handlers.ts:83`
  - `reconciliationAlert` — `backend/src/billing/billing-webhook.helpers.ts:147`
  - `opsAlert` — `backend/src/webhooks/payment-webhook-generic.helpers.ts:33`
- **Use when**: Triggering financial monitoring alerts.
- **Do NOT use for**: HealthService, Notification.
- **Migration status**: ✅ enforced

## Money (cents)

- **Canonical**: `Cents` (branded type) / `cents()` — from `common/money.ts`
- **One-line meaning**: Branded integer for monetary values in cents.
- **Owning domain**: `common` (Phase 0)
- **Aliases observed in code**:
  - `toCents`, `asCents` (legacy)
  - `amountInCents` — `backend/src/checkout/mercado-pago-pix.service.ts:17`
  - `totalInCents` — `backend/src/admin/transactions/queries/list-transactions.types.ts:20`
  - `priceInCents` — `backend/src/checkout/checkout-catalog.service.spec.ts:100`
- **Use when**: Storing/computing monetary values.
- **Do NOT use for**: Display (formatBRL), raw float values.
- **Migration status**: ⏳ raw number still common

## Phone (normalization)

- **Canonical**: `digitsOnly` / `digitsOrNull` / `whatsappDigits` — `common/phone.ts`
- **One-line meaning**: Phone number normalization helpers.
- **Owning domain**: `common` (Phase 0)
- **Aliases observed in code**:
  - `normalizePhone` — nullable variant in `checkout-social-lead.util.ts`
  - `normalizeNumber`, `cleanPhone`, `formatPhone` (legacy)
  - `NON_DIGIT_RE` — `backend/src/common/phone.ts:30` (canonical regex)
- **Use when**: Normalizing phone numbers for comparison/storage.
- **Do NOT use for**: Display formatting, email normalization.
- **Migration status**: ✅ enforced

## BRL (currency)

- **Canonical**: `parseBRL` / `formatBRL` — `common/money.ts`
- **One-line meaning**: Brazilian Real parsing and formatting.
- **Owning domain**: `common` (Phase 0)
- **Aliases observed in code**:
  - `parseCurrency`, `parseReal`, `BRLToCents` (legacy)
  - `formatCurrency` — `backend/src/cia/` (2 copies, migrated)
- **Use when**: Parsing/formatting BRL currency.
- **Do NOT use for**: Generic currency, cents arithmetic.
- **Migration status**: ✅ enforced

## Canonical Providers

| Canonical | Aliases (migrate) | Owning domain | Scope |
|---|---|---|---|
| `MercadoPago` | `mp`, `MercadoPagoSDK`, `mercado_pago` | payments | PIX BR (ADR 0009) |
| `Stripe` | `StripeConnect`, `stripe_sdk` | payments | Card + Connect (ADR 0003) |
| `WAHA` | `whatsapp_http_api`, `WhatsAppWebApi` | whatsapp | QR-based (legacy) |
| `MetaCloud` | `MetaCloudAPI`, `whatsapp_business`, `wabusiness` | whatsapp | Business Cloud API (default) |
| `Asaas` | — | — | **Deprecated** (ADR 0003) |

## Canonical Events (taxonomy)

| Canonical form | Banned forms |
|---|---|
| `channel.message.received` | `message_received`, `incomingMessage`, `WA_MESSAGE_RECEIVED` |
| `channel.message.sent` | `outboundMessage`, `messageSent` |
| `channel.message.failed` | `messageFail`, `wa_send_error` |
| `channel.session.connected` | `wa_connected`, `qr_authenticated`, `sessionOpen` |
| `channel.session.disconnected` | `wa_disconnected`, `sessionClose` |
| `conversation.started` | `thread_created`, `newConversation` |
| `conversation.updated` | `conversationDirty`, `thread_touched` |
| `lead.qualified` | `qualifyLead`, `leadQualified` |
| `checkout.created` | `newCheckout`, `checkoutInit` |
| `checkout.completed` | `checkoutDone`, `checkout.success` |
| `payment.approved` | `paymentSucceeded`, `chargeOK`, `payment.captured` |
| `payment.failed` | `paymentDeclined`, `chargeFail` |
| `payment.refunded` | `refundDone`, `chargeReversed` |
| `campaign.action.scheduled` | `campaignQueued`, `actionPlanned` |
| `campaign.action.executed` | `campaignSent`, `actionFired` |
| `brain.capability.invoked` | `capability.executed` (ambiguous) |
| `brain.capability.failed` | `capability.failed` (missing prefix) |

**Form rules**: lowercase, dot-separator, `domain.entity.verb-past-participle`.

## How to add a term

1. Find duplication in `DUPLICATION_REGISTER.md` or `CAPABILITY_MAP.md`
2. Pick canonical name (domain-clear, no abbreviation, English unless BR-market noun)
3. List historical aliases with file:line citations
4. Add term with scope note
5. Run codemod: `mcp__atomic-edit__atomic_rename_symbol_cross_file`
6. Update `DEPRECATION_MAP.md`
7. Regenerate: `npm run canonical:scan`
8. Gate: `npm run canonical:check`

## Related

- [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md) — bounded contexts
- [CAPABILITY_MAP.md](CAPABILITY_MAP.md) — what each domain does
- [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md) — cross-domain events
- [SERVICE_CATALOG.md](SERVICE_CATALOG.md) — service inventory
- [DUPLICATION_REGISTER.md](DUPLICATION_REGISTER.md) — known duplicates
- [DEPRECATION_MAP.md](DEPRECATION_MAP.md) — legacy → canonical
- [PRISMA_USAGE.md](PRISMA_USAGE.md) — model ownership
- CLAUDE.md "ORDEM DE CONSTRUÇÃO (DAG)" — phase definitions
