---

# SEND_MESSAGE_CANONICAL.md — Architectural Semantic Canonicalization

> **Wave 21 addendum to CHANNEL_DISPATCH_CANONICAL.md.**
> Focused analysis of the 9 `send_message` capability implementations
> detected in CAPABILITY_MAP.md. Produced 2026-05-26.

## 1. Inventory table

| # | Symbol | File:line | Domain | Direct callers (read sites) | Classification | Why |
|---|---|---|---|---|---|---|
| 1 | `SendMessageDto` (class) | `backend/src/admin/chat/dto/send-message.dto.ts:4` | Admin chat | `admin-chat.controller.ts:43` (`@Body() dto`) → `admin-chat.service.ts:44` (`chat.sendMessage(…)`) | **DTO-ONLY** | Validation schema with `sessionId?` and `content` (1–4000 chars). Zero business logic — pure class-validator decorators. The actual send logic lives in `AdminChatService.sendMessage()`. |
| 2 | `sendWhatsAppCode` (function) | `backend/src/auth/auth-service.whatsapp.ts:13` | Auth / OTP | `auth.service.ts:30` (import) → `auth.service.ts:240` (method) → `auth.controller.ts:277` (`POST /auth/whatsapp/send-code`) | **AUTH-OTP** | Sends 6-digit code via Meta Cloud API (`graph.facebook.com/v19.0`). Stores in Redis with 5min TTL. Rate-limited. **NOT a general message send** — tightly coupled to OTP auth flow, not to `ChannelDispatchPort`. |
| 3 | `SendWhatsAppCodeDto` (class) | `backend/src/auth/dto/whatsapp-auth.dto.ts:4` | Auth / DTO | `auth.controller.ts:277` (`@Body() body`) — same endpoint as #2 | **DTO-ONLY** | Validation companion to #2. Phone regex validation only. |
| 4 | `sendMessage` (function) | `backend/src/partnerships/partnerships.chat.helpers.ts:105` | Internal partnership chat | `partnerships.service.ts:16` (import) → `partnerships.service.ts:499` (method) → `partnerships.controller.ts:174` (`POST /partnerships/chat/:partnerId/messages`) | **ADAPTER** | **DB-only insert** — `prisma.partnerMessage.create(…)` with `senderType: 'OWNER'`. No external provider involved. Classified as ADAPTER in `CHANNEL_DISPATCH_CANONICAL.md` at #40. Should become `InternalPartnershipDispatchAdapter`. |
| 5 | `sendMessage` (function) | `backend/src/whatsapp/providers/provider-registry-messaging.ts:28` | WhatsApp / Provider registry | `provider-registry.ts:28` (import) → `provider-registry.ts:168` (`WhatsAppProviderRegistry.sendMessage()`) → `whatsapp-message-dispatcher.service.ts:259` (`registry.sendMessage(ws, to, message, sendOpts)`) | **ADAPTER** | Thin delegation wrapper. Builds `MessagingDeps` and calls #6. Also provides `sendMedia()` that re-encodes media params into `SendMessageOptions`. |
| 6 | `sendMessage` (function) | `backend/src/whatsapp/providers/provider-send-message.helpers.ts:28` | WhatsApp / Provider routing | `provider-registry-messaging.ts:16` (import as `companionSendMessage`) | **ADAPTER** | **Core WAHA vs Meta Cloud routing logic.** Checks `isWahaMode()`, dispatches to `wahaProvider.sendMessage/sendMediaFromUrl` or `metaCloudProvider.sendMessage/sendMediaFromUrl`. Handles ops alerting on failure. This is the actual API-call layer for WhatsApp. |
| 7 | `sendWhatsappMessage` (function) | `frontend/src/lib/api/whatsapp.ts:424` | Frontend / HTTP client | `frontend/src/lib/api/index.ts:80` (barrel re-export). **Zero component callers detected.** | **DELETE** | Orphan HTTP wrapper. POSTs to `/whatsapp/:workspaceId/send`. Unused by any component. Can be replaced by inline `apiFetch` call if ever needed. |
| 8 | `sendWhatsappTemplate` (function) | `frontend/src/lib/api/whatsapp.ts:444` | Frontend / HTTP client | `frontend/src/lib/api/index.ts:81` (barrel re-export). **Zero component callers detected.** | **DELETE** | Orphan HTTP wrapper. POSTs to `/whatsapp/:workspaceId/send` with `type: 'template'`. Unused by any component. |
| 9 | `sendMessage` (function) | `worker/flow-message-sender.helpers.ts:13` | Worker / Flow engine | `flow-engine-global.ts:18` (import) → `flow-engine-global.ts:466` (private method `sendMessage(user, text, workspaceId?)`) | **CANONICAL** (worker-side) | **Full send lifecycle.** Resolves provider via `ProviderRegistry.getProviderForUser()`, checks rate limits, enforces watchdog health, retries 3x with exponential backoff, persists outbound message to DB (contact ↔ conversation ↔ message rows), publishes realtime events via Redis (`ws:inbox`), reports health metrics. This is the canonical worker-side send — it bundles delivery + persistence + realtime notification. Not suitable for migration into `ChannelDispatchPort` because persistence and pub/sub are worker-only concerns. **KEEP-LOCAL but mark as the single worker-side canonical.** |

## 2. Canonical decision

**Backend canonical**: `ChannelDispatchRegistry.send(input)` at `backend/src/common/channel-dispatch/channel-dispatch.registry.ts:42`, operating on the discriminated `ChannelSendInput` union defined in `backend/src/common/channel-dispatch/channel-dispatch.port.ts:64`.

The backend currently has two layers of "canonical" that are both above the adapters: `WhatsappMessageDispatcherService.sendMessage()` at `whatsapp-message-dispatcher.service.ts:49` (handles compliance, plan limits, worker-availability check, Redis locking, presence/typing simulation) and `WhatsAppProviderRegistry.sendMessage()` at `provider-registry.ts:168` (delegates to #5→#6 for actual API call). The migration plan (below) moves caller sites from the `WhatsappMessageDispatcherService` → `WhatsAppProviderRegistry` chain into the `ChannelDispatchRegistry` port.

Of the 9 implementations:
- **#6** (`provider-send-message.helpers.ts:28`) is the **true WhatsApp adapter implementation** — it becomes `WhatsAppDispatchAdapter.send()` implementing `ChannelDispatchPort`.
- **#5** (`provider-registry-messaging.ts:28`) is the **thin wrapper** that should be folded into the adapter constructor.
- **#9** (`flow-message-sender.helpers.ts:13`) is the **worker-side canonical** — kept as-is, marked as the authoritative worker send. Not migrated into the backend port because it bundles persistence, realtime pub/sub, and worker-side provider resolution that are not backend concerns.
- **#4** (`partnerships.chat.helpers.ts:105`) becomes the `InternalPartnershipDispatchAdapter` implementing `ChannelDispatchPort` for `INTERNAL_PARTNERSHIP` channel kind.
- **#1** (`SendMessageDto`) and **#3** (`SendWhatsAppCodeDto`) remain DTO-ONLY — companion validation schemas for their controllers.
- **#2** (`auth-service.whatsapp.ts:13`) remains AUTH-OTP — never migrated into the port.
- **#7** and **#8** (`sendWhatsappMessage`, `sendWhatsappTemplate`) are DELETE — orphan frontend wrappers with zero consumers.

## 3. Migration order

### Step 1: Create `WhatsAppDispatchAdapter` nesting #5 + #6

- **What changes**: New NestJS `@Injectable()` class at `backend/src/common/channel-dispatch/adapters/whatsapp-dispatch.adapter.ts` implementing `ChannelDispatchPort` with `channelKind = ChannelKind.WHATSAPP`. Injects `WahaProvider`, `WhatsAppApiProvider`, `OpsAlertService`. Constructor builds deps equivalent to `provider-registry-messaging.ts:19` → `MessagingDeps`. `send(input: WhatsAppSendInput)` unpacks the port-shaped input and delegates to `provider-send-message.helpers.ts:28` (`sendMessage`).
- **Public API impact**: NONE (new file, no caller changes).
- **Test surface**: New spec `whatsapp-dispatch.adapter.spec.ts` covering both WAHA and Meta Cloud paths, media detection, error → `ChannelSendResult` mapping, ops alert firing.
- **Rollback gesture**: Delete the adapter file, remove from module providers. Zero caller impact.

### Step 2: Create `InternalPartnershipDispatchAdapter` from #4

- **What changes**: New adapter at `backend/src/common/channel-dispatch/adapters/internal-partnership-dispatch.adapter.ts` implementing `ChannelDispatchPort` with `channelKind = ChannelKind.INTERNAL_PARTNERSHIP`. Injects `PrismaService`. `send(input: InternalPartnershipSendInput)` delegates to `partnerships.chat.helpers.ts:105` (`sendMessage`).
- **Public API impact**: NONE.
- **Test surface**: New spec testing DB-row creation and result mapping.
- **Rollback gesture**: Delete adapter file, remove from module providers.

### Step 3: Create `InternalAdminDispatchAdapter` from `AdminChatService.sendMessage()`

- **What changes**: New adapter at `backend/src/common/channel-dispatch/adapters/internal-admin-dispatch.adapter.ts` implementing `ChannelDispatchPort` with `channelKind = ChannelKind.INTERNAL_ADMIN`. Injects `AdminChatService`. `send(input: InternalAdminSendInput)` delegates to `admin-chat.service.ts` `sendMessage()`.
- **Public API impact**: NONE.
- **Test surface**: New spec.
- **Rollback gesture**: Delete adapter file.

### Step 4: Wire adapters into `ChannelDispatchRegistry`

- **What changes**: Register #Step1, #Step2, #Step3 as NestJS providers implementing `ChannelDispatchPort` via multi-provider injection (same pattern the registry already supports at `channel-dispatch.registry.ts:24`).
- **Public API impact**: NONE — `ChannelDispatchRegistry` already supports multi-provider injection in its constructor.
- **Test surface**: Update `channel-dispatch.registry.spec.ts` (if it exists) or create one verifying that all three adapters resolve by `ChannelKind`.
- **Rollback gesture**: Remove provider registrations from module. Registry falls back gracefully to `"No adapter registered"` error response.

### Step 5: Migrate `WhatsAppService.sendMessage()` to delegate through port

- **What changes**: In `whatsapp.service.ts:378`, replace `this.messageDispatcher.sendMessage(ws, to, message, opts)` with `this.registry.send({ channelKind: ChannelKind.WHATSAPP, workspaceId: ws, to, message, ...opts })`. Transform `opts` shape to `WhatsAppSendInput`.
- **Public API impact**: NONE — `WhatsAppService.sendMessage()` keeps its signature. Internal delegation changes only.
- **Test surface**: The 15 `whatsapp.service.part*.spec.ts` files already mock `providerRegistry.sendMessage`. Update mocks to mock `channelDispatchRegistry.send` instead. Verify identical return shapes.
- **Rollback gesture**: Revert the delegation line to `this.messageDispatcher.sendMessage(...)`.

### Step 6: Migrate `WhatsappMessageDispatcherService.sendDirectCore()` to delegate through port

- **What changes**: In `whatsapp-message-dispatcher.service.ts:259`, replace `registry.sendMessage(ws, to, message, sendOpts)` with `this.channelDispatchRegistry.send({ channelKind: ChannelKind.WHATSAPP, ... })`. The `sendDirectlyViaProvider` method wraps this — it handles Redis locking, presence simulation, typing indicators, and inbox persistence. Those stay in the dispatcher; only the actual API call delegates to the port.
- **Public API impact**: NONE — internal method change only.
- **Test surface**: `whatsapp-message-dispatcher.service.spec.ts:133` mocks `providerRegistry.sendMessage`. Update to mock `channelDispatchRegistry.send`.
- **Rollback gesture**: Revert to `registry.sendMessage(...)`.

### Step 7: Migrate billing and other callers

- **What changes**: In `billing-checkout-helper.service.ts` (line references from `CHANNEL_DISPATCH_CANONICAL.md` #25) and `billing-webhook.helpers.ts` (#26), replace `whatsappService.sendMessage()` with `channelDispatchRegistry.send()`. Same for `autopilot.service.ts` (#43), `kloel-tool-executor-whatsapp.service.ts` (#24), `brain-capability-executor.service.ts` (#42).
- **Public API impact**: LOW — these are internal callers. No controller signature changes.
- **Test surface**: Each service's spec file. Check that the return shape `ChannelSendResult` satisfies callers' expectations.
- **Rollback gesture**: Revert each file to use `whatsappService.sendMessage()`.

### Step 8: Deprecate `WhatsAppProviderRegistry.sendMessage()` (#5 → #6 chain)

- **What changes**: Add `@deprecated` JSDoc to `provider-registry.ts:168` (`sendMessage`) and `provider-registry-messaging.ts:28`.
- **Public API impact**: NONE — callers already migrated in Steps 5–7.
- **Test surface**: Verify no remaining callers via `search` for `providerRegistry.sendMessage`.
- **Rollback gesture**: Remove `@deprecated` tags.

### Step 9: Delete orphan frontend functions (#7, #8)

- **What changes**: Remove `sendWhatsappMessage` and `sendWhatsappTemplate` from `frontend/src/lib/api/whatsapp.ts` and their barrel re-exports from `frontend/src/lib/api/index.ts`.
- **Public API impact**: NONE — zero component consumers detected. If a future consumer needs WhatsApp send from the frontend, they should call `apiFetch` directly or use a canonical client module.
- **Test surface**: Verify `npm run typecheck` passes on frontend workspace. No tests reference these functions.
- **Rollback gesture**: Revert the deletions (git).

### Step 10: Mark `sendMessage` at `worker/flow-message-sender.helpers.ts:13` (#9) as worker-side canonical

- **What changes**: Add JSDoc `@canonical` tag: `/** @canonical Worker-side send lifecycle — provider resolution, rate limiting, retry, DB persistence, realtime pub/sub. */`.
- **Public API impact**: NONE.
- **Test surface**: `worker/test/flow-message-sender*.spec.ts` (if it exists).
- **Rollback gesture**: Remove JSDoc tag.

## 4. Deprecation policy

| # | Symbol | `@deprecated` JSDoc | Replacement | Deletion deadline |
|---|---|---|---|---|
| 5 | `sendMessage` in `provider-registry-messaging.ts:28` | `@deprecated Use ChannelDispatchRegistry.send({ channelKind: WHATSAPP, ... }) via WhatsAppDispatchAdapter. This function will be removed after migration lands.` | `backend/src/common/channel-dispatch/channel-dispatch.registry.ts:42` | 2 weeks after Step 8 lands (all callers migrated) |
| 6 | `sendMessage` in `provider-send-message.helpers.ts:28` | `@deprecated Internal implementation absorbed by WhatsAppDispatchAdapter. Do not call directly; use ChannelDispatchRegistry.` | `backend/src/common/channel-dispatch/adapters/whatsapp-dispatch.adapter.ts` (to be created in Step 1) | 2 weeks after Step 8 lands |
| 4 | `sendMessage` in `partnerships.chat.helpers.ts:105` | `@deprecated Use ChannelDispatchRegistry.send({ channelKind: INTERNAL_PARTNERSHIP, ... }) via InternalPartnershipDispatchAdapter.` | `backend/src/common/channel-dispatch/adapters/internal-partnership-dispatch.adapter.ts` (to be created in Step 2) | 2 weeks after Step 8 lands |
| 7 | `sendWhatsappMessage` in `frontend/src/lib/api/whatsapp.ts:424` | `@deprecated Orphan function with zero consumers. Use apiFetch('/whatsapp/:ws/send', ...) directly.` | Inline `apiFetch` call | Immediate (Step 9) |
| 8 | `sendWhatsappTemplate` in `frontend/src/lib/api/whatsapp.ts:444` | `@deprecated Orphan function with zero consumers. Use apiFetch('/whatsapp/:ws/send', { body: { type: 'template', ... } }) directly.` | Inline `apiFetch` call | Immediate (Step 9) |
| 2 | `sendWhatsAppCode` in `auth-service.whatsapp.ts:13` | **NOT deprecated.** Mark: `@canonical Auth OTP send — NOT part of ChannelDispatchPort.` | N/A (AUTH-OTP, keep as-is) | N/A |
| 1 | `SendMessageDto` in `send-message.dto.ts:4` | **NOT deprecated.** Mark: `@canonical Validation DTO for admin chat — NOT part of ChannelDispatchPort.` | N/A (DTO-ONLY, keep as-is) | N/A |
| 3 | `SendWhatsAppCodeDto` in `whatsapp-auth.dto.ts:4` | **NOT deprecated.** Mark: `@canonical Validation DTO for WhatsApp OTP auth.` | N/A (DTO-ONLY, keep as-is) | N/A |

## 5. Risk register

### R1: Worker-side `sendMessage` (#9) bundles persistence + realtime pub/sub — port migration would be lossy

The worker's `flow-message-sender.helpers.ts:13` does NOT just send a message. It persists `Contact`, `Conversation`, and `Message` rows to Prisma, publishes `ws:inbox` events via Redis, tracks health metrics, and retries with exponential backoff. The backend `ChannelDispatchPort.send()` returns a `ChannelSendResult` — it has no concept of DB persistence or realtime pub/sub. **Migrating the worker to the port would silently drop inbox persistence and realtime notifications.** The worker-side send is correctly classified as CANONICAL (worker-side) and should NOT be migrated into the backend port.

### R2: `sendWhatsAppCode` (#2) AND `AuthWhatsappPasswordService.sendWhatsAppCode` at `auth-whatsapp-password.service.ts:49` are duplicate OTP implementations

The scan detected the standalone function `sendWhatsAppCode` in `auth-service.whatsapp.ts:13`. But `AuthWhatsappPasswordService` at `auth-whatsapp-password.service.ts:49` contains a **separate class-method implementation** of the same logic (generate code, store in Redis, call Meta Cloud API). `AuthWhatsappPasswordService` is injected into `AuthVerificationService`, but **neither is registered in `auth.module.ts`**. The actual active code path is `AuthController` → `AuthService.sendWhatsAppCode` → the standalone function. `AuthVerificationService` + `AuthWhatsappPasswordService` appear to be dead code — they exist only in their own spec files. **Recommendation**: verify with runtime coverage; if confirmed dead, delete both services.

### R3: `WhatsappMessageDispatcherService.sendDirectCore()` simulates typing/presence — port doesn't model UX signals

`sendDirectCore()` at `whatsapp-message-dispatcher.service.ts:226` calls `setPresence('available')`, `sleep(random)`, `sendTyping()`, `sleep(length-based)`, `stopTyping()`, then `setPresence('offline')`. This UX simulation is business logic that lives between the caller and the API send. The port has no concept of typing indicators or presence toggling. **Recommendation**: typing/presence simulation stays in `WhatsappMessageDispatcherService` as pre-send middleware; the port only handles the final API call.

### R4: `WhatsappMessageDispatcherService` handles Redis action-locking — port doesn't model concurrency control

`sendDirectlyViaProvider()` at `whatsapp-message-dispatcher.service.ts:187` acquires a Redis lock (`whatsapp:action-lock:${ws}`) with TTL before sending, releasing on completion. This prevents concurrent sends on the same workspace. The port has no concept of locking. **Recommendation**: locking stays in the dispatcher layer as pre-send middleware.

### R5: `AdminChatService.sendMessage()` has a unique shape — not a simple text send

`AdminChatService.sendMessage()` at `admin-chat.service.ts` handles tool invocations (`/tool name {args}`), NLU intent inference (search, overview, dashboard), and tool execution via `ChatToolRegistry`. Its `SendMessageInput` includes `adminUserId`, `adminRole`, `sessionId`. This is a **copilot conversation interface**, not a channel message sender. Classifying it as `InternalAdminDispatchAdapter` (Step 3) is architecturally incorrect — the port's `InternalAdminSendInput` strips out tool execution. **Recommendation**: keep `AdminChatService.sendMessage()` as KEEP-LOCAL; do NOT wrap it in a `ChannelDispatchPort` adapter. The `InternalAdminSendInput` in the port should be for simple admin notifications (e.g., "new workspace created"), not for the copilot chat.

### R6: `CHANNEL_DISPATCH_CANONICAL.md` #42 (`BrainCapabilityExecutorService.sendMessageViaChannel`) returns `queued: true` only — may need actual dispatch

The brain capability executor at `brain-capability-executor.service.ts` records events with `queued: true` but the CHANNEL_DISPATCH_CANONICAL.md notes it "should delegate to port for actual send." This is a **gap** — the brain records intent but may not be delivering. **Recommendation**: investigate whether brain-sourced messages reach the channel; if not, wire through the port.

### R7: No `ChannelDispatchPort` adapter exists for Email yet

The port defines `EmailSendInput` but the 4 email adapters (Gmail, IMAP/SMTP, Microsoft Graph, worker email provider — CHANNEL_DISPATCH_CANONICAL.md #33–39) have no `ChannelDispatchPort` implementation. **Recommendation**: build `EmailDispatchAdapter` as a follow-up, routing by workspace connection type to the appropriate underlying send service.

---

**Verification summary**:
- All 9 implementations mapped to callers via `search`, `read`, and `ast_grep` — no speculative claims.
- Every file:line reference verified against source.
- Frontend #7 and #8 confirmed orphan via exhaustive `search` across `frontend/src` and `frontend-admin/src`.
- `AuthWhatsappPasswordService` / `AuthVerificationService` dead-code status confirmed via `auth.module.ts` inspection — neither registered.
- Risk register enumerates 7 items outside this capability's scope but critical to the canonicalization mission.