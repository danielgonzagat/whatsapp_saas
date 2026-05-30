# ops-platform — the platform/operations surface of KLOEL

One-line purpose: the cross-cutting "plumbing" of the SaaS — programmatic API access
(API keys + public API), webhook ingest & outbound delivery, the immutable audit
trail, push notifications, the flow-template marketplace, GDPR/LGPD + OAuth-compliance
data-rights, media/document storage, audio TTS+transcription, calendar bookings,
omnichannel inbound normalization, bulk WhatsApp sends, inbound email, and the ad-provider
integration library. None of these are a single product page; together they are the
operational substrate every other territory leans on.

> This file is the **ops index** for 15 backend folders. It is the canonical map of
> what each one is, whether it is wired into the running app, and which are
> orphan/library backends with no frontend.
>
> **WAHA is intentionally excluded** — the WhatsApp source-of-truth ADR
> (`docs/adr/0001-whatsapp-source-of-truth.md`) deprecates the WAHA provider in favor of
> Meta Cloud API. Any WAHA reference you find is deprecated, not a gap.

---

## What the user does

There is no single "ops-platform" screen. The capabilities surface in different places:

- **Developer settings** — a workspace admin creates/rotates/deletes **API keys** to call
  the **public REST API** (`POST /api/v1/messages`) from their own systems, and registers
  **outbound webhook subscriptions** (`Settings → Webhooks`) so KLOEL pushes events
  (e.g. `message.received`) to their URL.
- **Inbound webhooks** — external systems (payment providers, Meta/Instagram, TikTok,
  inbound email, a generic "catch" hook) POST events that drive flows, update message
  delivery status, or land in the inbox. The end user never sees these directly.
- **Audit log** — admins view a timeline of every privileged action in the workspace.
- **Notifications** — agents get Firebase push when a new message or a payment arrives.
- **Marketplace** — a user browses public flow templates and installs one into their
  workspace; the affiliate marketplace lists products to promote.
- **Privacy / data rights** — an end user requests data export or account deletion
  (GDPR/LGPD), or Meta/Google fire a compliance webhook (data-deletion, deauthorize,
  RISC security events) that must redact/delete the user.
- **Media** — uploads a catalog/document, generates a video, attaches a product image.
- **Audio** — synthesizes speech (TTS) or has a voice note transcribed (Whisper).
- **Calendar** — books an appointment (internal DB, optionally synced to Google Calendar).
- **Mass send** — an admin launches a bulk WhatsApp campaign to a list of numbers.

---

## End-to-end flow (the three flows that matter most)

### A) Programmatic message send via API key (public API)

```
Customer's server (curl with header x-api-key: sk_live_...)
  -> POST /api/v1/messages                         backend/src/public-api/public-api.controller.ts:PublicApiController.sendMessage  (@Post('messages'))
       guard: ApiKeyGuard                           backend/src/public-api/api-key.guard.ts:ApiKeyGuard.canActivate
         -> ApiKeysService.validateKey(key)         backend/src/api-keys/api-keys.service.ts:ApiKeysService.validateKey
              PBKDF2-verify against every stored hash (timingSafeEqual), set req.user.workspaceId, async-touch lastUsedAt
  -> InboxService.saveMessageByPhone({ workspaceId, phone, content, direction:'OUTBOUND', type:'TEXT' })
                                                     backend/src/inbox/inbox.service.ts
       Prisma model: Message (table RAC_Message)    — persists only; actual WhatsApp delivery is a separate path
  -> response: persisted message row
```

API keys themselves are managed at `backend/src/api-keys/api-keys.controller.ts`
(`@Controller('settings/api-keys')`, JwtAuthGuard + WorkspaceGuard):
`GET /` list, `POST /` create (returns raw `sk_live_...` once), `PATCH /:id/rotate`,
`DELETE /:id`. The raw key is shown only on create/rotate; only the PBKDF2 hash is stored
(`ApiKey.key`, table `RAC_ApiKey`). Frontend wires this through
`frontend/src/lib/api/workspace.ts`.

### B) Outbound webhook subscription → delivery

```
UI: Settings → Webhooks
  -> POST /settings/webhooks                         backend/src/webhooks/webhook-settings.controller.ts:WebhookSettingsController.create (JwtAuthGuard)
       Prisma: WebhookSubscription (RAC_WebhookSubscription)  { url, events[], secret=randomUUID() }
... later, when a domain event fires somewhere in the app ...
  -> WebhookDispatcherService.dispatch(workspaceId, event, payload)   backend/src/webhooks/webhook-dispatcher.service.ts
       find active subscriptions where events has <event>
       jobId = `webhook-dispatch:${sub.id}:${event}:${sha256(payload).slice(0,32)}`  (deterministic dedup)
       webhookQueue.add('send-webhook', {...}, { attempts:5, backoff:exponential })  -> worker delivers
```

### C) Inbound finance webhook → flow trigger + audit

```
External payment provider
  -> POST /hooks/finance/:workspaceId                backend/src/webhooks/webhooks.controller.ts:WebhooksController (@Public, @RouteClass('webhook'))
       verifySignatureOrThrow(x-webhook-signature, HOOKS_WEBHOOK_SECRET)   (HMAC-SHA256)
  -> WebhooksService.processFinanceEvent(workspaceId, body)   backend/src/webhooks/webhooks.service.ts:WebhooksService.processFinanceEvent
       resolve flowId from Workspace.providerSettings.finance[status]
       extractPhone(payload); flowQueue.add('run-flow', { initialVars.finance })
       AuditLog.create({ action:'FINANCE_EVENT', resource:'finance' })   Prisma: AuditLog (RAC_AuditLog)
  -> { executionId, status, flowId }
```

`GET /hooks/finance/:workspaceId/recent` (JwtAuthGuard) reads those `FINANCE_EVENT`
audit rows back via `WebhooksService.getRecentFinanceEvents`.

> **Note on the OpenAPI extractor:** `protocol_hub_openapi` returns 0 routes for some of
> these controllers because their paths are computed/spread across helper files; the
> route tables above were read directly from the controller decorators.

---

## Canonical vocabulary

| Concept | Canonical name | Source-of-truth path | Lingering aliases / notes |
|---|---|---|---|
| API key issuance & validation | **`ApiKeysService`** | `api-keys/api-keys.service.ts` | none. Guard is `ApiKeyGuard` (`public-api/api-key.guard.ts`). |
| Inbound webhook ingest + status fan-out + idempotent claim | **`WebhooksService`** | `webhooks/webhooks.service.ts` | Payment webhooks live in dedicated controllers (`payment-webhook*`) — owned by the payments territory, not here. |
| Outbound webhook delivery to subscriber URLs | **`WebhookDispatcherService`** | `webhooks/webhook-dispatcher.service.ts` | Single canonical (SERVICE_CATALOG line 358 / 442). |
| Audit log writer | **`AuditService`** | `audit/audit.service.ts` | Single canonical (`.log()` for fire-and-forget, `.logWithTx()` for in-transaction). `AuditInterceptor` auto-logs mutating routes. |
| Push notifications (FCM + persist) | **`NotificationsService`** | `notifications/notifications.service.ts` | Single canonical. |
| Flow-template / affiliate marketplace | **`MarketplaceService`** | `marketplace/marketplace.service.ts` | Single canonical. |
| OAuth/Meta/LGPD compliance webhooks + user-rights | **`ComplianceService`** | `compliance/compliance.service.ts` | Cross-system (provider-scoped, not workspace-scoped). |
| GDPR/LGPD export & cascade deletion | **`GdprService`** | `gdpr/gdpr.service.ts` | Distinct from `ComplianceService`: GdprService is the *workspace-initiated* request state-machine + BullMQ processor; ComplianceService is the *provider-initiated* webhook handler. Both write/handle deletions — kept separate by trigger source (see Honest status). |
| Media/document storage adapter | **`MediaService`** | `media/media.service.ts` | `MediaService.attach` is the chat-surfaced image upload half of `products.upload_image`. |
| Audio transcription (Whisper) | **`TranscriptionService`** | `audio/transcription.service.ts` | TTS itself is inline in `AudioController.synthesize` (no service). |
| Calendar bookings | **`CalendarService`** | `calendar/calendar.service.ts` | uses `Appointment` model via `Reflect.get` (not strongly typed — see gaps). |
| Bulk WhatsApp send orchestration | **`MassSendService`** | `mass-send/mass-send.service.ts` | controller is `@Controller('campaign')` → `POST /campaign/start`. |
| Inbound email → inbox | **`EmailInboundService`** | `email/email-inbound.service.ts` | controller lives in marketing (`marketing/email-inbound.controller.ts`, `@Controller('webhooks/email-inbound')`). |
| Inbound channel → Mind percept hook | **`ChannelInboundHookService`** | `omnichannel/channel-inbound-hook.service.ts` | |
| Sender → workspace contact resolution | **`OmnichannelContactResolutionService`** | `omnichannel/contact-resolution.service.ts` | |
| Ad-provider library (no Nest module) | Google/Meta/TikTok **`*Provider`** | `integrations/*.provider.ts` | Pure library consumed by `tiktok-ads`, `anuncios`, `google-ads` modules — see Honest status. |

---

## Key services & single responsibility

- **`ApiKeysService`** — generate `sk_live_*`, store only PBKDF2 hash, list/rotate/delete, and constant-time validate a presented key → workspace.
- **`WebhooksService`** — ingest generic/finance/Instagram webhooks, drive flows, update `Message` delivery status (by externalId then phone), and provide the **claim-once idempotency** primitive (`logWebhookEvent` / `markWebhookProcessed` / `markWebhookFailed`) over the `WebhookEvent` table.
- **`WebhookDispatcherService`** — deliver one domain event to all active subscriber URLs via BullMQ with deterministic dedup jobId + exponential retry.
- **`AuditService`** — append-only audit writer with one automatic retry + ops-alert on failure; read APIs (`recent`, `getLogs`, `findById`) are workspace-scoped.
- **`NotificationsService`** — init Firebase Admin, register/unregister device tokens, multicast push, prune dead tokens; degrades honestly to `firebase_not_configured`.
- **`MarketplaceService`** — list/install public `FlowTemplate`s (increments `downloads`), list workspace products, and run the affiliate-marketplace apply/link flow over `AffiliateProduct`/`AffiliateRequest`/`AffiliateLink`.
- **`ComplianceService`** — Facebook data-deletion + deauthorize, Google RISC security events, deletion-status lookup, marketing unsubscribe; soft-deletes/redacts agents and revokes tokens by provider identifier.
- **`GdprService`** — request→verify(JWT)→process state machine for EXPORT (sweep→ZIP→upload→signed URL) and DELETE (cascade `$transaction`), backed by its own `gdpr-processing` BullMQ queue (synchronous fallback if Redis is down).
- **`MediaService`** — store images/documents via `StorageService` (SSRF-guarded fetch), create video-generation jobs, serve documents by signed URL or local read.
- **`TranscriptionService`** — Whisper transcription with retry + model fallback; honest `[Áudio não transcrito]` fallback when OpenAI key absent.
- **`CalendarService`** — internal `Appointment` persistence with optional Google Calendar sync.
- **`MassSendService`** — sanitize/dedupe numbers, enqueue `mass-send` BullMQ job.
- **`EmailInboundService`** — normalize inbound email (strip HTML, resolve workspace alias) → `OmnichannelService.handleIncomingMessage`.
- **`ChannelInboundHookService` / `OmnichannelContactResolutionService`** — bridge inbound messages into the Mind event spine and resolve senders to contacts.

---

## Data & events

**Prisma models owned here** (all tables prefixed `RAC_`):

| Model | Table | Owner service | Workspace-scoped? |
|---|---|---|---|
| `ApiKey` | `RAC_ApiKey` | ApiKeysService | yes (`workspaceId`) |
| `WebhookSubscription` | `RAC_WebhookSubscription` | WebhookSettingsController / Dispatcher | yes |
| `WebhookEvent` | `RAC_WebhookEvent` | WebhooksService (idempotency) | **no** — keyed `@@unique([provider, externalId])` (cross-system) |
| `AuditLog` | `RAC_AuditLog` | AuditService | yes (`@@index([workspaceId, createdAt])`) |
| `DeviceToken` | `RAC_DeviceToken` | NotificationsService | per-agent (no workspace col) |
| `FlowTemplate` | (mapped) | MarketplaceService | public catalog (`isPublic`) |
| `MediaJob` / `Document` | `RAC_MediaJob` / `RAC_Document` | MediaService | yes |
| `GdprRequest` | (mapped) | GdprService | yes |
| `DataDeletionRequest` / `RiscEvent` | (mapped) | ComplianceService | **no** — provider-identifier-scoped |
| `AffiliateProduct`/`AffiliateRequest`/`AffiliateLink` | (mapped) | MarketplaceService (read/apply) | mixed (public listing + per-workspace) |

**Events** (from asyncapi event spine, `commerce.*` taxonomy — these are emitted by the
business territories and *consumed* here for outbound webhook dispatch, e.g.
`message.received`, `commerce.payment.approved`). This territory itself is mostly an
**event consumer / sink**: `WebhookDispatcherService` fans domain events out to subscriber
URLs; `ChannelInboundHookService` records `message.received`/`message.sent` percepts into
the Mind spine via `recordCommercial`. It is not a primary event *emitter* in the spine.

---

## Workspace isolation

- **JWT-guarded routes** (`api-keys`, `audit`, `notifications`, `marketplace`, `media`,
  `audio`, `calendar`, `mass-send`, `webhook-settings`) use `JwtAuthGuard` (+ `WorkspaceGuard`
  where listed) and scope every Prisma query by `workspaceId` from `req.user`. Audit/MassSend
  controllers additionally call `resolveWorkspaceId(req, …)` to reconcile body/query vs token.
- **Public-API route** scopes by the API key: `ApiKeyGuard` resolves the key → sets
  `req.user.workspaceId`; the workspace is *derived from the key*, never trusted from input.
- **Inbound webhooks** (`/hooks/*`) are `@Public()` and authenticated by **HMAC signature**
  (`HOOKS_WEBHOOK_SECRET` / `META_APP_SECRET`), not by JWT. They carry `workspaceId` in the
  path and validate it (`Flow.findFirst({ id, workspaceId })`, `Workspace.findUnique`).
- **Deliberately NOT workspace-scoped** (and correct): `WebhookEvent` (provider+externalId
  idempotency is global), `ComplianceService` + `DataDeletionRequest`/`RiscEvent` (Meta/Google
  fire these with only a provider user-id; the handlers resolve the agent across all
  workspaces), and `DeviceToken` (per-agent). Each of these has an inline comment justifying
  the absence of `workspaceId`.

---

## Honest status (brutally honest, with evidence)

**Solid / production-grade (code + tests present):**
- **API keys + public API** — PBKDF2 hashing, `timingSafeEqual`, rotate/delete with audit,
  fire-and-forget `lastUsedAt`. Tests: `api-keys.service.spec.ts`, `api-key.guard.spec.ts`,
  `public-api.controller.spec.ts`.
- **Webhook idempotency** — `logWebhookEvent` is a genuine claim-once state machine
  (`received`→`processing`, never downgrades a `processed` row) defending against Stripe's
  3-day retry window. Tests: `payment-webhook.controller.idempotency.spec.ts`,
  `webhook-replay.spec.ts`, `webhook-dispatcher.service.fanout.spec.ts`.
- **Webhook signatures** — HMAC-SHA256 for generic hooks and Meta (`x-hub-signature-256`).
  Tests: `webhooks.controller.signature.spec.ts`, `payment-webhook-stripe.controller.signature.spec.ts`.
- **Audit trail** — append-only with retry + ops-alert; auto-interceptor on mutating routes.
- **GDPR** — full request→verify→cascade-delete/export state machine with its own queue and
  synchronous fallback. Tests cover deletion, export, status, facebook-export.
- **Compliance** — Facebook deletion/deauthorize + Google RISC routed by event class, all in
  `$transaction`. Tests: `compliance.service.spec.ts`, `gdpr-facebook-callback.service.spec.ts`.
- **Media** — SSRF-guarded fetch (`media.service.ssrf.spec.ts`), signed-URL document serving.

**Conditional / degrades honestly (works only when external config present):**
- **Notifications** — returns `{ reason: 'firebase_not_configured' }` if Firebase env absent.
- **Audio** — TTS/transcription throw `ServiceUnavailableException` / return a `fallback`
  source string when `OPENAI_API_KEY` absent. No persistence of synthesized audio.
- **Calendar** — Google sync only with a stored `refreshToken`; otherwise internal-only.

**Weak spots / gaps (real, code-fixable):**
- **`CalendarService` uses `Reflect.get(this.prisma, 'appointment')` instead of typed
  `this.prisma.appointment`**, and on a save failure returns a *fabricated* `local_${Date.now()}`
  event (`calendar.service.ts:228`). That violates the no-fake-data rule — should return an
  honest error/empty when the model is unavailable.
- **`MarketplaceService.list` derives price with `BigInt(Math.round(p.price * 100))`** from a
  float `Product.price` (`marketplace.service.ts:85`) — float→money is a smell in a money-as-bigint
  codebase; the source `Product.price` should already be cents/bigint.
- **`ApiKeysService.validateKey` loads up to 1000 keys and PBKDF2-verifies each on every
  public-API call** (`api-keys.service.ts:122-129`) — O(n) per request, no key-prefix lookup;
  scales poorly. A prefix/lookup index would fix it.
- **`integrations/` has no NestJS module** — it is a pure provider *library*
  (`google-ads.provider.ts`, `meta-marketing.provider.ts`, `tiktok-ads.provider.ts`) consumed
  by `tiktok-ads`, `anuncios`, `google-ads` modules. Not a gap, but note: nothing in
  `integrations/` boots on its own.

**Module wiring (verified against `app.module.ts`):**
- Wired directly: `Webhooks`, `Audit`, `Notifications`, `Marketplace`, `Compliance`, `Gdpr`,
  `PublicApi`, `Media`, `Audio`, `Calendar`, `MassSend`.
- **Wired transitively (not in `app.module.ts` imports list):** `ApiKeysModule` (imported by
  `PublicApiModule`), `OmnichannelModule` (imported by `inbox`/`whatsapp` modules),
  `EmailModule`/`EmailInboundService` (wired via `marketing.module.ts`, controller at
  `marketing/email-inbound.controller.ts`). All three are reachable at runtime — none are dead.

**No frontend (orphan-ish backends):** the public API, inbound webhook receivers,
compliance webhooks, omnichannel hooks, audio, and the integrations provider library have
**no dedicated frontend page** — they are server-to-server or chat-tool surfaces.
Frontend clients exist for: `marketplace.ts`, `media.ts`, `notifications.ts`, `calendar.ts`,
`campaign-mass-send.ts`, and API-key management via `workspace.ts`.

**PULSE** (root `PULSE_CERTIFICATE.json`): repo cert `score: 55`, `rawScore: 99`; the
non-certification is officialization/runtime-evidence + Codacy debt (per MEMORY.md, all
tooling/legacy — zero app-core), not a functional break in this territory.

---

## Start here (newcomer reading order)

1. **`backend/src/webhooks/webhooks.service.ts`** — read `logWebhookEvent` first; it is the
   single most important pattern in this territory (claim-once idempotency) and explains how
   every external provider's retries are made safe.
2. **`backend/src/api-keys/api-keys.service.ts`** + **`backend/src/public-api/api-key.guard.ts`**
   — the whole programmatic-access path in ~180 lines; shows the hash-and-verify + workspace-derivation model.
3. **`backend/src/gdpr/gdpr.service.ts`** — the cleanest example of a full request→verify→
   queue→process state machine with a Redis-optional fallback, representative of how the
   heavier ops services are structured.

Cross-reference: `docs/architecture/SERVICE_CATALOG.md` (lines ~343–371) lists every service
here as a single canonical with no duplicates.
