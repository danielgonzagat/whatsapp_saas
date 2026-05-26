---

# Connect Channel Canonical Taxonomy

**Wave 21 — Architectural Semantic Canonicalization**

Date: 2026-05-26
Status: DESIGN + CONTRACT (no migration executed)

## Purpose

This document inventories every `connect_channel`-equivalent implementation
across the Kloel monorepo, classifies each as **canonical**, **adapter**,
**UI-only**, **DTO-only**, **DELETE**, or **MOVE-TO-MARKETING**, and
prescribes the migration order per ADR-0012 (WhatsApp diluted into
`backend/src/marketing/` as OmniCore).

## 1. Inventory Table

| # | Symbol | File:line | Layer | Channel(s) | Direct callers | Classification | Why |
|---|---|---|---|---|---|---|---|
| 1 | `MetaConnectService` | `backend/src/marketing/marketing-connect/meta-connect.service.ts:10` | service | WhatsApp, Instagram, Facebook | `MarketingConnectController.getConnectStatus` (`backend/src/marketing/marketing-connect.controller.ts:49`), `MarketingConnectController.getConnectStatus` returns `{ meta, channels: { whatsapp, instagram, facebook, tiktok, email } }` | **CANONICAL** | Already in `marketing-connect/`. Single aggregator of Meta OAuth state + WhatsApp provider session state. Serves the primary unified status endpoint `GET /marketing/connect/status`. Co-injects `MetaConnectionStateService`, `WhatsAppProviderRegistry`, and `MetaWhatsAppService` — it IS the canonical read model for channel connection state. |
| 2 | `MetaConnectionStateService` | `backend/src/meta/meta-connection-state.service.ts:37` | service (data-access) | WhatsApp, Instagram, Facebook | `MetaConnectService.getStatus` (`backend/src/marketing/marketing-connect/meta-connect.service.ts:43`) | **ADAPTER** | Pure read-model over `MetaConnection` table (`backend/prisma/schema.prisma:3409`). Transforms DB rows into `MetaConnectionState` interface. Should be absorbed as a private helper in `MetaConnectService` — no external callers other than `MetaConnectService` itself. |
| 3 | `startSession` | `backend/src/whatsapp/providers/provider-registry-session.ts:113` | provider-adapter | WhatsApp | `WhatsAppProviderRegistry.startSession()` (`backend/src/whatsapp/providers/provider-registry.ts:149`), called by `WhatsAppApiController.startSession` (`backend/src/whatsapp/controllers/whatsapp-api.controller.ts:82`), `WhatsappSessionService.createSession` (`backend/src/whatsapp/whatsapp-session.service.ts:48`), `KloelToolExecutorWhatsAppService.toolConnectWhatsapp` (`backend/src/kloel/kloel-tool-executor-whatsapp.service.ts:41`), `UnifiedAgentActionsCrmService.actionConnectWhatsApp` (`backend/src/unified-agent-actions-crm.service.ts:522`) | **ADAPTER** | Provider-aware session initiator. Routes `startSession()` → WAHA (`WahaProvider.startSession`) or Meta Cloud (`WhatsAppApiProvider.startSession`) based on `resolveDefaultWhatsAppProvider()` (`backend/src/whatsapp/providers/provider-env.ts:34`). Persists snapshot to `providerSettings.whatsappApiSession`. This is low-level plumbing — not a business "connect channel." Should remain the provider-registry internal detail. |
| 4 | `WhatsappSessionService` | `backend/src/whatsapp/whatsapp-session.service.ts:19` | service | WhatsApp | `WhatsappService` (`backend/src/whatsapp/whatsapp.service.ts:44`), `WhatsappMessageDispatcherService` (`backend/src/whatsapp/whatsapp-message-dispatcher.service.ts:31`) | **MOVE-TO-MARKETING** | Orchestrates WhatsApp session lifecycle: `createSession`, `getConnectionStatus`, `getQrCode`, `disconnect`, `setPresence`, `markChatAsReadBestEffort`, `collectMessagingRuntimeIssues`. Duplicates responsibility with `MetaConnectService` (both produce connection status). Coupled to `WhatsAppProviderRegistry` and `WhatsAppApiProvider`. Should move to `backend/src/marketing/marketing-connect/whatsapp-session.adapter.ts` as the WhatsApp-specific session adapter behind the canonical `MetaConnectService`. |
| 5 | `WhatsAppSessionHarness` | `frontend/src/app/e2e/_components/whatsapp-session-harness.tsx:11` | UI (E2E) | WhatsApp | `frontend/src/app/e2e/whatsapp-session/page.tsx:5`, `frontend/src/app/e2e/whatsapp-console/page.tsx:5` | **UI-ONLY** | Pure E2E Playwright harness. Renders a mock connect button + "Aguardando QR Code..." placeholder. No real connection logic. Used by Playwright tests to validate the Meta embedded-signup fallback UX. Zero business logic — keep as-is in `e2e/`. |
| 6 | `MetaConnectSection` | `frontend/src/components/kloel/conta/ContaMetaConnectSection.tsx:12` | UI | Instagram, Messenger, Meta Ads | `ContaAppsSection` (`frontend/src/components/kloel/conta/ContaAppsSection.tsx:162`) | **UI-ONLY** | Correct frontend Meta OAuth connect button. Calls `GET /meta/auth/url` to open Meta OAuth popup, `POST /meta/auth/disconnect` to sever. No session-level WhatsApp logic — purely the Meta-platform OAuth UI. Keep as-is. |
| 7 | `connectWhatsapp` | `frontend/src/lib/api/whatsapp.ts:415` | API client | WhatsApp | None found (exported from `frontend/src/lib/api/index.ts:79` but no in-repo caller) | **DELETE** | Misnamed function. Does a `GET /whatsapp-api/session/status` — it does NOT connect anything. The real connect function is `initiateWhatsAppConnection` (`frontend/src/lib/api/whatsapp.ts:75`) which POSTs to `/whatsapp-api/session/start`. This function is dead code with a misleading name. Delete or rename to `getWhatsAppConnectionStatus` if needed. |

## 2. Canonical Service Decision

**The single canonical service responsible for "connect a channel" is
`ChannelOnboardingService` — a new facade in
`backend/src/marketing/marketing-connect/channel-onboarding.service.ts`
that merges the read-model of `MetaConnectService` + the wizard-state of
`ChannelSetupService` + a per-channel `connect()` method.**

### Rationale

`MetaConnectService.getStatus()` (`backend/src/marketing/marketing-connect/meta-connect.service.ts:29`) already produces a unified status DTO for all Meta channels but needs to be extended to include TikTok, Email, and Google Ads — today those are stitched together ad-hoc in `MarketingConnectController.getConnectStatus()` (`backend/src/marketing/marketing-connect.controller.ts:49-58`). `ChannelSetupService` (`backend/src/marketing/marketing-connect/channel-setup.service.ts:16`) owns the onboarding wizard (`getSetup`, `saveSetup`, `completeSetup`) but knows nothing about connection state. The merge eliminates the controller-as-stitcher anti-pattern: the new `ChannelOnboardingService` is the single injected dependency for both status and wizard, calling `EmailConnectService.getStatus`, `TikTokMarketingService.getStatus`, and `MetaConnectService.getStatus` internally (with `MetaConnectionStateService` absorbed as a private helper at `backend/src/meta/meta-connection-state.service.ts:37` → lines 48-104, since its only caller is `MetaConnectService.getStatus` at `meta-connect.service.ts:43`). The `ChannelSetupService` remains as a dedicated wizard-state persistence helper behind the facade — not a separate public contract.

### Public method shape

```typescript
interface ChannelOnboardingService {
  getStatus(workspaceId: string): Promise<UnifiedChannelStatus>;
  connect(workspaceId: string, channel: ChannelKind): Promise<ConnectInitResult>;
  disconnect(workspaceId: string, channel: ChannelKind): Promise<void>;
  getSetup(workspaceId: string, channel: ChannelKind): Promise<ChannelSetupState>;
  saveSetup(workspaceId: string, payload: ChannelSetupPayload): Promise<ChannelSetupState>;
  completeSetup(workspaceId: string, channel: ChannelKind): Promise<ChannelSetupCompleted>;
}

type ChannelKind = 'whatsapp' | 'instagram' | 'facebook' | 'messenger' | 'tiktok' | 'email' | 'google-ads';

type ConnectInitResult = {
  channel: ChannelKind;
  status: 'already_connected' | 'redirect_required' | 'qr_required' | 'config_missing' | 'error';
  authUrl?: string;
  qrCode?: string;
  message?: string;
};
```

Files: `backend/src/marketing/marketing-connect/channel-onboarding.service.ts` (new),
`backend/src/marketing/marketing-connect.controller.ts:36-46` (updated to inject only `ChannelOnboardingService` instead of 5 separate services).

## 3. Per-Channel Onboarding Shape

| Channel | Auth model | Webhook subscribe | Permission scope | Notes |
|---|---|---|---|---|
| WhatsApp (Meta Cloud) | Meta Embedded Signup OAuth (`backend/src/meta/meta-auth.controller.ts:67`) → `MetaConnection.upsert` with `channel='whatsapp'` (`backend/src/meta/meta-auth.controller.ts:367-374`) → `MetaConnectService.getStatus` reads `whatsappApiSession` from `providerSettings` (`backend/src/marketing/marketing-connect/meta-connect.service.ts:38-40`) | Meta webhook: `whatsapp_business_messages`, `whatsapp_business_account`; runtime diagnostics via `WhatsAppApiProvider.getRuntimeConfigDiagnostics()` (`backend/src/whatsapp/controllers/whatsapp-api.controller.ts:408`) | `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management`, `pages_show_list`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, `ads_management` | Default provider since `resolveDefaultWhatsAppProvider()` returns `'meta-cloud'` (`backend/src/whatsapp/providers/provider-env.ts:40`). Session start via `POST /whatsapp-api/session/start` → `WhatsAppProviderRegistry.startSession()` (`backend/src/whatsapp/providers/provider-registry.ts:149`). |
| WhatsApp (WAHA legacy) | WAHA HTTP API (`backend/src/whatsapp/providers/waha.provider.ts:115`) — session name = `workspaceId` | WAHA webhook config; checked via `WahaProvider.getSessionDiagnostics()` | N/A (WAHA runs on infra, not Meta OAuth) | Enabled via `WHATSAPP_PROVIDER_DEFAULT=whatsapp-api` env (`backend/src/whatsapp/providers/provider-env.ts:34`). QR-based pairing via `WahaProvider.startSession()` → `WahaProvider.getQrCode()`. Persists snapshot via `persistSessionSnapshot()` (`backend/src/whatsapp/providers/provider-registry-session.ts:74`). Coexists behind `WhatsAppProviderRegistry.isWahaMode()` gating (`backend/src/whatsapp/providers/provider-registry.ts:73`). |
| Instagram | Meta OAuth → `MetaConnection.upsert` with `channel='instagram'` | Meta webhook: `instagram_webhooks` (via `FacebookMessengerController` webhook field mapping) | `instagram_basic`, `instagram_manage_messages`, `pages_show_list` | Connected when `MetaConnection.instagramAccountId` is non-null and access token valid (`backend/src/meta/meta-connection-state.service.ts:81-82`). Auth URL built via `MetaWhatsAppService.safeBuildEmbeddedSignupUrl(wsId, { channel: 'instagram' })` (`backend/src/marketing/marketing-connect/meta-connect.service.ts:109`). Message send via `InstagramService.sendMessage()` (`backend/src/meta/instagram/instagram.service.ts`). |
| Facebook / Messenger | Meta OAuth → `MetaConnection.upsert` with `channel='facebook'` | Meta webhook: `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads` | `pages_show_list`, `pages_messaging`, `pages_read_engagement` | Connected when `MetaConnection.pageId` is non-null (`backend/src/meta/meta-connection-state.service.ts:90`). Message send/routing via `FacebookMessengerService.sendMessage()` (`backend/src/marketing/facebook-messenger.service.ts:37`). Webhook controller at `backend/src/marketing/facebook-messenger.controller.ts:24`. |
| Email (Gmail) | Google OAuth 2.0 → `MailboxGmailOAuthService.buildAuthUrl()` (`backend/src/marketing/mailbox-gmail-oauth.service.ts:31`) → `MailboxGmailOAuthCallbackController` (`backend/src/marketing/mailbox-gmail-oauth-callback.controller.ts:13`) | Gmail push notifications via `GmailSyncService` | `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/gmail.readonly` | Stored in `MailboxConnection` table (`backend/prisma/schema.prisma:2098`) with `provider='GMAIL'`. Send via `GmailSendService.sendMessageFromMailbox()`. Status aggregated by `EmailConnectService.getStatus()` (`backend/src/marketing/marketing-connect/email-connect.service.ts:95`). |
| Email (Microsoft) | Microsoft OAuth 2.0 → `MailboxMicrosoftOAuthService.buildAuthUrl()` (`backend/src/marketing/mailbox-microsoft-oauth.service.ts`) → `MailboxMicrosoftOAuthCallbackController` (`backend/src/marketing/mailbox-microsoft-oauth-callback.controller.ts:13`) | Microsoft Graph webhook subscriptions | `Mail.Send`, `Mail.Read`, `offline_access` | Stored in `MailboxConnection` with `provider='MICROSOFT'`. Routes through same `EmailConnectService.getStatus()` aggregation as Gmail. |
| Email (IMAP) | Credentials-based → `MailboxImapSmtpService.connectMailbox()` (`backend/src/marketing/mailbox-imap-smtp.service.ts:76`) | N/A (poll-based) | N/A | Stored in `MailboxConnection` with `provider='IMAP_SMTP'` and encrypted `imapPassword`/`smtpPassword` (`backend/prisma/schema.prisma:2115-2118`). Validated via `validateImapConnection()` + `validateSmtpConnection()` on connect. |
| TikTok | OAuth 2.0 → `TikTokMarketingService.generateAuthUrl()` (`backend/src/marketing/tiktok-marketing.service.ts:169`) → `TikTokMarketingController.complete()` (`backend/src/marketing/tiktok-marketing.controller.ts:25`) | N/A (API-polled campaign data) | Creator: `user.info.basic`, `video.list`, `video.publish`, `biz.creator.info` (18 scopes at `backend/src/marketing/tiktok-marketing.service.ts:190-208`). Advertiser: `business-api.tiktok.com` (`backend/src/marketing/tiktok-marketing.service.ts:35`) | Stored in `providerSettings.tiktok` as encrypted JSON (`backend/src/marketing/tiktok-marketing.service.ts:273-292`). Two auth modes: `creator` vs `advertiser` (resolved at `backend/src/marketing/tiktok-marketing.service.ts:62`). No `MetaConnection` row — stored in workspace `providerSettings` JSON. |
| Google Ads | Google OAuth 2.0 → `GoogleAdsMarketingService.generateAuthUrl()` (`backend/src/marketing/google-ads-marketing.service.ts:146`) → `GoogleAdsMarketingController.complete()` | N/A (API-polled) | `https://www.googleapis.com/auth/adwords` | Stored in `providerSettings.googleAds` (`backend/src/marketing/google-ads-marketing.service.ts:196`). Campaign listing via `googleAdsFetch('/customers/{id}/googleAds:searchStream')` (`backend/src/marketing/google-ads-marketing.service.ts:240`). Currently in `backend/src/marketing/` — correctly placed. |

## 4. Migration Order

### Step 1 — Absorb `MetaConnectionStateService` into `MetaConnectService`

- **What moves**: All logic from `backend/src/meta/meta-connection-state.service.ts:37-104` becomes a private method `MetaConnectService.#resolveMetaState(workspaceId)`.
- **What gets aliased/deprecated**: `MetaConnectionStateService` gets a `@deprecated` re-export at its current location, forwarding to `MetaConnectService`.
- **What gets deleted**: Nothing immediately — the deprecated export stays for one Wave to let external tooling adapt.
- **Test/integration check**: `backend/src/marketing/marketing-connect/meta-connect.service.spec.ts:1-` already tests `MetaConnectService.getStatus()` with a mocked `metaConnectionState` — update the mock to use the internal method instead, verify the same contract.

### Step 2 — Delete `connectWhatsapp` (frontend dead code)

- **What moves**: Nothing — pure deletion.
- **What gets aliased/deprecated**: If any external consumer imports it (exported from `frontend/src/lib/api/index.ts:79`), add a deprecation re-export that calls `getWhatsAppStatus` instead and logs a warning.
- **What gets deleted**: `frontend/src/lib/api/whatsapp.ts:415-419` (the `connectWhatsapp` function body). The actual `initiateWhatsAppConnection` function at `frontend/src/lib/api/whatsapp.ts:75` remains as the canonical frontend connect entry point.
- **Test/integration check**: `grep -r "connectWhatsapp" frontend/src/` — verify zero callers in non-test code. Run `npm run lint` on frontend.

### Step 3 — Create `ChannelOnboardingService` facade

- **What moves**: New file at `backend/src/marketing/marketing-connect/channel-onboarding.service.ts`. Aggregates:
  - `MetaConnectService.getStatus()` (Meta channels)
  - `EmailConnectService.getStatus()` (email)
  - `TikTokMarketingService.getStatus()` (TikTok)
  - `GoogleAdsMarketingService.getStatus()` (Google Ads)
  - `ChannelSetupService.getSetup/saveSetup/completeSetup()` (wizard)
  - Per-channel `connect()` dispatching to the correct OAuth URL or session-start flow.
- **What gets aliased/deprecated**: `MarketingConnectController` (`backend/src/marketing/marketing-connect.controller.ts:36-46`) changes its constructor to inject only `ChannelOnboardingService` instead of 5 separate services. The old injections remain as deprecated constructor params (unused) for one Wave.
- **What gets deleted**: Nothing yet — old services remain as internal delegates of the facade.
- **Test/integration check**: `backend/src/marketing/marketing-connect.controller.spec.ts:143-148` currently constructs the controller with 8 services — update to use only `ChannelOnboardingService` mock. Verify `GET /marketing/connect/status` returns identical shape.

### Step 4 — Move `WhatsappSessionService` to `marketing-connect/`

- **What moves**: `backend/src/whatsapp/whatsapp-session.service.ts` → `backend/src/marketing/marketing-connect/whatsapp-session.adapter.ts`.
- **What gets aliased/deprecated**: `WhatsappSessionService` gets a `@deprecated` re-export at `backend/src/whatsapp/whatsapp-session.service.ts` forwarding to the new location. Its consumers — `WhatsappService` (`backend/src/whatsapp/whatsapp.service.ts:44`), `WhatsappMessageDispatcherService` (`backend/src/whatsapp/whatsapp-message-dispatcher.service.ts:31`) — update their imports to point at `marketing-connect/`.
- **What gets deleted**: Nothing immediately; `WhatsAppApiController` (`backend/src/whatsapp/controllers/whatsapp-api.controller.ts`) still uses `WhatsAppProviderRegistry` directly for session ops — that stays.
- **Test/integration check**: `backend/src/whatsapp/whatsapp-session.service.spec.ts:14-` — move to `backend/src/marketing/marketing-connect/whatsapp-session.adapter.spec.ts`, verify all session lifecycle tests pass. Run `npm run test -- --testPathPattern="whatsapp-session"`.

### Step 5 — Wire `KloelToolExecutorWhatsAppService.toolConnectWhatsapp` through the facade

- **What moves**: `backend/src/kloel/kloel-tool-executor-whatsapp.service.ts:41` currently calls `this.providerRegistry.startSession(workspaceId)` directly. Change to call `this.channelOnboarding.connect(workspaceId, 'whatsapp')`.
- **What gets aliased/deprecated**: Nothing — direct injection change.
- **What gets deleted**: The direct `WhatsAppProviderRegistry` import from `kloel-tool-executor-whatsapp.service.ts` if no other provider-registry methods remain in use there.
- **Test/integration check**: `backend/src/kloel/kloel-tool-executor-whatsapp.service.spec.ts:121-` mocks `providerRegistry.startSession` — update to mock `channelOnboarding.connect`. Verify tool `toolConnectWhatsapp` returns identical result shape.

### Step 6 — Remove `WhatsAppApiController.startSession` duplicate route

- **What moves**: `POST /whatsapp-api/session/start` (`backend/src/whatsapp/controllers/whatsapp-api.controller.ts:82`) becomes an internal redirect to the canonical `POST /marketing/connect/channel { channel: 'whatsapp' }` endpoint, or is deprecated and the UI switches to the marketing endpoint.
- **What gets aliased/deprecated**: `WhatsAppApiController.startSession` gets `@deprecated` annotation, kept for one Wave for backward compat.
- **What gets deleted**: Eventual removal of the duplicate route after UI migration.
- **Test/integration check**: `backend/src/whatsapp/controllers/whatsapp-api.controller.spec.ts:214-` tests `startSession` — run to confirm backward compat. New test for `POST /marketing/connect/channel` with `{ channel: 'whatsapp' }`.

## 5. Domain Boundary

### After migration — canonical "channel onboarding" domain

```
backend/src/marketing/marketing-connect/
├── channel-onboarding.service.ts        # CANONICAL facade — getStatus, connect, disconnect, getSetup, saveSetup, completeSetup
├── channel-setup.service.ts             # Wizard-state persistence (internal helper)
├── meta-connect.service.ts              # Meta OAuth + WhatsApp session aggregator (absorbs MetaConnectionStateService)
├── email-connect.service.ts             # Email connection aggregator (Gmail/Microsoft/IMAP routing)
├── whatsapp-session.adapter.ts          # Moved from backend/src/whatsapp/whatsapp-session.service.ts
├── whatsapp-summary.service.ts          # WhatsApp-specific summary/analytics
├── shared/
│   └── channel-helpers.ts               # Channel type guards, DTO shapes
├── channel-onboarding.service.spec.ts   # NEW — unified facade tests
├── channel-setup.service.spec.ts        # EXISTS
├── meta-connect.service.spec.ts         # EXISTS
├── email-connect.service.spec.ts        # EXISTS
└── whatsapp-summary.service.spec.ts     # EXISTS
```

### Folders that shrink to deprecated

| Folder | After migration | Rationale |
|---|---|---|
| `backend/src/whatsapp/` | `WhatsappSessionService` moves out; `WhatsAppApiController.startSession` deprecated. `WhatsAppProviderRegistry` stays as the provider-level adapter — it's NOT a "connect channel" but a "route provider-specific API calls." | ADR-0012: WhatsApp diluted into marketing. Session lifecycle moves to OmniCore; provider-registry stays as adapter layer. |
| `backend/src/meta/` | `MetaConnectionStateService` absorbed into `MetaConnectService`. `MetaAuthController` and `MetaWhatsAppService` stay as the Meta OAuth implementation — they serve the `/meta/auth/*` routes directly. | Meta OAuth is a platform concern, not a channel concern. The Meta OAuth flow is correct where it is; only the read-model moves to marketing. |
| `frontend/src/lib/api/whatsapp.ts` | `connectWhatsapp` (line 415) deleted. All other functions (session management, messaging, catalog, brain) stay. | Only the misnamed dead function is removed. |

### Folders that grow

| Folder | After migration | Rationale |
|---|---|---|
| `backend/src/marketing/marketing-connect/` | Gains `channel-onboarding.service.ts`, `whatsapp-session.adapter.ts`, `channel-onboarding.service.spec.ts`. | Becomes the single canonical home for "connect a channel." |
| `backend/src/marketing/` (module-level) | `MarketingConnectController` reduces from 8 injected services to 1 facade (`ChannelOnboardingService`). | Controller becomes a thin HTTP adapter over the facade. |

## 6. Risk Register

### WAHA ↔ Meta Cloud coexistence

**Risk**: WAHA legacy (`WHATSAPP_PROVIDER_DEFAULT=whatsapp-api`) must coexist with Meta Cloud (`WHATSAPP_PROVIDER_DEFAULT=meta-cloud`) during a long migration window. Two different connect flows (QR-based pairing vs OAuth redirect) must not leak into the canonical interface.

**Smallest coexistence interface**:

```typescript
// In ChannelOnboardingService.connect(workspaceId, 'whatsapp'):
const providerType = await this.providerRegistry.getProviderType(workspaceId);
// providerType is 'meta-cloud' | 'whatsapp-api'
// resolved by resolveDefaultWhatsAppProvider() at backend/src/whatsapp/providers/provider-env.ts:34

if (providerType === 'whatsapp-api') {
  // WAHA: returns QR code
  const result = await this.providerRegistry.startSession(workspaceId);
  return { channel: 'whatsapp', status: 'qr_required', qrCode: result.qrCode };
}
// Meta Cloud: returns OAuth redirect URL
const authUrl = this.metaWhatsApp.safeBuildEmbeddedSignupUrl(workspaceId, { channel: 'whatsapp' });
return { channel: 'whatsapp', status: 'redirect_required', authUrl };
```

The `ChannelKind` remains `'whatsapp'` regardless of provider. Provider routing is selected per workspace via `providerSettings.whatsappProvider` (migrated on first read by `WhatsAppProviderRegistry.getProviderType()` at `backend/src/whatsapp/providers/provider-registry.ts:83-110`) and gated by `WHATSAPP_PROVIDER_DEFAULT` env var (`backend/src/whatsapp/providers/provider-env.ts:34-41`). No caller above the facade knows which provider is active.

**Additional risks**:

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `MetaConnectService.getStatus()` and `WhatsappSessionService.getConnectionStatus()` diverge in status shape during migration | Medium | Medium — UI shows stale/wrong connection state | Both backed by same `WhatsAppProviderRegistry.getSessionStatus()` (`backend/src/whatsapp/providers/provider-registry.ts:158`). Facade `ChannelOnboardingService.getStatus()` calls `MetaConnectService.getStatus()` which calls the provider-registry, ensuring single source of truth. |
| `KloelToolExecutorWhatsAppService` and `UnifiedAgentActionsCrmService` both call `providerRegistry.startSession()` bypassing the facade | High | Low — duplicate code but same provider-registry backing | Both are updated in Step 5 to call `channelOnboarding.connect(wsId, 'whatsapp')`. The `WhatsAppProviderRegistry.startSession()` method stays as an internal implementation detail — not public API. |
| Email providers (Gmail/Microsoft/IMAP) have 3 separate connect flows that diverge from the unified facade's `connect()` shape | Medium | Medium — facade's `connect(wsId, 'email')` must branch to Gmail/Microsoft/IMAP auth URL | `EmailConnectService` already handles provider detection via `getStatus()` (`backend/src/marketing/marketing-connect/email-connect.service.ts:95-133`). The facade's `connect()` delegates to `EmailConnectService.connect()` for enable/disable toggle, and routes OAuth URL generation to the correct mailbox service. |
| `providerSettings` JSON blob grows unbounded as channel state accumulates | Low | High — schema drift, migration pain | `ChannelSetup` table (`backend/prisma/schema.prisma:3434`) already provides typed schema for wizard state. `MetaConnection` table (`backend/prisma/schema.prisma:3409`) for Meta channels. `MailboxConnection` table (`backend/prisma/schema.prisma:2098`) for email. Only TikTok and Google Ads remain in `providerSettings` JSON — migrate them to dedicated `ChannelConnection` table in Wave 23+. |

---

_Cites: `backend/src/marketing/marketing-connect/meta-connect.service.ts:10,29,43,109`, `backend/src/meta/meta-connection-state.service.ts:37,48-104`, `backend/src/whatsapp/providers/provider-registry-session.ts:113,74`, `backend/src/whatsapp/whatsapp-session.service.ts:19,48`, `backend/src/whatsapp/providers/provider-registry.ts:73,83-110,149,158`, `backend/src/whatsapp/providers/provider-env.ts:34-41`, `backend/src/whatsapp/controllers/whatsapp-api.controller.ts:82,408`, `backend/src/meta/meta-auth.controller.ts:67,367-374`, `backend/src/marketing/marketing-connect.controller.ts:36-46,49-58`, `backend/src/marketing/marketing-connect/channel-setup.service.ts:16`, `backend/src/marketing/marketing-connect/email-connect.service.ts:95-133`, `backend/src/marketing/tiktok-marketing.service.ts:62,169,190-208,273-292`, `backend/src/marketing/google-ads-marketing.service.ts:146,196,240`, `backend/src/marketing/facebook-messenger.service.ts:37,24`, `backend/src/kloel/kloel-tool-executor-whatsapp.service.ts:41`, `backend/prisma/schema.prisma:2098,2115-2118,3409,3434`, `frontend/src/lib/api/whatsapp.ts:75,415-419`, `frontend/src/components/kloel/conta/ContaMetaConnectSection.tsx:12`, `frontend/src/app/e2e/_components/whatsapp-session-harness.tsx:11`._