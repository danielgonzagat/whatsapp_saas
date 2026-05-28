# Kloel Canonical Vocabulary — Family Glossary

> Authored by PI atomic subagent `w21-canonical-vocabulary-r2` (Round 2).
> Artifact of the Architectural Semantic Canonicalization mission.
> Materialized 2026-05-26.

> **Purpose**: Expand CANONICAL_VOCABULARY.md with semantic-family grouping
> tables. Each table maps a canonical concept across its aliases, domain
> constraints, and the conditions under which each alias is permitted.
> This document is the **authoritative cross-reference** for the
> Contact/Lead/Customer/Prospect/Client/User family and the
> ChannelSession/WhatsappSession/WaSession/Connection/Instance/BotSession
> family.

---

## How to read

- **Canonical** = the one name you MUST use in new code.
- **Alias** = a name observed in the codebase that maps to the canonical.
- **Domain** = the bounded context where this name is valid.
- **When permitted** = the narrow conditions under which the alias is
  acceptable (if any). Absent = must migrate.
- **Prisma model** = the database entity backing this concept.

---

## Family I — Contact / Lead / Customer / Prospect / Client / User

### Semantic overview

```
                    ┌──────────┐
                    │   User   │  (auth domain — authenticated human)
                    │  Agent   │  Prisma: RAC_Agent
                    └────┬─────┘
                         │ (distinct — different bounded context)
                         │
  ┌──────────────────────┼──────────────────────┐
  │                      │                      │
  ▼                      ▼                      ▼
┌─────────┐        ┌──────────┐          ┌───────────┐
│ Contact │◄───────│   Lead   │          │ Customer  │
│ (crm)   │  links │ (funnel) │converts  │(checkout) │
│ RAC_    │  to    │ KloelLead│─────────►│ Checkout  │
│ Contact │        │+SocialLd│          │ Order     │
└─────────┘        └──────────┘          └───────────┘
     │                   │
     │ (semantic alias)  │
     ▼                   ▼
┌──────────┐       ┌──────────┐
│ Prospect │       │  Client  │
│ (pre-    │       │ (post-   │
│ funnel)  │       │ purchase)│
└──────────┘       └──────────┘
```

### Canonical term table

| Canonical | Alias | Domain | Prisma model | When permitted |
|---|---|---|---|---|
| **User** | `Agent` | `auth` | `RAC_Agent` | Prisma entity name (canonical at DB layer) |
| **User** | `AdminUser` | `auth` / `admin` | `AdminUser` | Admin panel operators only; distinct from workspace Agent |
| **User** | `userId` | `auth` / `kloel` | — | JWT payload field (e.g., `brain-runtime.service.ts:203`); always refers to Agent |
| **User** | `Operator` | `admin` | — | Deprecated; migrate to `AdminUser` or `Agent` |
| **User** | `Member` | `auth` | — | Workspace membership role name; NOT a standalone entity |
| **Contact** | — | `contacts` / `crm` | `RAC_Contact` | **Canonical** for CRM/inbox person reachable via messaging channels |
| **Contact** | `buyer` | `checkout` | — | Legacy informal usage in `mercado-pago-pix.service.ts:12-16`; migrate to `Contact` |
| **Contact** | `Prospect` | `kloel` / `defens` | — | Pre-funnel person (doc-comment only; `case-library.builder.ts:11`). NOT a Prisma entity. Use `Contact` with status/segment |
| **Contact** | `Client` | _(none)_ | — | No domain entity; `@prisma/client` imports dominate (471+ files). `resolveClientIp` is infra, not entity |
| **Lead (KloelLead)** | `lead` | `kloel` / `autopilot` | `RAC_KloelLead` | AI-driven lead entity: `status` (new/hot/warm/cold/converted/lost), `stage`, `score` |
| **Lead (KloelLead)** | `kloelLead` | `analytics` | `RAC_KloelLead` | Used in `analytics.service.ts:332` for counting; canonical at Prisma level |
| **Lead (Social)** | `CheckoutSocialLead` | `checkout` | `RAC_CheckoutSocialLead` | Pre-checkout captured lead (Google/Facebook/Apple auth). Links to `Contact` via `contactId`. Converts to `CheckoutOrder` via `convertedOrderId` |
| **Lead (Social)** | `checkoutSocialLead` | `checkout` / `admin` | `RAC_CheckoutSocialLead` | `admin-marketing.service.ts:75` — aggregate counting |
| **Lead (Social)** | `capturedLeadId` | `checkout` | — | Field on `CheckoutOrder.metadata`; references `CheckoutSocialLead.id` |
| **Lead (Social)** | `socialLead` | `checkout` | — | Informal in `checkout-public.controller.ts:143`; migrate to full model name |
| **Customer** | `customerName` / `customerEmail` / `customerCPF` / `customerPhone` | `checkout` | `RAC_CheckoutOrder` | Fields on `CheckoutOrder` — the person who placed the order. NOT a standalone entity |
| **Customer** | `customer` / `stripeCustomerId` | `billing` | — | Stripe customer ID on `Workspace` (billing context); NOT a CRM entity |
| **Customer** | `Customer` (conceptual) | `admin` / `transactions` | — | `list-transactions.types.ts:14-18` — admin-view projection of `CheckoutOrder.customer*` fields |

### Domain constraints

1. **User ≠ Contact**: A `User` (Agent) has login credentials. A `Contact` has a phone number. They are distinct entities in different bounded contexts. Do NOT use `User` to mean `Contact`.

2. **Contact is the hub**: Both `KloelLead` and `CheckoutSocialLead` link back to `Contact` via `contactId`. `Contact` is the canonical identity for a person in the CRM.

3. **Lead is funnel-stage, not identity**: `KloelLead` represents where a Contact is in the sales funnel (status/stage/score). `CheckoutSocialLead` represents a pre-checkout capture. Both are temporary states — a Lead converts to a Customer (via `CheckoutOrder`).

4. **Customer is transactional, not an entity**: There is no `Customer` Prisma model. "Customer" is a role a Contact assumes after completing a purchase. The `CheckoutOrder.customer*` fields are denormalized snapshots.

5. **Prospect is pre-Contact**: Not yet in the system. No model. Informal. Use `Contact` with a `status` or `source` filter.

6. **Client has zero domain meaning in Kloel**: The word appears almost exclusively in `@prisma/client` imports (471+ files). The few non-import uses (`resolveClientIp`, `StripeClient`) are infrastructure, not domain entities.

### Migration status summary

| Status | Count | Notes |
|---|---|---|
| ✅ Canonical enforced | 2 | `User`/`Agent`, `Contact` |
| ⏳ Aliases entrenched | 4 | `Lead` (both models), `Customer` (fields), `buyer` |
| ⛔ Overlap risk | 2 | `Prospect` (no model), `Client` (prisma import noise) |

---

## Family II — ChannelSession / WhatsappSession / WaSession / Connection / Instance / BotSession

### Semantic overview

```
┌─────────────────────────────────────────────────────┐
│                  ChannelSession                      │
│  (canonical — runtime connection to messaging       │
│   channel; lives in Workspace.providerSettings)      │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │         WhatsappSessionService                 │  │
│  │  (NestJS service managing WhatsApp sessions)    │  │
│  │  emits: commerce.whatsapp.session_lifecycle     │  │
│  │  sub-events: qr | connected | disconnected |    │  │
│  │              banned                             │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  whatsappApiSession (JSON field on Workspace)   │  │
│  │  type: ProviderSessionSnapshot                  │  │
│  │  stored in: providerSettings.whatsappApiSession │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Canonical term table

| Canonical | Alias | Domain | Source | When permitted |
|---|---|---|---|---|
| **ChannelSession** | — | `whatsapp` / `omnichannel` | CANONICAL_VOCABULARY.md | **Canonical** — use for conceptual discussion and new code |
| **ChannelSession** | `WhatsappSessionService` | `whatsapp` | `whatsapp-session.service.ts` | NestJS service class name (canonical at implementation level) |
| **ChannelSession** | `whatsappApiSession` | `whatsapp` | `providerSettings` JSON field on `Workspace` | JSON field name in `ProviderSettings`; acceptable at data layer |
| **ChannelSession** | `waSession` | `kloel` | `unified-agent-context.service.ts:226` | Local variable — reads `whatsappApiSession`; migrate variable name to `channelSession` |
| **ChannelSession** | `providerSettings` | `whatsapp` | `schema.prisma:122` | Top-level JSON container; NOT a session alias — it CONTAINS the session |
| **ChannelSession** | `WhatsAppSessionState` | `whatsapp` | `whatsapp-api.provider.helpers.ts:2` | Type union: `CONNECTED \| DISCONNECTED \| ...`; acceptable as provider-internal type |
| **ChannelSession** | `connectionStatus` | `whatsapp` | `provider-settings.types.ts:138` | String field inside `providerSettings`; acceptable as status indicator |
| **ChannelSession** | `MetaConnection` | `whatsapp` / `integrations` | `schema.prisma:246` | OAuth connection model — distinct concept: OAuth-level auth, not runtime session |
| **ChannelSession** | `connection` (inf.) | `whatsapp` | Provider messages | Provider-facing status text; NOT a domain entity |
| **ChannelSession** | `instance` | `whatsapp` | `whatsapp-watchdog.service.ts:284` | Watchdog lock message: "another instance is already reconnecting"; process-level, not session |
| **ChannelSession** | `botSession` | _(legacy)_ | Not found in current code | Historical alias; listed in CANONICAL_VOCABULARY.md as legacy |
| **ChannelSession** | `WAHASession` | _(legacy)_ | Not found in current code | Historical alias for WAHA provider sessions; deprecated in favor of MetaCloud |

### Domain constraints

1. **ChannelSession is the canonical concept**: A runtime connection to a messaging channel. It is stored as `whatsappApiSession` inside `providerSettings` on `Workspace`. There is NO dedicated Prisma model for it (⏳ migration status).

2. **WhatsappSessionService is the manager**: This NestJS service owns session lifecycle (create, status, disconnect). It emits `commerce.whatsapp.session_lifecycle` Spine events.

3. **whatsappApiSession is the data**: The JSON field name in `ProviderSettings`. It holds a `ProviderSessionSnapshot` (status, phoneNumber, pushName, qrCode, etc.).

4. **connectionStatus is a derived field**: A string inside `providerSettings` used for quick status checks. It is NOT the session itself.

5. **MetaConnection is OAuth, not session**: The `MetaConnection` Prisma model stores OAuth tokens for Meta platform integration. It is distinct from the runtime ChannelSession.

6. **instance is a process, not a session**: Watchdog uses "instance" to mean a running Node process holding a distributed lock. Not a domain entity.

7. **botSession and WAHASession are dead**: Not found in current code. They are historical aliases from the WAHA provider era.

### Session sub-event taxonomy

`commerce.whatsapp.session_lifecycle` is emitted with an `input.event` field that carries one of:

| Sub-event | Meaning | Emitter |
|---|---|---|
| `qr` | QR code generated, waiting for scan | `whatsapp-session.service.ts:65` |
| `connected` | Session authenticated and live | `whatsapp-session.service.ts:75` / `internal-whatsapp-runtime.controller.ts:127` |
| `disconnected` | Session torn down (manual or error) | `whatsapp-session.service.ts:134` |
| `banned` | Session terminated by provider (policy) | _(inferred from `SessionLifecycleInput.event` type union)_ |

---

## Related

- [CANONICAL_VOCABULARY.md](CANONICAL_VOCABULARY.md) — master term list (47 terms)
- [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md) — canonical event inventory
- [DEPRECATION_MAP.md](DEPRECATION_MAP.md) — alias → canonical migration tracking
- [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md) — bounded contexts