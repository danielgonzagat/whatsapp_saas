# Backend Marketing & Communication — Codebase Exploration

> Generated: 2026-05-19 | Scope: `backend/src/{whatsapp,campaigns,email,marketing,inbox,omnichannel,crm,contacts,mass-send,followup,flows,notifications,analytics,anuncios,unsubscribe,gdpr,cookie-consent}`  
> Total `.ts` files: **357** across 17 modules

---

## Module Index

| # | Module | Files | Layer | Core Purpose |
|---|--------|-------|-------|-------------|
| 1 | `whatsapp` | 144 | **Core** | WhatsApp multi-provider messaging, CIA agent runtime, catchup/sync, watchdog, session lifecycle |
| 2 | `inbox` | 15 | **Core** | Unified conversation inbox for all channels, WebSocket real-time, smart routing |
| 3 | `omnichannel` | 5 | **Core** | Channel-agnostic inbound hook → CIA brain pipeline, contact resolution |
| 4 | `crm` | 14 | **Core** | Contact/deal/pipeline management + AI-powered NeuroCRM (scoring, clustering, NBO) |
| 5 | `contacts` | 8 | **Core** | Channel identifier resolution, contact identity merge (dedup) |
| 6 | `marketing` | 79 | **Marketing** | Multi-channel marketing hub: email campaigns, TikTok/Instagram/Facebook, Gmail/Microsoft/IMAP mailbox OAuth, channel connect wizard |
| 7 | `campaigns` | 6 | **Marketing** | WhatsApp/email campaign creation, scheduling, BullMQ processing with personalization |
| 8 | `mass-send` | 5 | **Marketing** | Bulk WhatsApp message dispatch via BullMQ queue |
| 9 | `flows` | 24 | **Automation** | Visual flow builder (nodes/edges), execution engine, "wait for reply" state machine, WebSocket live preview, flow templates/optimizer |
| 10 | `followup` | 5 | **Automation** | Scheduled follow-up tasks via cron + autopilot queue |
| 11 | `analytics` | 15 | **Insights** | Dashboard stats, KPI reports, advanced analytics, agent performance, queue stats, smart-time |
| 12 | `notifications` | 7 | **Engagement** | Firebase push notifications + welcome/onboarding transactional emails |
| 13 | `anuncios` | 5 | **Ads** | Multi-platform ads management: Meta, Google Ads, TikTok Ads |
| 14 | `email` | 5 | **Infra** | Email inbound webhook receiver → inbox pipeline |
| 15 | `unsubscribe` | 5 | **Compliance** | Token-based email unsubscribe with redirect |
| 16 | `gdpr` | 20 | **Compliance** | LGPD/GDPR: export requests, data deletion (cascade across 6+ tables), identity verification, Facebook callback |
| 17 | `cookie-consent` | 5 | **Compliance** | Cookie consent banner persistence, JWT-signed cookie, per-category consent (necessary/analytics/marketing) |

---

## 1. `whatsapp/` — 144 files

**Purpose:** The largest and most critical module. Manages WhatsApp connectivity, message dispatch, AI agent runtime, inbox integration, session lifecycle, and catchup/sync with remote WhatsApp servers.

### Architecture

```
whatsapp/
├── whatsapp.module.ts          # NestJS module, imports 12 other modules
├── whatsapp.service.ts         # Facade: contacts, chats, messages, agent dispatch
├── whatsapp.controller.ts      # Legacy /whatsapp/:workspaceId/* compatibility
├── whatsapp.interfaces.ts      # IWhatsappMessaging, IInboundProcessor, ICiaRuntime, ICatchupHistory
├── whatsapp.tokens.ts          # WHATSAPP_MESSAGING, INBOUND_PROCESSOR, CIA_RUNTIME, CATCHUP_HISTORY
│
├── providers/                  # Multi-provider abstraction
│   ├── provider-registry.ts         # Central registry: messaging, contacts, sessions, op
│   ├── provider-registry.types.ts   # WhatsAppProvider, MessagingProvider, SessionProvider
│   ├── waha.provider.ts             # WAHA HTTP provider (primary)
│   ├── whatsapp-api.provider.ts     # WhatsApp Cloud API provider (Meta official)
│   ├── waha-session.provider.ts     # Session lifecycle (start/stop/status/logout)
│   ├── waha-transport.ts            # HTTP transport to WAHA engine
│   ├── waha-types.ts                # WAHA protocol types
│   └── provider-env.ts              # Provider environment detection
│
├── controllers/
│   ├── whatsapp-api.controller.ts       # Public API: send message, templates, media
│   ├── whatsapp-catalog.controller.ts   # Product catalog operations
│   └── whatsapp-meta-compat.controller.ts # Meta API compatibility layer
│
├── inbound-processor.service.ts  # Processes incoming WhatsApp messages → inbox
├── inbound-mind-percept.ts       # Maps inbound messages to MindPercept events
│
├── account-agent.service.ts      # CIA account agent: product gap detection, auto-reply
├── agent-events.service.ts       # Agent event bus
├── agent-conversation-state.util.ts # Operational state machine for conversations
│
├── whatsapp-catchup.service.ts         # Catchup: fetch chat history from WAHA
├── whatsapp-catchup-orchestrator.service.ts # Orchestrates catchup across chats
├── whatsapp-catchup-history.service.ts # Historical message reconciliation
│
├── whatsapp-watchdog.service.ts         # Watchdog: monitors session health
├── whatsapp-watchdog-recovery.service.ts # Auto-recovery from broken sessions
├── whatsapp-watchdog-session.service.ts  # Session-level watchdog operations
│
├── whatsapp-session.service.ts          # Session management
├── whatsapp-message-dispatcher.service.ts # Message send dispatch with rate limiting
├── whatsapp-send-rate-guard.service.ts  # Rate limiting guard
├── whatsapp-media.service.ts            # Media URL/number normalization
├── whatsapp-reconciler.service.ts       # State reconciliation with remote
├── worker-runtime.service.ts            # Worker-side runtime
├── internal-whatsapp-runtime.controller.ts # Internal runtime endpoints
│
├── whatsapp.service.chats.ts            # Chat listing helpers
├── whatsapp.service.chats.messages.ts   # Message loading
├── whatsapp.service.chats.backlog.ts    # Backlog processing
├── whatsapp.service.ranking.ts          # Chat ranking/ordering
└── whatsapp.service.catalog.ts          # Product catalog operations
```

### Key Interfaces (`whatsapp.interfaces.ts`)

```typescript
export interface IWhatsappMessaging {
  sendMessage(workspaceId, phone, text, options?): Promise<unknown>;
  syncRemoteContactProfile(workspaceId, phone, name): Promise<unknown>;
}
export interface IInboundProcessor { process(input): Promise<unknown>; }
export interface ICiaRuntime { startBacklogRun(...): Promise<{runId?, totalQueued?}>; }
export interface ICatchupHistory { ... } // 9 methods for catchup reconciliation
```

### Provider Architecture

- **WAHA** (primary) — self-hosted WhatsApp HTTP engine via `waha-transport.ts`
- **WhatsApp Cloud API** (Meta official) — via `whatsapp-api.provider.ts`
- Registry pattern via `WhatsAppProviderRegistry` with 4 sub-registries: messaging, contacts, session, op

### Key Files to Start
- `whatsapp.module.ts` — module wiring, 12 imports, 25+ providers
- `whatsapp.service.ts` — main facade (468 lines)
- `whatsapp.interfaces.ts` — contract definitions
- `providers/provider-registry.ts` — multi-provider abstraction

---

## 2. `inbox/` — 15 files

**Purpose:** Unified inbox for all communication channels (WhatsApp, Instagram, Messenger, Email, TikTok). Provides conversation management, WebSocket real-time updates, and smart routing.

### Architecture

```
inbox/
├── inbox.module.ts           # Imports Kloel, Contacts, Omnichannel, JWT
├── inbox.service.ts          # Conversation CRUD, agent listing, status management
├── inbox.controller.ts       # REST: agents, conversations, messages, close/reopen
├── inbox.gateway.ts          # WebSocket (Socket.IO): real-time message delivery
├── inbox.interface.ts        # IInboxService contract (saveMessageByPhone)
├── inbox.token.ts            # INBOX_SERVICE symbol
├── smart-routing.service.ts  # Rule-based routing → queue/agent assignment
├── omnichannel.service.ts    # Unified message ingestion → inbox → CIA
├── omnichannel.helpers.ts    # Message normalization, attachment processing
├── inbox-events.service.ts   # Internal event bus for inbox operations
```

### Key Flows

1. **Message Ingestion:** `OmnichannelService.handleIncomingMessage()` saves to inbox via `saveMessageByPhone()`, triggers CIA processing
2. **Smart Routing:** `SmartRoutingService.routeConversation()` checks routing rules → assigns to queue/agent
3. **Real-time:** `InboxGateway` (Socket.IO) pushes new messages, status changes to connected clients

### Key Files
- `inbox.service.ts` — 563 lines, core conversation management
- `omnichannel.service.ts` — 316 lines, unified message ingestion
- `smart-routing.service.ts` — 172 lines, routing logic with Redis-backed rules

---

## 3. `omnichannel/` — 5 files

**Purpose:** Channel-agnostic inbound hook that feeds the CIA "brain" pipeline. Resolves contacts across channels.

### Architecture

```
omnichannel/
├── omnichannel.module.ts                 # Imports Contacts, Kloel
├── channel-inbound-hook.service.ts       # onMessageReceived → MindEventProcessor + BrainEventSpine
├── contact-resolution.service.ts         # Resolve/create contacts from channel identifiers
```

### Key Flow
`ChannelInboundHookService.onMessageReceived()` is called from every channel's inbound handler. It:
1. Maps the message to a `MindPerceptEvent` (kind: `message.received`)
2. Feeds it to `MindEventProcessorService` (CIA perception layer)
3. Broadcasts through `BrainEventSpineService`

---

## 4. `crm/` — 14 files

**Purpose:** Classic CRM operations (contacts, deals, pipeline stages) + AI-powered "NeuroCRM" for lead scoring, sentiment analysis, clustering, and next-best-action recommendations.

### Architecture

```
crm/
├── crm.module.ts            # Imports Prisma, Billing, Config
├── crm.service.ts           # Contacts CRUD, deals, pipeline stages (571 lines)
├── crm.controller.ts        # REST API: /crm (contacts, deals, pipelines, tags)
├── neuro-crm.service.ts     # OpenAI-powered: analyzeContact, nextBestAction, scoreContacts, clusterContacts
├── neuro-crm.controller.ts  # REST: /crm/neuro (analyze, next-best, score, cluster, sentiment)
├── neuro-crm.helpers.ts     # Analysis normalization, fallback generation
├── neuro-crm.types.ts       # RawAnalysis, AnalysisContact, AnalysisResult
├── dto/
│   ├── create-contact.dto.ts
│   ├── upsert-contact.dto.ts
│   └── list-contacts.query.dto.ts
```

### NeuroCRM AI Features
- **`analyzeContact()`** — OpenAI analysis: lead score, purchase probability, sentiment, intent, next best action
- **`nextBestAction()`** — Rule-based NBO using score, sentiment, recency
- **`scoreContacts()`** — Bulk scoring for all contacts in workspace
- **`clusterContacts()`** — 2D clustering via PCA-like dimensionality reduction for visualization
- **`sentimentTrend()`** — Time-series sentiment tracking
- **`autoLabelContacts()`** — Automatic tag suggestions

---

## 5. `contacts/` — 8 files

**Purpose:** Contact identity resolution and deduplication. Maps external channel identifiers (phone, email, social handle) to unified contacts.

### Architecture

```
contacts/
├── contacts.module.ts
├── channel-identifier.service.ts        # CRUD for channel-to-contact mappings, channel name normalization
├── contact-identity-resolver.service.ts  # Resolve (find or create) contact from channel+identifier
├── contact-identity-merge.service.ts     # Merge duplicate contacts (links them, preserves history)
├── contact-custom-fields.types.ts        # Custom field definitions
```

### Key Types
```typescript
// channel-identifier.service.ts
type ValidChannel = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'EMAIL' | 'TIKTOK';
// Channel aliases: FACEBOOK→MESSENGER, FB→MESSENGER, IG→INSTAGRAM

// contact-identity-resolver.service.ts
interface IdentityResolveParams {
  workspaceId, channel, externalId, phone?, email?, socialHandle?
}
// Returns: { contactId, channelIdentifierId, wasCreated, wasResolved }
```

---

## 6. `marketing/` — 79 files

**Purpose:** The largest marketing module. Multi-channel marketing hub spanning email campaigns, social media (TikTok, Instagram, Facebook Messenger), email mailbox OAuth integration (Gmail, Microsoft, IMAP/SMTP), and a channel connect wizard.

### Architecture

```
marketing/
├── marketing.module.ts                   # Imports Prisma, Whatsapp, Inbox, Kloel
├── marketing.controller.ts               # Aggregated stats, channel status, live feed, AI brain status
├── marketing-connect.controller.ts       # Channel connect wizard, TikTok OAuth, email mailbox setup
│
├── email-marketing.service.ts           # BullMQ email campaign processing (queue + worker)
├── email-marketing.controller.ts        # REST: /marketing/email (CRUD campaigns)
├── email-marketing.helpers.ts           # Provider resolution, email building, stat updates
├── email-marketing-webhook.controller.ts # Email delivery webhooks (SendGrid/Resend)
│
├── tiktok-marketing.service.ts          # TikTok OAuth (creator + advertiser), account management
├── tiktok-marketing-mode.service.ts     # Determine TikTok mode (creator vs advertiser)
├── tiktok-marketing.controller.ts       # REST: /marketing/tiktok (connect, status)
├── tiktok-ads.service.ts               # TikTok Ads integration (campaigns, metrics)
│
├── facebook-messenger.service.ts        # Facebook Messenger send/receive, webhook processing
├── facebook-messenger.controller.ts     # REST: /marketing/messenger
│
├── instagram/
│   ├── instagram-marketing.service.ts    # Instagram post creation, insights fetching
│   ├── instagram-marketing.controller.ts # REST: /marketing/instagram
│   └── dto/                              # CreateInstagramPostDto, InsightsQueryDto
│
├── mailbox-gmail-oauth.service.ts       # Gmail OAuth2: auth URL, callback, send, sync
├── mailbox-gmail-oauth-callback.controller.ts # OAuth2 callback endpoint
├── mailbox-gmail-oauth/                 # Gmail sub-services
│   ├── gmail-client.service.ts          # Google API client wrapper
│   ├── oauth-handshake.service.ts       # Token exchange
│   ├── oauth-state.ts                   # Signed state with HMAC
│   ├── sync.service.ts                  # Gmail inbox → Kloel inbox sync
│   ├── send.service.ts                  # Send via Gmail API
│   ├── message-parser.ts                # Gmail message → normalized format
│   ├── mime-builder.ts                  # MIME email construction
│   ├── metadata-helpers.ts              # Thread/label metadata
│   ├── config-resolver.ts               # OAuth config from env
│   ├── constants.ts                     # Google auth URLs, Gmail scopes
│   └── types.ts                         # GoogleTokenResponse, GmailMailboxRecord
│
├── mailbox-microsoft-oauth.service.ts   # Microsoft Graph OAuth2 (Outlook/Hotmail)
├── mailbox-microsoft-oauth-callback.controller.ts
├── mailbox-microsoft-oauth.helpers.ts
│
├── mailbox-imap-smtp.service.ts         # Generic IMAP/SMTP mailbox integration
├── mailbox-imap-smtp-socket.helpers.ts
├── mailbox-token-crypto.ts              # AES-256-GCM token encryption at rest
│
├── marketing-connect/                   # Channel connection wizard
│   ├── channel-setup.service.ts         # Step-by-step setup wizard for each channel
│   ├── meta-connect.service.ts          # Meta (WhatsApp + Instagram + Messenger) connection status
│   ├── email-connect.service.ts         # Email provider connection (Gmail/MS/IMAP/Resend/SendGrid)
│   ├── whatsapp-summary.service.ts      # WhatsApp account summary for dashboard
│   └── shared/channel-helpers.ts        # Shared types: MarketingChannelSetupPayload, EmailSubSettings
│
├── marketing-connect.helpers.ts         # Email validation HTML body
├── dto/create-email-campaign.dto.ts
└── tokens.ts                            # GMAIL_OAUTH_TOKEN symbol
```

### Email Provider Architecture

The marketing module supports 5 email delivery paths:
1. **Gmail OAuth** — Per-workspace Gmail mailbox (OAuth2, not shared sender) — `mailbox-gmail-oauth/`
2. **Microsoft OAuth** — Per-workspace Outlook/Hotmail via Microsoft Graph
3. **IMAP/SMTP** — Generic IMAP/SMTP for any provider
4. **Resend** — Global provider via `RESEND_API_KEY`
5. **SendGrid** — Global provider via `SENDGRID_API_KEY`

### Key Files
- `marketing.module.ts` — 6 controllers, 14 providers, 12 exports
- `marketing-connect.controller.ts` — 227 lines, unified connect wizard
- `email-marketing.service.ts` — 399 lines, BullMQ queue + worker
- `mailbox-gmail-oauth.service.ts` — 146 lines, Gmail OAuth orchestration
- `tiktok-marketing.service.ts` — 400 lines, TikTok OAuth2 flow

---

## 7. `campaigns/` — 6 files

**Purpose:** Campaign creation for WhatsApp and email. Uses BullMQ for queued processing, supports template variables (`{{name}}`), AI-generated messages, smart-time scheduling, and unsubscribe footers.

### Architecture

```
campaigns/
├── campaigns.module.ts       # Imports Analytics, Audit, Billing, Spine
├── campaigns.service.ts      # 510 lines — create, AI generation, BullMQ queue/worker
├── campaigns.controller.ts   # POST /campaigns (with idempotency)
└── dto/create-campaign.dto.ts
```

### Key Flow
1. `CampaignsController.create()` — validates, enforces plan limits, supports idempotency key
2. `CampaignsService.createCampaign()` — creates DB record, optionally generates AI message
3. `processCampaignJob()` — BullMQ worker: resolves contacts, replaces `{{name}}`, dispatches via Meta WhatsApp or Email provider
4. Uses `SmartTimeService` for optimal send time
5. Appends `List-Unsubscribe` header + unsubscribe footer HTML

---

## 8. `mass-send/` — 5 files

**Purpose:** Bulk WhatsApp message dispatch. Simple queue-based system for sending the same message to a list of phone numbers.

### Architecture

```
mass-send/
├── mass-send.module.ts       # Imports WhatsappModule
├── mass-send.service.ts      # BullMQ enqueueCampaign — sanitizes numbers, deduplicates
├── mass-send.controller.ts   # POST /campaign/start
```

### Key Details
- Controller validates `approvalRequestId` (links to approval workflow)
- Service sanitizes phone numbers (removes non-digits), deduplicates
- Enforces minimum 5-digit number validation
- Jobs go to `mass-send` queue (consumed by worker process)

---

## 9. `flows/` — 24 files

**Purpose:** Visual flow builder and execution engine. Supports node/edge graph editing, "wait for reply" state machine, WebSocket live preview, flow templates, and an AI optimizer.

### Architecture

```
flows/
├── flows.module.ts              # Imports Workspace, Auth, Billing, Audit
├── flows.service.ts             # Save, get, list, delete, run flows (356 lines)
├── flows.controller.ts          # REST: CRUD flows, run, versions, execution logs
├── flows.gateway.ts             # WebSocket (Socket.IO): real-time flow execution preview
├── flows.wait-for-reply.ts      # Wait state machine: pause/resume/expire
│
├── flow-optimizer.service.ts    # AI-powered flow optimization suggestions
├── flow-optimizer.controller.ts # REST: /flows/optimize
│
├── flow-template.service.ts     # Template CRUD, recommendations
├── flow-template.controller.ts  # REST: /flows/templates
├── flow-template.recommended.ts # Template recommendation engine
├── templates.ts                 # Built-in flow templates
│
└── dto/
    ├── flow.dto.ts
    ├── run-flow.dto.ts
    ├── save-flow-version.dto.ts
    └── log-execution.dto.ts
```

### Key Features
- **Wait for Reply:** `flows.wait-for-reply.ts` — pauses flow execution waiting for contact reply, with configurable timeout and fallback message
- **WebSocket Gateway:** Real-time node execution status pushed to frontend
- **Flow Optimizer:** AI analyzes flow structure and suggests improvements
- **Templates:** Built-in + recommended templates for common use cases

---

## 10. `followup/` — 5 files

**Purpose:** Scheduled follow-up tasks. Cron-based processing that enqueues overdue follow-ups into the autopilot queue.

### Architecture

```
followup/
├── followup.module.ts       # Imports PrismaModule
├── followup.service.ts      # CRUD + @Cron(EVERY_MINUTE) processDueFollowUps
├── followup.controller.ts   # REST: /followups (CRUD, stats)
```

### Key Flow
1. `@Cron(CronExpression.EVERY_MINUTE)` checks for due follow-ups
2. Batch-fetches contacts, validates flow/message existence
3. Enqueues each into `autopilotQueue` with `buildQueueJobId()`
4. Updates follow-up status from `pending` → `sent`

---

## 11. `analytics/` — 15 files

**Purpose:** Dashboard analytics, KPI reporting, advanced analytics, agent performance metrics, queue statistics, and smart-time scheduling.

### Architecture

```
analytics/
├── analytics.module.ts               # Imports PrismaModule
├── analytics.service.ts              # Dashboard stats, report generation (444 lines)
├── analytics.controller.ts           # REST: /analytics (stats, reports, smart-time)
├── analytics.helpers.ts              # Time aggregation, trend computation, KPI building
├── advanced-analytics.service.ts     # Advanced metrics and correlations
├── agent-performance.service.ts      # Agent performance metrics (response time, resolution rate)
├── queue-stats.service.ts            # Queue depth, throughput, wait times
├── smart-time/
│   └── smart-time.service.ts         # Optimal send-time prediction (ML-based)
└── dto/analytics-query.dto.ts        # Date range + metric query DTOs
```

### Key Metrics Tracked
- Dashboard: messages (today), contacts (total), flow executions (7d), sentiment distribution, lead score distribution, outbound status
- Reports: KPI (response time, resolution rate, CSAT), financial (revenue, deals), sales summary
- Time patterns: hourly/daily heatmaps for optimal scheduling
- Payment methods: aggregation by type

---

## 12. `notifications/` — 7 files

**Purpose:** Firebase Cloud Messaging (FCM) push notifications + welcome/onboarding transactional emails.

### Architecture

```
notifications/
├── notifications.module.ts                 # Imports Prisma, Auth, Config
├── notifications.service.ts                # FCM push via Firebase Admin SDK (269 lines)
├── notifications.controller.ts             # REST: /notifications (register device, send)
├── welcome-onboarding-email.service.ts     # Welcome email sequence (after signup)
```

### Key Details
- Firebase Admin SDK initialized with service account credentials from env
- Handles `app/duplicate-app` error gracefully
- `WelcomeAndOnboardingEmailService`: triggers onboarding email sequence post-registration
- Push tokens stored per user for device targeting

---

## 13. `anuncios/` — 5 files

**Purpose:** Multi-platform ads management dashboard. Connects to Meta (Facebook/Instagram Ads), Google Ads, and TikTok Ads.

### Architecture

```
anuncios/
├── anuncios.module.ts       # Imports Marketing, TikTokAds, Meta, Google Ads providers
├── anuncios.service.ts      # Aggregates campaign data across 3 ad platforms (289 lines)
├── anuncios.controller.ts   # REST: /api/anuncios (status, accounts, campaigns, sync)
```

### Key Types
```typescript
interface AccountResponse { id, platform, accountId, accountName, status, connected }
interface CampaignResponse { id, platform, accountId, campaignId, campaignName, status, spend, revenue, roas, conversions, impressions, clicks, ctr, cpc }
interface PlatformStatusResponse { platform, connected, status, accountId, clientConfigured }
```

Uses `AdProvider` interface pattern for multi-platform abstraction. Providers:
- `MetaMarketingProvider` — Facebook/Instagram Ads
- `GoogleAdsProvider` — Google Ads
- `TikTokAdsProvider` — TikTok Ads (via `tiktok-ads` module)
- `AdsSyncProcessor` — background sync processor

---

## 14. `email/` — 5 files

**Purpose:** Email inbound webhook receiver. Accepts incoming emails from external providers (SendGrid, Resend, custom SMTP webhooks) and routes them into the unified inbox.

### Architecture

```
email/
├── email.module.ts              # Imports InboxModule
├── email-inbound.service.ts     # Process inbound email → OmnichannelService
├── email-inbound.controller.ts  # POST /email-inbound (public webhook with webhook secret)
```

### Key Flow
1. `EmailInboundController` receives webhook POST with HMAC signature validation
2. Parses email: extracts from/to/subject/body/attachments
3. `EmailInboundService.processInboundEmail()` normalizes to `InboundEmail` type
4. Routes through `OmnichannelService` for inbox persistence + CIA processing

---

## 15. `unsubscribe/` — 5 files

**Purpose:** Token-based email unsubscribe. Generates signed JWT tokens in email footers; when clicked, processes opt-out and redirects to confirmation page.

### Architecture

```
unsubscribe/
├── unsubscribe.module.ts       # Imports PrismaModule
├── unsubscribe.service.ts      # Token verification + contact opt-out (DB update)
├── unsubscribe.controller.ts   # GET /unsubscribe?token=... (public, redirects)
```

### Key Flow
1. Token in email footer links to `GET /unsubscribe?token=<JWT>`
2. `UnsubscribeService.processUnsubscribeToken()` verifies token, finds contact by email
3. Sets `optIn: false`, `optedOutAt: now()`
4. Redirects to `FRONTEND_URL/unsubscribed` (success) or `.../unsubscribed?error=...`

---

## 16. `gdpr/` — 20 files

**Purpose:** LGPD/GDPR compliance orchestrator. Handles data export (sweep → ZIP → upload → signed URL), data deletion (cascade across 6+ tables), identity verification, Facebook data-deletion callback, and BullMQ processing lifecycle.

### Architecture

```
gdpr/
├── gdpr.module.ts                   # Imports Auth, Audit, Prisma
├── gdpr.service.ts                  # Orchestrator: request creation, verification, export, deletion (382 lines)
├── gdpr.controller.ts               # REST: /gdpr (export-request, delete-request, verify)
├── gdpr.helpers.ts                  # ZIP creation, code generation, signed_request parsing
├── gdpr-processing.helpers.ts       # processGdprExport, processGdprDeletion, sendGdprVerificationEmail
├── gdpr-facebook-callback.service.ts # Facebook data deletion callback handler
├── data-export.controller.ts        # Export-specific endpoints
├── data-delete.controller.ts        # Deletion-specific endpoints
├── dto/
│   ├── delete-request.dto.ts
│   ├── export-request.dto.ts
│   ├── verify-identity.dto.ts
│   └── verify-identity-query.dto.ts
```

### Key Flow
1. User requests export or deletion → creates `GdprRequest` record (status: `PENDING_VERIFICATION`)
2. Verification email sent with 6-digit code
3. User verifies → status advances to `PROCESSING`
4. BullMQ `gdpr-processing` queue picks up job:
   - **Export:** sweeps all user data across tables → creates ZIP → uploads to storage → returns signed URL
   - **Deletion:** `$transaction` cascade delete across 6+ tables (contacts, messages, conversations, flows, campaigns, workspaces)
5. Facebook callback: handles Meta's mandatory data deletion callback endpoint

### Architectural Note
> This file is explicitly designed as a **single regulatory workflow orchestrator**. Every step shares the same request state machine and error-recovery path. Utilities are extracted to `gdpr.helpers.ts` and `gdpr-processing.helpers.ts`.

---

## 17. `cookie-consent/` — 5 files

**Purpose:** Cookie consent banner persistence. Manages per-category consent (necessary, analytics, marketing) stored as a JWT-signed cookie.

### Architecture

```
cookie-consent/
├── cookie-consent.module.ts       # Imports PrismaModule
├── cookie-consent.service.ts      # Normalize, parse, save, get consent records
├── cookie-consent.controller.ts   # GET/POST /cookie-consent (cookie-based)
```

### Key Details
- Cookie name: `kloel_consent`
- Max age: 365 days
- Cookie domain: auto-resolved from hostname (`.kloel.com` for production)
- Three categories: `necessary` (always true), `analytics`, `marketing`
- Stored as JWT inside cookie for tamper-proofing

---

## Cross-Cutting Architecture

### Communication Flow

```
Channel (WhatsApp/Email/Instagram/Messenger/TikTok)
  │
  ├─► Inbound Webhook (whatsapp-api.controller / email-inbound.controller / facebook-messenger)
  │     │
  │     ├─► ChannelInboundHookService.onMessageReceived()
  │     │     ├─► MindEventProcessorService (CIA perception)
  │     │     └─► BrainEventSpineService (CIA cognition)
  │     │
  │     └─► OmnichannelService.handleIncomingMessage()
  │           ├─► InboxService.saveMessageByPhone() → DB + WebSocket broadcast
  │           ├─► ContactIdentityResolverService.resolve() → find/create contact
  │           └─► SmartRoutingService.routeConversation() → assign agent/queue
  │
  └─► Outbound (WhatsApp/Email/Messenger)
        │
        ├─► WhatsappService.sendMessage()
        │     └─► WhatsAppProviderRegistry → WahaProvider / WhatsAppApiProvider
        │
        ├─► EmailMarketingService → Resend / SendGrid / Gmail OAuth / IMAP
        │
        └─► MassSendService → BullMQ queue → Worker dispatch
```

### Dependency Graph (Modules)

```
                    ┌──────────┐
                    │  Kloel   │ (CIA brain, event spine, channel transport)
                    └────┬─────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   ┌─────────┐    ┌──────────┐    ┌────────────┐
   │Whatsapp │    │  Inbox   │    │ Omnichannel│
   │  (144)  │◄──►│  (15)    │◄──►│   (5)      │
   └────┬────┘    └────┬─────┘    └─────┬──────┘
        │              │                │
        ▼              ▼                ▼
   ┌─────────┐    ┌──────────┐    ┌────────────┐
   │Marketing│    │Contacts  │    │    CRM     │
   │  (79)   │    │  (8)     │    │   (14)     │
   └────┬────┘    └──────────┘    └─────┬──────┘
        │                               │
        ▼                               ▼
   ┌─────────┐                    ┌──────────┐
   │Campaigns│                    │Analytics │
   │  (6)    │                    │  (15)    │
   └─────────┘                    └──────────┘

   ┌─────────┐    ┌──────────┐    ┌────────────┐
   │  Flows  │    │ Followup │    │ Mass-Send  │
   │  (24)   │    │   (5)    │    │    (5)     │
   └─────────┘    └──────────┘    └────────────┘

   ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │  Anuncios │  │   GDPR   │  │Unsubscribe│  │  Cookie  │
   │    (5)    │  │   (20)   │  │   (5)    │  │ Consent  │
   └───────────┘  └──────────┘  └──────────┘  └──────────┘
```

### Token/DI Symbols

| Token | Module | Purpose |
|-------|--------|---------|
| `WHATSAPP_MESSAGING` | whatsapp | Abstract messaging interface |
| `INBOUND_PROCESSOR` | whatsapp | Abstract inbound processor |
| `CIA_RUNTIME` | whatsapp | CIA runtime service |
| `CATCHUP_HISTORY` | whatsapp | Catchup history service |
| `INBOX_SERVICE` | inbox | Abstract inbox saver contract |
| `GMAIL_OAUTH_TOKEN` | marketing | Gmail OAuth service alias |
| `UNIFIED_AGENT_TOKEN` | kloel | CIA unified agent port |

---

## Improvement Suggestions

### 1. **WhatsApp Module Size (144 files)**
The `whatsapp/` module is extremely large and could benefit from splitting:
- Extract `account-agent/` into its own module (14+ files dedicated to CIA agent)
- Extract `catchup/` into a sub-module (20+ files for catchup/history/reconciliation)
- Extract `providers/` into a shared `whatsapp-providers` module
- The `whatsapp.service.ts` depends on 10+ injected services — consider a facade/mediator pattern

### 2. **Email Provider Fragmentation**
Email sending has 4 different paths (Gmail OAuth, Microsoft OAuth, IMAP/SMTP, Resend/SendGrid) spread across the marketing module. Consider:
- A unified `EmailProvider` interface with standardized send/sync methods
- `EmailConnectService` already partially does this — extend the pattern

### 3. **Overlapping Campaign vs Mass-Send**
`campaigns/` and `mass-send/` both handle bulk messaging. `mass-send` is a simpler queue-only system while `campaigns` adds AI generation and templates. Consider merging or clarifying the boundary:
- `campaigns` → sophisticated campaigns with templates, AI, scheduling
- `mass-send` → quick bulk dispatch (which is what it does today)

### 4. **Marketing Controller Split**
`marketing/` has 2 controllers at the root (`marketing.controller.ts` and `marketing-connect.controller.ts`) both mapped to `/marketing`. This works but creates ambiguity. The split is:
- `MarketingController` → read-only stats/status
- `MarketingConnectController` → mutation (connect, setup, OAuth)

### 5. **Flows Wait-for-Reply as Standalone Module**
The `flows.wait-for-reply.ts` (~280 lines) implements a state machine that could be extracted into a dedicated `flow-execution` module with clearer pause/resume/expire semantics.

### 6. **GDPR — Solid but Single File**
`gdpr.service.ts` is intentionally a monolith for regulatory audit trail reasons (documented in file header). This is a valid architectural decision but requires strict discipline to not let it grow further. The helpers extraction (`gdpr.helpers.ts`, `gdpr-processing.helpers.ts`) is well done.

### 7. **Missing Integration Coverage**
- **TikTok Ads** is referenced in `anuncios/` but the actual TikTok ads provider lives in `integrations/tiktok-ads.provider.ts` (outside scope)
- **Meta Conversions API** is referenced but the service is in `integrations/meta-conversions-api.service.ts`

### 8. **Tech Debt Indicators**
- `whatsapp.service.part2.spec.ts` through `part15.spec.ts` — suggests the test file grew too large and was split numerically (14 spec part files)
- `whatsapp.module.ts` uses `require()` for `KloelModule` and `CiaModule` instead of `import` — circular dependency workaround
- Multiple `@Optional()` injections throughout the codebase indicate services that may or may not be available

### 9. **Rate Limiting / Throttling**
Most controllers use `@RouteClass()` decorator (e.g., `'read'`, `'mutate'`, `'ai'`) for throttler classification. This is a good pattern. Worth auditing that all mutation endpoints are correctly classified.

### 10. **WebSocket Usage**
Two WebSocket gateways exist:
- `InboxGateway` — real-time message delivery (low latency)
- `FlowsGateway` — flow execution preview (lower volume)

Both use Socket.IO with JWT auth. No Redis adapter is visible in the gateway code — this means horizontal scaling would require adding the `@socket.io/redis-adapter`.

---

## File Count Summary

| Module | Files | Spec Files | Prod Files | Spec Ratio |
|--------|-------|-----------|------------|-----------|
| whatsapp | 144 | ~75 | ~69 | 52% |
| marketing | 79 | ~35 | ~44 | 44% |
| flows | 24 | ~10 | ~14 | 42% |
| gdpr | 20 | ~9 | ~11 | 45% |
| analytics | 15 | ~6 | ~9 | 40% |
| inbox | 15 | ~4 | ~11 | 27% |
| crm | 14 | ~4 | ~10 | 29% |
| contacts | 8 | ~3 | ~5 | 38% |
| notifications | 7 | ~2 | ~5 | 29% |
| campaigns | 6 | ~2 | ~4 | 33% |
| omnichannel | 5 | ~2 | ~3 | 40% |
| mass-send | 5 | ~1 | ~4 | 20% |
| followup | 5 | ~1 | ~4 | 20% |
| anuncios | 5 | ~1 | ~4 | 20% |
| email | 5 | ~1 | ~4 | 20% |
| unsubscribe | 5 | ~1 | ~4 | 20% |
| cookie-consent | 5 | ~1 | ~4 | 20% |
| **TOTAL** | **357** | **~158** | **~199** | **~44%** |

---

## Start Here

For an agent exploring this area:

1. **`whatsapp/whatsapp.module.ts`** — Understand the central module and its 12 imports. This is the most connected module.
2. **`whatsapp/whatsapp.interfaces.ts`** — The 4 core contracts that everything depends on.
3. **`inbox/omnichannel.service.ts`** — Trace a message from any channel into the inbox + CIA.
4. **`marketing/marketing.module.ts`** — See how the marketing hub wires together 6 controllers and 14 providers.
5. **`crm/neuro-crm.service.ts`** — Understand the AI-powered CRM features.
