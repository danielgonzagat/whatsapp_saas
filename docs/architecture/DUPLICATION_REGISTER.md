# Kloel Duplication Register

**What this answers.** This is the canonical, exhaustive register of every *structural duplication* in the Kloel backend — the same concept implemented in more than one model, table, service, resolver, or ledger. For each duplication it names every real implementation (file:line / `Class.method` / `RAC_*` table), states the severity and *why*, declares the canonical choice, and sketches the migration. It is the flagship reference for canonicalization work: when you are about to add a write path, an enum, a resolver, or a money table, check here first. Every name below is a real model/service/file verified against `backend/prisma/schema.prisma` + `backend/src/**` + `worker/**` — no invented names.

**Last generated:** 2026-06-07 (from `docs/architecture/inventory/_CONSOLIDATED.json`, which consolidates the 7 domain inventory JSONs).

---

## How to read this register

- **Severity ladder.** `P0` = active correctness / security / revenue defect (a human is mischarged, mis-identified, or a logged-out token still works). `P1` = a settled-or-near-settled merge with a live split-brain or maintenance hazard. `P2` = drift-prone duplication with no live data corruption. `P3` = cosmetic / naming entropy.
- **Grounding.** `RAC_*` names are Prisma `@@map` tables; `schema:N` is the line in `backend/prisma/schema.prisma`. Service line numbers are in `backend/src/**` (or `worker/**` for the separate worker deployable).
- **Anti-regression gate.** The Brain→Mind memory/message canonicalization is *enforced in CI* by [`scripts/ops/check-canonical-mind-access.mjs`](../../scripts/ops/check-canonical-mind-access.mjs) — it forbids new `prisma.kloelMemory` / `prisma.kloelMessage` / `prisma.chatMessage` reaches outside the Mind alias services. Several P1 memory/message entries below are exactly what that gate protects; cross-references are inline.

### Critic corrections baked into this v2 (do not regress)

1. **`ChannelSession` is FICTIONAL** — zero grep matches in `backend/src/**` and `schema.prisma`. The real channel-session surface is `WhatsappSessionService` (`backend/src/marketing/channels/whatsapp/whatsapp-session.service.ts:19`) over `ChannelSetup` (schema:3492) + `MetaConnection` (schema:3467). It is **not** listed as a canonical model anywhere below.
2. **`Lead` is NOT an alias of `Contact`.** `KloelLead` (`RAC_KloelLead`, schema:1834) is a separate **live** table. Contact-vs-KloelLead is recorded as an **open P1 merge decision** (§P1-1), not a settled alias.
3. **`OpsEvent` (schema:1614) and `RiscEvent` (schema:1273) are LIVE models** (absent from v1). `OpsEvent` ← `OpsAlertService` (`observability/ops-alert.service.ts`); `RiscEvent` ← `ComplianceService.routeRiscEvent` (`compliance/compliance.service.ts:140`). `routeRiscEvent` **is** the processor — RiscEvent is *not* an ingest-only stub.
4. **`campaign-jobs` / `voice-jobs` / `media-jobs` are NOT dead queues.** They have live `new Worker(...)` consumers in the separate `worker/` deployable (`worker/campaign-processor.ts:147`, `worker/voice-processor.ts:253`, `worker/media-processor.ts:16`). **Only `mass-send` is genuinely questionable** (§P1-13).
5. **Three migrations are mid-flight, not converged:** KloelMemory→MindMemory dual-write (`mind-memory-item.service.ts:96`, flag `KLOEL_MINDMEMORY_DUALWRITE`, default OFF), MindMessage canonical-but-dead-on-read (flag `KLOEL_MINDMESSAGE_DUALWRITE`), and `ProductPlan.price`(Float)→`CheckoutProductPlan.priceInCents`. See §In-flight migrations.

---

## Severity index

| # | Severity | Concept | Family |
|---|---|---|---|
| [P0-1](#p0-1) | P0 | Request→workspaceId resolver with divergent security (IDOR) | identity-auth |
| [P0-2](#p0-2) | P0 | Phone normalization identity fragmentation | contact-identity |
| [P0-3](#p0-3) | P0 | Payment-with-link lookup by RAW phone → lost revenue | contact-identity |
| [P0-4](#p0-4) | P0 | Sale/Order/Payment ledger split (one payment, 3 tables) | checkout-payment |
| [P0-5](#p0-5) | P0 | Plan price split across two tables / two money units | product-plan-offer |
| [P0-6](#p0-6) | P0 | Coupon model + validation divergence | checkout-payment |
| [P0-7](#p0-7) | P0 | Cognitive loop implemented 3×; one persists nothing | mind-core |
| [P0-8](#p0-8) | P0 | Logout blacklist writes a key the JWT guard never reads | identity-auth |
| [P1-1](#p1-1) | P1 | Contact vs KloelLead — open MERGE DECISION | contact-identity |
| [P1-2](#p1-2) | P1 | Three near-identical lead-lifecycle services | contact-identity |
| [P1-3](#p1-3) | P1 | Two dispatch registries (pure vs guarded) | channel-dispatch |
| [P1-4](#p1-4) | P1 | Per-channel send implemented twice | channel-dispatch |
| [P1-5](#p1-5) | P1 | Two services to the same Meta page endpoint | channel-dispatch |
| [P1-6](#p1-6) | P1 | Three Meta-connection readers + ~19 raw bypasses | channel-dispatch |
| [P1-7](#p1-7) | P1 | Two `WalletService` classes, same name, different tables | wallet-ledger |
| [P1-8](#p1-8) | P1 | Five parallel money balance+ledger systems | wallet-ledger |
| [P1-9](#p1-9) | P1 | Cart/abandonment recovery owned by two crons | checkout-payment |
| [P1-10](#p1-10) | P1 | MindMessage unified table vs 4 live source tables | message |
| [P1-11](#p1-11) | P1 | Conversation-history read across 6 divergent call sites | message |
| [P1-12](#p1-12) | P1 | MindMemory vs KloelMemory (split-brain) | memory |
| [P1-13](#p1-13) | P1 | mass-send — the one genuinely dead queue | channel-dispatch |
| [P1-14](#p1-14) | P1 | Two workspace-invitation models + services | identity-auth |
| [P1-15](#p1-15) | P1 | Admin auth stack duplicates tenant auth stack | identity-auth |
| [P1-16](#p1-16) | P1 | TOTP/MFA implemented identically twice | identity-auth |
| [P1-17](#p1-17) | P1 | Inconsistent token-at-rest policy (plaintext in DB) | identity-auth |
| [P1-18](#p1-18) | P1 | ApiKey validation = O(n) PBKDF2 table scan (DoS) | identity-auth |
| [P1-19](#p1-19) | P1 | Divergent surprise / prediction-error math | mind-core |
| [P1-20](#p1-20) | P1 | Two tick schedulers fanning the same workspace set | mind-core |
| [P1-21](#p1-21) | P1 | Event spine has two physical sinks | mind-core |
| [P1-22](#p1-22) | P1 | Three+ product/plan CRUD write stacks | product-plan-offer |
| [P1-23](#p1-23) | P1 | Order bump / upsell stored typed AND as JSON | product-plan-offer |
| [P1-24](#p1-24) | P1 | Affiliate config has 3-5 sources of truth | product-plan-offer |
| [P1-25](#p1-25) | P1 | Member enrollment via divergent paths | product-plan-offer |
| [P2-1](#p2-1) | P2 | Two `MetaWebhookController`s with duplicated HMAC/dedup | channel-dispatch |
| [P2-2](#p2-2) | P2 | `ChannelCapability`/`ChannelSendResult` declared twice | channel-dispatch |
| [P2-3](#p2-3) | P2 | Channel-name vocabularies (casing forks) | channel-dispatch |
| [P2-4](#p2-4) | P2 | Legacy `ProductCheckout` JSON-blob vs typed graph | checkout-payment |
| [P2-5](#p2-5) | P2 | Overlapping cross-channel identity resolution | contact-identity |
| [P2-6](#p2-6) | P2 | `recordCase` bypassed by direct `mindCase.create` | mind-core |
| [P2-7](#p2-7) | P2 | MindGlobalPrior vs KloelGlobalPrior | global-prior |
| [P2-8](#p2-8) | P2 | MindMessage table is write-only (dead-on-read) | message |
| [P2-9](#p2-9) | P2 | Per-surface MindMessage dual-write helper ×4 | message |
| [P2-10](#p2-10) | P2 | Two `*LongTermMemory*` services (naming collision) | memory |
| [P2-11](#p2-11) | P2 | Stripe-sub→workspaceId resolver copied across 3 billing services | checkout-payment |
| [P2-12](#p2-12) | P2 | Payout execution reimplemented 3× | wallet-ledger |
| [P2-13](#p2-13) | P2 | Tag upsert+connect duplicated outside CrmService | contact-identity |
| [P2-14](#p2-14) | P2 | Contact provenance bridge unwired in scraped-import | contact-identity |
| [P2-15](#p2-15) | P2 | PIX charge — canonical vs ORPHAN dead duplicate | checkout-payment |
| [P2-16](#p2-16) | P2 | Per-product AI config split (typed vs per-plan JSON) | product-plan-offer |
| [P2-17](#p2-17) | P2 | Pixels stored in three places; only one fired | product-plan-offer |
| [P3-1](#p3-1) | P3 | Four+ outbound send facades (guarded vs un-guarded) | channel-dispatch |
| [P3-2](#p3-2) | P3 | Two byte-identical contact-by-phone DTOs | contact-identity |
| [P3-3](#p3-3) | P3 | Two bcrypt work-factor constants, same value | identity-auth |
| [P3-4](#p3-4) | P3 | sha256-hex hasher + `marketplace` namespace overload | cross-cutting |
| [P3-5](#p3-5) | P3 | BrainRuntime alias + self-model/consciousness overlap | mind-core |

---

# P0 — active correctness / security / revenue defects

<a id="p0-1"></a>
## P0-1 · Request→workspaceId resolver with divergent security semantics (cross-tenant IDOR)

**Family:** identity-auth

| Implementation | Behaviour |
|---|---|
| `auth/workspace-access.ts:119` `resolveWorkspaceId` | **SECURE / canonical** — `assertWorkspaceAccess(candidate, req.user)` enforces requested `===` token workspaceId, throws Forbidden on mismatch |
| `kloel/guards/kloel-security.guard.ts:45` `getWorkspaceId` | reads `params`/`body`, **IGNORES the JWT** |
| `kloel/product-sub-resources/helpers/common.helpers.ts:20` `getWorkspaceId` | `req.user \|\| req.workspaceId \|\| ''` — can yield empty string, no cross-check |
| `common/throttler/route-class.guard.ts:25` `resolveWorkspaceId` | trusts `x-workspace-id` header (throttle-keying only) |
| `marketing/channels/whatsapp/controllers/whatsapp.controller.ts:38` `resolveWorkspaceId` | local copy |
| `kloel/middleware/audit-log.middleware.ts:156` `resolveWorkspaceId` | local copy |
| `partnerships/partnerships.controller.ts:44` | **already converged** onto the secure resolver (migration pattern to copy) |

**Severity P0 — why.** The guard variants resolve a tenant boundary from caller-supplied params/body/header while ignoring the verified token. A caller can pass another workspace's id and the request proceeds — classic IDOR over the multi-tenant boundary that fronts nearly every model (`Workspace`, schema:119). The empty-string path (`common.helpers.ts:20`) is worse: it can silently widen a query to `''`.

**Canonical:** `auth/workspace-access.ts:119` `resolveWorkspaceId` — the only variant that proves the caller owns the workspace.

**Migration:** Converge `kloel-security.guard` + `common.helpers` onto `resolveWorkspaceId`, following the `partnerships.controller.ts:44` migration. Keep `route-class.guard`'s header-trust **only** for throttle keying, never for data access. Add a guard-level regression test asserting a mismatched `:workspaceId` param is rejected.

---

<a id="p0-2"></a>
## P0-2 · Phone normalization semantics diverge across Contact-keying paths → one human → many rows

**Family:** contact-identity

| Implementation | Normalization |
|---|---|
| `crm.service.ts:47` `CrmService.upsertContact` → `normalizePhone().digits` | BR-promoting **[canonical]** |
| `kloel/kloel-lead-processor.service.ts:92` `KloelLeadProcessorService` → `normalizePhone().digits` | BR-promoting |
| `checkout-social-lead.service.helpers.ts:185` `CheckoutSocialLeadService.buildContactUpsertArgs` → `digitsOrNull` | digits-only, **NO `55` promotion**, locally aliased AS `normalizePhone` (misleading) |
| `crm.deals.helpers.ts:80` `createDeal` → `String(phone).trim()` | RAW |
| `scrapers.service.ts:145` `importLeads` → `lead.phone` | RAW |
| `kloel/mind/coordination/whatsapp-mind-coordinator.service.ts:135` `handleIncomingMessage` → `getOrCreateLead(msg.from RAW)` | RAW JID |

**Severity P0 — why.** Four different keying conventions write to the same `(workspaceId, phone)` unique surface on `RAC_Contact` (schema:399, `@@unique([workspaceId, phone])`) and `RAC_KloelLead` (schema:1834, same unique). `+55 11 98765-4321` from CRM and the raw-JID variant from the WhatsApp coordinator produce **different** phone strings → the same human becomes multiple Contact/KloelLead rows, fragmenting funnel state, dedup, and recovery.

**Canonical:** `normalizePhone()` from `backend/src/common/phone/phone-normalization.util.ts:150` (structured, BR-promoting). Every `(workspaceId, phone)` write must route through `.digits`.

**Migration:** (1) Replace `digitsOrNull`/raw keying at every Contact and KloelLead write with `normalizePhone().digits`. (2) Normalize at the channel boundary **before** `getOrCreateLead` (fixes the coordinator raw-JID path). (3) Remove the `import digitsOrNull as normalizePhone` alias in checkout-social-lead. (4) Backfill/merge already-fragmented rows via the orphan merge service ([P1-1](#p1-1) note).

---

<a id="p0-3"></a>
## P0-3 · `processWhatsAppMessageWithPayment` looks up the lead by RAW phone → payment link silently not generated (lost revenue)

**Family:** contact-identity

| Implementation | Key used |
|---|---|
| `kloel-lead-processor.service.ts:78-83` `processWhatsAppMessage` | creates the lead via **normalized** phone |
| `kloel-lead-processor.service.ts:285` `processWhatsAppMessageWithPayment` | `prisma.kloelLead.findFirst({ where: { workspaceId, phone: senderPhone } })` — **RAW** |

**Severity P0 — why.** A direct corollary of [P0-2](#p0-2), isolated because it costs money on a single line. The lead is created under a normalized phone; the payment-link path re-looks it up by the raw sender phone. On a `(11) 98765-4321`-format inbound the two keys differ, the lookup misses, and the high-buy-intent payment link is never generated — silent revenue loss.

**Canonical:** use `normalizePhone(senderPhone).digits` for the lookup, matching `getOrCreateLead`.

**Migration:** Single-line fix at `kloel-lead-processor.service.ts:285` to normalize the lookup key; add a regression test asserting the payment link fires for a `(11) 98765-4321`-format sender.

---

<a id="p0-4"></a>
## P0-4 · Sale/Order/Payment record split — one human payment can be PAID in one ledger and PENDING in another

**Family:** checkout-payment

| Implementation | Role |
|---|---|
| `CheckoutOrder` (schema:3220) + `CheckoutPayment` (schema:3330) — `CheckoutPaymentService.capture` (`checkout/checkout-payment.service.ts:52`) | checkout pipeline source of truth **[canonical]** |
| `KloelSale` (schema:1917) — `SalesService` (`sales/sales.service.ts:64`) + `kloel/PaymentService` + `kloel/SmartPaymentService` | chat-driven sales source of truth |
| `Payment` (schema:2744) — **NO owning `@Injectable`** | generic raw webhook-only record |
| `PhysicalOrder` (schema:2706) — `saleId String?` with **NO FK** | physical fulfillment |

**Severity P0 — why.** A single Stripe webhook fans out to update **three** parallel tables via independent `updateMany()` calls (`webhooks/payment-webhook-stripe.handlers.ts:44-54`, `payment-webhook-generic.helpers.ts:79/111`). If one update lands and another doesn't, the same human payment is `PAID` in `CheckoutPayment` and `PENDING` in `KloelSale` (or the orphan `Payment`). `CheckoutOrder.totalInCents` is the GMV source of truth, so `KloelSale` chat revenue is also double-orphaned — absent from both `admin gmv.query.ts` and `dashboard.service` GMV.

**Canonical:** `CheckoutOrder` + `CheckoutPayment` for product sales; `KloelSale` becomes a thin **originator** that **always** materializes a `CheckoutOrder`; retire the orphan `Payment` model.

**Migration:** (1) Make every `KloelSale` create/confirm also upsert a `CheckoutOrder`+`CheckoutPayment` keyed on a shared `externalId`. (2) Repoint the webhook handlers to a single resolver that updates **one** canonical row, not three parallel `updateMany()`. (3) Fold `KloelSale` revenue into `admin gmv.query.ts` + `dashboard.service`. (4) Drop `RAC_Payment` after confirming zero readers besides the webhook helpers.

---

<a id="p0-5"></a>
## P0-5 · Plan / pricing split across two tables with different money units → merchant edits a price with NO commercial effect

**Family:** product-plan-offer

| Implementation | Money |
|---|---|
| `CheckoutProductPlan` (`RAC_CheckoutProductPlan`, schema:2969, **`priceInCents Int`**) — `checkout/checkout-product.service.ts` | **[canonical]** — the ONLY plan model read by `checkout-order-pricing.util.ts` |
| `ProductPlan` (`RAC_ProductPlan`, schema:2213, **`price Float`**; `priceInCents Int?` nullable mid-migration) — `plans/plan.service.ts` + `kloel/product-sub-resources/product-plan.controller.ts:83` + `kloel-product-sub-resource-tools.service.ts:107` | not consulted at order time |

**Severity P0 — why.** Money lives in two unsynced tables with different units (Float reais vs Int cents). The buyer is charged from `CheckoutProductPlan.priceInCents`; the merchant edits prices via `ProductPlanController` / chat tools, which write `ProductPlan.price`. Those writes do **not** dual-write `priceInCents`, so a merchant can "change the price" and the checkout charges the old value — a silent pricing defect.

**Canonical:** `CheckoutProductPlan.priceInCents`.

**Migration:** (1) Backfill `ProductPlan.priceInCents` from `price*100` for all rows (today only `PlanService.create` writes it additively; `ProductPlanController` + chat tools don't dual-write). (2) Route `ProductPlanController` and `KloelProductSubResourceToolsService` writes through `CheckoutProductService`. (3) Order pricing stays the single reader (already is). (4) Demote `ProductPlan` to a read-through view or retire. See §In-flight migrations.

---

<a id="p0-6"></a>
## P0-6 · Coupon model + validation divergence (`ProductCoupon` vs `CheckoutCoupon`)

**Family:** checkout-payment

| Implementation | Value type / enum / validate |
|---|---|
| `CheckoutCoupon` (`RAC_CheckoutCoupon`, schema:3178, **Int cents**, `DiscountType PERCENTAGE/FIXED`) + `validateCouponHelper` (`checkout/checkout-catalog.helpers.ts:79`) | **[canonical]** — enforces `minOrderValue`/`appliesTo`/`discountAmount` |
| `ProductCoupon` (`RAC_ProductCoupon`, schema:2297, **Float**, `PERCENT/FIXED`) + `kloel/CouponService` + `ProductCouponDomainService` + `ProductCouponController.validate` (`product-coupon.controller.ts:154`) | **omits** `minOrderValue`/`appliesTo`/discount-amount |
| Bridge: `syncWorkspaceCheckoutCouponForProduct` (`kloel/product-coupon-sync.util.ts:54`) | one-directional Float→cents |
| Third surface: `CheckoutConfig.autoCouponCode` + `couponPopup*` (schema:3061) | presentation |

**Severity P0 — why.** Two value types (Float vs Int cents), two enum spellings (`PERCENT` vs `PERCENTAGE`), and **divergent validate logic** — the ProductCoupon path skips `minOrderValue`/`appliesTo` guards the checkout path enforces. A coupon validated as "ok" by `ProductCouponController.validate` can be rejected (or over-applied) at order time, and the one-way Float→cents sync introduces silent rounding. Coupons created via `CheckoutCatalogService.createCoupon` have no `ProductCoupon` row at all.

**Canonical:** `CheckoutCoupon` + `validateCouponHelper`. `ProductCoupon` becomes a write-through view (or is retired).

**Migration:** (1) Make `ProductCouponController.validate` delegate to `validateCouponHelper`. (2) Make `ProductCoupon` writes always upsert a `CheckoutCoupon`. (3) Unify the enum spelling. (4) Store cents on both to kill the Float→cents round-trip. See §In-flight migrations.

---

<a id="p0-7"></a>
## P0-7 · Cognitive loop (perceive→predict→belief→surprise→policy→update) implemented 3×; one persists nothing

**Family:** mind-core

| Implementation | Storage |
|---|---|
| `MindService.tick` + `MindEventProcessorService.process` (`mind.service.ts:46`; `mind/runtime/mind-event-processor.service.ts:27`) → `RAC_MindBelief`/`MindPrediction`/`MindPolicy` | **[canonical]** DB-persisted, lease-coordinated |
| `MindPredictionService.runCycle` (`mind/mind-prediction.service.ts:51`) → in-memory `activePredictions[]` + `RAC_AutopilotEvent` | **NON-durable**, lost on restart, linear `surprise=confidence` |
| `MindBackgroundProcessor.tick` (`mind/mind-bg.processor.ts:38`) | hebbian/consolidation/valence substrate |
| `MindEventIngestor.tickAllWorkspaces` (`mind/coordination/mind-event-ingestor.service.ts:50`) | fan-out |

**Severity P0 — why.** The learning that should accrue in `RAC_MindPrediction` is split across two unreconciled stores: the canonical loop persists, the shadow `MindPredictionService` keeps predictions in memory and loses them on restart — and uses different surprise math (linear vs Shannon, see [P1-19](#p1-19)). Downstream thresholds (e.g. self-modification on surprise) become ambiguous depending on which loop fired. This is a *decision-outcome learning leak*: outcomes that should sharpen future predictions evaporate.

**Canonical:** `MindService.tick` + `MindEventProcessorService` — the only DB-persisted, lease-coordinated, prediction-table-backed loop.

**Migration:** (1) Make `MindPredictionService` persist to `RAC_MindPrediction` (or delete the shadow loop). (2) Unify surprise on `MindSurpriseService.computeSurprise` (Shannon `-log(p)`); remove the linear path. (3) Re-scope mind-bg as an explicit "substrate sub-tick" demoted under `MindProcessorService` ([P1-20](#p1-20)).

---

<a id="p0-8"></a>
## P0-8 · Logout access-token blacklist writes a Redis namespace the JWT guard never reads → logged-out token stays valid

**Family:** identity-auth

| Implementation | Redis key |
|---|---|
| `AuthService.logout()` (`auth.service.ts:329`) | writes `access-token-revoked:<jti>` — **DEAD, nothing reads it** |
| `JwtAuthGuard` (`jwt-auth.guard.ts:92`) | reads `jti:revoked:<jti>` |
| `AuthTokenService.revokeAccessToken`/`isAccessTokenRevoked` (`auth.token.service.ts:458/472`) | writes+reads `jti:revoked:<jti>` **[canonical]** |

**Severity P0 — why.** Logout writes a blacklist entry under one key namespace; the guard checks a different namespace. The result: a logged-out access JWT keeps passing the guard until its natural expiry — a security defect. It is also a textbook example of [P1-15](#p1-15): the fix exists in `AuthTokenService` but `AuthService.logout` carries its own divergent copy.

**Canonical:** `AuthTokenService.revokeAccessToken` (key `jti:revoked:<jti>`).

**Migration:** Repoint `AuthService.logout` to call `AuthTokenService.revokeAccessToken`; delete the dead `access-token-revoked:<jti>` write; add a test asserting a logged-out access JWT is rejected.

---

# P1 — settled / near-settled merges with live split-brain or maintenance hazard

<a id="p1-1"></a>
## P1-1 · Contact (`RAC_Contact`) vs KloelLead (`RAC_KloelLead`) — open MERGE DECISION

> **Critic correction:** `Lead` is **NOT** a settled alias of `Contact`. This is an *unsettled* merge.

**Family:** contact-identity

| Implementation | Read by |
|---|---|
| `Contact` (`RAC_Contact`, schema:399, `@@unique([workspaceId, phone])`) — `leadStatus/leadStage/lastMessage/lastIntent/totalMessages` mirror columns | `CrmService` / CRM UI |
| `KloelLead` (`RAC_KloelLead`, schema:1834, same unique) — `status/stage/lastMessage/lastIntent/totalMessages/score` | `LeadsService` for `GET /kloel/leads/:workspaceId` (the leads-list UI); live backing store for WhatsApp lead-processing |
| `CheckoutSocialLead.status/stepReached` (schema:3273) | separate status machine |
| `ScrapedLead.phone` (schema:779) | distinct identity surface until imported |

**Severity P1 — why.** Two person/lead entities model the same human with overlapping funnel columns. `KloelLead` funnel state is mirrored onto `Contact` via best-effort dual-write (implemented directly in the 3 lead services — `kloel-lead-processor.service.ts`, `lead-mind-coordinator.service.ts`, `whatsapp-mind-coordinator.service.ts`) + backfill (`person-kloel-lead-to-contact.backfill.*` in `backend/src/prisma/backfills/`; **no dedicated `*.flag.ts` file** for this migration), but the cut-over is **not** complete: `LeadsService` still reads `KloelLead` while CRM reads `Contact`, so the **leads screen and the CRM screen can disagree** about the same person. Combined with [P0-2](#p0-2), fragmented phone keys multiply this divergence.

**Canonical (declared, not yet realized):** `Contact` is the declared canonical person (PERSON migration). Treat Contact-vs-KloelLead as an **open P1 merge decision**, not a settled alias.

**Migration:** (1) Make `KloelLead` funnel state read-through/derived from `Contact`. (2) Repoint `LeadsService.listLeads` from `KloelLead` to `Contact` (the frontend docstring at `frontend/src/lib/api/leads.ts:4-12` already *claims* Contact-backing — stale). (3) Activate `ContactIdentityMergeService` (`contacts/contact-identity-merge.service.ts:19`, currently **ORPHAN — zero production callers**) to reconcile fragmented rows. (4) Then retire `RAC_KloelLead`. See §In-flight migrations.

---

<a id="p1-2"></a>
## P1-2 · Three near-identical lead-lifecycle services, each with its own `getOrCreateLead`

**Family:** contact-identity

| Implementation | Note |
|---|---|
| `KloelLeadProcessorService.processWhatsAppMessage` (`kloel/kloel-lead-processor.service.ts:56`) + `getOrCreateLead` (`kloel-lead-processor-helpers.ts:76`) | |
| `LeadMindCoordinator.processWhatsAppMessage` + `syncCanonicalContact` + `getOrCreateLead` (`kloel/mind/coordination/lead-mind-coordinator.service.ts:92`) | self-annotated **"canonical per-lead cognitive coordinator"** |
| `WhatsAppMindCoordinator.handleIncomingMessage` + `syncCanonicalContact` + `getOrCreateLead` (`kloel/mind/coordination/whatsapp-mind-coordinator.service.ts:175`) | passes **RAW** `msg.from` |

**Severity P1 — why.** Three copies of WhatsApp→(KloelLead + Contact dual-write) with three `getOrCreateLead` bodies that have drifted (one uses raw phone — feeds [P0-2](#p0-2)). A fix to dedup or normalization must be applied three times or it silently regresses.

**Canonical:** `LeadMindCoordinator` (self-annotated). Collapse the other two, or extract one shared `getOrCreateLead(workspaceId, normalizedPhone)` + `syncCanonicalContact`.

**Migration:** Extract the single helper; delete the 3 drifted copies; normalize phone at the channel boundary before any of them.

---

<a id="p1-3"></a>
## P1-3 · Two parallel outbound dispatch registries: pure `ChannelDispatchRegistry` vs guarded `ChannelTransportRegistry`

**Family:** channel-dispatch

| Implementation | Posture |
|---|---|
| `ChannelDispatchRegistry` (`common/channel-dispatch/channel-dispatch.registry.ts:31`) | keyed by `ChannelKind`, `ChannelDispatchPort` adapters, **NO policy guard** — **[canonical transport core]** |
| `ChannelTransportRegistry` (`kloel/channel-transport.registry.ts:52`) | keyed by `ChannelName`, `ChannelTransportProvider`, MindGuard + audit, **flag-gated delegation** (`KLOEL_TRANSPORT_CANONICAL_DELEGATE`, default OFF, excludes email+tiktok) |

**Severity P1 — why.** Two registries with two result contracts and two keyings. With the delegate flag OFF, the guarded registry still runs **duplicate legacy `provider.send()` bodies** instead of delegating, so a send may take two different code paths depending on the flag. The email exclusion hides a deeper split ([P1-4](#p1-4)).

**Canonical:** `ChannelDispatchRegistry` as transport core; keep `ChannelTransportRegistry` **only** as a guard+audit decorator that **always** delegates.

**Migration:** (1) Finish the `KLOEL_TRANSPORT_CANONICAL_DELEGATE` rollout (flip default ON) so the legacy provider bodies become dead. (2) Resolve the email exclusion (it uses `EmailCampaignService`, a different mechanism — itself a latent P1). (3) Collapse the two result contracts ([P2-2](#p2-2)). See §In-flight migrations.

---

<a id="p1-4"></a>
## P1-4 · Per-channel send implemented twice: `marketing/channels/*-dispatch.adapter` vs `kloel/channel-transport.providers`

**Family:** channel-dispatch

| Adapter (canonical) | Provider (legacy/guarded) |
|---|---|
| `InstagramDispatchAdapter` (`instagram-dispatch.adapter.ts:24`) | `InstagramChannelTransport` (`channel-transport.providers.ts:42`) |
| `MessengerDispatchAdapter` (`messenger-dispatch.adapter.ts:23`) | `MessengerChannelTransport` (`channel-transport.providers.ts:124`) |
| `TikTokDispatchAdapter` (`tiktok-dispatch.adapter.ts:33`) | `TikTokChannelTransport` (`channel-transport.providers.ts:202`) |
| `EmailDispatchAdapter` + `TransactionalEmailDispatchAdapter` | `EmailChannelTransport` (`channel-transport.providers.ts:258`) |

**Severity P1 — why.** Each channel's send exists twice. `TikTokDispatchAdapter`'s own docstring says it **"supersedes"** `TikTokChannelTransport`. The email pair genuinely diverges in delivery behaviour (`EmailChannelTransport` uses `EmailCampaignService`), which is why `canDelegate` excludes it at `registry.ts:169`.

**Canonical:** the `marketing/channels/*-dispatch.adapter` (`ChannelDispatchPort`) family.

**Migration:** Collapse `*ChannelTransport` into thin guard-only decorations once delegation is all they add; resolve the `EmailChannelTransport` mechanism divergence first (it changes delivery behaviour).

---

<a id="p1-5"></a>
## P1-5 · Two services send to the SAME Meta page endpoint `${pageId}/messages` under two ChannelKinds; only one persists

**Family:** channel-dispatch

| Implementation | ChannelKind / persistence |
|---|---|
| `MessengerService.sendTextMessage` (`channels/messenger/messenger.service.ts:12`) | `ChannelKind.MESSENGER`, **NO persistence** |
| `FacebookMessengerService.sendMessage` (`marketing/facebook-messenger.service.ts:41`) | `ChannelKind.FACEBOOK`, persists `FbMessage` (`RAC_FbMessage`, schema:3911) + full webhook processing |

**Severity P1 — why.** Two `ChannelKind`s for one physical wire surface (the Meta page-messaging endpoint). Only `FacebookMessengerService` persists, so which kind a message is routed under decides whether it's recorded. Risk of double-persistence (both `RAC_Message` and `RAC_FbMessage`) for FB inbound must also be checked.

**Canonical:** `FacebookMessengerService` (richer, persistence-backed). Make the `ChannelKind` split semantically real or unify to one page-messaging service.

**Migration:** Route both kinds through one page-messaging service that always persists `FbMessage` as a provider-native delivery ledger while `RAC_Message` stays the canonical conversation store; verify FB inbound isn't double-persisted.

---

<a id="p1-6"></a>
## P1-6 · Three Meta-connection readers with divergent shapes + ~19 raw `prisma.metaConnection.find*` bypasses

**Family:** channel-dispatch

| Implementation | Output |
|---|---|
| `MetaWhatsAppService.resolveConnection` (`meta/meta-whatsapp.service.ts:71`) | `ResolvedMetaConnection` **[canonical]** |
| `MetaConnectionStateService.forWorkspace` (`meta/meta-connection-state.service.ts:44`) | `MetaConnectionState` |
| `resolveInstagramConnection` (`marketing/instagram/instagram-marketing.service.ts:24`) | `InstagramConnection` (bespoke decrypt) |
| ~19 direct `prisma.metaConnection.find*` callsites | across marketing/meta/omnichannel/kloel |

**Severity P1 — why.** Credential resolution for `MetaConnection` (schema:3467) happens three ways with divergent token-expiry semantics (`EXPIRED` at `meta-connection-state.service.ts:31` vs `tokenExpired` in `resolveConnection`), plus ~19 raw finds that skip resolution/decryption entirely. A token-refresh or expiry fix lands in one and not the others.

**Canonical:** `MetaWhatsAppService.resolveConnection` as the single credential resolver; `MetaConnectionStateService` consumes it; delete `resolveInstagramConnection`.

**Migration:** Unify the token-expiry semantics into one helper; replace raw `find*` callsites with the resolver.

---

<a id="p1-7"></a>
## P1-7 · Two distinct `WalletService` classes with the SAME name on DIFFERENT tables (DI/import hazard)

**Family:** wallet-ledger

| Implementation | Tables / ops |
|---|---|
| `kloel/wallet.service.ts:49` `WalletService` | `KloelWallet`/`KloelWalletLedger` — seller earnings; `confirmPayment` pending→available, `withdraw` |
| `wallet/wallet.service.ts:73` `WalletService` | `PrepaidWallet`/`PrepaidWalletTransaction` — usage credits; `createTopupIntent`, `debit` |

**Severity P1 — why.** Identical class name, different domains, both call `MercadoPagoPixChargeService`/`StripeService`. A wrong import wires the wrong money domain and the bug is **silent** — both compile, both have the methods, but they touch different actors' balances.

**Canonical:** rename to `SellerWalletService` and `PrepaidWalletService` (or `UsageWalletService`). Legitimately different domains; the identical name is the trap.

**Migration:** Rename both classes + their provider tokens; update injectors.

---

<a id="p1-8"></a>
## P1-8 · Five parallel money balance+ledger systems with hand-rolled append/reconcile/mature logic

**Family:** wallet-ledger

| System | Owner |
|---|---|
| `KloelWallet`/`KloelWalletTransaction`/`KloelWalletLedger` (seller earnings) | `kloel/WalletService` + `kloel/WalletLedgerService.appendWithinTx` |
| `PrepaidWallet`/`PrepaidWalletTransaction` (usage prepaid, self-ledger w/ `balanceAfterCents`) | `wallet/WalletService` |
| `ConnectAccountBalance`/`ConnectLedgerEntry` (Stripe Connect per-account) | `payments/ledger/LedgerService` |
| `MarketplaceTreasury`/`MarketplaceTreasuryLedger` (Kloel house) | `MarketplaceTreasuryService` |
| `WalletAnticipation` (Float receivable, schema:2855) | **NO dedicated service** |

**Severity P1 — why.** Five genuinely-different actors' money, but the append/reconcile/mature logic is hand-rolled ~3-4× with inconsistent contracts: some ledgers carry `balanceAfter` (`ConnectLedgerEntry`, `PrepaidWalletTransaction`), some don't (`KloelWalletLedger`, `MarketplaceTreasuryLedger`); `WalletAnticipation` is still `Float` while the others are BigInt cents. Three separate reconciliation services exist.

**Canonical:** keep the five separate (different actors) but extract **one** shared append-only ledger abstraction (direction/bucket/`amountInCents`/`balanceAfter`/reason + reconcile + maturation).

**Migration:** (1) Define a `SharedLedger` interface; back the 4 ledger writers with it. (2) Add `balanceAfter` to `KloelWalletLedger` + `MarketplaceTreasuryLedger`. (3) Migrate `WalletAnticipation` Float → BigInt cents. (4) Unify the 3 reconciliation services (`ConnectLedgerReconciliationService`, `MarketplaceTreasuryReconcileService`, `common/ledger-reconciliation.service.ts`).

---

<a id="p1-9"></a>
## P1-9 · Cart/abandonment recovery owned by two independent crons (no cross-dedup → same human recovered twice)

**Family:** checkout-payment

| Implementation | Cadence / target |
|---|---|
| `kloel/CartRecoveryService` | `@Cron` 30min over `CheckoutOrder` `status=PENDING`, MIND-chosen email, stamps `CheckoutOrder.recoveryEmailSentAt` |
| `checkout/CheckoutSocialRecoveryService` (`checkout-social-recovery.service.ts:46`) | `@Cron` 10min over `CheckoutSocialLead`, deterministic `workspaceChannels` gate, stamps `CheckoutSocialLead.recoveryEmailSentAt`/`recoveryWhatsAppSentAt` |

**Severity P1 — why.** Two crons on different cadences recover "a buyer who started but didn't pay," with no cross-dedup keyed on the person. A human who is both a `PENDING CheckoutOrder` and a `CheckoutSocialLead` is recovered twice, by two different channel-decision engines (MIND bandit vs deterministic gate).

**Canonical:** one Recovery domain owning "started but didn't pay" regardless of how far the buyer got.

**Migration:** Unify the crons behind one recovery scheduler keyed on the person (`Contact`); dedup; pick one channel-decision engine.

---

<a id="p1-10"></a>
## P1-10 · Unified message table `RAC_MindMessage` vs the 4 live source tables it claims to canonicalize — canonical-but-DEAD-on-read

**Family:** message

| Table | Status |
|---|---|
| `RAC_MindMessage` (schema:3849), source discriminator `brain\|dashboard\|lead_conversation\|thread\|channel` | **DECLARED canonical; WRITE-ONLY, ZERO readers** |
| `RAC_KloelMessage` (schema:1691) — brain | REAL read/write via `MindMessageService` |
| `RAC_ChatMessage` (schema:1899) — dashboard thread | REAL read/write via `MindChatMessageService`/`KloelThreadService` |
| `RAC_KloelConversation` (schema:1865) — lead funnel | REAL read/write via `saveLeadMessage` |
| `RAC_Message` (schema:721) — omnichannel | REAL read/write via `InboxService.saveMessage` |

**Severity P1 — why.** `RAC_MindMessage` is the declared target but every writer is gated behind `KLOEL_MINDMESSAGE_DUALWRITE` (default OFF) and there are **zero readers** — `StateBuilderService.resolveShortTermMemory` + `KloelConversationStore` read `.items = prisma.kloelMessage`. Until backfill + read cut-over land, the 4 legacy tables remain de-facto canonical per surface. **Enabling dual-write blindly = 2× write cost + silent divergence with no benefit.** The schema comment claiming `MindMessage` has "ZERO writers" is **stale** — fix it. Protected by [`check-canonical-mind-access.mjs`](../../scripts/ops/check-canonical-mind-access.mjs).

**Canonical:** `RAC_MindMessage` once a reader migration lands; today the 4 source tables stand.

**Migration:** (1) Wire **one** reader path (state-builder + conversation-store) onto `RAC_MindMessage` behind a read flag. (2) Backfill the 4 source tables. (3) Flip dual-write ON, verify parity, cut reads over. (4) Until then do **not** enable dual-write blindly. See §In-flight migrations.

---

<a id="p1-11"></a>
## P1-11 · Conversation-history read across 6 call sites with divergent take/order/projection

**Family:** message

| Call site | Window |
|---|---|
| `MindCanonicalService.getConversationHistory` (`mind-canonical.service.ts:45`) | `take=50, asc` **[canonical]** |
| `MindMessageService.getHistory` (`mind-message.service.ts:70`) | `take=50, asc` |
| `KloelConversationStore.getConversationHistory` (`kloel-conversation-store.ts:46`) | `take=20, asc` |
| `StateBuilderService.resolveShortTermMemory` (`state-builder.service.ts:206`) | `take=limit, desc then reverse` |
| `kloel-lead-processor-helpers` history read | `take=30`, `KloelConversation` |
| `kloel.service.ts:313` | `take=50` |

**Severity P1 — why.** "History" means a different window (20/30/50, asc vs desc) per caller, so the prompt context an agent sees depends on which path assembled it — non-deterministic memory.

**Canonical:** `MindCanonicalService.getConversationHistory` (the read the Mind unification was meant to absorb).

**Migration:** Route all 6 callers through it with an explicit window parameter; remove the bespoke take limits.

---

<a id="p1-12"></a>
## P1-12 · MindMemory vs KloelMemory — canonical table dual-written but legacy remains source of truth (split-brain)

**Family:** memory

| Table | Role |
|---|---|
| `RAC_KloelMemory` (schema:1711, `@deprecated`) via `MindMemoryItemService.items` | **PRIMARY read+write**, ~89+ direct `prisma.kloelMemory` callers |
| `RAC_MindMemory` (schema:3872) | dual-write behind `KLOEL_MINDMEMORY_DUALWRITE` (`mind-memory-item.service.ts:96`) + read by `kloel-memory-engine.service.ts:232/282/192` |

**Severity P1 — why.** Migration is **incomplete**: 2 writers + 2 readers exist but there's no backfill, and a key written to one table and read from the other diverges. The schema comment on `MindMemory` claiming "canonical-but-dead / ZERO writers" is **stale** — correct it. Protected by [`check-canonical-mind-access.mjs`](../../scripts/ops/check-canonical-mind-access.mjs).

**Canonical:** `RAC_MindMemory` (target) — but `RAC_KloelMemory` is still authoritative today.

**Migration:** (1) Backfill `RAC_KloelMemory` → `RAC_MindMemory`. (2) Repoint the ~89 `prisma.kloelMemory` callers through `MindMemoryItemService`. (3) Flip dual-write ON, verify, cut reads over. See §In-flight migrations.

---

<a id="p1-13"></a>
## P1-13 · `mass-send` — the ONE genuinely dead/questionable queue

> **Critic correction:** `campaign-jobs` / `voice-jobs` / `media-jobs` are **NOT** dead — they have live `new Worker(...)` consumers in the separate `worker/` deployable.

**Family:** channel-dispatch

| Queue | Worker | Status |
|---|---|---|
| `campaign-jobs` | `worker/campaign-processor.ts:147` `campaignWorker` | **LIVE** |
| `voice-jobs` | `worker/voice-processor.ts:253` `voiceWorker` | **LIVE** |
| `media-jobs` | `worker/media-processor.ts:16` `mediaWorker` | **LIVE** |
| `mass-send` | (`backend/src/mass-send/*`) | the **genuinely questionable** surface |

**Severity P1 — why.** The recon falsely flagged the campaign/voice/media queues as dead because their consumers live in a *separate deployable* (`worker/`, with its own `queue-names.const.ts` registry) rather than in `backend/`. The real outlier is `mass-send` — verify whether `backend/src/mass-send/mass-send.service.ts` has a live consumer or is an orphan send surface.

**Canonical:** keep the three worker-backed queues; investigate/retire `mass-send`.

**Migration:** Confirm `mass-send` has no live consumer, then delete the module (or wire it). Do **not** touch campaign/voice/media — they are load-bearing.

---

<a id="p1-14"></a>
## P1-14 · Two parallel workspace-invitation models + services

**Family:** identity-auth

| Implementation | Flow |
|---|---|
| `Invitation` (schema:1286) + `TeamService.inviteMember`/`acceptInvite`/`revokeInvite` (`team.service.ts:62-174`) | sends email, accept → creates `Agent` |
| `CollaboratorInvite` (schema:2768) + `PartnershipsService.inviteCollaborator`/`revokeInvite` (`partnerships.service.ts:103-137`) | status enum + `invitedBy`, **no email**, **no accept-creates-Agent** |

**Severity P1 — why.** Two co-equal invite models — the same workspace can present two different pending-invite lists for the same person.

**Canonical:** pick ONE. `Invitation` has the richer flow; `CollaboratorInvite` has the better schema (status enum, `invitedBy`, indexes).

**Migration:** Merge into one model+service (Invitation's accept/email flow + CollaboratorInvite's columns); migrate rows; delete the loser.

---

<a id="p1-15"></a>
## P1-15 · Entire admin auth stack duplicates the tenant auth stack with no shared core

**Family:** identity-auth

| Tenant (`src/auth`) | Admin (`src/admin/auth`) |
|---|---|
| `AuthService`/`AuthTokenService`/`AccountMfaService`/`RateLimitService` + `Agent`/`RefreshToken` | `AdminAuthService`/`AdminSessionFactory`/`AdminMfaService`/`AdminLoginAttemptsService` + `AdminUser`/`AdminSession` |

**Severity P1 — why.** Two full credential/MFA/session/throttle stacks with no shared core — security fixes don't propagate. [P0-8](#p0-8) is a *live* instance: the access-token-revocation fix exists in one stack and the other carries a broken copy.

**Canonical:** extract a shared credential/MFA/session core; keep `AdminUser` vs `Agent` as the only divergence (principal table + RBAC).

**Migration:** Hoist password hashing, TOTP, session rotation, login throttling, audit append into `common/`; both stacks consume them.

---

<a id="p1-16"></a>
## P1-16 · TOTP engine + MFA implemented identically in two services

**Family:** identity-auth

| Implementation | Functions |
|---|---|
| `AccountMfaService` (`auth/account-mfa.service.ts:20-96`) | `base32`/`generateTotp`/`verifyTotp` |
| `AdminMfaService` (`admin/auth/admin-mfa.service.ts:20-96`) | same functions, same constants `MFA_PERIOD_SECONDS=30`/`MFA_WINDOW_STEPS=2` |

**Severity P1 — why.** Byte-identical HOTP/codec math in two homes; secret encryption is already shared (`admin-crypto`), so only the math diverges-risk remains.

**Canonical:** hoist one `common/totp.ts`; both import.

**Migration:** Move `base32Encode/Decode`/`generateTotp`/`verifyTotp` to `common/totp.ts`; delete the copies.

---

<a id="p1-17"></a>
## P1-17 · Inconsistent token-at-rest policy (plaintext bearer tokens in DB)

**Family:** identity-auth

| Token | At rest |
|---|---|
| `RefreshToken.token` (schema:1155) | **PLAINTEXT** `@unique` |
| `PasswordResetToken.token` (schema:1184) | **PLAINTEXT** `@unique` |
| `AdminSession.token_hash` (schema:4109) | sha256 HASHED |
| `MagicLinkToken.tokenHash` (schema:1199) | sha256 HASHED |
| `ApiKey.key` (schema:1649) | PBKDF2 HASHED (but column documented as plaintext `sk_live_...`) |

**Severity P1 — why.** A DB read leak currently exposes **live tenant refresh + reset tokens in plaintext**, while admin sessions and magic links are hashed — inconsistent posture across the token families.

**Canonical:** store `sha256(token)` for all bearer tokens (matches AdminSession/MagicLink); query by hash. Keep PBKDF2 only for the API-key secret (with a lookup index — see [P1-18](#p1-18)).

**Migration:** Hash `RefreshToken` + `PasswordResetToken` at rest; query by hash; migrate existing rows on next rotation.

---

<a id="p1-18"></a>
## P1-18 · ApiKey validation is an O(n) full-table scan running PBKDF2 per candidate (DoS amplifier)

**Family:** identity-auth

| Implementation | Cost |
|---|---|
| `ApiKeysService.validateKey` (`api-keys.service.ts:122`) | `findMany(take:1000)` then linear `verifyStoredKey` (PBKDF2 210k iters) over **every** row |

**Severity P1 — why.** Each API-key validation scans up to 1000 rows and runs a 210k-iteration PBKDF2 on each — an attacker can amplify CPU per request (DoS).

**Canonical:** store a deterministic `sha256(rawKey)` lookup hash in an indexed column for the `WHERE`; keep PBKDF2 only for the constant-time secret compare.

**Migration:** Add indexed `lookupHash`; backfill on rotation; change `validateKey` to `WHERE lookupHash = sha256(rawKey)` then a single PBKDF2 verify.

---

<a id="p1-19"></a>
## P1-19 · Divergent surprise / prediction-error math (same concept, different units)

**Family:** mind-core

| Implementation | Formula |
|---|---|
| `MindSurpriseService.computeSurprise` (`mind/inference/mind-surprise.service.ts:135`) | Shannon `-log(p)` **[canonical]** |
| `MindPredictionService` (`mind/mind-prediction.service.ts:105`) | linear `surprise=confidence` |

**Severity P1 — why.** Two definitions of "surprise" with different units feed the same downstream thresholds (e.g. self-modification on `surprise>0.7`), so a threshold means different things depending on which loop fired — directly compounds [P0-7](#p0-7).

**Canonical:** `MindSurpriseService.computeSurprise` (information-theoretic, used by belief update + causal model).

**Migration:** Make `MindPredictionService` use `MindSurpriseService.computeSurprise`.

---

<a id="p1-20"></a>
## P1-20 · Two BullMQ tick schedulers fanning out the same active-workspace set (5s vs 30s)

**Family:** mind-core

| Implementation | Queue / cadence |
|---|---|
| `MindProcessorService` (`mind/runtime/mind-processor.service.ts:30`) | queues `mind-scheduler`/`mind-tick`, **30s** **[canonical persisted tick]** |
| `MindBackgroundScheduler` (`mind/mind-bg.scheduler.ts:17`) | queue `mind-bg-tick`, **5s** + `@Cron` fallback |
| `MindEventIngestor.tickAllWorkspaces` (`mind/coordination/mind-event-ingestor.service.ts:50`) | fan-out |

**Severity P1 — why.** Two schedulers both decide "who ticks a workspace" on different cadences → double work + Redis queue sprawl.

**Canonical:** `MindProcessorService` for the persisted cognitive tick; demote mind-bg to a clearly-scoped substrate sub-tick or fold in.

**Migration:** Make one scheduler own "who ticks a workspace"; nest the substrate cadence under it.

---

<a id="p1-21"></a>
## P1-21 · Event spine has TWO physical sinks; generic events land in the legacy non-idempotent table

**Family:** mind-core

| Implementation | Sink |
|---|---|
| `MindEventSpine.record` (`mind/coordination/mind-event-spine.service.ts:43`) | `RAC_AutopilotEvent` — legacy log, **no idempotency/outbox** |
| `MindEventSpine.recordCommercial`/`recordMany` (same file:73,142) | `RAC_MindOutboxEvent` — transactional, idempotent, dispatchable |

**Severity P1 — why.** Generic brain/cognition events land in the non-idempotent legacy table while only "commercial" ones get the transactional outbox — two reliability tiers for one spine.

**Canonical:** `RAC_MindOutboxEvent` as the single sink.

**Migration:** Migrate generic events onto the outbox. Note `MindPerceptionService` **reads** percepts back out of `RAC_AutopilotEvent`, so the perception read path must move too.

---

<a id="p1-22"></a>
## P1-22 · Three+ parallel product/plan CRUD write stacks; the checkout stack bypasses events/audit/cognition

**Family:** product-plan-offer

| Implementation | Side effects |
|---|---|
| `ProductService` + `PlanService` (`products/`, `plans/`) | `ProductService` alone emits `mind.product.observed` + `AuditService` + `MindEventSpine` |
| `CheckoutProductService` (`checkout/`) | `createProduct`/`updateProduct` **bypass** events+audit+brainSpine |
| `Product*Controller` family (`kloel/product-sub-resources/*`) | writes Prisma directly |
| `KloelProductSubResourceToolsService` | chat tools |

**Severity P1 — why.** Products created via the checkout stack (or sub-resource controllers / chat tools) are **invisible to cognition and audit** — the brain never observes them.

**Canonical:** consolidate Product writes on `ProductService` (events+audit+brainSpine); plan writes on `CheckoutProductService` (canonical money).

**Migration:** Route `CheckoutProductService.createProduct` through `ProductService` for the Product half; route sub-resource controllers + chat tools through the service layer.

---

<a id="p1-23"></a>
## P1-23 · Order bump / upsell stored both typed AND as JSON; JSON variant not read by checkout pricing

**Family:** product-plan-offer

| Implementation | Read by pricing? |
|---|---|
| `OrderBump` (schema:3132) + `Upsell` (schema:3154) via `CheckoutCatalogService` (`checkout-catalog.service.ts:30,117`) | **yes** — priced at checkout |
| `ProductPlan.checkoutImages.orderBump` JSON via `PlanService.setOrderBump` (`plan.service.ts:419`) | **no** — dead config |

**Severity P1 — why.** A merchant editing bumps via `PlanService.setOrderBump` writes a JSON slot that the actual checkout never reads — the edit silently has no effect.

**Canonical:** typed `OrderBump`/`Upsell` tables.

**Migration:** Stop writing the `checkoutImages` JSON slots; migrate any data into typed rows.

---

<a id="p1-24"></a>
## P1-24 · Affiliate config has 3-5 sources of truth with no synchronization

**Family:** product-plan-offer

| Source | Read by |
|---|---|
| `Product.affiliate*`/`commission*` columns | `AffiliateService.getConfig` (`affiliate.service.ts`) **[canonical]** |
| `AffiliateProduct.commissionPct`/`cookieDays`/`approvalMode` (schema:2538) | own |
| `ProductPlan` affiliate fields | `PlanService.setAffiliateConfig` (`plan.service.ts:383`) |
| `AffiliatePartner` + `ProductCommission` (per-product splits, schema:2332) | 4th/5th overlapping commission surface |

**Severity P1 — why.** Up to five overlapping commission surfaces with no sync — the commission a partner sees depends on which surface is read.

**Canonical:** `Product.affiliate*` columns (what `AffiliateService.getConfig` reads).

**Migration:** Make the other surfaces derive from / sync to `Product.affiliate*`; define one commission source of truth.

---

<a id="p1-25"></a>
## P1-25 · Member enrollment via divergent paths; auto-enroll on payment emits no event (invisible to cognition)

**Family:** product-plan-offer

| Implementation | Side effects |
|---|---|
| `MemberEnrollmentsController.enrollStudent` (`member-enrollments.controller.ts:77`) | `MemberAreaStatsService.recalculate` + emits `member.enrolled` |
| `CheckoutPostPaymentEffectsService.autoEnrollInMemberAreas` (`checkout-post-payment-effects.service.ts:228`) | inlines stats, **emits NOTHING**, re-keys buyer by email with no link to `CheckoutOrder` |
| `MemberAreaPublicController` enroll-by-email | separate surface |

**Severity P1 — why.** Auto-enroll on payment emits none of the `member.*` events, so cognition is blind to every *paid* enrollment, and it re-keys the buyer by email instead of linking to the `CheckoutOrder`.

**Canonical:** the `MemberEnrollmentsController` path (event + shared stats service).

**Migration:** Make `autoEnrollInMemberAreas` call `MemberAreaStatsService.recalculate` + emit `member.enrolled`; link enrollment to `CheckoutOrder.customerEmail`.

---

# P2 — drift-prone duplication, no live data corruption

<a id="p2-1"></a>
## P2-1 · Two webhook controllers named `MetaWebhookController` with duplicated HMAC-verify + Redis-NX + dedup

**Family:** channel-dispatch

| Implementation | Route / behaviour |
|---|---|
| `meta/webhooks/meta-webhook.controller.ts:123` (`webhooks/meta`) | verify + ROUTE to `OmnichannelService` (live ingest) |
| `meta/meta-webhook.controller.ts:46` (`webhooks/meta-marketing`, aliased `MetaCoreWebhookController`) | verify + LOG-ONLY |

**Why P2:** copy-on-the-security-path (HMAC + Redis-NX + `WebhookEvent` dedup) is exactly the drift class to eliminate, plus a same-name collision in `meta.module.ts` and divergent verify-token env precedence (`META_MARKETING_VERIFY_TOKEN||META_VERIFY_TOKEN||META_WEBHOOK_VERIFY_TOKEN` vs `META_VERIFY_TOKEN`).

**Canonical:** extract the shared verify+dedup into one guard/util; keep two thin handlers; rename one class.

---

<a id="p2-2"></a>
## P2-2 · `ChannelCapability` + `ChannelSendResult` DTOs declared twice (blocked required vs optional)

**Family:** channel-dispatch

| Implementation | `blocked` field |
|---|---|
| `common/channel-dispatch/channel-dispatch.port.ts:164/210` | OPTIONAL **[canonical]** |
| `kloel/channel-transport.types.ts:27/49` | REQUIRED |

**Canonical:** the port DTOs; re-export the transport variants as type aliases (as `ChannelName` already does). Remove `mapCanonicalResult`/`mapResult` glue at `channel-transport.registry.ts:283` and `whatsapp-dispatch.adapter.ts:80`.

---

<a id="p2-3"></a>
## P2-3 · Channel-name vocabularies: `ChannelKind` (lowercase) vs `OmniChannel` (Uppercase) vs identifier casing

**Family:** channel-dispatch

| Implementation | Casing |
|---|---|
| `ChannelKind`/`CanonicalChannelName` (`channel-dispatch.port.ts:14/37`) | lowercase **[canonical]** |
| `OmniChannel = Uppercase<...>` (`inbox/omnichannel.helpers.ts:34`) | UPPER |
| `normalizeChannelIdentifierChannel` (`contacts/channel-identifier.service`) | UPPER |

**Canonical:** `ChannelKind` lowercase as the one enum; `OmniChannel`/identifier casing become derived `Uppercase<ChannelKind>` views (precedent: `ChannelName` at `channel-transport.types.ts:22`).

---

<a id="p2-4"></a>
## P2-4 · Legacy `ProductCheckout` (JSON-blob) vs canonical `CheckoutProductPlan`/`CheckoutConfig` graph

**Family:** checkout-payment

| Implementation | Shape |
|---|---|
| `ProductCheckout` (schema:2273) | single row, 14-section JSON config blob; consumed by `kloel-product-sub-resource-tools.service.ts` + `product-checkout.controller.ts` |
| `CheckoutProductPlan` + `CheckoutConfig` + `CheckoutPlanLink` (schema:2969/3027/3005) | typed-column canonical graph |

**Canonical:** the typed graph. No order-time pricing reads `ProductCheckout.config`, so it's transitional, not load-bearing.

---

<a id="p2-5"></a>
## P2-5 · Overlapping cross-channel identity resolution — omnichannel bypasses the cross-channel match

**Family:** contact-identity

| Implementation | Role |
|---|---|
| `ContactIdentityResolverService.resolve` (`contacts/contact-identity-resolver.service.ts:29`) | **[canonical]** — cross-channel phone/email/socialHandle match |
| `ChannelIdentifierService.resolve`/`findContactByChannel` (`contacts/channel-identifier.service.ts:79/189`) | persistence primitive |
| `OmnichannelContactResolutionService.resolveFromMessage` (`omnichannel/contact-resolution.service.ts:19`) | calls `ChannelIdentifierService` **directly**, bypassing the cross-channel match |

**Why P2:** the bypass creates synthetic-phone duplicates instead of merging into verified contacts.

**Canonical:** `ContactIdentityResolverService` for full resolution; `OmnichannelContactResolutionService` should delegate to it.

---

<a id="p2-6"></a>
## P2-6 · `recordCase` capability bypassed by direct `prisma.mindCase.create` writers

**Family:** mind-core

| Implementation | |
|---|---|
| `MindCaseMemoryService.recordCase` (`mind/memory/mind-case-memory.service.ts:40`) | **[canonical]** |
| `MindMultiModalPerceptionService` (`mind/perception/mind-multimodal-perception.service.ts:103`) | direct `prisma.mindCase.create` |
| `MindCanonicalService` (`mind/mind-canonical.service.ts:105`) | direct `prisma.mindCase.create` |

**Canonical:** `MindCaseMemoryService.recordCase` (so token extraction/dedup invariants aren't skipped). `EpisodeService` + `MindConsciousnessService` already delegate correctly.

---

<a id="p2-7"></a>
## P2-7 · `MindGlobalPrior` vs `KloelGlobalPrior` — two global-prior tables+services

**Family:** global-prior

| Implementation | |
|---|---|
| `MindGlobalPriorService` over `RAC_MindGlobalPrior` (`mind/memory/mind-global-prior.service.ts:55`) | **[canonical]**, injected via `MindPolicyService.mixWithGlobalPrior` |
| `KloelGlobalPriorService` over `RAC_KloelGlobalPrior` (`kloel/kloel-global-prior.service.ts:32`) | `@deprecated`, registered in `kloel.module` but **ZERO constructor injectors = dead** |

**Canonical:** `MindGlobalPriorService`. Drop `KloelGlobalPriorService` + its registration (no consumers); the bridge methods are already wired; table drop is owner-gated.

---

<a id="p2-8"></a>
## P2-8 · `MindMessage` table is WRITE-ONLY (dual-written, never read)

**Family:** message · (the writer/reader detail behind [P1-10](#p1-10))

| Direction | Sites |
|---|---|
| WRITERS | `inbox.service.ts:60`, `chat.service.ts:86`, `kloel-thread.service.ts:79`, `kloel-lead-processor-helpers.ts:161` (all `prisma.mindMessage.create`, flag-gated) |
| READERS | **none** (no `prisma.mindMessage.find*` outside specs) |

**Canonical:** `RAC_MindMessage` once a reader migration lands; today reads go to `RAC_KloelMessage`/`RAC_ChatMessage` via the alias services. Either wire reads or stop the writes — and fix the stale "ZERO writers" schema comment.

---

<a id="p2-9"></a>
## P2-9 · Per-surface `MindMessage` dual-write helper duplicated 4×

**Family:** message

| Implementation | source |
|---|---|
| `InboxService.dualWriteChannelMindMessage` (`inbox.service.ts:47`) | `'channel'` |
| `KloelThreadService.dualWriteThreadMindMessage` (`kloel-thread.service.ts:67`) | `'thread'` |
| `chat.service.ts` `addMessage` dual-write (`chat.service.ts:86`) | `'dashboard'` |
| `dualWriteLeadConversationMindMessage` (`kloel-lead-processor-helpers.ts:147`) | `'lead_conversation'` |

**Canonical:** a single `MindMessageDualWriteService.mirror(source, {...})` reading the one flag, instead of four hand-rolled try/catch+flag-check copies.

---

<a id="p2-10"></a>
## P2-10 · Two distinctly-behaving services named `*LongTermMemory*` (naming collision) + a third consolidation surface

**Family:** memory

| Implementation | Store / trigger |
|---|---|
| `LongTermMemoryService` (`mind/memory/long-term-memory.service.ts:51`) | spine-event → `RAC_MindGraphNode` fact consolidation + `recallRelevant` |
| `MindLongTermMemoryService` (`mind/memory/mind-long-term-memory.service.ts:33`) | tick → `RAC_MindCase`→belief consolidation + prune |
| `ConsolidationService` (`mind/consolidation.service.ts:52`) | bg-substrate working-memory consolidation |

**Canonical:** keep all three (different stores/triggers) but **rename for intent** (e.g. `GraphFactMemoryService` vs `CaseConsolidationService`) to remove the trap where a dev wires the wrong one.

---

<a id="p2-11"></a>
## P2-11 · Stripe subscription → workspaceId resolver copied across 3 billing services

**Family:** checkout-payment

| Implementation |
|---|
| `billing/billing-webhook.service.ts:233` `resolveWorkspaceId` |
| `billing/billing-checkout-helper.service.ts:253` `resolveWorkspaceId` |
| `billing/billing-checkout-webhook.service.ts:288` `resolveWorkspaceId` |

**Canonical:** one shared resolver injected via the `billing-*.helper` port that already types it (`billing-subscription-status.helper.ts:15`). Collapse the 3 private copies.

---

<a id="p2-12"></a>
## P2-12 · Payout execution reimplemented 3× with separate approval models

**Family:** wallet-ledger

| Implementation | Source |
|---|---|
| `ConnectPayoutService` (`payments/connect/connect-payout.service.ts:78`) | `stripe.payouts.create` from Connect balance (two-step `ConnectPayoutApprovalService`) |
| `MarketplaceTreasuryPayoutService` (`marketplace-treasury-payout.service.ts:44`) | house treasury (direct) |
| `kloel/WalletService.withdraw` | `KloelWallet` (`WalletAnticipation` auto-complete) |

**Canonical:** per-actor payout is legitimately distinct, but the debit-balance + append-ledger + create-payout core should share the [P1-8](#p1-8) ledger abstraction; keep the distinct approval models.

---

<a id="p2-13"></a>
## P2-13 · Tag upsert + connect duplicated outside `CrmService`

**Family:** contact-identity

| Implementation | |
|---|---|
| `CrmService.addTag` (`crm.service.ts:86`) | **[canonical]** |
| `crm.deals.helpers.ts` `addTagInline` (line 258, auto-tags `'cliente'` on deal won) | re-implements tag upsert + contact connect with possibly-non-canonical phone keying |

**Canonical:** `CrmService.addTag` (or a shared tagging helper).

---

<a id="p2-14"></a>
## P2-14 · Contact provenance bridge columns unwired in the scraped-lead import path

**Family:** contact-identity

| Implementation | |
|---|---|
| `Contact.scrapingJobId`/`scrapedFrom` (schema:441-443) | typed provenance pointers |
| `ScrapersService.importLeads` contact.upsert (`scrapers.service.ts:141`) | sets `customFields.source` but **never** `scrapingJobId`/`scrapedFrom` |

**Canonical:** set the typed columns on the upsert; the `@@index([scrapingJobId])` + `ScrapingJobContacts` relation are currently dead for imported contacts.

---

<a id="p2-15"></a>
## P2-15 · PIX charge creation — canonical vs ORPHAN dead duplicate

**Family:** checkout-payment

| Implementation | Status |
|---|---|
| `MercadoPagoPixChargeService` (`payments/mercadopago/mercadopago-pix-charge.service.ts:27`) | **[canonical]**, 10+ consumers |
| `MercadoPagoPixService` (`checkout/mercado-pago-pix.service.ts:146`) | **ORPHAN** — not registered in `checkout.module.ts`, only its own specs import it |

**Canonical:** `MercadoPagoPixChargeService`. Pure dead-code deletion (~12KB) of `checkout/mercado-pago-pix.service.ts` + its 2 specs.

---

<a id="p2-16"></a>
## P2-16 · Per-product AI config split (typed table vs per-plan JSON)

**Family:** product-plan-offer

| Implementation | |
|---|---|
| `ProductAIConfig` table (schema:2394) + `services-v2/product-ai-config.service.ts` | **[canonical]**, typed |
| `ProductPlan.aiConfig` JSON (schema:2261) | per-plan blob, no reader-consistency guarantee |

**Canonical:** the `ProductAIConfig` table. Migrate the JSON in.

---

<a id="p2-17"></a>
## P2-17 · Pixels stored in three places; only one is fired

**Family:** product-plan-offer

| Implementation | Fired? |
|---|---|
| `CheckoutPixel` table (`CheckoutCatalogService.createPixel`) | **yes** — fired by `checkout/facebook-capi.service.ts` |
| `Product.metadata.pixels` (`ProductService.setPixels` — `product.service.ts:427`) | no |
| `ProductCampaign.pixelId` scalar (schema:2378) | no |

**Canonical:** `CheckoutPixel` table; the others are not consulted by the firing path — consolidate or document as attribution-only.

---

# P3 — cosmetic / naming entropy

<a id="p3-1"></a>
## P3-1 · Four+ outbound send entrypoints/facades over the same core (guarded vs un-guarded posture)

**Family:** channel-dispatch

| Implementation | Posture |
|---|---|
| `ChannelMessageDispatchService.dispatch` (`marketing/channel-message-dispatch.service.ts:72`) | **[canonical facade]** |
| `services-v2/channel.service.ts` `ChannelService.send` | thin |
| `services-v2/messaging.service.ts` `MessagingService.sendWhatsApp/...` | thin |
| `kloel-tool-dispatcher.channel.handlers.ts` `dispatchChannelTool` | via **GUARDED** `ChannelTransportRegistry` |
| `billing-checkout-helper.service.ts:118` | resolves the dispatcher via `ModuleRef` ad hoc |

**Why P3 (not data-corrupting):** the facades are acceptable thin adapters; the real concern is `dispatchChannelTool` taking the guarded path while `services-v2` takes the pure path — two policy postures for the same agent. Unify so MindGuards apply regardless of tool surface.

---

<a id="p3-2"></a>
## P3-2 · Two byte-identical contact-by-phone DTOs

**Family:** contact-identity · `CreateContactDto` (`crm/dto/create-contact.dto.ts`) and `UpsertContactDto` (`crm/dto/upsert-contact.dto.ts`). Keep `UpsertContactDto`; make `Create` extend it.

---

<a id="p3-3"></a>
## P3-3 · Two bcrypt work-factor constants with the same value

**Family:** identity-auth · `common/constants.ts:10` `BCRYPT_ROUNDS = 12` (tenant) and `admin/auth/admin-auth.service.helpers.ts:22` `BCRYPT_WORK_FACTOR = 12` (admin). Two sources invite drift on a security bump; collapse to one exported constant.

---

<a id="p3-4"></a>
## P3-4 · sha256-hex opaque-token hasher + `marketplace` namespace overload

**Family:** cross-cutting-naming · `auth/auth-service.helpers.ts:24` `hashOpaqueToken` vs `admin/common/admin-crypto.ts` `sha256Hex` (identical primitive, two homes). Separately, `marketplace/MarketplaceService` (FlowTemplate catalog, NOT money) vs `marketplace-treasury/*` (house money) vs `split/MarketplaceFee` — "marketplace" means three things. One shared `common/` sha256-hex helper; rename the template store to `TemplateMarketplaceService`.

---

<a id="p3-5"></a>
## P3-5 · `BrainRuntimeService` alias re-export + self-model vs consciousness overlap + two runtime orchestrators

**Family:** mind-core

| Implementation | |
|---|---|
| `MindRuntime` (`mind/coordination/mind-runtime.service.ts:52`) + `export { MindRuntime as BrainRuntimeService }` (line 438) + legacy shim `kloel/brain-runtime.service.ts` | ADR-0013 Wave M1 alias window |
| `MindSelfModelService.snapshot` (→ `RAC_MindSelfModel`) vs `MindConsciousnessService.getSelfNarrative`/`selfAssess` (`consciousness/mind-consciousness.service.ts:47`) | self-model vs narrative |
| `MindRuntime` (sync decide/observe) vs `CiaRuntimeService` (`cia/cia-runtime.service.ts:13`, async autonomy lifecycle) | distinct |

**Canonical:** `MindRuntime` + `MindSelfModelService`; `MindConsciousnessService` as a read/narrative view; `CiaRuntime` distinct (document the split). Remove the `BrainRuntimeService` alias once DI tokens migrate.

---

# In-flight migrations (mid-migration, NOT converged)

These are *intentional* transitional states — not bugs to "fix" by deleting one side, but migrations to **finish**. Surfaced explicitly so nobody mistakes a half-done dual-write for a settled alias.

| Migration | From → To | Flag | State |
|---|---|---|---|
| KV/semantic memory | `RAC_KloelMemory` (schema:1711, ~89+ callers, source of truth) → `RAC_MindMemory` (schema:3872) | `KLOEL_MINDMEMORY_DUALWRITE` (default OFF; `mind-memory-item.service.ts:96`) | **mid** — 2 writers + 2 readers, NO backfill, split-brain risk; schema "ZERO writers" comment STALE. ([P1-12](#p1-12)) |
| Unified message store | `RAC_KloelMessage`+`RAC_ChatMessage`+`RAC_KloelConversation`+`RAC_Message` → `RAC_MindMessage` (schema:3849) | `KLOEL_MINDMESSAGE_DUALWRITE` (default OFF) | **canonical-but-dead-on-read** — 4 flag-gated writers, ZERO readers; enabling dual-write today = 2× write + silent divergence. ([P1-10](#p1-10)) |
| Plan price unit | `RAC_ProductPlan.price` Float → `RAC_CheckoutProductPlan.priceInCents` Int | (no flag — additive column) | **half-done** — `priceInCents` populated only by `PlanService.create`; controller + chat tools don't dual-write; merchant edits can have no commercial effect. ([P0-5](#p0-5)) |
| Channel transport | `kloel/channel-transport.providers` `provider.send` → `marketing/channels/*-dispatch.adapter` via `ChannelDispatchRegistry` | `KLOEL_TRANSPORT_CANONICAL_DELEGATE` (default OFF; **excludes email+tiktok**) | **mid** — default OFF runs duplicate legacy bodies; email excluded due to a delivery-mechanism behaviour change. ([P1-3](#p1-3)) |
| Instagram DM send | raw `InstagramService.sendMessage` → `ChannelMessageDispatchService` via `InstagramDispatchAdapter` | `instagram-canonical-dispatch.flag` | **mid** — flag-gated delegation landed (commit `a38949d94`); raw fallback dead once flag permanently ON. |
| Lead funnel | `RAC_KloelLead` funnel columns → `RAC_Contact` mirror (schema:426-430) + `Contact.kloelLeadId` bridge (schema:444) | best-effort dual-write in the 3 lead services + `person-kloel-lead-to-contact.backfill.*` (no dedicated flag file) | **mid** — additive columns + backfill landed, cut-over incomplete; `LeadsService` still reads `KloelLead` while CRM reads `Contact`. Open P1 MERGE DECISION. ([P1-1](#p1-1)) |
| Global priors | `RAC_KloelGlobalPrior` (`@deprecated`) + `KloelGlobalPriorService` → `RAC_MindGlobalPrior` + `MindGlobalPriorService` | (no flag — service wired, legacy zero injectors) | **near-complete** — `KloelGlobalPriorService` dead; safe to drop service+provider; table drop owner-gated. ([P2-7](#p2-7)) |
| Coupons | `RAC_ProductCoupon` (Float, `PERCENT/FIXED`) → `RAC_CheckoutCoupon` (Int cents, `PERCENTAGE/FIXED`) | (no flag — one-way `product-coupon-sync.util`) | **mid** — one-directional sync fires only on product-coupon controller writes; divergent validate; silent Float→cents rounding. ([P0-6](#p0-6)) |
| Brain→Mind DI rename | `BrainRuntimeService` alias + `kloel/brain-runtime.service.ts` shim → `MindRuntime` | (no flag — ADR-0013 Wave M1 4-week alias window) | **scheduled-for-removal** compatibility layer. ([P3-5](#p3-5)) |

---

# Models the v1 docs missed (now live and owned)

| Model | schema | Owner | Note |
|---|---|---|---|
| `OpsEvent` | 1614 | `OpsAlertService` (`observability/ops-alert.service.ts`) | Operational error/degradation/recovery sink for dashboard alerting — **distinct** from the cognitive event spine (`AutopilotEvent`/`MindOutboxEvent`). |
| `RiscEvent` | 1273 | `ComplianceService.routeRiscEvent` (`compliance/compliance.service.ts:140`) | Google RISC cross-account protection. `routeRiscEvent` (classify + route + mark processed) **IS** the processor — *not* an ingest-only stub (v1 was wrong). |

---

# Non-existent surfaces (do NOT reintroduce)

| Phantom name | Reality |
|---|---|
| `ChannelSession` (model or service) | **FICTIONAL** — zero grep matches in `backend/src/**` and `schema.prisma`. Channel-session state lives in `ChannelSetup` (schema:3492, wizard progress) + `MetaConnection` (schema:3467, credentials), resolved by `WhatsappSessionService` (`marketing/channels/whatsapp/whatsapp-session.service.ts:19`) and `MetaWhatsAppService.resolveConnection`. `SessionStatus` is a provider-registry type, not a model. |
| `campaign-jobs`/`voice-jobs`/`media-jobs` as "dead queues" | **LIVE** — workers in the separate `worker/` deployable (`campaign-processor.ts:147`, `voice-processor.ts:253`, `media-processor.ts:16`). |
