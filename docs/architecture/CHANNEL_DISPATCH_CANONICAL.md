# Channel Dispatch Canonical Taxonomy

**Wave 21 — Architectural Semantic Canonicalization**

Date: 2026-05-26
Status: DESIGN + CONTRACT (no migration executed)

## Purpose

This document inventories every `sendMessage`-equivalent across the
Kloel monorepo, classifies each call site as **canonical**, **adapter**,
or **KEEP-LOCAL**, and prescribes the migration order for Wave 22 onward.

## Design

The canonical contract is `ChannelDispatchPort` in
`backend/src/common/channel-dispatch/channel-dispatch.port.ts`.
Every channel-specific send implementation becomes an **adapter**
that implements this port. Higher-order services (brain, autopilot,
flow engine, billing, campaigns, admin-chat, public-api) call
`ChannelDispatchRegistry.send(input)` with a discriminated
`ChannelSendInput` — never a channel-specific method directly.

## Channel Domains

| Domain | ChannelKind | Canonical input type |
| --- | --- | --- |
| WhatsApp | `whatsapp` | `WhatsAppSendInput` |
| Instagram (Meta) | `instagram` | `InstagramSendInput` |
| Messenger (Meta) | `messenger` | `MessengerSendInput` |
| Facebook (Meta) | `facebook` | `FacebookSendInput` |
| Email (Gmail/IMAP/Microsoft) | `email` | `EmailSendInput` |
| Internal partnership chat | `internal-partnership` | `InternalPartnershipSendInput` |
| Internal admin chat | `internal-admin` | `InternalAdminSendInput` |

## Inventory — 20+ sendMessage Call Sites

### WhatsApp Channel

| # | File | Method | Classification | Reason |
| --- | --- | --- | --- | --- |
| 1 | `whatsapp/providers/waha.provider.ts` | `sendMessage(sessionId, to, message, opts?)` | ADAPTER | Direct WAHA API call — becomes WhatsAppDispatchAdapter |
| 2 | `whatsapp/providers/waha.provider.ts` | `sendImageFromUrl(...)` | ADAPTER | Waha media send — folded into adapter as media case |
| 3 | `whatsapp/providers/waha.provider.ts` | `sendMediaFromUrl(...)` | ADAPTER | Waha media send — same adapter |
| 4 | `whatsapp/providers/waha.provider.ts` | `sendMedia(...)` | ADAPTER | Waha raw media send — same adapter |
| 5 | `whatsapp/providers/waha.provider.ts` | `sendLocation(...)` | KEEP-LOCAL | Location is UI-level feature, not a generic text/media send |
| 6 | `whatsapp/providers/whatsapp-api.provider.ts` | `sendMessage(workspaceId, to, message, opts?)` | ADAPTER | Meta Cloud API call — becomes WhatsAppDispatchAdapter |
| 7 | `whatsapp/providers/whatsapp-api.provider.ts` | `sendMediaFromUrl(...)` | ADAPTER | Meta Cloud media send — same adapter |
| 8 | `whatsapp/whatsapp-message-dispatcher.service.ts` | `sendMessage(ws, to, message, opts)` | CANONICAL | This IS the current canonical entry point for WhatsApp; will delegate to port |
| 9 | `whatsapp/whatsapp-message-dispatcher.service.ts` | `sendTemplate(ws, to, template)` | KEEP-LOCAL | Template send has unique shape (template name+language+components), not text |
| 10 | `whatsapp/whatsapp.service.ts` | `sendMessage(ws, to, message, opts?)` | CANONICAL | Public API — delegates to messageDispatcher |
| 11 | `whatsapp/whatsapp.service.ts` | `sendDirectMessage(ws, to, message)` | CANONICAL | Public API — delegates to messageDispatcher |
| 12 | `kloel/channel-transport-whatsapp.provider.ts` | `send(workspaceId, request)` | CANONICAL | Transport layer — already implements ChannelTransportProvider |
| 13 | `worker/providers/whatsapp-api-provider.ts` | `sendText(workspace, to, message, opts?)` | ADAPTER | Worker-side Meta Cloud adapter |
| 14 | `worker/providers/whatsapp-api-provider.ts` | `sendMedia(workspace, to, type, url, caption?, opts?)` | ADAPTER | Worker-side media adapter |
| 15 | `worker/providers/auto-provider.ts` | `sendText(workspace, to, message)` | ADAPTER | Auto-detect WhatsApp provider (waha vs meta-cloud) |
| 16 | `worker/providers/auto-provider.ts` | `sendMedia(workspace, to, type, url, caption?)` | ADAPTER | Auto-detect media send |
| 17 | `worker/providers/unified-whatsapp-provider.ts` | `sendText(workspaceOrId, to, message, opts?)` | ADAPTER | Unified routing layer for worker WhatsApp sends |
| 18 | `worker/providers/unified-whatsapp-provider.ts` | `sendMedia(workspaceOrId, to, type, url, caption?, opts?)` | ADAPTER | Unified routing for worker media |
| 19 | `worker/whatsapp-engine.ts` | `sendText(workspace, to, message, opts?)` | ADAPTER | Worker send entry — resolves provider and delegates |
| 20 | `worker/whatsapp-engine.ts` | `sendMedia(workspace, to, type, url, caption?, opts?)` | ADAPTER | Worker media entry |
| 21 | `worker/send-message-handler.ts` | `handleSendMessage(job)` | CANONICAL | Job handler — routes to WhatsAppEngine based on content type |
| 22 | `worker/flow-message-sender.helpers.ts` | `sendMessage(deps, user, text, wsId?)` | CANONICAL | Flow engine send — resolves provider and persists |
| 23 | `worker/flow-engine-global.ts:466` | `sendMessage(user, text, workspaceId?)` | CANONICAL | Flow engine wrapper — delegates to flow-message-sender |
| 24 | `kloel/kloel-tool-executor-whatsapp.service.ts` | `toolSendWhatsAppMessage(wsId, args)` | CANONICAL | Tool-level dispatch — should delegate to port |
| 25 | `billing/billing-checkout-helper.service.ts` | `whatsappService.sendMessage(wsId, phone, message)` | CANONICAL | Billing notification — calls through to WhatsAppService |
| 26 | `billing/billing-webhook.helpers.ts` | `notifier.sendMessage(wsId, phone, message)` | CANONICAL | Webhook notification — calls through injected notifier |

### Instagram Channel

| # | File | Method | Classification | Reason |
| --- | --- | --- | --- | --- |
| 27 | `meta/instagram/instagram.service.ts` | `sendMessage(igAccountId, recipientId, text, accessToken)` | ADAPTER | Low-level Meta Graph API call — becomes InstagramDispatchAdapter |
| 28 | `kloel/channel-transport.providers.ts` | `InstagramChannelTransport.send(wsId, request)` | CANONICAL | Transport layer — already implements ChannelTransportProvider |

### Messenger Channel

| # | File | Method | Classification | Reason |
| --- | --- | --- | --- | --- |
| 29 | `meta/messenger/messenger.service.ts` | `sendTextMessage(pageId, recipientId, text, accessToken)` | ADAPTER | Low-level Meta Graph API call |
| 30 | `meta/messenger/messenger.service.ts` | `sendMediaMessage(pageId, recipientId, type, url, accessToken)` | ADAPTER | Media variant of same adapter |
| 31 | `kloel/channel-transport.providers.ts` | `MessengerChannelTransport.send(wsId, request)` | CANONICAL | Transport layer |

### Facebook Channel

| # | File | Method | Classification | Reason |
| --- | --- | --- | --- | --- |
| 32 | `marketing/facebook-messenger.service.ts` | `sendMessage(wsId, pageId, psid, text, accessToken)` | ADAPTER | Graph API call with DB-persisted messages |

### Email Channel

| # | File | Method | Classification | Reason |
| --- | --- | --- | --- | --- |
| 33 | `marketing/mailbox-gmail-oauth/send.service.ts` | `sendMessageFromMailbox(wsId, input)` | ADAPTER | Gmail API send — becomes EmailDispatchAdapter (Gmail variant) |
| 34 | `marketing/mailbox-gmail-oauth.service.ts` | `sendMessageFromMailbox(wsId, input)` | ADAPTER | Wrapper that delegates to GmailSendService |
| 35 | `marketing/mailbox-imap-smtp.service.ts` | `sendMessageFromMailbox(wsId, input)` | ADAPTER | SMTP send — EmailDispatchAdapter (IMAP/SMTP variant) |
| 36 | `marketing/mailbox-microsoft-oauth.service.ts` | `sendMessageFromMailbox(wsId, input)` | ADAPTER | Microsoft Graph send — EmailDispatchAdapter (Microsoft variant) |
| 37 | `kloel/channel-transport.providers.ts` | `EmailChannelTransport.send(wsId, request)` | CANONICAL | Transport layer — already implements ChannelTransportProvider |
| 38 | `worker/providers/email-provider.ts` | `sendText(workspace, to, message)` | ADAPTER | Worker-side email send |
| 39 | `worker/providers/email-provider.ts` | `sendMedia(workspace, to, type, url, caption?)` | ADAPTER | Worker-side email media |

### Internal Partnership Chat

| # | File | Method | Classification | Reason |
| --- | --- | --- | --- | --- |
| 40 | `partnerships/partnerships.chat.helpers.ts` | `sendMessage(prisma, partnerId, content, senderId, senderName)` | ADAPTER | DB-only append; no external provider |

### Internal Admin Chat

| # | File | Method | Classification | Reason |
| --- | --- | --- | --- | --- |
| 41 | `admin/chat/admin-chat.service.ts` | `sendMessage(input: SendMessageInput)` | ADAPTER | Copilot chat with tool execution; unique shape |

### Brain / Capability Layer

| # | File | Method | Classification | Reason |
| --- | --- | --- | --- | --- |
| 42 | `kloel/brain-capability-executor.service.ts` | `sendMessageViaChannel(wsId, args?)` | CANONICAL | Event-record only (queued: true); should delegate to port for actual send |

### Autopilot

| # | File | Method | Classification | Reason |
| --- | --- | --- | --- | --- |
| 43 | `autopilot/autopilot.service.ts` | `sendDirectMessage(wsId, contactId, message)` | CANONICAL | Compliance-checked send; enqueues to flow queue |

### Public API

| # | File | Method | Classification | Reason |
| --- | --- | --- | --- | --- |
| 44 | `public-api/public-api.controller.ts` | `sendMessage(body)` | KEEP-LOCAL | Only persists to InboxService; actual delivery is separate |

## KEEP-LOCAL Rationale

| # | Call site | Why KEEP-LOCAL |
| --- | --- | --- |
| 5 | `WahaProvider.sendLocation()` | Location sharing is a UI-specific feature with lat/lng params. Not a text/media send — not worth generalizing into the port. |
| 9 | `WhatsappMessageDispatcher.sendTemplate()` | Template send has a unique shape (`name`, `language`, `components[]`). The template approval flow is Meta-specific and business-logic-heavy. |
| 44 | `PublicApiController.sendMessage()` | This endpoint ONLY persists to InboxService (`saveMessageByPhone`). It does not trigger delivery — actual send is done by a separate flow. The port is for DELIVERY, not persistence. |

## Migration Order (Wave 22+)

1. **Phase 1 — Adapters (zero behavior change)**
   - Create `WhatsAppDispatchAdapter` that wraps `WhatsAppMessageDispatcher.sendMessage`
   - Create `InstagramDispatchAdapter` that wraps `InstagramService.sendMessage`
   - Create `MessengerDispatchAdapter` that wraps `MessengerService.sendTextMessage`
   - Create `FacebookDispatchAdapter` that wraps `FacebookMessengerService.sendMessage`
   - Create `EmailDispatchAdapter` that dispatches to Gmail/IMAP/Microsoft based on connection type
   - Create `InternalPartnershipDispatchAdapter` that wraps `partnerships.chat.helpers.sendMessage`
   - Create `InternalAdminDispatchAdapter` that wraps `AdminChatService.sendMessage`
   - Wire all adapters into `ChannelDispatchRegistry` via NestJS multi-provider injection

2. **Phase 2 — Canonical callers (internal delegation)**
   - `WhatsAppService.sendMessage` → internally calls `ChannelDispatchRegistry.send({ channelKind: WHATSAPP, ... })`
   - `WhatsAppService.sendDirectMessage` → same pattern
   - `KloelToolExecutorWhatsappService.toolSendWhatsAppMessage` → delegates to registry
   - `BrainCapabilityExecutorService.sendMessageViaChannel` → delegates to registry for actual send
   - `AutopilotService.sendDirectMessage` → delegates through registry for WhatsApp
   - All existing public methods KEPT (back-compat); they delegate internally

3. **Phase 3 — Worker alignment**
   - `WorkerEngine.sendText` / `sendMedia` → delegate through a worker-side `ChannelDispatchRegistry`
   - `FlowEngineGlobal.sendMessage` → same pattern
   - `SendMessageHandler` → pass through registry

4. **Phase 4 — Transport layer unification**
   - `kloel/channel-transport.providers.ts` adapters are ALREADY close to the port shape.
     Either (a) make them implement `ChannelDispatchPort` directly, or (b) create thin
     adapters that bridge `ChannelTransportProvider` → `ChannelDispatchPort`.

## Back-Compat Strategy

- **Existing services keep their public methods** (e.g., `WhatsAppService.sendMessage`,
  `AdminChatService.sendMessage`). No caller is broken.
- **Internally**, each service method delegates to `ChannelDispatchRegistry.send()` with a
  `ChannelSendInput` discriminated union.
- **New services** call `ChannelDispatchRegistry.send()` directly — never a channel-specific
  method.
- **Channel-specific adapters** (`WahaProvider.sendMessage`, `InstagramService.sendMessage`, etc.)
  remain as internal implementation details of their respective adapters. Their public signatures
  do NOT need to change.
- **The port IS the contract.** Adapters translate from the port's shape to the provider's
  native shape. No provider knowledge leaks above the adapter.

## Files Created

| File | Purpose |
| --- | --- |
| `backend/src/common/channel-dispatch/channel-dispatch.port.ts` | Canonical `ChannelDispatchPort` interface + discriminated `ChannelSendInput` union + `ChannelSendResult` |
| `backend/src/common/channel-dispatch/channel-dispatch.registry.ts` | `ChannelDispatchRegistry` — resolves adapters by `ChannelKind`, delegates `send()` |
| `docs/architecture/CHANNEL_DISPATCH_CANONICAL.md` | This document |

