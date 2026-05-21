# Kloel Canonical Vocabulary

> The single official name for every recurring concept. New code MUST use the
> canonical name. Aliases listed are deprecated or context-specific.
>
> Anti-regression: `scripts/ops/check-canonical-duplicates.mjs` flags new
> implementations that look like aliases of a canonical capability.

## Domain entities

| Canonical | Aliases (migrate) | Scope note |
|---|---|---|
| `Workspace` | `Tenant`, `Org`, `Account` | Multi-tenant isolation unit |
| `User` | `Agent` (inbox role), `Operator` (admin context) | Person with login; role qualifiers allowed |
| `Contact` | `Lead`, `Customer`, `Prospect`, `Person` | CRM/Inbox entity; `Lead`/`Customer` only as funnel-stage labels |
| `ChannelSession` | `whatsappSession`, `waSession`, `connection`, `instance`, `botSession`, `WAHASession` | Per-workspace session across messaging channels |
| `Message` | `ChatMessage`, `inboundMessage`, `outboundMessage` | Atomic conversation unit; direction is a field |
| `Conversation` | `Thread`, `Dialog`, `Chat` | Ordered Message[] per (Contact, ChannelSession) |
| `Product` | `Item` (commerce only), `Offer` (marketing only) | Catalog entity; `Offer` is marketing wrapper, not synonym |
| `Plan` | `Tier`, `SubscriptionTier`, `Pricing` | Product variant with billing semantics |
| `Checkout` | `Order` (post-payment only), `Purchase` | Pre-payment intent; becomes `Order` after payment |
| `Payment` | `Charge`, `Transaction` (overloaded) | Money-move event; `Transaction` too overloaded |
| `Wallet` | `Balance` (display), `Account` (collision) | Prepaid balance scoped to Workspace |
| `LedgerEntry` | `Movement`, `Posting`, `JournalEntry` | Append-only; never UPDATE, only compensating entries |
| `Workflow` | `Flow`, `Sequence`, `Automation`, `Funnel` | Declarative orchestration; `Funnel` is UX wrapper |
| `Campaign` | `Broadcast`, `Blast`, `Outreach` | Outbound wave with audience selector |
| `Affiliate` | `Partner`, `Reseller`, `Referrer` | Commission earner; `Partner` allowed in partnerships module only |
| `Webhook` | `Hook`, `Callback`, `Notification`, `IncomingEvent` | External provider → internal event boundary |

## Capabilities (verbs)

| Canonical | Aliases (migrate) | Scope note |
|---|---|---|
| `MessageDispatchService.dispatch` | `sendMessage`, `sendWhatsappMessage`, `sendText`, `wahaSend`, `CampaignSender.send` | Single send pipeline; channel adapters live below |
| `phone.normalize` (E164 digits) | `normalizePhone`, `normalizeNumber`, `cleanPhone`, `formatPhone` (when normalizing) | Digits-only base normalizer |
| `phone.optional` (null on empty) | `normalizePhone` in `checkout-social-lead.util.ts` | Returns `null \| string` for nullable lookups |
| `phone.whatsapp` (strips @c.us/@s.whatsapp.net) | `normalizePhone` in `whatsapp/inbound-processor.helpers.ts` | WhatsApp-specific |
| `WorkspaceContext.resolve` | `resolveTenant`, `resolveWorkspace`, `getTenantId`, `getWorkspaceId`, `extractTenant` | Resolves Workspace from auth + request |
| `normalizeEmail` (`common/string.ts`) | local copies in `auth-service.helpers.ts`, `auth.helpers.ts` | Checkout variant (returns null) stays local |
| `safeStr` (`common/string.ts`) | 4 local copies in kloel/* | Single signature; no exceptions |
| `clamp(value, min, max)` (`common/math.ts`) | 9 prior duplicates | Tuple-domain variant in `evol/types.ts` is a different operator |
| `clampScore` (`common/math.ts`) | 4 prior duplicates | healthy-money local copy preserved |
| `daysSince` (`common/math.ts`) | 3 prior duplicates | Returns fractional days |
| `filterByWorkspace` (`kloel/spine-events.helpers.ts`) | 3 prior duplicates | SpineEvent[] workspace filter |
| `filterByWorkspaceAndEntity` (`kloel/spine-events.helpers.ts`) | — | Pairs with above when entityRef provided |
| `formatBRL` (`frontend/src/lib/common/money.ts`) | 2 prior copies in `cia/*` | Autopilot/brain-settings variants intentionally differ |

## Events (taxonomy)

| Canonical form | Banned forms |
|---|---|
| `channel.message.received` | `message_received`, `whatsapp.message.incoming`, `incomingMessage`, `WA_MESSAGE_RECEIVED` |
| `channel.message.sent` | `outboundMessage`, `messageSent` |
| `channel.message.failed` | `messageFail`, `wa_send_error` |
| `channel.session.connected` | `wa_connected`, `qr_authenticated`, `sessionOpen` |
| `channel.session.disconnected` | `wa_disconnected`, `sessionClose` |
| `conversation.started` | `thread_created`, `newConversation` |
| `conversation.updated` | `conversationDirty`, `thread_touched` |
| `lead.qualified` | `qualifyLead`, `leadQualified`, `prospect.qualified` |
| `checkout.created` | `newCheckout`, `checkoutInit` |
| `checkout.completed` | `checkoutDone`, `checkout.success` |
| `payment.approved` | `paymentSucceeded`, `chargeOK`, `payment.captured` |
| `payment.failed` | `paymentDeclined`, `chargeFail` |
| `payment.refunded` | `refundDone`, `chargeReversed` |
| `campaign.action.scheduled` | `campaignQueued`, `actionPlanned` |
| `campaign.action.executed` | `campaignSent`, `actionFired` |

**Canonical form rules**: lowercase, dot-separator only (no underscore/colon/camelCase), `domain.entity.verb-past-participle` order. The canonical scanner (`scripts/ops/check-canonical-events.mjs`) refuses any new emit that doesn't match this shape.

## Provider names

| Canonical | Aliases (migrate) | Scope note |
|---|---|---|
| `MercadoPago` | `mp`, `MercadoPagoSDK`, `mercado_pago` | PIX BR provider (see [ADR 0009](../adr/0009-mercadopago-pix-stripe-card-split.md)) |
| `Stripe` | `StripeConnect`, `stripe_sdk` | Cartão internacional + Connect (marketplace, payouts) |
| `WAHA` | `whatsapp_http_api`, `WhatsAppWebApi` | WhatsApp QR-based session provider |
| `MetaCloud` | `MetaCloudAPI`, `whatsapp_business`, `wabusiness` | WhatsApp Business Cloud API (official) |
| `Asaas` | — | **Deprecated** as of ADR 0003; do not reintroduce |

## How to add a row

1. Find duplication in `DUPLICATION_REGISTER.md` or `CAPABILITY_MAP.md`
2. Pick the canonical name (domain-clear, no abbreviation, English unless BR-market noun like PIX/CNPJ)
3. List historical aliases (grep the codebase)
4. Add row with scope note for context-specific exceptions
5. Run codemod via `mcp__atomic-edit__atomic_rename_symbol_cross_file`
6. Update `DEPRECATION_MAP.md` with deadline + status
7. Regenerate: `npm run canonical:scan`
8. Gate must remain green: `npm run canonical:check`
