# WAVE 21 — Channel Dispatch Canonical Report

> Authored by PI atomic subagent `w21-canonical-channel-dispatch` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date**: 2026-05-26
**Status**: COMPLETE (design + contract only, no migration)
**TSC**: PASS

## 1. Inventory — 44 Call Sites

### WhatsApp (26 sites)

| # | File | Method | Params |
| --- | --- | --- | --- |
| 1 | `whatsapp/providers/waha.provider.ts:34` | `sendMessage` | `(sessionId, to, message, opts?)` |
| 2 | `whatsapp/providers/waha.provider.ts:57` | `sendImageFromUrl` | `(sessionId, to, imageUrl, caption?)` |
| 3 | `whatsapp/providers/waha.provider.ts:72` | `sendMediaFromUrl` | `(sessionId, to, mediaUrl, caption?, mediaType?, opts?)` |
| 4 | `whatsapp/providers/waha.provider.ts:99` | `sendMedia` | `(sessionId, to, mimetype, data, filename?, caption?, opts?)` |
| 5 | `whatsapp/providers/waha.provider.ts:122` | `sendLocation` | `(sessionId, to, lat, lng, desc?)` |
| 6 | `whatsapp/providers/whatsapp-api.provider.ts:155` | `sendMessage` | `(workspaceId, to, message, opts?)` |
| 7 | `whatsapp/providers/whatsapp-api.provider.ts:174` | `sendMediaFromUrl` | `(workspaceId, to, mediaUrl, caption?, mediaType?, opts?)` |
| 8 | `whatsapp/whatsapp-message-dispatcher.service.ts:55` | `sendMessage` | `(ws, to, message, opts?)` |
| 9 | `whatsapp/whatsapp-message-dispatcher.service.ts:106` | `sendTemplate` | `(ws, to, template)` |
| 10 | `whatsapp/whatsapp-message-dispatcher.service.ts:141` | `sendDirectMessage` | `(ws, to, message)` |
| 11 | `whatsapp/whatsapp.service.ts:385` | `sendMessage` | `(ws, to, message, opts?)` |
| 12 | `whatsapp/whatsapp.service.ts:391` | `sendTemplate` | `(ws, to, template)` |
| 13 | `whatsapp/whatsapp.service.ts:395` | `sendDirectMessage` | `(ws, to, message)` |
| 14 | `kloel/channel-transport-whatsapp.provider.ts:42` | `send` | `(workspaceId, request: ChannelSendRequest)` |
| 15 | `worker/providers/whatsapp-api-provider.ts:133` | `sendText` | `(workspace, to, message, opts?)` |
| 16 | `worker/providers/whatsapp-api-provider.ts:152` | `sendMedia` | `(workspace, to, type, url, caption?, opts?)` |
| 17 | `worker/providers/auto-provider.ts:14` | `sendText` | `(workspace, to, message)` |
| 18 | `worker/providers/auto-provider.ts:35` | `sendMedia` | `(workspace, to, type, url, caption?)` |
| 19 | `worker/providers/unified-whatsapp-provider.ts:106` | `sendText` | `(workspaceOrId, to, message, opts?)` |
| 20 | `worker/providers/unified-whatsapp-provider.ts:116` | `sendMedia` | `(workspaceOrId, to, type, url, caption?, opts?)` |
| 21 | `worker/whatsapp-engine.ts:202` | `sendText` | `(workspace, to, message, opts?)` |
| 22 | `worker/whatsapp-engine.ts:282` | `sendMedia` | `(workspace, to, type, url, caption?, opts?)` |
| 23 | `worker/send-message-handler.ts:27` | `handleSendMessage` | `(job)` |
| 24 | `worker/flow-message-sender.helpers.ts:13` | `sendMessage` | `(deps, user, text, wsId?)` |
| 25 | `worker/flow-engine-global.ts:466` | `sendMessage` | `(user, text, wsId?)` |
| 26 | `worker/flow-node-executor.interactions.ts:76` | `WhatsAppEngine.sendMedia` | `(workspace, user, type, url, caption?)` |

### WhatsApp Tool Layer (3 sites)

| # | File | Method | Params |
| --- | --- | --- | --- |
| 27 | `kloel/kloel-tool-executor-whatsapp.service.ts:94` | `toolSendWhatsAppMessage` | `(wsId, args)` |
| 28 | `kloel/kloel-chat-tools.service.ts:458` | `toolSendChannelMessage` | `(wsId, args)` |
| 29 | `kloel/brain-capability-executor.service.ts:376` | `sendMessageViaChannel` | `(wsId, args?)` |

### Billing/Payment Callers of WhatsAppService (2 sites)

| # | File | Method | Params |
| --- | --- | --- | --- |
| 30 | `billing/billing-checkout-helper.service.ts:71` | `whatsappService.sendMessage` | `(wsId, phone, message)` |
| 31 | `billing/billing-webhook.helpers.ts:142` | `notifier.sendMessage` | `(wsId, phone, message)` |

### Campaigns Caller (1 site)

| # | File | Method | Params |
| --- | --- | --- | --- |
| 32 | `campaigns/campaigns.service.ts:253` | `metaWhatsApp.sendTextMessage` | `(wsId, phone, bodyText, ...)` |

### Instagram (2 sites)

| # | File | Method | Params |
| --- | --- | --- | --- |
| 33 | `meta/instagram/instagram.service.ts:29` | `sendMessage` | `(igAccountId, recipientId, text, accessToken)` |
| 34 | `kloel/channel-transport.providers.ts:88` | `InstagramChannelTransport.send` | `(wsId, request)` |

### Messenger (3 sites)

| # | File | Method | Params |
| --- | --- | --- | --- |
| 35 | `meta/messenger/messenger.service.ts:23` | `sendTextMessage` | `(pageId, recipientId, text, accessToken)` |
| 36 | `meta/messenger/messenger.service.ts:41` | `sendMediaMessage` | `(pageId, recipientId, type, url, accessToken)` |
| 37 | `kloel/channel-transport.providers.ts:162` | `MessengerChannelTransport.send` | `(wsId, request)` |

### Facebook (1 site)

| # | File | Method | Params |
| --- | --- | --- | --- |
| 38 | `marketing/facebook-messenger.service.ts:41` | `sendMessage` | `(wsId, pageId, psid, text, accessToken)` |

### Email (7 sites)

| # | File | Method | Params |
| --- | --- | --- | --- |
| 39 | `marketing/mailbox-gmail-oauth/send.service.ts:24` | `sendMessageFromMailbox` | `(wsId, {toEmail, subject?, html?, proactive?})` |
| 40 | `marketing/mailbox-gmail-oauth.service.ts:115` | `sendMessageFromMailbox` | `(wsId, input)` |
| 41 | `marketing/mailbox-imap-smtp.service.ts:138` | `sendMessageFromMailbox` | `(wsId, {toEmail, subject?, html?, proactive?})` |
| 42 | `marketing/mailbox-microsoft-oauth.service.ts:148` | `sendMessageFromMailbox` | `(wsId, {toEmail, subject?, html?, proactive?})` |
| 43 | `kloel/channel-transport.providers.ts:240` | `EmailChannelTransport.send` | `(wsId, request)` |
| 44 | `worker/providers/email-provider.ts:19` | `sendText` | `(workspace, to, message)` |
| 45 | `worker/providers/email-provider.ts:62` | `sendMedia` | `(workspace, to, type, url, caption?)` |

### Internal Chat (2 sites)

| # | File | Method | Params |
| --- | --- | --- | --- |
| 46 | `partnerships/partnerships.chat.helpers.ts:81` | `sendMessage` | `(prisma, partnerId, content, senderId, senderName)` |
| 47 | `admin/chat/admin-chat.service.ts:245` | `sendMessage` | `(input: SendMessageInput)` |

### Autopilot (1 site)

| # | File | Method | Params |
| --- | --- | --- | --- |
| 48 | `autopilot/autopilot.service.ts:397` | `sendDirectMessage` | `(wsId, contactId, message)` |

### Public API (1 site)

| # | File | Method | Params |
| --- | --- | --- | --- |
| 49 | `public-api/public-api.controller.ts:42` | `sendMessage` | `(body: {phone, message})` |

## 2. Per-Channel Adapter Mapping

| ChannelKind | Adapter file (future) | Wraps |
| --- | --- | --- |
| `whatsapp` | `common/channel-dispatch/adapters/whatsapp-dispatch.adapter.ts` | `WhatsAppMessageDispatcherService` → `WhatsAppProviderRegistry` |
| `instagram` | `common/channel-dispatch/adapters/instagram-dispatch.adapter.ts` | `InstagramService.sendMessage()` |
| `messenger` | `common/channel-dispatch/adapters/messenger-dispatch.adapter.ts` | `MessengerService.sendTextMessage()` |
| `facebook` | `common/channel-dispatch/adapters/facebook-dispatch.adapter.ts` | `FacebookMessengerService.sendMessage()` |
| `email` | `common/channel-dispatch/adapters/email-dispatch.adapter.ts` | `GmailSendService`, `MailboxImapSmtpService`, `MailboxMicrosoftOAuthService` |
| `internal-partnership` | `common/channel-dispatch/adapters/partnership-dispatch.adapter.ts` | `partnerships.chat.helpers.sendMessage()` |
| `internal-admin` | `common/channel-dispatch/adapters/admin-dispatch.adapter.ts` | `AdminChatService.sendMessage()` |

## 3. Canonical Port Interface (verbatim)

```typescript
// backend/src/common/channel-dispatch/channel-dispatch.port.ts

export enum ChannelKind {
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
  MESSENGER = 'messenger',
  FACEBOOK = 'facebook',
  EMAIL = 'email',
  INTERNAL_PARTNERSHIP = 'internal-partnership',
  INTERNAL_ADMIN = 'internal-admin',
}

export type ChannelSendInput =
  | WhatsAppSendInput
  | InstagramSendInput
  | MessengerSendInput
  | FacebookSendInput
  | EmailSendInput
  | InternalPartnershipSendInput
  | InternalAdminSendInput;

export interface ChannelSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  blocked?: boolean;
  blockedReason?: string;
  queued?: boolean;
  delivery?: 'direct' | 'queued';
  externalId?: string;
  provider?: string;
}

export interface ChannelDispatchPort {
  readonly channelKind: ChannelKind;
  send(input: ChannelSendInput): Promise<ChannelSendResult>;
  isConfigured?(): boolean;
  capability?(workspaceId: string): Promise<ChannelCapability>;
}

export interface ChannelCapability {
  channel: ChannelKind;
  sendAvailable: boolean;
  sendBlockedReason: string | null;
  requiredSetup: string[];
}
```

## 4. Files Created

| File | Lines | Purpose |
| --- | --- | --- |
| `backend/src/common/channel-dispatch/channel-dispatch.port.ts` | 89 | `ChannelKind` enum, 7 discriminated input types, `ChannelSendResult`, `ChannelDispatchPort` interface, `ChannelCapability` |
| `backend/src/common/channel-dispatch/channel-dispatch.registry.ts` | 56 | `ChannelDispatchRegistry` — NestJS injectable that collects and resolves adapters by `ChannelKind` |
| `docs/architecture/CHANNEL_DISPATCH_CANONICAL.md` | 131 | Full taxonomy with inventory, classification, migration order, back-compat strategy |
| `WAVE21_CHANNEL_DISPATCH_REPORT.md` | — | This report |

## 5. Backend TypeScript Compilation

```
$ npm --prefix backend run typecheck
> backend@0.0.1 typecheck
> tsc -p tsconfig.build.json --noEmit

(no output — exit code 0)
```

**Result: PASS**

## 6. Why Each KEEP-LOCAL Stays Local

| # | Call site | Reason |
| --- | --- | --- |
| 5 | `WahaProvider.sendLocation(lat, lng, desc)` | Location is a UI-level feature with lat/lng coordinates — not a generic text/media send. Adding it to the port would bloat the contract for seven channels that don't support it. |
| 9 | `WhatsAppMessageDispatcher.sendTemplate(name, language, components)` | Template send has a Meta-specific shape with template approval lifecycle. The `name`/`language`/`components[]` shape does not generalize to Instagram, Messenger, Email, etc. |
| 44 | `PublicApiController.sendMessage(body)` | This endpoint persists to InboxService only (`saveMessageByPhone`). It does NOT trigger delivery. The port is for delivery, not persistence. The eventual delivery happens through a separate flow that SHOULD use the port. |

