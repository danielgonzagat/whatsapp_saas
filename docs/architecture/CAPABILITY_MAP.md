# Kloel Capability Map

**What this answers:** For every functional capability Kloel performs (named by verb), this doc names the *one* canonical implementation you should call, every duplicate implementation that must migrate onto it, and the migration state (settled / mid-migration / orphan-to-delete). It is the ground-truth routing table for "where does X actually happen, and which copy is real." Every name below is a verified model/service/file from the inventories or `schema.prisma` — no invented names. When two implementations disagree, the canonical column is the one with authority (DB-persisted, event-emitting, security-verified, or read by the live pricing/cognition path).

**Last generated:** 2026-06-07 (grounded in `backend/prisma/schema.prisma` + `backend/src/**` + `worker/**`, via `docs/architecture/inventory/_CONSOLIDATED.json`).

---

## How to read this

- **Canonical implementation** = the surface every other caller should converge onto. Calling anything else is, at best, a duplicate write path and, at worst, a silent divergence (a row PAID in one ledger and PENDING in another; a price the merchant edits that never reaches the buyer).
- **Status legend:**
  - `canonical` — single owner, nothing to migrate.
  - `mid-migration` — a flagged dual-write/delegation is in flight; the legacy path still runs until the flag flips and reads cut over.
  - `fragmented` / `divergent` — multiple co-equal implementations with no agreed owner yet; a merge decision is open.
  - `orphan-to-delete` — dead duplicate (zero production callers); pure deletion.
- **Severity** mirrors the duplication register (`P0` revenue/identity/security-impacting → `P3` cosmetic).

> **Five corrections baked in (v1 docs were wrong on these):**
> 1. **`ChannelSession` is FICTIONAL** — zero grep matches in `src/` and `schema.prisma`. The real channel-session surface is **`WhatsappSessionService`** over `ChannelSetup` + `MetaConnection`.
> 2. **`Lead` is NOT an alias of `Contact`.** `KloelLead` (`RAC_KloelLead`, separate live table) is an **open P1 MERGE DECISION** vs `Contact` (`RAC_Contact`), not a settled alias.
> 3. **`OpsEvent` and `RiscEvent` are LIVE models** (absent from v1). `OpsEvent` ← `OpsAlertService`; `RiscEvent` ← `ComplianceService.routeRiscEvent` (which IS the processor, not a stub).
> 4. **`campaign-jobs` / `voice-jobs` / `media-jobs` are NOT dead queues** — they have live `new Worker(...)` consumers in the separate `worker/` deployable. Only `mass-send` is genuinely questionable.
> 5. **Three migrations are mid-flight, not converged:** `KloelMemory→MindMemory` dual-write, `MindMessage` canonical-but-dead-on-read, `ProductPlan.price→CheckoutProductPlan.priceInCents`.

---

## Capability index

| Domain | Capabilities |
|---|---|
| [Channels & Dispatch](#1-channels--dispatch) | route-outbound-message, send-whatsapp, send-instagram-dm, send-facebook-page-message, resolve-meta-connection, channel-session-state, ingest-meta-webhook |
| [Conversation & Message](#2-conversation--message) | persist-customer-message, read-brain-conversation-history |
| [Contact & Identity](#3-contact--identity) | person-contact-identity-by-phone, cross-channel-identity-resolution, identity-merge-dedupe |
| [Checkout, Payment & Wallet](#4-checkout-payment--wallet) | checkout-payment-capture, pix-charge, coupon-validate-at-order, append-only-money-ledger |
| [Product, Plan & Member](#5-product-plan--member) | product-crud, plan-crud, member-enrollment |
| [Kloel Mind cognition](#6-kloel-mind-cognition) | cognitive-loop, score-intent, tick-scheduling, surprise-math, global-prior, memory-kv-store, record-case |
| [Identity, Auth & Tenant](#7-identity-auth--tenant) | tenant-resolution, session-issuance, totp-mfa, workspace-invitation, api-key-lifecycle |
| [Observability & Compliance](#8-observability--compliance) | ops-error-eventing, risc-cross-account-protection |

---

## 1. Channels & Dispatch

| Capability | Canonical implementation | Duplicate implementations to migrate | Status | Sev |
|---|---|---|---|---|
| **route-outbound-message-by-channel** | `ChannelDispatchRegistry.send/sendMessage` (`common/channel-dispatch/channel-dispatch.registry.ts:31`) fronted by `ChannelMessageDispatchService.dispatch` (`marketing/channel-message-dispatch.service.ts:72`) | `ChannelTransportRegistry.send` (guarded, `kloel/channel-transport.registry.ts:52`); `services-v2/channel.service.ts ChannelService.send`; `services-v2/messaging.service.ts MessagingService.*`; `kloel-tool-dispatcher.channel.handlers.ts dispatchChannelTool` | **mid-migration** — `KLOEL_TRANSPORT_CANONICAL_DELEGATE` default **OFF**, excludes email+tiktok; guarded path still runs duplicate legacy provider bodies | P1 |
| **send-whatsapp-message** | `WhatsappService.sendMessage → WhatsappMessageDispatcherService.sendMessage` (`whatsapp-message-dispatcher.service.ts:49`) | `WhatsAppDispatchAdapter.send`; `MetaWhatsAppService.sendTextMessage` (direct Cloud path); `WhatsAppChannelTransport` (guarded) | layered (provider registry below adapters is acceptable) | P2 |
| **send-instagram-dm** | `InstagramService.sendMessage` via `InstagramDispatchAdapter` | `InstagramMarketingService.sendDirectMessage` (now flag-gated to canonical, commit `a38949d94`); `InstagramChannelTransport.send` (guarded) | **mid-migration** — `instagram-canonical-dispatch.flag` (`isInstagramCanonicalDispatchEnabled`) | P1 |
| **send-facebook-page-message** | `FacebookMessengerService.sendMessage` (`marketing/facebook-messenger.service.ts:41`, persists `FbMessage` `RAC_FbMessage` schema:3911) | `MessengerService.sendTextMessage` (`channels/messenger/messenger.service.ts:12` — SAME `${pageId}/messages` endpoint, **NO persistence**); `MessengerChannelTransport` (guarded) | **duplicate** — two `ChannelKind`s (`MESSENGER` vs `FACEBOOK`) for one wire surface | P1 |
| **resolve-meta-connection-credentials** | `MetaWhatsAppService.resolveConnection` (`meta/meta-whatsapp.service.ts:71`) → `ResolvedMetaConnection` | `MetaConnectionStateService.forWorkspace` (different shape); `resolveInstagramConnection` (`instagram-marketing.service.ts:24`, bespoke decrypt — delete); **~19 raw `prisma.metaConnection.find*`** callsites | **fragmented** — divergent expiry semantics (`EXPIRED` vs `tokenExpired`) | P1 |
| **channel-session-state** | `WhatsappSessionService` (`marketing/channels/whatsapp/whatsapp-session.service.ts:19`) over `ChannelSetup` (schema:3492) + `MetaConnection` (schema:3467) | — (**none**; there is NO `ChannelSession` model — that name is fictional) | **canonical** | — |
| **ingest-meta-inbound-webhook** | `MetaWebhookController('webhooks/meta')` → `OmnichannelService` (`meta/webhooks/meta-webhook.controller.ts:123`, live ingest) | `MetaWebhookController('webhooks/meta-marketing')` (aliased `MetaCoreWebhookController`, `meta/meta-webhook.controller.ts:46`, **log-only**); `WhatsappController @Post('incoming')`; internal-whatsapp-runtime/whatsapp-meta-compat controllers | **duplicated HMAC-verify + Redis-NX + WebhookEvent-dedup** (extract a shared guard) | P2 |

**Channel vocabulary note:** the one channel-name discriminator is `ChannelKind` (lowercase, `channel-dispatch.port.ts:14`). `OmniChannel` (Uppercase) and the contacts-layer identifier casing are duplicate vocabularies that should become derived `Uppercase<ChannelKind>` views. The `ChannelSendResult`/`ChannelCapability` DTOs are declared twice (`channel-dispatch.port.ts` = blocked OPTIONAL [canonical] vs `kloel/channel-transport.types.ts` = blocked REQUIRED).

---

## 2. Conversation & Message

| Capability | Canonical implementation | Duplicate implementations to migrate | Status | Sev |
|---|---|---|---|---|
| **persist-customer-message** | `InboxService.saveMessage → RAC_Message` (`inbox/inbox.service.ts:207`, one `$transaction` with `RAC_Conversation`) | `FacebookMessengerService → RAC_FbMessage`; `InboxService.dualWriteChannelMindMessage → RAC_MindMessage` (flag-gated) | **mid-migration** — `RAC_MindMessage` is **dead-on-read** | P1 |
| **read-brain-conversation-history** | `MindCanonicalService.getConversationHistory → RAC_KloelMessage` (`mind/mind-canonical.service.ts:45`, take=50 asc) | `KloelConversationStore.getConversationHistory` (take=20); `MindMessageService.getHistory` (take=50); `StateBuilderService.resolveShortTermMemory` (take=limit desc-then-reverse); `kloel-lead-processor-helpers` (take=30, KloelConversation); `kloel.service.ts:313` (take=50) | **6 call sites, divergent take/order/projection** — "history" means a different window per caller | P1 |

**The MindMessage situation (critical):** `RAC_MindMessage` (schema:3849) is the **declared** unified message store with a `source` discriminator (`brain|dashboard|lead_conversation|thread|channel`), but it is **canonical-but-DEAD-on-read**: it has **4 flag-gated writers** (`inbox.service.ts:60`, `chat.service.ts:86`, `kloel-thread.service.ts:79`, `kloel-lead-processor-helpers.ts:161`, all behind `KLOEL_MINDMESSAGE_DUALWRITE` default OFF) and **ZERO readers**. The 4 real source tables remain de-facto canonical per surface:

| Surface | Real source table | Real read/write service |
|---|---|---|
| brain | `RAC_KloelMessage` (schema:1691) | `MindMessageService` |
| dashboard thread | `RAC_ChatMessage` (schema:1899) | `MindChatMessageService` / `KloelThreadService` |
| lead funnel | `RAC_KloelConversation` (schema:1865) | `saveLeadMessage` |
| omnichannel | `RAC_Message` (schema:721) | `InboxService.saveMessage` |

The per-surface MindMessage dual-write helper is hand-rolled **4×** (`dualWriteChannelMindMessage`, `dualWriteThreadMindMessage`, chat `addMessage` dual-write, `dualWriteLeadConversationMindMessage`) and should collapse to one `MindMessageDualWriteService.mirror(source, …)`. **Do NOT enable the dual-write flag before a reader path exists** — ON-but-no-reader = 2× write cost + silent divergence with zero benefit. The schema comment claiming "ZERO writers" is STALE.

---

## 3. Contact & Identity

| Capability | Canonical implementation | Duplicate implementations to migrate | Status | Sev |
|---|---|---|---|---|
| **person-contact-identity-by-phone** | `CrmService.upsertContact` → `normalizePhone().digits` (BR-promoting, `crm.service.ts:39`; util `common/phone/phone-normalization.util.ts:150`) | `KloelLeadProcessorService` (digits); `LeadMindCoordinator`/`WhatsAppMindCoordinator syncCanonicalContact`; `CheckoutSocialLeadService.buildContactUpsertArgs` (`digitsOrNull`, **no 55 promotion**, locally aliased AS `normalizePhone`); `crm.deals.helpers.createDeal` (raw `String(phone).trim()`); `scrapers.service.importLeads` (raw) | **P0 phone-normalization divergence** → one human becomes multiple `Contact`/`KloelLead` rows | P0 |
| **cross-channel-identity-resolution** | `ContactIdentityResolverService.resolve` (`contacts/contact-identity-resolver.service.ts:29`, does cross-channel phone/email/socialHandle match) | `ChannelIdentifierService.resolve` (persistence primitive — keep, but as a dependency); `OmnichannelContactResolutionService.resolveFromMessage` (calls `ChannelIdentifierService` DIRECTLY, **bypassing** cross-channel match → synthetic-phone duplicates) | **bypass hazard** | P2 |
| **identity-merge-dedupe** | `ContactIdentityMergeService.mergeContacts` (`contacts/contact-identity-merge.service.ts:24`, writes `ContactIdentityLink`, re-points relations) | `person-kloel-lead-to-contact.backfill.core.ts` (implicit merge, no `ContactIdentityLink`) | **ORPHAN** — zero production injectors (only its own file + `contacts.module.ts` registration) despite live duplication paths needing it | P1 |

### Open MERGE DECISION — `Contact` vs `KloelLead` (P1, NOT a settled alias)

`Contact` (`RAC_Contact`, schema:399, unique `workspaceId_phone`) is the **declared canonical person**. `KloelLead` (`RAC_KloelLead`, schema:1834, unique `workspaceId_phone`) is a **separate live table** modeling the same human with overlapping funnel columns (`status/stage/lastMessage/lastIntent/totalMessages/score`). They are bridged by `Contact.kloelLeadId` (schema:444) + best-effort fail-open dual-write implemented directly in 3 lead services (`kloel-lead-processor.service.ts`, `lead-mind-coordinator.service.ts`, `whatsapp-mind-coordinator.service.ts`) + `person-kloel-lead-to-contact.backfill.*` — there is **no dedicated `*.flag.ts` file** for this migration — **but the cut-over is incomplete:**

- `LeadsService` (`kloel/leads.service.ts:86`) still **reads `KloelLead`** for `GET /kloel/leads/:workspaceId` (the leads-list UI).
- `CrmService` reads **`Contact`** for the CRM UI.
- **The two screens can disagree** when the dual-write drifts.

> Three near-identical lead-lifecycle services each carry their own `getOrCreateLead` (`KloelLeadProcessorService`, `LeadMindCoordinator` [self-annotated canonical], `WhatsAppMindCoordinator` [passes RAW `msg.from`]). Collapse onto `LeadMindCoordinator`. **Live revenue bug:** `processWhatsAppMessageWithPayment` looks up `KloelLead` by **RAW** `senderPhone` (`kloel-lead-processor.service.ts:285`) while the lead was created under the **normalized** phone → the payment link silently fails to generate.

**Path to settle:** (1) make `KloelLead` funnel state read-through/derived from `Contact`; (2) repoint `LeadsService` from `KloelLead` to `Contact` (fix the stale frontend docstring at `leads.ts:4-12` that already claims Contact-backing); (3) activate `ContactIdentityMergeService`; (4) retire `RAC_KloelLead`.

---

## 4. Checkout, Payment & Wallet

| Capability | Canonical implementation | Duplicate implementations to migrate | Status | Sev |
|---|---|---|---|---|
| **checkout-payment-capture** | `CheckoutPaymentService.capture → CheckoutPayment + CheckoutOrder` (`checkout/checkout-payment.service.ts:52`) | `SalesService → KloelSale` (`sales/sales.service.ts:64`); `kloel/PaymentService` + `SmartPaymentService → KloelSale`; `wallet/WalletService.createTopupIntent → PrepaidWalletTransaction` | **P0 parallel revenue silos** — one payment PAID in one ledger, PENDING in another; `KloelSale` GMV is double-orphaned (absent from admin `gmv.query` AND `dashboard.service`) | P0 |
| **pix-charge** | `MercadoPagoPixChargeService` (`payments/mercadopago/mercadopago-pix-charge.service.ts:27`, 10+ consumers) | `MercadoPagoPixService` (`checkout/mercado-pago-pix.service.ts:146` — unregistered in `checkout.module.ts`, only its own specs import it) | **orphan-to-delete** (~12KB payload logic that can drift from the live one) | P2 |
| **coupon-validate-at-order** | `validateCouponHelper` / `CheckoutCatalogService.validateCoupon` (`checkout/checkout-catalog.helpers.ts:79` → `CheckoutCoupon` cents, enforces `minOrderValue/appliesTo/discountAmount`) | `ProductCouponController.validate` (`product-coupon.controller.ts:154` → `ProductCoupon` Float, **omits** minOrderValue/appliesTo/discount-amount); one-way `syncWorkspaceCheckoutCouponForProduct` bridge | **P0 divergent validate** — two value types, two enum spellings (`PERCENTAGE` vs `PERCENT`), divergent logic | P0 |
| **append-only-money-ledger** | *(no single owner — needs one shared abstraction)* | `LedgerService` (`ConnectLedgerEntry`); `MarketplaceTreasuryService` (`MarketplaceTreasuryLedger`); `kloel/WalletLedgerService` (`KloelWalletLedger`); `PrepaidWalletTransaction` self-ledger | **3–4 hand-rolled append/reconcile/mature** with inconsistent contracts (some carry `balanceAfter`, some don't; `WalletAnticipation` still Float vs others BigInt cents) | P1 |

### The Sale/Order/Payment record split (P0)

One human payment fans out to up to **three** tables via a single Stripe webhook, with three parallel `updateMany()` calls and no single resolver:

- `CheckoutOrder` (schema:3220) + `CheckoutPayment` (schema:3330) — **canonical** checkout source of truth; `CheckoutOrder.totalInCents` is the GMV source of truth.
- `KloelSale` (schema:1917) — chat-driven sales source of truth (`SalesService` + `kloel/PaymentService` + `SmartPaymentService`). Should become a thin originator that ALWAYS materializes a `CheckoutOrder`.
- `Payment` (schema:2744) — generic raw webhook-only sink, **NO owning `@Injectable` service** → retire after confirming zero readers.
- `PhysicalOrder` (schema:2706) — fulfillment, `saleId String?` with **no FK**.

### Wallet naming trap & the five money systems

**`WalletService` is declared TWICE with the same class name on different tables** (DI/import hazard — both call `MercadoPagoPixChargeService`/`StripeService`, so a wrong-import is silent):

| Class (rename target) | File | Tables | Domain |
|---|---|---|---|
| `WalletService` → **`SellerWalletService`** | `kloel/wallet.service.ts:49` | `KloelWallet` + `KloelWalletLedger` | seller earnings |
| `WalletService` → **`PrepaidWalletService`** | `wallet/wallet.service.ts:73` | `PrepaidWallet` + `PrepaidWalletTransaction` | usage credits |

Five parallel balance+ledger systems exist (`KloelWallet`, `PrepaidWallet`, `ConnectAccountBalance/ConnectLedgerEntry`, `MarketplaceTreasury/MarketplaceTreasuryLedger`, `WalletAnticipation`). Each is a genuinely different actor's money — **keep separate, share ONE append-only ledger abstraction**. Payout execution is likewise reimplemented 3× (`ConnectPayoutService`, `MarketplaceTreasuryPayoutService`, `kloel/WalletService.withdraw`).

> **Cart/abandonment recovery** is also duplicated: `kloel/CartRecoveryService` (`@Cron` 30min over `CheckoutOrder` PENDING, MIND-chosen email) vs `checkout/CheckoutSocialRecoveryService` (`@Cron` 10min over `CheckoutSocialLead`, deterministic gate). No cross-dedup → a human who is both a PENDING order and a social lead gets recovered twice.

---

## 5. Product, Plan & Member

| Capability | Canonical implementation | Duplicate implementations to migrate | Status | Sev |
|---|---|---|---|---|
| **product-crud** | `ProductService` (`products/product.service.ts:39` — alone emits `mind.product.observed` + `AuditService` + `MindEventSpine`) | `CheckoutProductService.createProduct` (bypasses events+audit+brainSpine); `Product*Controller` family (direct Prisma); `KloelProductSubResourceToolsService` (chat tools) | **3+ write stacks** — products created via checkout are invisible to cognition/audit | P1 |
| **plan-crud** | `CheckoutProductService.createPlan → CheckoutProductPlan.priceInCents` (`checkout/checkout-product.service.ts:162` — the only plan model read by `checkout-order-pricing.util.ts`) | `PlanService.create → ProductPlan.price` Float (`plans/plan.service.ts`); `ProductPlanController.createPlan` (`product-plan.controller.ts:83`); `KloelProductSubResourceToolsService` | **P0 money split, 4 writers** — merchant can edit a `ProductPlan.price` with **NO commercial effect** (pricing reads `CheckoutProductPlan` only) | P0 |
| **member-enrollment** | `MemberEnrollmentsController.enrollStudent` (`member-enrollments.controller.ts:77` — emits `member.enrolled` + `MemberAreaStatsService.recalculate`) | `CheckoutPostPaymentEffectsService.autoEnrollInMemberAreas` (`checkout-post-payment-effects.service.ts:228` — emits **NOTHING**, inlines stats, re-keys buyer by email with no link to `CheckoutOrder`); `MemberAreaPublicController` enroll-by-email | **P1 divergent paths** — cognition is blind to paid enrollments | P1 |

> **Offer-config duplicates** (all P1/P2, canonical = the typed checkout graph): `OrderBump`/`Upsell` typed tables [canonical] vs `ProductPlan.checkoutImages.orderBump` JSON (dead, never priced); `CheckoutProductPlan/CheckoutConfig` graph [canonical] vs legacy `ProductCheckout` 14-section JSON blob; `ProductAIConfig` table [canonical] vs `ProductPlan.aiConfig` JSON; `CheckoutPixel` [canonical, the only one fired] vs `Product.metadata.pixels` vs `ProductCampaign.pixelId`. **Affiliate config** has 3–5 unsynced sources (`Product.affiliate*` [canonical], `AffiliateProduct`, `ProductPlan` affiliate fields, `AffiliatePartner`, `ProductCommission`).

---

## 6. Kloel Mind cognition

| Capability | Canonical implementation | Duplicate implementations to migrate | Status | Sev |
|---|---|---|---|---|
| **cognitive-loop** (perceive→predict→belief→surprise→policy→update) | `MindService.tick` + `MindEventProcessorService.process` (`mind.service.ts:46`; `mind/runtime/mind-event-processor.service.ts:27`) → `RAC_MindBelief/MindPrediction/MindPolicy` (DB-persisted, lease-coordinated) | `MindPredictionService.runCycle` (in-memory `activePredictions[]`, **persists NOTHING**, lost on restart); `MindBackgroundProcessor.tick` (substrate); `MindEventIngestor.tickAllWorkspaces` | **P0 — 3+ loops, divergent storage**; one persists nothing | P0 |
| **score-intent** | `MindPredictionService.runCycle` (`mind/mind-prediction.service.ts:62`) — reads `RAC_AutopilotEvent` intent rows (`SELECT intent, action, status …`), matches each active prediction's `expectedOutcome` against `${r.intent}_${r.status}` (`:98-99`), scores `wasCorrect`/`surprise`/`confidence` (`:108-114`), and emits significant-intent patterns | *(the intent-scoring loop itself; the broader cognitive loop is owned by `MindService` above)* | **functional** — this IS the live intent-scoring path (v1 missed it). Its weakness is non-durable storage + linear surprise (see below), not absence | P1 |
| **surprise / prediction-error math** | `MindSurpriseService.computeSurprise` (`mind/inference/mind-surprise.service.ts:135` = Shannon `-log(p)`) | `MindPredictionService` (`mind-prediction.service.ts:105` = linear `surprise = confidence`) | **divergent units** — `self-modification surprise > 0.7` threshold is ambiguous depending on which loop fired | P1 |
| **tick-scheduling** | `MindProcessorService` (`mind/runtime/mind-processor.service.ts:30`; queue `mind-tick`, 30s, persisted tick) | `MindBackgroundScheduler` (`mind/mind-bg.scheduler.ts:17`; queue `mind-bg-tick`, 5s + `@Cron` fallback); `MindEventIngestor.tickAllWorkspaces` | **two schedulers, double work** + Redis queue sprawl | P1 |
| **global-prior** | `MindGlobalPriorService → RAC_MindGlobalPrior` (`mind/memory/mind-global-prior.service.ts:55`, injected via `MindPolicyService.mixWithGlobalPrior`) | `KloelGlobalPriorService → RAC_KloelGlobalPrior` (`kloel/kloel-global-prior.service.ts:32` — @deprecated, **ZERO injectors = dead**) | **legacy dead, service safe to drop** (table drop owner-gated) | P2 |
| **memory-kv-store** | `KloelMemory` via `MindMemoryItemService.items` (`mind-memory-item.service.ts`, ~89+ direct `prisma.kloelMemory` callers — **current source of truth**) | `MindMemory` dual-write behind `KLOEL_MINDMEMORY_DUALWRITE` (`mind-memory-item.service.ts:96`) + read by `kloel-memory-engine.service.ts:232/282/192` | **mid-migration (split-brain risk)** — `RAC_MindMemory` is the TARGET, `RAC_KloelMemory` still authoritative; schema "ZERO writers" comment STALE (2 writers + 2 readers exist) | P1 |
| **record-case** | `MindCaseMemoryService.recordCase` (`mind/memory/mind-case-memory.service.ts:40`) | `MindMultiModalPerceptionService` `prisma.mindCase.create` direct (`:103`); `MindCanonicalService` `prisma.mindCase.create` direct (`mind-canonical.service.ts:105`) | **2 direct-create bypasses** (skip token-extraction/dedup invariants) | P2 |

### Cognitive event spine (two physical sinks)

`MindEventSpine.record → RAC_AutopilotEvent` (legacy log, **no idempotency/outbox**) vs `MindEventSpine.recordCommercial/recordMany → RAC_MindOutboxEvent` (transactional, idempotent, dispatchable — **canonical sink**). Note `MindPerceptionService` READS percepts back out of `RAC_AutopilotEvent`, so the perception read path must move when generic events migrate to the outbox.

> **Naming traps to fix (P2/P3):** `LongTermMemoryService` (graph-fact consolidation) vs `MindLongTermMemoryService` (case→belief consolidation) vs `ConsolidationService` (substrate) — keep all three, **rename for intent**. `MindRuntime` exports `as BrainRuntimeService` (ADR-0013 alias window) + legacy `kloel/brain-runtime.service.ts` shim — remove once DI tokens migrate. `MindRuntime` (sync decide/observe) vs `CiaRuntimeService` (async autonomy lifecycle) are legitimately distinct — document the split.

---

## 7. Identity, Auth & Tenant

| Capability | Canonical implementation | Duplicate implementations to migrate | Status | Sev |
|---|---|---|---|---|
| **tenant-resolution (request → workspaceId)** | `resolveWorkspaceId` (`auth/workspace-access.ts:119` — enforces `requested === token.workspaceId`, Forbidden on mismatch) | `kloel-security.guard.ts:45 getWorkspaceId` (reads params/body, **IGNORES JWT**); `common.helpers.ts:20 getWorkspaceId` (can yield `''`); `route-class.guard.ts:25 resolveWorkspaceId` (trusts `x-workspace-id` header) | **P0 cross-tenant IDOR risk** — `partnerships.controller.ts:44` ALREADY converged (follow that pattern); keep header-trust ONLY for throttle keying | P0 |
| **tenant-session-issuance/rotation** | `AuthTokenService` (`auth/auth.token.service.ts:29` — JWT+refresh, JTI blacklist `jti:revoked:<jti>`) | `AdminAuthService.refresh` + `AdminSessionFactory` (entire admin stack duplicates tenant stack with no shared core) | **parallel admin duplicate** — security fixes don't propagate | P1 |
| **totp-mfa** | `AccountMfaService` (`auth/account-mfa.service.ts:99` — base32/generateTotp/verifyTotp) | `AdminMfaService` (`admin/auth/admin-mfa.service.ts:106` — identical engine, same `MFA_PERIOD_SECONDS=30`/`MFA_WINDOW_STEPS=2`) | **copy to hoist** into `common/totp.ts` (secret-encryption already shared via admin-crypto) | P1 |
| **workspace-invitation** | **AMBIGUOUS — pick one:** `TeamService.inviteMember` (`Invitation`, schema:1286 — richer flow: email + accept→create Agent) vs `PartnershipsService.inviteCollaborator` (`CollaboratorInvite`, schema:2768 — better schema: status enum, `invitedBy`, indexes; no email/accept) | two co-equal models+services | **P1 pick-one** — a workspace can show two different pending-invite lists for the same person | P1 |
| **api-key-lifecycle** | `ApiKeysService` (`api-keys/api-keys.service.ts:12`) | — (single owner) | **canonical but `validateKey` is O(n)** — `findMany(take:1000)` + linear PBKDF2 (210k iters) per row = DoS amplifier; needs indexed `lookupHash` | P1 |

> **Live security bug (P0, access-token logout):** `AuthService.logout()` writes Redis key `access-token-revoked:<jti>` (`auth.service.ts:329`) but `JwtAuthGuard` reads `jti:revoked:<jti>` (`jwt-auth.guard.ts:92`). The logged-out access token stays valid until natural expiry. **Canonical = `AuthTokenService.revokeAccessToken`** (writes the namespace the guard checks). **Token-at-rest is inconsistent:** `RefreshToken.token` + `PasswordResetToken.token` are PLAINTEXT, while `AdminSession.token_hash` + `MagicLinkToken.tokenHash` are sha256-hashed — standardize on hashed. **Orphan:** `AuthPasswordService` (`auth.password.service.ts:36`) is never injected (absent from `auth.module.ts`, superseded by `auth-service.register-login.ts`).

---

## 8. Observability & Compliance

| Capability | Canonical implementation | Duplicate implementations | Status | Sev |
|---|---|---|---|---|
| **ops-error-eventing** | `OpsAlertService → OpsEvent` (`observability/ops-alert.service.ts:117`, `RAC_OpsEvent` schema:1614) | — (none) | **canonical** — operational error/degradation/recovery sink, **distinct** from the cognitive spine (`AutopilotEvent`/`MindOutboxEvent`) | — |
| **risc-cross-account-protection** | `ComplianceService.routeRiscEvent → RiscEvent` (`compliance/compliance.service.ts:165`, `RAC_RiscEvent` schema:1273; `classifyRiscEvent` + `routeRiscEvent` + marks processed) | — (none) | **canonical** — **CORRECTION:** `routeRiscEvent` IS the RISC (Google cross-account protection) processor; v1 wrongly called `RiscEvent` an unprocessed ingest-only stub | — |

Both `OpsEvent` and `RiscEvent` are **LIVE models that were absent from the v1 docs**.

---

## In-flight migrations (do NOT treat as converged)

| Migration | From → To | Flag | State |
|---|---|---|---|
| **KV/semantic memory** | `RAC_KloelMemory` (source of truth, ~89+ callers) → `RAC_MindMemory` | `KLOEL_MINDMEMORY_DUALWRITE` (OFF) | mid-migration: 2 writers + 2 readers, **no backfill**, split-brain risk; "ZERO writers" comment STALE |
| **Unified messages** | `RAC_KloelMessage`+`RAC_ChatMessage`+`RAC_KloelConversation`+`RAC_Message` → `RAC_MindMessage` | `KLOEL_MINDMESSAGE_DUALWRITE` (OFF) | **canonical-but-DEAD-on-read**: 4 flag-gated writers, ZERO readers; enabling now = 2× write, no benefit |
| **Plan pricing units** | `RAC_ProductPlan.price` (Float reais) → `RAC_CheckoutProductPlan.priceInCents` (Int) | *(no flag — additive column)* | half-done: `priceInCents` populated only by `PlanService.create`; controller + chat tools don't dual-write; merchant edits can have no commercial effect |
| **Channel transport** | `kloel/channel-transport.providers.ts` send bodies → `marketing/channels/*-dispatch.adapter` | `KLOEL_TRANSPORT_CANONICAL_DELEGATE` (OFF, **excludes email+tiktok**) | mid-migration: default OFF → guarded path runs duplicate legacy bodies; email blocked by `EmailChannelTransport` using a different mechanism (`EmailCampaignService`) |
| **Instagram DM send** | `InstagramMarketingService.sendDirectMessage` raw → `ChannelMessageDispatchService` via `InstagramDispatchAdapter` | `instagram-canonical-dispatch.flag` | mid-migration: flag-gated delegation landed (commit `a38949d94`) |
| **Lead → Person** | `RAC_KloelLead` funnel columns → `RAC_Contact` mirror + `Contact.kloelLeadId` (schema:444) | best-effort dual-write in the 3 lead services + `person-kloel-lead-to-contact.backfill.*` (no dedicated flag file) | mid-migration: additive columns + backfill landed, cut-over incomplete (`LeadsService` reads `KloelLead`, CRM reads `Contact`). **Open P1 MERGE DECISION** |
| **Global prior** | `RAC_KloelGlobalPrior` + `KloelGlobalPriorService` → `RAC_MindGlobalPrior` + `MindGlobalPriorService` | *(no flag)* | near-complete: bridge wired, legacy service dead (zero injectors); table drop owner-gated |
| **Coupons** | `RAC_ProductCoupon` (Float) → `RAC_CheckoutCoupon` (Int cents) | *(one-way sync util)* | mid-migration: one-directional sync only on product-coupon controller writes; divergent validate; silent Float→cents rounding |
| **Brain→Mind DI rename** | `BrainRuntimeService` alias + shim → `MindRuntime` | *(ADR-0013 alias window)* | scheduled-for-removal compatibility layer |

---

## Queue reality (correction)

All BullMQ queues are registered in `backend/src/queue/queue-names.const.ts`. **`campaign-jobs`, `voice-jobs`, and `media-jobs` are NOT dead** — they have live consumers in the separate `worker/` deployable:

| Queue | Worker | File |
|---|---|---|
| `campaign-jobs` | `campaignWorker` | `worker/campaign-processor.ts:147` |
| `voice-jobs` | `voiceWorker` | `worker/voice-processor.ts:253` |
| `media-jobs` | `mediaWorker` | `worker/media-processor.ts:15` |

The genuinely questionable surface is **`mass-send`** (`backend/src/mass-send/*`) — that is the only queue without a confirmed live worker.
