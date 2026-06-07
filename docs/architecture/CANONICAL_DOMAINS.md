# Kloel — Canonical Domain Map

**What this answers:** the authoritative list of Kloel's bounded contexts (domains) — what each one *is for*, which canonical entities it *owns*, what it *must not own*, who it depends on (upstream/downstream), and which backend modules implement it. Use this as the boundary contract when deciding where a new model/service/field belongs, or when resolving the duplication and in-flight-migration debt catalogued in `inventory/_CONSOLIDATED.json`. Every model, service, file, schema line, and flag below is a **real grounded name** — verified against `backend/prisma/schema.prisma`, `backend/src/**`, and the separate `worker/**` deployable. No invented names.

**Last generated:** 2026-06-07 (grounded in `docs/architecture/inventory/_CONSOLIDATED.json`, schema.prisma, backend/src, worker).

> This supersedes the prior auto-generated `scan.mjs` inventory (186 top-level modules). This is the curated **bounded-context** map: nine domains, not 186 folders.

---

## Critic corrections baked into this map (do NOT regress)

These five errors appeared in the v1 docs and are corrected here. They are the load-bearing facts most likely to be re-introduced by a careless edit.

| # | v1 error | Corrected fact (this doc) | Ground |
|---|----------|---------------------------|--------|
| 1 | `ChannelSession` listed as a canonical model/surface | **`ChannelSession` is FICTIONAL** — zero grep matches in `backend/src/**` and `schema.prisma`. The real channel-session surface is **`WhatsappSessionService`** over **`ChannelSetup`** + **`MetaConnection`**. | `whatsapp-session.service.ts:19`; `schema:3492` (ChannelSetup), `schema:3467` (MetaConnection); grep verified 0 hits |
| 2 | `Lead` treated as an alias of `Contact` | **`KloelLead` is NOT an alias of `Contact`.** `KloelLead` (`RAC_KloelLead`) is a **separate live table** distinct from `Contact` (`RAC_Contact`). Recorded as an **open P1 MERGE DECISION**, not a settled alias. | `schema:1834` (KloelLead), `schema:399` (Contact) |
| 3 | `OpsEvent` and `RiscEvent` absent | Both are **LIVE models** with real writers. `OpsEvent` ← `OpsAlertService`; `RiscEvent` ← `ComplianceService.routeRiscEvent` (this IS the processor, not an ingest-only stub). | `schema:1614` (OpsEvent), `schema:1273` (RiscEvent); `ops-alert.service.ts`, `compliance.service.ts:140` |
| 4 | `campaign-jobs` / `voice-jobs` / `media-jobs` flagged as dead queues | They have **live workers** in the separate `worker/` deployable. **Only `mass-send` is genuinely questionable.** | `worker/campaign-processor.ts:147` `campaignWorker`, `worker/voice-processor.ts:253` `voiceWorker`, `worker/media-processor.ts:15` `mediaWorker` |
| 5 | Migrations shown as converged | Three are **mid-migration, NOT converged**: `KloelMemory→MindMemory` dual-write; `MindMessage` canonical-but-dead-on-read; `ProductPlan.price→CheckoutProductPlan.priceInCents`. | `mind-memory-item.service.ts:96` (`KLOEL_MINDMEMORY_DUALWRITE`); `KLOEL_MINDMESSAGE_DUALWRITE`; `schema:2213` vs `schema:2969` |

---

## Domain dependency map (ASCII)

Arrows point in the direction of a **runtime dependency / data flow** (`A ──▶ B` = A produces work or data consumed by B). The tenancy boundary (`workspaceId`) flows from **Identity** into every box and is omitted from the arrows to keep the graph readable.

```
                          ┌──────────────────────────────────────────┐
                          │  IDENTITY, AUTH & TENANT                  │
                          │  Workspace · Agent · AdminUser · ApiKey   │
                          │  RiscEvent (RISC cross-account protection)│
                          └───────────────┬──────────────────────────┘
                       workspaceId tenancy │ (flows into EVERY domain)
        ┌───────────────────────┬──────────┼───────────────────┬──────────────────┐
        ▼                       ▼           ▼                   ▼                  ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│ CHANNELS &       │  │ CONTACT, CRM &   │  │ PRODUCT, PLAN &      │  │ CHECKOUT, PAYMENT &  │
│ OMNICORE DISPATCH│  │ LEAD IDENTITY    │  │ OFFER / MEMBER AREA  │  │ WALLET               │
│ MetaConnection   │  │ Contact ⇄ Kloel- │  │ Product · Checkout-  │  │ CheckoutOrder/Payment│
│ ChannelSetup     │  │ Lead (P1 MERGE)  │  │ ProductPlan(¢)       │  │ KloelSale · 5 wallets│
│ WebhookEvent     │  │ Pipeline/Deal    │  │ Coupon · MemberArea  │  │ + ledgers · payouts  │
└───┬──────────┬───┘  └───┬──────────┬───┘  └──────────┬───────────┘  └──────┬─────────┬─────┘
    │          │          │          │                 │ pricing reads        │         │
    │ Normalized          │ inbound  │ lead            │ CheckoutProductPlan  │ payment │ auto-
    │ Message             │ resolution conversion       ▼ .priceInCents        │ link    │ enroll
    │ ingest    │ percept │          │          ┌──────────────────┐          │ send    │
    ▼          ▼ hook     ▼          ▼          │  (Checkout reads  │◀─────────┘         ▼
┌──────────────────────┐ │  ┌────────────────┐ │   Product/Plan)   │           (Member Area
│ CONVERSATION,        │ │  │  (Checkout      │ └──────────────────┘            enrollment)
│ MESSAGE & THREAD     │ │  │   syncs Checkout-│
│ Message · KloelMsg   │ │  │   SocialLead ⇄  │      commerce.* spine events
│ ChatThread · Mind-   │ │  │   Contact)      │            │
│ Message(dead-on-read)│ │  └────────────────┘            │
└──────────┬───────────┘ │                                ▼
   history  │            percept                 ┌──────────────────────────────┐
   reads    └──────────────┬────────────────────▶│  KLOEL MIND COGNITIVE CORE   │
                           │                      │  perceive→predict→belief→    │
                           │   decide ──▶ dispatch│  surprise→policy→memory→tick │
                           │◀─────────────────────│  MindBelief/Prediction/Policy│
                           │  (back to Channels)  │  MindMemory ⇄ KloelMemory    │
                                                  │  MindOutboxEvent · CIA       │
                                                  └──────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │ OBSERVABILITY & OPS  (cross-cutting)  —  OpsEvent ◀── every service (errors)  │
  │ distinct from the cognitive spine (Mind owns AutopilotEvent/MindOutboxEvent) │
  └─────────────────────────────────────────────────────────────────────────────┘
```

Read it as: **Identity** is the root (owns the tenancy boundary). **Channels** ingest inbound and run outbound. **Conversation** persists every message. **Contact/CRM** resolves the human. **Product** defines what's for sale; **Checkout** transacts it and fans money into the wallets/ledgers. **Mind** sits in the middle as the cognitive loop: it reads conversation history + commerce spine events as percepts, decides, and dispatches back through Channels. **Observability** is a sideband error sink touched by everyone.

---

## Domain catalogue

Nine bounded contexts. Each entry: purpose → owned canonical entities → boundaries (`mustNotOwn`) → upstream/downstream → implementing modules.

---

### 1. Identity, Auth & Tenant

**Purpose:** Tenant root + tenant-user identity + sessions/tokens + OAuth/passwordless + MFA + team/collaborator invites + API keys + platform-admin auth + compliance (GDPR/RISC). The `workspaceId` tenancy boundary originates here.

**Owns (canonical entities):**

| Entity | Backing model | Note |
|--------|---------------|------|
| Workspace | `Workspace` (`RAC_Workspace`, schema:119) | Tenant root; `workspaceId` FK on nearly every model. Membership is implicit via `Agent.workspaceId` — no membership join table. |
| Agent | `Agent` | Tenant-user principal; role lives on Agent; `@@unique([workspaceId, email])`. |
| RefreshToken, DeviceToken, PasswordResetToken, MagicLinkToken | resp. models | Token families. `RefreshToken.token` (schema:1155) + `PasswordResetToken.token` (schema:1184) are **plaintext at rest** (P1 — `AdminSession.token_hash` / `MagicLinkToken.tokenHash` are sha256-hashed). |
| SocialAccount | `SocialAccount` | OAuth identity link. |
| Invitation, CollaboratorInvite | schema:1286 / schema:2768 | **Two parallel invite models** (P1 pick-one) — `TeamService` vs `PartnershipsService`. |
| ApiKey | `ApiKey` (schema:1649) | PBKDF2-hashed; `ApiKeysService.validateKey` does an O(n) full-table PBKDF2 scan (P1 DoS amplifier). |
| Persona | `Persona` | Agent persona. |
| AdminUser, AdminSession, AdminPermission, AdminAuditLog, AdminLoginAttempt | admin auth models | Platform-admin stack — **fully duplicates the tenant auth stack with no shared core** (P1). |
| CookieConsent, DataDeletionRequest, GdprRequest | compliance models | GDPR surface. |
| **RiscEvent** | `RiscEvent` (schema:1273) | **LIVE** (correction #3). Written + routed by `ComplianceService.routeRiscEvent` (`compliance.service.ts:140`) — this IS the processor, not an ingest-only stub. |

**Must NOT own:** `Contact`, `KloelLead`, `Message`, any commerce/wallet model.

**Modules:** `backend/src/auth`, `backend/src/api-keys`, `backend/src/team`, `backend/src/workspaces`, `backend/src/admin/auth`, `backend/src/partnerships` (CollaboratorInvite half), `backend/src/compliance` (RiscEvent).

**Upstream:** (none — root domain). **Downstream:** every domain (the `workspaceId` tenancy boundary).

**Canonical request→workspaceId resolver:** `resolveWorkspaceId` (`auth/workspace-access.ts:119`) — the only variant that proves the caller owns the workspace. The `kloel-security.guard.ts:45` / `common.helpers.ts:20` variants are an **open P0 IDOR risk**; `partnerships.controller.ts:44` is already converged onto the secure one.

---

### 2. Contact, CRM & Lead Identity

**Purpose:** Canonical person identity, cross-channel identity resolution/merge, lead funnel + scoring, CRM pipeline/deals/tags. **Contains the open Contact-vs-KloelLead merge decision.**

**Owns (canonical entities):**

| Entity | Backing model | Note |
|--------|---------------|------|
| **Contact** | `Contact` (`RAC_Contact`, schema:399) | **Declared canonical person**, unique `(workspaceId, phone)`. |
| **KloelLead** | `KloelLead` (`RAC_KloelLead`, schema:1834) | **NOT an alias of Contact** (correction #2). Separate live table, unique `(workspaceId, phone)`. Live backing store for the WhatsApp lead-processing path and `GET /kloel/leads/:workspaceId` (`LeadsService`). |
| ContactInsight, ContactIdentityLink, ChannelIdentifier | resp. models | Insight, merge-link, per-channel identifier. |
| KloelConversation | `KloelConversation` (schema:1865) | Lead-funnel message log (also read by the Conversation domain). |
| ScrapedLead | `ScrapedLead` (schema:779) | Distinct identity surface until imported. |
| Tag, Pipeline, Stage, Deal | CRM models | Pipeline/deals/tags. Note: CRM aliases `Deal` as `'lead'` in `getPipeline` (`stage.leads = deals`) — a pipeline naming overload, **distinct** from the Lead entity. |

**Must NOT own:** `Message` (`RAC_Message` — owned by Conversation domain), `CheckoutSocialLead` persistence (owned by Checkout, only synced here), `Workspace`/`Agent`.

**Modules:** `backend/src/contacts`, `backend/src/crm`, `backend/src/kloel` (lead processor + mind coordinators + `leads.service.ts`), `backend/src/scrapers`.

**Upstream:** Channels/OmniCore (inbound messages → contact resolution); Checkout (`CheckoutSocialLead` sync). **Downstream:** Kloel Mind (lead percepts); Checkout (lead conversion).

**Open decisions in this domain:**
- **P1 MERGE DECISION — Contact vs KloelLead:** `Contact` is the *declared* canonical person (PERSON migration), but cut-over is incomplete: `LeadsService` still reads `KloelLead` while CRM reads `Contact`, so the two screens can disagree. Bridged via `Contact.kloelLeadId` (schema:444) + best-effort dual-write implemented directly in the three lead services (`kloel-lead-processor.service.ts`, `lead-mind-coordinator.service.ts`, `whatsapp-mind-coordinator.service.ts`) + the `person-kloel-lead-to-contact.backfill.*` core (`backend/src/prisma/backfills/`) — there is **no dedicated `*.flag.ts` file** for this migration (unlike `mindmessage-dualwrite.flag.ts`). Treat as an **open merge, NOT a settled alias.**
- **P0 phone-normalization divergence:** `Contact`/`KloelLead` writes key on divergently-normalized phone (BR-promoting `normalizePhone().digits` vs `digitsOrNull` vs raw). Canonical: `normalizePhone()` (`common/phone/phone-normalization.util.ts:150`). All `(workspaceId, phone)` writes must route through it.
- **Orphan merge service:** `ContactIdentityMergeService` (`contacts/contact-identity-merge.service.ts`) has **zero production callers** despite live duplication paths — must be activated to reconcile fragmented rows.

---

### 3. Conversation, Message & Thread

**Purpose:** All message + conversation persistence: omnichannel inbox, brain dialog, dashboard threads, lead-funnel logs, admin/partner chat, and the intended-canonical unified `MindMessage` layer (**currently dead-on-read**).

**Owns (canonical entities):**

| Entity | Backing model | Note |
|--------|---------------|------|
| Conversation | `Conversation` (`RAC_Conversation`, schema:682) | Customer-facing omnichannel thread (singleton-open per `workspace,contact,channel`). |
| **Message** | `Message` (`RAC_Message`, schema:721) | Canonical omnichannel inbox store via `InboxService.saveMessage`. |
| KloelMessage | `KloelMessage` (schema:1691) | Brain dialog — real read/write via `MindMessageService`. De-facto canonical for the brain surface. |
| ChatMessage, ChatThread | schema:1899 / 1885 | Dashboard assistant chat container (distinct from the inbox Conversation). |
| KloelConversation | `KloelConversation` (schema:1865) | Lead funnel log (shared with Contact domain). |
| **MindMessage** | `MindMessage` (`RAC_MindMessage`, schema:3849) | **DECLARED unified target — canonical-but-DEAD-on-read** (correction #5). 4 flag-gated writers (`inbox`/`chat`/`thread`/`lead-processor`), **ZERO readers**. Stale schema comment claiming "ZERO writers" must be corrected. |
| FbMessage | `FbMessage` (`RAC_FbMessage`, schema:3911) | **Provider-native delivery ledger ONLY**, not a parallel conversation history. |
| PartnerMessage, AdminChatMessage, AdminChatSession | resp. models | Separate-audience surfaces. |

**Must NOT own:** channel credential resolution (Channels domain), outbound transport adapters (Channels domain).

**Modules:** `backend/src/inbox`, `backend/src/kloel` (thread / conversation-store / mind aliases), `backend/src/chat`, `backend/src/partnerships` (PartnerMessage), `backend/src/admin/chat`.

**Upstream:** Channels/OmniCore (`NormalizedMessage` ingest). **Downstream:** Kloel Mind (history reads for prompt assembly + percepts).

**In-flight migration:** Legacy message tables (`KloelMessage` + `ChatMessage` + `KloelConversation` + `Message`) → `MindMessage`, flag `KLOEL_MINDMESSAGE_DUALWRITE` (default OFF). State: **canonical-but-dead-on-read** — enabling dual-write today = 2× write cost + silent divergence with no benefit, because `StateBuilderService`/`KloelConversationStore` still read `.items = prisma.kloelMessage`. Needs reader cut-over + backfill first. Canonical history read: `MindCanonicalService.getConversationHistory` (`mind-canonical.service.ts:45`) — 6 call sites currently use divergent take/order windows.

---

### 4. Channels & OmniCore Dispatch

**Purpose:** Outbound multi-channel send (WhatsApp/IG/Messenger/Facebook/Email/TikTok/internal), inbound Meta/WhatsApp webhook ingest, channel session + Meta connection resolution, channel setup/config/arsenal/product catalog.

**Owns (canonical entities):**

| Entity | Backing model | Note |
|--------|---------------|------|
| **MetaConnection** | `MetaConnection` (`RAC_MetaConnection`, schema:3467) | Meta credentials. Canonical resolver: `MetaWhatsAppService.resolveConnection` (`meta/meta-whatsapp.service.ts:71`). |
| **ChannelSetup** | `ChannelSetup` (`RAC_ChannelSetup`, schema:3492) | Wizard/session progress. Together with MetaConnection it IS the channel-session state — there is **NO `ChannelSession` model** (correction #1). |
| ChannelProduct, ChannelArsenal, ChannelConfig | resp. models | Channel catalog/config. |
| Integration, IntegrationCredential | resp. models | Third-party integration store. |
| WebhookEvent | `WebhookEvent` | Inbound webhook dedup ledger. |
| FbMessage | `FbMessage` (schema:3911) | Channel-native delivery ledger (Conversation domain owns it as conversation store; here it's the provider-side delivery record). |
| IgPost, IgInsight | resp. models | Instagram post/insight surfaces. |

**Must NOT own:** Conversation/Message canonical store (Conversation domain owns `RAC_Message`), MindGuard policy (Mind domain).

**Modules:** `backend/src/marketing/channels`, `backend/src/omnichannel`, `backend/src/meta`, `backend/src/common/channel-dispatch`, `backend/src/inbox` (omnichannel funnel).

**Upstream:** Kloel Mind (decide → dispatch); Marketing/Campaigns. **Downstream:** Conversation/Message (`saveMessage`); Contact (resolution); Kloel Mind (percept spine hook).

**Canonical channel-session surface (correction #1):** `WhatsappSessionService` (`marketing/channels/whatsapp/whatsapp-session.service.ts:19`) over `ChannelSetup` + `MetaConnection`. `SessionStatus` is a provider-registry type, not a model.

**Dispatch core split (P1):** canonical transport core is `ChannelDispatchRegistry` (`common/channel-dispatch/channel-dispatch.registry.ts:31`, pure `ChannelKind`→adapter). `ChannelTransportRegistry` (`kloel/channel-transport.registry.ts:52`) should be only a MindGuard+audit decorator that always delegates. In-flight: `KLOEL_TRANSPORT_CANONICAL_DELEGATE` (default OFF, excludes email+tiktok) and `instagram-canonical-dispatch.flag` (landed commit `a38949d94`).

**Campaign queues (correction #4):** `campaign-jobs` / `voice-jobs` / `media-jobs` are **NOT dead** — live workers in `worker/` (`campaign-processor.ts:147`, `voice-processor.ts:253`, `media-processor.ts:15`). Only `mass-send` (`backend/src/mass-send/*`) is genuinely questionable.

---

### 5. Product, Plan & Offer / Member Area

**Purpose:** Product catalog, plans/pricing (**two parallel models mid-migration**), offer/checkout config, coupons, affiliate program, member-area courses/enrollment, per-product AI config.

**Owns (canonical entities):**

| Entity | Backing model | Note |
|--------|---------------|------|
| Product | `Product` (`RAC_Product`, schema:1734) | Catalog root. Canonical CRUD: `ProductService` (`products/product.service.ts:39`) — the only writer that emits `mind.product.observed` + `AuditService` + `MindEventSpine`. |
| ProductPlan | `ProductPlan` (`RAC_ProductPlan`, schema:2213, `price` Float) | **Legacy/UI plan model mid-migration** to `priceInCents` (correction #5). `price` Float is **never consulted at order time.** |
| **CheckoutProductPlan** | `CheckoutProductPlan` (`RAC_CheckoutProductPlan`, schema:2969, `priceInCents` Int) | **Canonical plan/offer read by pricing** — the only plan model read by `checkout-order-pricing.util.ts`. |
| CheckoutConfig | `CheckoutConfig` (schema:3027) | Offer presentation. |
| OrderBump, Upsell | schema:3132 / 3154 | Typed bump/upsell (priced at checkout). The `ProductPlan.checkoutImages.orderBump` JSON variant is dead config. |
| ProductCoupon, **CheckoutCoupon** | schema:2297 / 3178 | Coupon split (P0): `CheckoutCoupon` (Int cents, `validateCouponHelper`) is canonical at order time; `ProductCoupon` (Float) omits `minOrderValue`/`appliesTo`/discount-amount. |
| CheckoutPixel | (table) | Canonical pixel — the only one fired (by `checkout/facebook-capi.service.ts`). |
| ProductReview, ProductCommission, ProductUrl, ProductCampaign, ProductAIConfig, ProductCheckout | resp. models | `ProductAIConfig` (schema:2394) is the canonical typed AI config; `ProductCheckout` (schema:2273) is the legacy JSON-blob checkout config (transitional). `ProductCampaign` (schema:2378) backs per-product attribution; execution runs on the live `campaign-jobs` worker. |
| MemberArea, MemberModule, MemberLesson, MemberEnrollment | member-area models | Courses + enrollment. Canonical enroll: `MemberEnrollmentsController.enrollStudent` (event + `MemberAreaStatsService`). |
| AffiliateProduct, AffiliateRequest, AffiliateLink, ChannelProduct (join) | resp. models | Affiliate program (config has 3–5 unsynchronized sources of truth — P1). |

**Must NOT own:** `CheckoutOrder`/`CheckoutPayment` (Checkout domain owns the transaction), wallet/ledger.

**Modules:** `backend/src/products`, `backend/src/plans`, `backend/src/product-categories`, `backend/src/member-area`, `backend/src/affiliate`, `backend/src/checkout` (`CheckoutProductPlan`/`CheckoutConfig`), `backend/src/kloel/product-sub-resources`.

**Upstream:** Identity (workspace). **Downstream:** Checkout (pricing reads `CheckoutProductPlan`); Channels (`ChannelProduct`).

**In-flight migration (correction #5):** `ProductPlan.price` (Float reais) → `CheckoutProductPlan.priceInCents` (Int cents). State: **half-done** — `ProductPlan.priceInCents` is populated only by `PlanService.create`; `ProductPlanController` + chat tools do NOT dual-write it. A merchant can edit a `ProductPlan.price` that has **no commercial effect** because pricing reads `CheckoutProductPlan` only.

---

### 6. Checkout, Payment & Wallet

**Purpose:** Checkout order lifecycle + payment capture, chat-driven direct sales, provider charge adapters + routing + fraud, Stripe Connect ledger, marketplace treasury, seller earnings wallet, prepaid usage wallet, coupons-at-order-time, payouts, SaaS subscription billing.

**Owns (canonical entities):**

| Entity | Backing model | Note |
|--------|---------------|------|
| **CheckoutOrder** + **CheckoutPayment** | schema:3220 / 3330 | **Canonical order/payment** (GMV source of truth = `CheckoutOrder.totalInCents`). Capture: `CheckoutPaymentService.capture` (`checkout-payment.service.ts:52`). |
| KloelSale | `KloelSale` (`RAC_KloelSale`, schema:1917) | Chat-driven direct-sale originator (via `SalesService`) — **should materialize a CheckoutOrder**; currently a parallel GMV silo excluded from platform GMV (P0). |
| Payment | `Payment` (`RAC_Payment`, schema:2744) | **Unowned raw webhook sink** — NOT canonical; retire after confirming zero non-webhook readers. |
| UpsellOrder, CheckoutSocialLead, ExternalPaymentLink, PhysicalOrder | resp. models | `CheckoutSocialLead` (schema:3273) is a separate status machine synced to Contact. `PhysicalOrder` (schema:2706) is soft-linked via `saleId` (no FK). |
| KloelWallet, KloelWalletTransaction, KloelWalletLedger | seller earnings | `kloel/WalletService` (`wallet.service.ts:49`). **Name collides** with the prepaid `WalletService` (P1 DI trap). |
| PrepaidWallet, PrepaidWalletTransaction | usage credits | `wallet/WalletService` (`wallet/wallet.service.ts:73`). |
| BankAccount, WalletAnticipation | resp. models | `WalletAnticipation` (schema:2855) is still Float (others are BigInt cents). |
| MarketplaceTreasury, MarketplaceTreasuryLedger, MarketplaceFee | house money | `MarketplaceTreasuryService`. |
| ConnectAccountBalance, ConnectLedgerEntry, ConnectMaturationRule | Stripe Connect | `LedgerService` (`payments/ledger/ledger.service.ts:59`). |

**Must NOT own:** Product/Plan definitions (Product domain), Contact identity (only references `customerEmail`/lead).

**Modules:** `backend/src/checkout`, `backend/src/payments`, `backend/src/sales`, `backend/src/billing`, `backend/src/wallet`, `backend/src/marketplace-treasury`, `backend/src/kloel` (payment / smart-payment / wallet / cart-recovery).

**Upstream:** Product/Plan (`CheckoutProductPlan` pricing); Channels (payment-link send). **Downstream:** Wallet/ledger (split + credit); Member Area (auto-enroll); Kloel Mind (`commerce.payment.*` spine); CRM (`markLeadConverted`).

**Key boundary debts:**
- **P0 revenue split:** one human payment can be PAID in one ledger (`CheckoutOrder`/`CheckoutPayment`) and PENDING in another (`KloelSale`, `Payment`). A single Stripe webhook fans out to 3 tables. Canonical: `CheckoutOrder`+`CheckoutPayment`; `KloelSale` must always materialize a `CheckoutOrder`; retire the orphan `Payment`.
- **Five money systems (P1):** `KloelWallet` (seller), `PrepaidWallet` (usage), `ConnectAccountBalance` (Stripe Connect), `MarketplaceTreasury` (house), `WalletAnticipation` (receivable). Genuinely different actors' money — keep separate but extract **one** shared append-only ledger abstraction.
- **Dead duplicate to delete:** `MercadoPagoPixService` (`checkout/mercado-pago-pix.service.ts:146`) is an orphan; canonical PIX charge is `MercadoPagoPixChargeService` (`payments/mercadopago/mercadopago-pix-charge.service.ts:27`).
- **Cart/abandonment recovery (P1):** two independent crons (`kloel/CartRecoveryService` over `CheckoutOrder` PENDING vs `checkout/CheckoutSocialRecoveryService` over `CheckoutSocialLead`) recover the same human twice — unify behind one person-keyed recovery scheduler.

---

### 7. Kloel Mind Cognitive Core

**Purpose:** `perceive → infer (beliefs/predictions/surprise) → policy (epsilon-greedy/bandit/global-prior) → memory (cases/graph/episodes/priors) → runtime (tick scheduler, event spine/outbox, capability executor, Brain decide/observe)`, plus self-model/consciousness/self-evolution, CIA autonomy, and Brain→Mind canonicalization aliases.

**Owns (canonical entities):**

| Entity | Backing model | Note |
|--------|---------------|------|
| MindBelief, MindPrediction, MindPolicy | inference/policy tables | Canonical DB-persisted loop: `MindService.tick` + `MindEventProcessorService.process` (`mind.service.ts:46`). |
| MindWorkspaceState, MindCase, MindConceptDetection | state/case/concept | Case memory canonical via `MindCaseMemoryService.recordCase`. |
| MindGraphNode, MindGraphEdge | semantic graph | Graph-fact memory. |
| **MindOutboxEvent** | `MindOutboxEvent` (schema:3725) | **Canonical idempotent/transactional event sink.** |
| AutopilotEvent | `AutopilotEvent` (schema:1400) | Legacy event log sink (no idempotency/outbox) — generic events still land here; migrate onto the outbox. |
| MindBanditArm, MindGuardAudit, MindDailyReport | policy/audit/report | Bandit arms, guard audit, daily report. |
| **MindGlobalPrior** | `MindGlobalPrior` (schema:3800) | Canonical cross-workspace prior via `MindGlobalPriorService`. |
| KloelGlobalPrior | `KloelGlobalPrior` (schema:3897) | **@deprecated, dead** — `KloelGlobalPriorService` has zero injectors; safe to drop the service. |
| MindSelfModel | `MindSelfModel` | Self-model snapshot. |
| **MindMemory** ⇄ KloelMemory | schema:3872 / 1711 | KV/semantic memory **mid-migration** (correction #5). `KloelMemory` is the current source of truth (~89+ callers via `MindMemoryItemService.items`); `MindMemory` is the canonical target (dual-write + partial reads). |

**Must NOT own:** channel transport, payment capture, the message tables themselves (it **READS** them via aliases).

**Modules:** `backend/src/kloel/mind/**`, `backend/src/kloel/mind.service.ts`, `backend/src/kloel/kloel-global-prior.service.ts`.

**Upstream:** Channels (percept hook); Conversation (history); Checkout/CRM (commerce spine events). **Downstream:** Channels (decide → dispatch); all domains (policy decisions, reports).

**In-flight migration (correction #5):** `KloelMemory → MindMemory`, flag `KLOEL_MINDMEMORY_DUALWRITE` (default OFF, `mind-memory-item.service.ts:96`). State: **mid-migration** — 2 writers + 2 readers exist, NO backfill, split-brain risk if a key is written to one store and read from the other. The schema comment on `MindMemory` claiming "canonical-but-dead / ZERO writers" is **STALE.**

**Known cognitive duplications (P0/P1):** the cognitive loop is implemented 3+ times (canonical = `MindService.tick`; `MindPredictionService.runCycle` persists NOTHING); surprise math diverges (canonical = `MindSurpriseService.computeSurprise`, Shannon `-log(p)`); two tick schedulers fan out the same workspace set (30s `MindProcessorService` vs 5s `MindBackgroundScheduler`); the event spine has two physical sinks (canonical = `MindOutboxEvent`).

---

### 8. Observability & Ops (cross-cutting)

**Purpose:** Operational error/degradation/recovery event sink for dashboard alerting — **distinct from the cognitive event spine.**

**Owns (canonical entities):**

| Entity | Backing model | Note |
|--------|---------------|------|
| **OpsEvent** | `OpsEvent` (schema:1614) | **LIVE** (correction #3). Written by `OpsAlertService` (`observability/ops-alert.service.ts`) on `critical_error` / `degradation` / `recovery`. |

**Must NOT own:** cognitive events (Mind domain owns `AutopilotEvent`/`MindOutboxEvent`).

**Modules:** `backend/src/observability` (`OpsAlertService` writes `OpsEvent`).

**Upstream:** all services (error reporting). **Downstream:** admin dashboard.

---

### 9. Marketing & Campaign Execution (worker-side, cross-cutting)

> Not a separate `digest.domains` entry, but called out here because correction #4 makes the queue/worker boundary load-bearing. The execution lives in the **separate `worker/` deployable** with its own queue registry (`backend/src/queue/queue-names.const.ts`).

**Purpose:** Async execution of marketing campaigns, voice synthesis/transcription, and media processing off BullMQ queues.

**Live workers (correction #4 — NOT dead queues):**

| Queue | Worker | Ground |
|-------|--------|--------|
| `campaign-jobs` | `campaignWorker` | `worker/campaign-processor.ts:147` |
| `voice-jobs` (transcribe-audio) | `voiceWorker` | `worker/voice-processor.ts:253` |
| `media-jobs` | `mediaWorker` | `worker/media-processor.ts:15` |
| `mass-send` | **(genuinely questionable)** | `backend/src/mass-send/*` — the only queue actually lacking a confirmed live worker |

**Modules:** `worker/` (separate deployable), `backend/src/queue` (queue-name registry), `backend/src/marketing` (enqueue side).

---

## Cross-domain canonical vocabulary (quick reference)

The forbidden-alias list that this map enforces. Full detail in `inventory/_CONSOLIDATED.json` → `vocabulary`.

| Concept | Canonical backing | Forbidden / corrected |
|---------|-------------------|------------------------|
| Person | `Contact` (`RAC_Contact`, schema:399) | `Lead`/`KloelLead` is **NOT** an alias (P1 merge). |
| Lead | `KloelLead` (`RAC_KloelLead`, schema:1834) | NOT a settled duplicate-of-Contact. |
| Message | `Message` (schema:721) + per-surface legacy tables | `MindMessage` is **canonical-but-dead-on-read**. |
| Channel / Session | `ChannelSetup` (schema:3492) + `MetaConnection` (schema:3467) via `WhatsappSessionService` | **`ChannelSession` is FICTIONAL** — do not use. |
| Workspace / Tenant | `Workspace` (schema:119) | No `Tenant`/`Account` model; resolve via `resolveWorkspaceId` (workspace-access.ts:119). |
| Plan / Offer | `CheckoutProductPlan.priceInCents` (schema:2969) | `ProductPlan.price` (Float) is **never read at order time.** |
| Order / Payment | `CheckoutOrder` + `CheckoutPayment` (schema:3220/3330) | `Payment` is an unowned webhook sink; `KloelSale` must materialize a CheckoutOrder. |
| Wallet / Ledger | 5 distinct actor wallets (see Checkout domain) | `WalletService` unqualified is **ambiguous** (two classes). |
| Campaign | `ProductCampaign` (schema:2378) + live `campaign-jobs` worker | campaign/voice/media queues are **NOT dead.** |
| Memory | `KloelMemory` (current) ⇄ `MindMemory` (target, schema:3872) | `KloelMemory→MindMemory` is **in-flight.** |
| GlobalPrior | `MindGlobalPrior` (schema:3800) | `KloelGlobalPrior` service is **dead** (zero injectors). |
| Ops event | `OpsEvent` (schema:1614) | distinct from the cognitive spine. |
| RISC event | `RiscEvent` (schema:1273) | LIVE; `routeRiscEvent` IS the processor. |

---

## In-flight migrations (do NOT treat as converged)

Source: `inventory/_CONSOLIDATED.json` → `inFlightMigrations`. The three flagged by correction #5 are bolded.

| Migration | From → To | Flag | State |
|-----------|-----------|------|-------|
| **Memory canonicalization** | `RAC_KloelMemory` → `RAC_MindMemory` | `KLOEL_MINDMEMORY_DUALWRITE` (OFF) | mid-migration; 2 writers + 2 readers; no backfill; split-brain risk. |
| **Unified message store** | 4 legacy tables → `RAC_MindMessage` | `KLOEL_MINDMESSAGE_DUALWRITE` (OFF) | canonical-but-dead-on-read; 4 writers, ZERO readers. |
| **Plan money unit** | `ProductPlan.price` Float → `CheckoutProductPlan.priceInCents` | (additive column, no env flag) | half-done; only `PlanService.create` dual-writes; merchant edits to `ProductPlan.price` have no commercial effect. |
| Channel transport | legacy guarded providers → canonical dispatch adapters | `KLOEL_TRANSPORT_CANONICAL_DELEGATE` (OFF; excl. email+tiktok) | mid-migration; guarded path mostly runs duplicate legacy bodies. |
| Instagram DM send | raw `InstagramService.sendMessage` → `ChannelMessageDispatchService` | `instagram-canonical-dispatch.flag` | mid-migration; flag-gated delegation landed (commit `a38949d94`). |
| Lead → Contact (PERSON) | `RAC_KloelLead` funnel cols → `RAC_Contact` mirror + `kloelLeadId` (schema:444) | best-effort dual-write in the 3 lead services + `person-kloel-lead-to-contact.backfill.*` (no dedicated flag file) | mid-migration; `LeadsService` still reads `KloelLead`; open P1 merge. |
| GlobalPrior | `RAC_KloelGlobalPrior` → `RAC_MindGlobalPrior` | (no flag) | near-complete; legacy service has zero injectors, safe to drop. |
| Coupon | `RAC_ProductCoupon` (Float) → `RAC_CheckoutCoupon` (cents) | (one-way sync util) | mid-migration; one-directional sync, divergent validate, Float→cents rounding. |
| Brain→Mind DI rename | `BrainRuntimeService` alias → `MindRuntime` | (ADR-0013 Wave M1 alias window) | scheduled-for-removal compat layer. |

---

## How to use this map

- **Placing a new model/field:** find the domain whose *purpose* matches, confirm the target domain doesn't appear in any other domain's `mustNotOwn`, and check the canonical vocabulary table so you don't re-introduce a forbidden alias (especially `ChannelSession`).
- **Touching money:** order/payment writes go through `CheckoutPaymentService`; plan price lives in `CheckoutProductPlan.priceInCents` (never `ProductPlan.price`); never add a 6th wallet/ledger contract — back it with the shared append-only abstraction.
- **Touching identity:** route every `(workspaceId, phone)` write through `normalizePhone()`; resolve `workspaceId` only via `resolveWorkspaceId` (workspace-access.ts:119); remember `KloelLead` ≠ `Contact` (open merge).
- **Touching cognition:** the canonical loop is `MindService.tick`; the canonical event sink is `MindOutboxEvent`; do NOT enable `MindMessage`/`MindMemory` dual-write without a reader path landing first.
