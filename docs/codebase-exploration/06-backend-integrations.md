# Backend External Integrations

> **Scope:** `backend/src/{meta,google-ads,tiktok-ads,integrations,partnerships,marketing/instagram,marketing/mailbox-gmail-oauth,marketing/marketing-connect,pipeline,growth}`  
> **Generated:** 2026-05-19  
> **Stats:** 75 source files (`.ts`, excl. `.spec.ts`) + 46 test files

---

## Module Index

| # | Module | Path | Purpose | Key Integration |
|---|--------|------|---------|-----------------|
| 1 | **Meta** | `meta/` | Meta Platform OAuth, WhatsApp Cloud API, Instagram, Messenger, Ads, Webhooks | Facebook Graph API v21.0 |
| 2 | **Google Ads** | `google-ads/` | Google Ads OAuth connect/disconnect/status endpoints | Google OAuth2 + Ads API |
| 3 | **TikTok Ads** | `tiktok-ads/` | TikTok Ads OAuth connect/disconnect/status endpoints | TikTok Business API v1.3 |
| 4 | **Integrations** | `integrations/` | Ad provider abstraction, sync workers, conversions API | Google Ads API, Meta CAPI, TikTok Events API |
| 5 | **Partnerships** | `partnerships/` | Collaborators, affiliates, partner chat | Internal (Prisma) |
| 6 | **Instagram Marketing** | `marketing/instagram/` | Instagram DM and profile management | Meta Graph API (via MetaSdkService) |
| 7 | **Gmail OAuth Mailbox** | `marketing/mailbox-gmail-oauth/` | Per-workspace Gmail OAuth mailbox (read/send/sync) | Gmail API v1 |
| 8 | **Marketing Connect** | `marketing/marketing-connect/` | Multi-channel marketing setup, status, email connect | Meta, WhatsApp, Email providers |
| 9 | **Pipeline** | `pipeline/` | CRM sales pipeline with stages/deals | Internal (Prisma) |
| 10 | **Growth** | `growth/` | QR code generation, Money Machine auto-campaign | Internal + Campaigns |

---

## 1. Meta Module (`backend/src/meta/`)

### Architecture

The Meta module is the **largest and most critical** integration surface. It is declared `@Global()` so its exports are available throughout the app.

```
meta/
├── meta.module.ts                   # @Global() module — imports Prisma, Inbox, Webhooks, WhatsApp
├── meta-sdk.service.ts              # Low-level Graph API client (GET/POST/DELETE + rate limiting)
├── meta-auth.controller.ts          # OAuth flow: /url, /callback, /disconnect, /status
├── meta-whatsapp.service.ts         # WhatsApp Cloud API (send, media, mark read, asset discovery)
├── meta-connection-state.service.ts # Multi-channel connection state aggregator
├── meta-webhook.controller.ts       # Marketing webhook (ad account insights)
├── meta-token-crypto.ts             # Re-exports from integrations/meta-token-crypto
├── meta-input.util.ts               # Input sanitization for Graph API paths/segments
├── ads/
│   ├── meta-ads.service.ts          # Meta Ads API (campaigns, insights, lead forms)
│   └── meta-ads.controller.ts       # Ads endpoints
├── instagram/
│   ├── instagram.service.ts         # Instagram DM, profile, media, insights, publish
│   └── instagram.controller.ts      # Instagram endpoints
├── messenger/
│   ├── messenger.service.ts         # Messenger send text/media, profile, conversations
│   └── messenger.controller.ts      # Messenger endpoints
├── oauth/
│   ├── meta-auth-helpers.ts         # OAuth error humanization, redirect sanitization
│   ├── meta-oauth-url.helpers.ts    # Redirect URI resolution (env-based)
│   └── meta-scopes.helpers.ts       # Per-channel OAuth scope definitions
├── read-model/
│   └── meta-read-helpers.ts         # Type-safe JSON reading utilities
├── startup/
│   └── meta-startup-check.ts        # OnModuleInit startup validation
└── webhooks/
    └── meta-webhook.controller.ts   # Core Meta webhook (WhatsApp/Instagram/Messenger events)
```

### Key Files

#### `meta-sdk.service.ts` (lines 1-255)
The foundational HTTP client for Meta's Graph API. Features:
- `graphApiGet()`, `graphApiPost()`, `graphApiDelete()` — typed wrappers around `fetch`
- `exchangeToken()` — short-lived → long-lived token (60-day expiry)
- `validateWebhookSignature()` — HMAC-SHA256 signature verification
- `checkRateLimit()` — Redis-based rate limiter (Instagram: 200/hr, Ads: 1000/hr, Graph: 500/hr)
- Auth error detection (code 190) with structured logging for token rotation
- URL validation via `validateExternalUrl()` (SSRF protection)
- 30s timeout on all external calls

#### `meta-auth.controller.ts` (lines 1-415)
Complete OAuth 2.0 flow:
- `GET /meta/auth/url` — generates Embedded Signup URL with channel-specific config
- `GET /meta/auth/callback` (public) — code→token exchange → long-lived token → page discovery → Instagram → ad accounts → WhatsApp assets → MetaConnection upsert
- `POST /meta/auth/disconnect` — revokes permissions + deletes connections
- `GET /meta/auth/status` — aggregates all channel states (whatsapp, instagram, messenger, facebook, ads)
- `GET /meta/auth/diagnostics` — operator diagnostics (scope, redirect URI resolution)

State parsing is robust: handles JSON, URL-encoded, and base64url states.

#### `meta-whatsapp.service.ts` (lines 1-400)
WhatsApp Cloud API operations:
- `buildEmbeddedSignupUrl()` — channel-aware OAuth URL construction
- `resolveConnection()` — retrieves encrypted credentials from MetaConnection
- `discoverWhatsAppAssets()` — auto-discovers WABA + phone number from `/me/businesses`
- `getPhoneNumberDetails()` — full connection diagnostics
- `sendTextMessage()` / `sendMediaMessage()` — WhatsApp Cloud API `/messages` endpoint
- `markMessageAsRead()` — read receipts
- `resolveWorkspaceIdByPhoneNumberId()` — reverse phone→workspace lookup
- `touchWebhookHeartbeat()` — records webhook activity in providerSettings
- Supports quoted message replies

#### `meta-webhook.controller.ts` (`webhooks/` subdirectory) (lines 1-480+)
The core webhook handler for all Meta events (WhatsApp, Instagram, Messenger):
- Signature validation via HMAC-SHA256
- Deduplication via externalId hash
- WhatsApp: text messages, status updates (delivered/read/failed)
- Instagram: message events, comment events
- Messenger: message events
- Omnichannel integration — routes to `InboundProcessorService` + `OmnichannelService`
- Idempotency via `WebhooksService.logWebhookEvent()` with `P2002` duplicate handling

### Integration Pattern
```
MetaSdkService (HTTP client)
  ├── MetaWhatsAppService (WhatsApp Cloud API)
  ├── MetaAdsService (Meta Ads API)
  ├── InstagramService (Instagram Graph API)
  ├── MessengerService (Messenger Platform)
  ├── MetaMarketingProvider (Ads sync)
  └── MetaConversionsApiService (CAPI)
```

All services use `MetaSdkService` as the HTTP transport layer. Credentials are stored encrypted in `MetaConnection` table (per workspace + channel).

### Risks & Notes
- **Token rotation**: Code 190 errors are detected but token refresh must be triggered manually via `AdsSyncProcessor.enqueueMetaRefreshToken()`
- **Dual webhook controllers**: Two webhook controllers exist — `meta/webhooks/meta-webhook.controller.ts` (core events) and `meta/meta-webhook.controller.ts` (marketing events). The module comment notes "Webhook ordering: MetaWebhookController processes events with createdAt timestamps".
- **Channel model**: One `MetaConnection` per `workspaceId + channel` (whatsapp/instagram/facebook)

---

## 2. Google Ads Module (`backend/src/google-ads/`)

### Files (2 source + 2 spec)
| File | Purpose |
|------|---------|
| `google-ads-auth.controller.ts` | OAuth connect/callback/status/disconnect endpoints |

### Architecture
A thin controller module that delegates to `AnunciosService` for all logic. Routes:
- `GET /api/google-ads/connect` → generate OAuth URL
- `GET /api/google-ads/callback` → complete OAuth handshake
- `GET /api/google-ads/status` → connection status
- `POST /api/google-ads/disconnect` → disconnect

```
GoogleAdsAuthController
  └── AnunciosService (../../anuncios/anuncios.service)
```

### Notes
- Uses `JwtAuthGuard` + `WorkspaceGuard` on all routes
- Delegates all business logic to `AnunciosService` (platform-agnostic ads service)
- No direct Google API calls in this module — all handled via `GoogleAdsProvider` in `integrations/`

---

## 3. TikTok Ads Module (`backend/src/tiktok-ads/`)

### Files (3 source + 3 spec)
| File | Purpose |
|------|---------|
| `tiktok-ads.module.ts` | Module definition (imports Prisma + Marketing) |
| `tiktok-auth.controller.ts` | Full OAuth flow + disconnect + status |

### Architecture
```
TikTokAdsModule
├── TikTokAuthController  (OAuth endpoints)
├── TikTokAdsProvider      (business logic, implements AdProvider)
└── TikTokEventsApiService (conversion tracking)
```

Routes:
- `GET /tiktok-ads/auth/url` → generate OAuth URL (base64url-encoded state)
- `GET /tiktok-ads/auth/callback` (public) → code→token exchange → persist credentials
- `POST /tiktok-ads/auth/disconnect` → revoke + delete
- `GET /tiktok-ads/auth/status` → connection status + advertiser IDs

### Integration Pattern
TikTok uses a **dual-storage** approach:
1. `IntegrationCredential` table (encrypted tokens via `tiktok-token-crypto`)
2. `Workspace.providerSettings.tiktok` JSON (connection metadata, advertiser IDs)

On disconnect, both stores are cleaned up in a transaction.

### Notes
- Uses `Buffer.from(state, 'base64url')` for OAuth state encoding
- Revokes tokens server-side via TikTok revoke endpoint
- Falls back to `NEXT_PUBLIC_TIKTOK_CLIENT_KEY` for client key resolution

---

## 4. Integrations Module (`backend/src/integrations/`)

### Files (18 source + 14 spec)

#### Core Abstraction
| File | Purpose |
|------|---------|
| `ad-provider.interface.ts` | `AdProvider` interface — 7 methods (connect, completeOAuth, getStatus, syncAccounts, syncCampaigns, syncInsights, disconnect, refreshToken) |
| `ads-sync-persistence.helpers.ts` | Upsert helpers for adAccount, adCampaign, adInsight tables |
| `ads-sync.processor.ts` | BullMQ worker for Google Ads + Meta Ads sync jobs |
| `exceptions/not-configured.exception.ts` | `NotConfiguredException` with platform + missingCredentials |

#### Google Ads Implementation
| File | Purpose |
|------|---------|
| `google-ads.provider.ts` | `AdProvider` implementation using `google-ads-api` SDK |
| `google-ads.helpers.ts` | OAuth URL building, token crypto wrappers, client params |
| `google-ads-oauth.helpers.ts` | OAuth connect/complete/disconnect/refresh flows |
| `google-ads.mappers.ts` | Maps API rows → `AdCampaignSyncResult` / `AdInsightSyncResult` |
| `google-ads-token-crypto.ts` | AES-256-GCM token encryption |
| `google-ads-enhanced-conversions.service.ts` | Enhanced Conversions (hashed PII → Google Ads API) |

#### Meta Marketing Implementation
| File | Purpose |
|------|---------|
| `meta-marketing.provider.ts` | `AdProvider` implementation (Meta Ads via Graph API) |
| `meta-token-crypto.ts` | Re-used AES-256-GCM encryption for Meta tokens |
| `meta-conversions-api.service.ts` | Meta Conversions API (CAPI) — event tracking with hashed PII |

#### TikTok Implementation
| File | Purpose |
|------|---------|
| `tiktok-ads.provider.ts` | `AdProvider` implementation (TikTok Business API) |
| `tiktok-ads.helpers.ts` | Token resolution, credential helpers, persistence |
| `tiktok-token-crypto.ts` | AES-256-GCM token encryption |
| `tiktok-events-api.service.ts` | TikTok Events API — pixel-based event tracking |

### Key Architecture: Ad Sync Workers

The `AdsSyncProcessor` runs **two BullMQ workers**:

1. **Google Ads Worker** (`google-ads-sync-jobs` queue):
   - Concurrency: 2, Rate: 1 job/2s
   - Retry: 5x exponential backoff (5s)
   - Jobs: sync-accounts, sync-campaigns, sync-insights, refresh-google-token

2. **Meta Ads Worker** (`ads-sync-meta` queue):
   - Concurrency: 2, Rate: 200 jobs/hour
   - Retry: 5x exponential backoff (5s)
   - Jobs: sync-meta-accounts, sync-meta-campaigns, sync-meta-insights, refresh-meta-token

Static enqueue helpers (`AdsSyncProcessor.enqueueSyncAccounts()`, etc.) use **date-based jobId deduplication** to prevent duplicate syncs within the same day.

### Conversions API

All three platforms (Meta, Google Ads, TikTok) have `*-events-api.service.ts` files that:
- Hash PII (email, phone, name, address) using SHA-256
- Build platform-specific payloads
- Send to respective conversion endpoints
- Follow the same pattern: `PrismaService` for credential resolution, `OpsAlertService` for error alerting

### Token Encryption Pattern

All three platforms use AES-256-GCM encryption with the same pattern:
```
encrypt*Token(token) → hex-encoded ciphertext
decrypt*Token(encrypted) → plaintext or null
```

Credentials are stored in:
- `MetaConnection` table (Meta)
- `IntegrationCredential` table (Google Ads, TikTok)
- `Workspace.providerSettings` JSON (TikTok fallback)

---

## 5. Partnerships Module (`backend/src/partnerships/`)

### Files (7 source + 3 spec)
| File | Purpose |
|------|---------|
| `partnerships.module.ts` | Module (imports EmailService) |
| `partnerships.controller.ts` | REST CRUD controller |
| `partnerships.service.ts` | Business logic (520+ lines) |
| `partnerships.helpers.ts` | Utility functions (e.g., `isPublicCodeTaken`) |
| `dto/` | `CreateAffiliateDto`, etc. |

### Endpoints
- **Collaborators**: CRUD + invite/revoke/role management
- **Affiliates**: CRUD + approve/revoke + performance stats + filtering
- **Partner Chat**: Internal messaging between workspace and partners

### Architecture
```
PartnershipsController
  └── PartnershipsService
      ├── PrismaService (data)
      ├── AuditService (audit log)
      ├── EmailService (invite emails)
      └── ConfigService (frontend URL)
```

### Notes
- Generates opaque invite tokens (`randomBytes(32).toString('base64url')`) hashed with SHA-256
- Affiliate codes use `generateUniquePublicCheckoutCode()` (shared with checkout)
- Partner roles: AFFILIATE, SUPPLIER, COPRODUCER, MANAGER
- Partner chat is **internal DB-only** — not WhatsApp; no rate limits apply

---

## 6. Instagram Marketing (`backend/src/marketing/instagram/`)

### Files (4 source + 2 spec)
| File | Purpose |
|------|---------|
| `instagram-marketing.controller.ts` | Instagram marketing endpoints |
| `instagram-marketing.service.ts` | Instagram DM management |

### Notes
- Built on top of `InstagramService` from Meta module
- Separate from the core Instagram service — this handles the marketing workflow

---

## 7. Gmail OAuth Mailbox (`backend/src/marketing/mailbox-gmail-oauth/`)

### Files (11 source + 10 spec)
| File | Purpose |
|------|---------|
| `gmail-client.service.ts` | Gmail API HTTP client (token exchange, userinfo, list/get/send) |
| `oauth-handshake.service.ts` | Complete OAuth flow → persist `MailboxConnection` |
| `sync.service.ts` | Incremental Gmail inbox sync → Omnichannel |
| `send.service.ts` | Send email via Gmail API |
| `message-parser.ts` | Normalize Gmail messages to omnichannel format |
| `mime-builder.ts` | Build MIME messages for Gmail send |
| `metadata-helpers.ts` | Read/write sync metadata (synced message IDs) |
| `oauth-state.ts` | State generation/validation with TTL |
| `config-resolver.ts` | Google OAuth config resolution |
| `constants.ts` | Gmail API URLs, scopes, TTL |
| `types.ts` | All TypeScript interfaces |

### Architecture
```
GmailClientService (HTTP client)
  ├── GmailOAuthHandshakeService (OAuth flow)
  ├── GmailSyncService (inbox sync → OmnichannelService)
  └── GmailSendService (email sending)

MailboxConnection (Prisma model)
  └── Per workspaceId + provider + email
```

### Integration Pattern
The Gmail mailbox is a **per-workspace OAuth mailbox** (not a shared sender):
- Each workspace connects their own Gmail account
- Tokens are encrypted (`encryptMailboxToken`) and stored in `MailboxConnection`
- Sync is incremental — tracks `syncedMessageIds` in metadata
- Incoming emails are normalized and routed to `OmnichannelService`
- **Architecture mandate** (from Memory #1353): Email uses per-workspace OAuth mailbox, not a shared sender

### OAuth Scopes
```
openid, email, profile,
gmail.readonly, gmail.send, gmail.modify
```

---

## 8. Marketing Connect (`backend/src/marketing/marketing-connect/`)

### Files (8 source + 8 spec)
| File | Purpose |
|------|---------|
| `meta-connect.service.ts` | Meta connection status aggregation (WhatsApp + Instagram + Facebook + Ads) |
| `whatsapp-summary.service.ts` | WhatsApp marketing setup summary (products, sales, arsenal) |
| `email-connect.service.ts` | Email provider connection + sending |
| `channel-setup.service.ts` | Multi-channel onboarding wizard (step tracking) |
| `shared/channel-helpers.ts` | Type guards, normalizers, channel key validation |

### Architecture
```
MarketingConnectModule
├── MetaConnectService     → aggregates MetaConnection + WhatsAppProviderRegistry
├── WhatsAppSummaryService → reads providerSettings.whatsappLifecycle
├── EmailConnectService    → Resend/SendGrid/SMTP/Gmail Microsoft/IMAP
└── ChannelSetupService    → onboarding step state in providerSettings.marketingChannelSetup
```

### Email Provider Resolution
```
RESEND_API_KEY  → resend
SENDGRID_API_KEY → sendgrid
SMTP_HOST        → smtp
(fallback)       → log
```
Per-workspace overrides via `channelConfig.transferCriteria`.

---

## 9. Pipeline Module (`backend/src/pipeline/`)

### Files (4 source + 2 spec)
| File | Purpose |
|------|---------|
| `pipeline.module.ts` | Module (imports Prisma) |
| `pipeline.controller.ts` | REST endpoints (GET pipeline, POST deals, PUT stage) |
| `pipeline.service.ts` | Default pipeline creation, deal management |
| `dto/` | `CreateDealDto` |

### Architecture
```
PipelineController
  └── PipelineService
      └── PrismaService
          ├── Pipeline (with stages + deals)
          ├── Stage (ordered stages within pipeline)
          └── Deal (contact + stage + value)
```

### Default Pipeline
On first access, auto-creates a "Sales Pipeline" with 5 stages:
1. Lead
2. Contacted
3. Proposal
4. Won
5. Lost

---

## 10. Growth Module (`backend/src/growth/`)

### Files (6 source + 4 spec)
| File | Purpose |
|------|---------|
| `growth.module.ts` | Module (imports Campaigns + AiBrain) |
| `growth.controller.ts` | QR code generation for WhatsApp |
| `money-machine.controller.ts` | Money Machine activate + report |
| `money-machine.service.ts` | Auto-campaign generation from inactive leads |

### Architecture
```
GrowthController
  └── POST /growth/qr/whatsapp → qrcode → dataURL

MoneyMachineController
  └── MoneyMachineService
      ├── PrismaService (contact scanning)
      ├── CampaignsService (auto-create campaigns)
      └── Flow creation (auto-generate message flow nodes)
```

### Money Machine Flow
1. Scan for contacts with `lastMessageAt > 30 days`
2. If inactive leads found → create a Flow + Campaign
3. Returns `{ status: 'ACTIVE' | 'IDLE' }`

---

## Integration Patterns Summary

### Pattern 1: AdProvider Interface
All ad platforms implement the `AdProvider` interface with identical method signatures:
```typescript
interface AdProvider {
  readonly platform: string;
  connect(workspaceId, redirectUri): Promise<OAuthConnectResult>;
  completeOAuth(workspaceId, code, redirectUri): Promise<OAuthConnectResult>;
  getStatus(workspaceId): Promise<OAuthStatusResult>;
  syncAccounts(workspaceId): Promise<SyncAccountsResult>;
  syncCampaigns(workspaceId): Promise<SyncCampaignsResult>;
  syncInsights(workspaceId, since, until): Promise<SyncInsightsResult>;
  disconnect?(workspaceId): Promise<DisconnectResult>;
  refreshToken?(workspaceId): Promise<RefreshTokenResult | null>;
}
```

### Pattern 2: Token Encryption
All tokens are encrypted at rest using AES-256-GCM:
- Meta: `encryptMetaToken` / `decryptMetaToken` → stored in `MetaConnection`
- Google Ads: `encryptGoogleAdsToken` / `decryptGoogleAdsToken` → stored in `IntegrationCredential`
- TikTok: `encryptTikTokToken` / `decryptTikTokToken` → stored in `IntegrationCredential` + `providerSettings`
- Gmail: `encryptMailboxToken` / `decryptMailboxToken` → stored in `MailboxConnection`

### Pattern 3: Credential Resolution
```
1. Check database for persisted credentials (encrypted)
2. Fall back to environment variables (e.g., META_ACCESS_TOKEN)
3. Decrypt if needed → use for API calls
4. On auth error (401/190) → log warning + optionally enqueue token refresh
```

### Pattern 4: Webhook Handling
```
1. Validate HMAC signature
2. Parse webhook body
3. Generate deduplication key (SHA-256 hash)
4. Log to WebhooksService (P2002 = already seen → 200 OK)
5. Route to appropriate handler (WhatsApp/Instagram/Messenger/Marketing)
6. Return 200 OK (never expose errors to webhook sender)
```

### Pattern 5: Sync Workers
```
BullMQ Worker
  ├── Job types: sync-accounts, sync-campaigns, sync-insights, refresh-token
  ├── Deduplication: date-based jobId
  ├── Retry: 3-5x exponential backoff
  ├── Rate limiting: queue-level (1/2s for Google, 200/hr for Meta)
  └── Persistence: upsert via Prisma helpers
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     External APIs                        │
│  Meta Graph │ Google Ads │ TikTok Business │ Gmail API   │
└──────┬──────────┬────────────┬──────────────┬───────────┘
       │          │            │              │
       ▼          ▼            ▼              ▼
┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────────┐
│MetaSdk   │ │Google  │ │TikTok    │ │GmailClient   │
│Service   │ │AdsApi  │ │fetch()   │ │Service       │
│(HTTP)    │ │(SDK)   │ │          │ │(HTTP)        │
└────┬─────┘ └───┬────┘ └────┬─────┘ └──────┬───────┘
     │           │           │               │
     ▼           ▼           ▼               ▼
┌─────────────────────────────────────────────────────────┐
│                   Integration Layer                       │
│  AdProvider interface → GoogleAdsProvider                 │
│                       → MetaMarketingProvider             │
│                       → TikTokAdsProvider                 │
│  Conversions API → MetaCAPI / GoogleEC / TikTokEvents     │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     ┌─────────┐ ┌──────────┐ ┌──────────┐
     │BullMQ   │ │Prisma    │ │Omnichannel│
     │Workers  │ │(Upsert)  │ │(Inbox)   │
     └─────────┘ └──────────┘ └──────────┘
```

---

## Improvement Suggestions

### 1. Unified Token Rotation
**Current:** Token refresh is manual (must call `enqueue*RefreshToken` explicitly). Auth errors are logged but not automatically recovered.
**Suggestion:** Implement proactive token refresh — check expiry before API calls, auto-refresh when approaching expiry (e.g., within 24h).

### 2. Rate Limiter Consolidation
**Current:** `MetaSdkService.checkRateLimit()` uses Redis but is only used by Meta. Google and TikTok have no rate limiting.
**Suggestion:** Extract a shared `RateLimiterService` that all providers use. Google Ads API has strict quotas that are currently un-guarded.

### 3. Conversions API Error Handling
**Current:** All three `*-events-api.service.ts` files have similar patterns but different error handling.
**Suggestion:** Extract a base `ConversionsApiService` with shared hashing, payload building, and retry logic.

### 4. Dual Webhook Controller Clarification
**Current:** Two `MetaWebhookController` classes exist — `meta/webhooks/meta-webhook.controller.ts` and `meta/meta-webhook.controller.ts` — both registered in the Meta module.
**Suggestion:** Rename for clarity (e.g., `MetaCoreWebhookController` and `MetaMarketingWebhookController`) — the module already aliases them internally.

### 5. TikTok Credential Dual-Storage
**Current:** TikTok stores credentials in both `IntegrationCredential` table AND `Workspace.providerSettings.tiktok` JSON.
**Suggestion:** Migrate to `IntegrationCredential`-only (matching Google Ads pattern) with a migration to sync existing data.

### 6. AdsSyncProcessor Test Coverage
**Current:** 46 test files exist across the integration modules but `ads-sync.processor.spec.ts` may have gaps in BullMQ worker lifecycle testing.
**Suggestion:** Add integration tests for worker startup/shutdown, job retry exhaustion, and DLQ routing.

### 7. Pipeline Module Independence
**Current:** Pipeline is listed under integrations but is purely internal (Prisma-based, no external API).
**Suggestion:** Relocate to `backend/src/crm/pipeline/` to clarify it's a CRM feature, not an external integration.

### 8. Growth/Money Machine Hardcoded Copy
**Current:** `MoneyMachineService.activate()` uses a hardcoded Portuguese message: `'Oi! Faz um tempo que não nos falamos...'`
**Suggestion:** Use the AiBrain module (already imported) to generate dynamic copy per contact/workspace, or make it configurable via providerSettings.

---

## Start Here

For a developer new to the integrations layer, open these files in order:

1. **`backend/src/integrations/ad-provider.interface.ts`** — the AdProvider contract that all platforms implement
2. **`backend/src/meta/meta-sdk.service.ts`** — the foundational HTTP client for all Meta Graph API calls
3. **`backend/src/meta/meta-auth.controller.ts`** — the complete OAuth flow (best example of integration pattern)
4. **`backend/src/integrations/google-ads.provider.ts`** — an AdProvider implementation using a third-party SDK
5. **`backend/src/integrations/tiktok-ads.provider.ts`** — an AdProvider implementation using raw fetch()
6. **`backend/src/integrations/ads-sync.processor.ts`** — the BullMQ worker orchestrating all ad sync jobs
