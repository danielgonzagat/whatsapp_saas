# Kloel Service Catalog

**What this answers:** Which `@Injectable` service owns each capability, what each canonical service is *responsible for*, what it *must not do*, and what it depends on — then the services that **duplicate** a responsibility and must converge. Use it before adding a service ("does an owner already exist?") and before wiring one ("am I importing the right `WalletService`?"). Every name below is a real model/service/file verified by grep/AST against `backend/prisma/schema.prisma` + `backend/src/**` + `worker/**`. No invented names.

**Last generated:** 2026-06-07 — grounded in `docs/architecture/inventory/_CONSOLIDATED.json` (7 inventory clusters, all read in full) and cross-checked against source.

---

## Table of contents

- [How to read this catalog](#how-to-read-this-catalog)
- [Canonical services](#canonical-services) — the single owner per capability
  - [Channels, sessions & dispatch](#channels-sessions--dispatch)
  - [Conversation & message](#conversation--message)
  - [Contact, CRM & identity](#contact-crm--identity)
  - [Checkout, payment, wallet & ledger](#checkout-payment-wallet--ledger)
  - [Product, plan & offer](#product-plan--offer)
  - [Kloel Mind cognitive core](#kloel-mind-cognitive-core)
  - [Identity, auth & tenant](#identity-auth--tenant)
  - [Observability, ops & compliance](#observability-ops--compliance)
- [Services that duplicate a responsibility (must converge)](#services-that-duplicate-a-responsibility-must-converge)
  - [DI HAZARD: two `WalletService` classes on different tables](#di-hazard-two-walletservice-classes-on-different-tables)
- [In-flight migrations (mid-migration, NOT converged)](#in-flight-migrations-mid-migration-not-converged)
- [Corrections baked in from the v1 docs](#corrections-baked-in-from-the-v1-docs)

---

## How to read this catalog

Each service entry carries four fields:

| Field | Meaning |
|---|---|
| **Responsibility** | The one job this service owns. If you need this job done, call this service. |
| **Must NOT do** | The boundary. Doing this here is an architecture violation even if it compiles. |
| **Backing model(s)** | The real Prisma model(s) it reads/writes, with `schema.prisma` line. |
| **Depends on** | Upstream services/registries it composes (DI). |

A service flagged **DUPLICATE** has a sibling doing the same job on a different store or with divergent semantics — those are collected in [the convergence section](#services-that-duplicate-a-responsibility-must-converge) with a canonical choice and migration sketch.

Severity tags follow the digest: **P0** (correctness/revenue/security live bug), **P1** (split source-of-truth / merge decision), **P2** (drift/dead-duplicate), **P3** (cosmetic/naming).

---

## Canonical services

These are the **single owner** for their capability. New code should route through them.

### Channels, sessions & dispatch

#### `WhatsappSessionService`
`backend/src/marketing/channels/whatsapp/whatsapp-session.service.ts:19`

- **Responsibility:** The **real** channel-session surface — session lifecycle + `getConnectionStatus` over `ChannelSetup` + `MetaConnection`, driven through `WhatsAppProviderRegistry`.
- **Must NOT do:** Be referred to as **`ChannelSession`** — that name is **FICTIONAL** (zero grep matches in `backend/src` and `schema.prisma`). There is no `ChannelSession` model and no `ChannelSession` service. Channel-session state is `ChannelSetup` (wizard progress) + `MetaConnection` (credentials).
- **Backing models:** `ChannelSetup` (`RAC_ChannelSetup`, schema:3492), `MetaConnection` (`RAC_MetaConnection`, schema:3467).
- **Depends on:** `WhatsAppProviderRegistry`, `MetaWhatsAppService.resolveConnection`.

#### `ChannelDispatchRegistry`
`backend/src/common/channel-dispatch/channel-dispatch.registry.ts:31`

- **Responsibility:** Canonical **pure** outbound router — keyed by `ChannelKind`, dispatches to `ChannelDispatchPort` adapters via `send`/`sendMessage`. The transport/routing core.
- **Must NOT do:** Run policy guards. Guarding is the transport registry's decorator role, not the core router's.
- **Backing contract:** `ChannelDispatchPort`, `ChannelSendResult`/`ChannelCapability` (canonical DTOs at `common/channel-dispatch/channel-dispatch.port.ts:164/210`).
- **Depends on:** the per-channel `*-dispatch.adapter` set (`InstagramDispatchAdapter`, `MessengerDispatchAdapter`, `TikTokDispatchAdapter`, `EmailDispatchAdapter` + `TransactionalEmailDispatchAdapter`, `WhatsAppDispatchAdapter`).

#### `MetaWhatsAppService`
`backend/src/meta/meta-whatsapp.service.ts:30`

- **Responsibility:** Canonical Meta Cloud WhatsApp client **and** the single credential resolver `resolveConnection` → `ResolvedMetaConnection`.
- **Must NOT do:** (no boundary violation flagged) — but it should become the *only* Meta-connection resolver; `MetaConnectionStateService` should consume it and `resolveInstagramConnection` should be deleted (see [duplicates](#metaconnectionstateservice--resolveinstagramconnection--19-raw-finders-p1)).
- **Backing models:** `MetaConnection` (`RAC_MetaConnection`, schema:3467).

`ChannelMessageDispatchService.dispatch` (`backend/src/marketing/channel-message-dispatch.service.ts:72`) is the canonical **facade** in front of `ChannelDispatchRegistry`; the `services-v2/channel.service.ts` and `services-v2/messaging.service.ts` facades are acceptable thin adapters over it.

### Conversation & message

#### `InboxService`
`backend/src/inbox/inbox.service.ts:21`

- **Responsibility:** Canonical omnichannel message + conversation persistence — writes `RAC_Message` + `RAC_Conversation` in one `$transaction` (`saveMessage` at `:207`); realtime `ws message:new` emits + post-commit webhook dispatch (`:249`).
- **Must NOT do:** Enable `MindMessage` dual-write without a reader path (today that is **2× write cost + silent divergence with no benefit** — see [in-flight migrations](#in-flight-migrations-mid-migration-not-converged)). Must NOT own channel credential resolution or outbound transport adapters (Channels domain).
- **Backing models:** `Message` (`RAC_Message`, schema:721), `Conversation` (`RAC_Conversation`, schema:682). Dual-writes `MindMessage` (`RAC_MindMessage`, schema:3849) behind `KLOEL_MINDMESSAGE_DUALWRITE` (default OFF).

#### `MindCanonicalService`
`backend/src/kloel/mind/mind-canonical.service.ts:31`

- **Responsibility:** Brain→Mind Phase-1 facade for conversation **history** (`getConversationHistory`, take=50 asc), memory, case, policy and graph reads. The intended single read for brain conversation history.
- **Must NOT do:** `prisma.mindCase.create` directly — must route through `MindCaseMemoryService.recordCase` (it currently bypasses this at `:105`, a P2 to fix).
- **Backing models (reads):** `KloelMessage` (`RAC_KloelMessage`, schema:1691) for brain history.

### Contact, CRM & identity

#### `CrmService`
`backend/src/crm/crm.service.ts:18`

- **Responsibility:** Canonical `Contact` CRUD, tag upsert/connect (`addTag` at `:86`), pipeline/deal surface. **`upsertContact` is the only Contact write that uses the structured, BR-promoting `normalizePhone()`** (`:39`/`:47`).
- **Must NOT do:** (no boundary violation flagged) — but it owns the canonical phone-keying; every other `Contact`/`KloelLead` write that keys by raw/`digitsOrNull` phone is a P0 identity-fragmentation bug routing around it.
- **Backing models:** `Contact` (`RAC_Contact`, schema:399, unique `workspaceId_phone`), `Tag`, `Pipeline`, `Stage`, `Deal`.
- **Depends on:** `normalizePhone()` (`backend/src/common/phone/phone-normalization.util.ts:150`).

#### `ContactIdentityMergeService`
`backend/src/contacts/contact-identity-merge.service.ts:19`

- **Responsibility:** Merge two `Contact` rows — writes `ContactIdentityLink`, re-points relations (`mergeContacts` at `:24`).
- **Must NOT do:** **Stay orphaned while duplication paths run.** This service has **zero production callers** despite live phone-normalization divergence creating duplicate contacts every day. Activating it is step 3 of the Contact↔KloelLead merge.
- **Backing models:** `Contact` (schema:399), `ContactIdentityLink`.

`ContactIdentityResolverService.resolve` (`backend/src/contacts/contact-identity-resolver.service.ts:29`) is the canonical **cross-channel** resolver (phone/email/socialHandle match); `ChannelIdentifierService` is its persistence primitive. The omnichannel path bypasses the resolver — see [duplicates](#omnichannelcontactresolutionservice-bypasses-the-cross-channel-resolver-p2).

### Checkout, payment, wallet & ledger

#### `CheckoutPaymentService`
`backend/src/checkout/checkout-payment.service.ts:52`

- **Responsibility:** Canonical checkout payment **capture** → `CheckoutPayment` + `CheckoutOrder` across Stripe / MP-PIX / MP-boleto arms (`capture` at `:52`).
- **Must NOT do:** Be bypassed by a parallel `KloelSale` capture that does **not** materialize a `CheckoutOrder`. `CheckoutOrder.totalInCents` is the GMV source of truth — a sale that never becomes a `CheckoutOrder` is invisible to platform GMV.
- **Backing models:** `CheckoutOrder` (`RAC_CheckoutOrder`, schema:3220), `CheckoutPayment` (`RAC_CheckoutPayment`, schema:3330).

#### `MercadoPagoPixChargeService`
`backend/src/payments/mercadopago/mercadopago-pix-charge.service.ts:27`

- **Responsibility:** Canonical MercadoPago PIX charge adapter (**10+ consumers**).
- **Must NOT do:** (none) — note the orphan twin `MercadoPagoPixService` (`backend/src/checkout/mercado-pago-pix.service.ts:146`) must be **deleted**, not wired (see [duplicates](#mercadopagopixservice-orphan-pix-charge-p2)).

#### `LedgerService`
`backend/src/payments/ledger/ledger.service.ts:59`

- **Responsibility:** Append-only **Stripe Connect** ledger over `ConnectAccountBalance` + `ConnectLedgerEntry` (carries `balanceAfter`); emits `commerce.payment.*` spine events.
- **Must NOT do:** (none flagged) — but it is one of 3–4 hand-rolled ledgers; the append/reconcile/mature core should be extracted into one shared abstraction (P1).
- **Backing models:** `ConnectAccountBalance`, `ConnectLedgerEntry`.

> **The two `WalletService` classes are listed in the convergence section, not here**, because the shared unqualified name is itself the hazard. See [DI HAZARD](#di-hazard-two-walletservice-classes-on-different-tables).

### Product, plan & offer

#### `ProductService`
`backend/src/products/product.service.ts:39`

- **Responsibility:** Canonical `Product` CRUD that **alone** emits `mind.product.observed` + `AuditService.log` + `MindEventSpine`.
- **Must NOT do:** (none flagged) — but it is the *only* product write wired into cognition/audit; products created via `CheckoutProductService.createProduct` are currently invisible to cognition (a P1 to fix by routing the Product half through here).
- **Backing models:** `Product` (`RAC_Product`, schema:1734).
- **Depends on:** `AuditService`, `MindEventSpine`.

#### `CheckoutProductService`
`backend/src/checkout/checkout-product.service.ts:23`

- **Responsibility:** Canonical **plan/offer** write stack — `CheckoutProductPlan.priceInCents` (`createPlan` at `:162`) + `CheckoutConfig`. **`CheckoutProductPlan.priceInCents` is the ONLY plan model read by order pricing** (`checkout-order-pricing.util.ts`).
- **Must NOT do:** Bypass `mind.product.observed` / audit / brainSpine on its `createProduct` (it currently does — route the Product half through `ProductService`).
- **Backing models:** `CheckoutProductPlan` (`RAC_CheckoutProductPlan`, schema:2969, `priceInCents Int`), `CheckoutConfig` (schema:3027).

`validateCouponHelper` / `CheckoutCatalogService.validateCoupon` (`checkout/checkout-catalog.helpers.ts:79`) is the **canonical coupon validation** over `CheckoutCoupon` (`RAC_CheckoutCoupon`, schema:3178) — the only coupon priced at order time (enforces `minOrderValue`/`appliesTo`/`discountAmount`).

### Kloel Mind cognitive core

#### `MindService`
`backend/src/kloel/mind.service.ts:31`

- **Responsibility:** Canonical **WIRED** cognitive loop — `tick` → `MindEventProcessorService.process` (`mind/runtime/mind-event-processor.service.ts:27`). DB-persisted (`RAC_MindBelief`/`MindPrediction`/`MindPolicy`) and lease-coordinated.
- **Must NOT do:** (none flagged) — it is the single source-of-truth loop; the in-memory `MindPredictionService` shadow loop must converge onto it (P0).
- **Backing models:** `MindBelief`, `MindPrediction`, `MindPolicy`, `MindWorkspaceState`.

#### `MindGlobalPriorService`
`backend/src/kloel/mind/memory/mind-global-prior.service.ts:55`

- **Responsibility:** Canonical cross-workspace anonymized global priors over `RAC_MindGlobalPrior` by `(domain, predicate, context)`; injected via `MindPolicyService.mixWithGlobalPrior`.
- **Must NOT do:** (none) — its deprecated twin `KloelGlobalPriorService` must be **dropped**, not injected (zero injectors today).
- **Backing models:** `MindGlobalPrior` (`RAC_MindGlobalPrior`, schema:3800).

Surprise math canonical: **`MindSurpriseService.computeSurprise`** (`mind/inference/mind-surprise.service.ts:135`, Shannon `-log(p)`) — the information-theoretic version used by belief update + causal model. The linear `surprise=confidence` path in `MindPredictionService` must converge onto it (P1).

Tick scheduling canonical: **`MindProcessorService`** (`mind/runtime/mind-processor.service.ts:30`, queue `mind-tick`, 30s, persisted). Event-spine sink canonical: **`RAC_MindOutboxEvent`** (transactional, idempotent, dispatchable) via `MindEventSpine.recordCommercial`/`recordMany`.

### Identity, auth & tenant

#### `AuthTokenService`
`backend/src/auth/auth.token.service.ts:29`

- **Responsibility:** Canonical tenant JWT + refresh issuance/rotation **and** the access-token JTI blacklist — `revokeAccessToken`/`isAccessTokenRevoked` write+read the key namespace `jti:revoked:<jti>` (`:458`/`:472`), which is **the namespace `JwtAuthGuard` actually checks** (`jwt-auth.guard.ts:92`).
- **Must NOT do:** (none) — but note the **live P0 bug**: `AuthService.logout()` (`auth.service.ts:329`) writes a *different* key `access-token-revoked:<jti>` that nothing reads, so a logged-out access token stays valid until natural expiry. Logout must call `AuthTokenService.revokeAccessToken`.
- **Backing models:** `RefreshToken` (`RAC_RefreshToken`, schema:1155), JWT claims.

The **canonical request→workspaceId resolver** is `resolveWorkspaceId` (`backend/src/auth/workspace-access.ts:119`) — the only variant that proves the caller owns the workspace (enforces `requested === token.workspaceId`, `Forbidden` on mismatch). The `kloel-security.guard.ts:45` / `common.helpers.ts:20` / `route-class.guard.ts:25` variants are an IDOR hazard and must converge (P0).

TOTP canonical: **`AccountMfaService`** (`auth/account-mfa.service.ts:99`). The admin twin `AdminMfaService` is a byte-identical engine to hoist into `common/totp.ts`.

### Observability, ops & compliance

#### `OpsAlertService`
`backend/src/observability/ops-alert.service.ts:42`

- **Responsibility:** Persists `OpsEvent` (schema:1614) rows for **dashboard alerting** on `critical_error` / `degradation` / `recovery`. **(LIVE model absent from v1 docs — now included.)**
- **Must NOT do:** Emit into the **cognitive** event spine. Operational alerting is distinct from cognition; Mind owns `AutopilotEvent`/`MindOutboxEvent`, this owns `OpsEvent`.
- **Backing models:** `OpsEvent` (`RAC_OpsEvent`, schema:1614).

#### `ComplianceService`
`backend/src/compliance/compliance.service.ts:25` (route at `:140`/`:165`)

- **Responsibility:** Ingests **and ROUTES** RISC (Google cross-account-protection) events — writes `RiscEvent` (schema:1273), `classifyRiscEvent` + `routeRiscEvent` + marks processed. **(LIVE model absent from v1 docs — now included.)**
- **Must NOT do:** Be treated as **ingest-only**. **CORRECTION:** v1 wrongly called `RiscEvent` "an ingest-only stub with no processor." `routeRiscEvent` (`:165`) **IS** the processor — it classifies, routes, and writes/updates `RiscEvent` rows.
- **Backing models:** `RiscEvent` (`RAC_RiscEvent`, schema:1273).

---

## Services that duplicate a responsibility (must converge)

Each row below names two-or-more services doing the same job. **Canonical choice** = the one to keep; **converge** = what to do with the rest. Ordered by severity.

### DI HAZARD: two `WalletService` classes on different tables

> **This is the headline DI trap.** Two classes named **`WalletService`** exist on **different tables in different domains**. Verified:
> - `backend/src/kloel/wallet.service.ts:49` — `export class WalletService`
> - `backend/src/wallet/wallet.service.ts:73` — `export class WalletService`

| | `WalletService` (kloel) | `WalletService` (prepaid) |
|---|---|---|
| **File** | `backend/src/kloel/wallet.service.ts:49` | `backend/src/wallet/wallet.service.ts:73` |
| **Domain** | Seller **earnings** | Prepaid **usage credits** |
| **Tables** | `KloelWallet` + `KloelWalletLedger` | `PrepaidWallet` + `PrepaidWalletTransaction` |
| **Key methods** | `confirmPayment` (pending→available), `withdraw` | `createTopupIntent`, `debit` |
| **Money provider** | `MercadoPagoPixChargeService` / `StripeService` | `MercadoPagoPixChargeService` / `StripeService` |

- **Severity:** **P1.** Both are legitimately different domains, but the **identical class name + both calling the same charge services** means a wrong DI import (`import { WalletService } from '../kloel/wallet.service'` vs `'../wallet/wallet.service'`) is **silent today** — it compiles and runs against the wrong table.
- **Canonical choice:** **Rename** to `SellerWalletService` (kloel) and `PrepaidWalletService` / `UsageWalletService` (prepaid).
- **Converge:** Rename both classes **and their provider tokens**; update every injector. Do this before touching either — the rename is the safety fix.

### `SalesService` / `kloel/PaymentService` / `SmartPaymentService` duplicate payment capture (P0)

- **Canonical:** `CheckoutPaymentService.capture` → `CheckoutOrder` + `CheckoutPayment`.
- **Duplicates:** `SalesService` (`sales/sales.service.ts:64`) → `KloelSale`; `kloel/PaymentService` + `kloel/SmartPaymentService` → `KloelSale`; the unowned raw webhook sink `Payment` (`RAC_Payment`, schema:2744, **no `@Injectable` owner**); `PhysicalOrder` (schema:2706, `saleId String?` with **no FK**).
- **Why it bites:** One human payment can be **PAID in one ledger and PENDING in another** — a single Stripe webhook fans out to 3 tables via 3 parallel `updateMany()` calls. `KloelSale` revenue is **double-orphaned** (absent from both `admin/gmv.query.ts` and `dashboard.service` GMV).
- **Converge:** Make every `KloelSale` create/confirm **also upsert a `CheckoutOrder`+`CheckoutPayment`** keyed on a shared `externalId`; repoint webhook handlers (`payment-webhook-stripe.handlers.ts:44-54`, `payment-webhook-generic.helpers.ts:79/111`) to one resolver updating ONE canonical row; fold `KloelSale` into GMV; drop the orphan `Payment` model.

### `PlanService` duplicates the canonical money-plan write (P0)

- **Canonical:** `CheckoutProductService.createPlan` → `CheckoutProductPlan.priceInCents` (the only plan read by order pricing).
- **Duplicate:** `PlanService.create` (`plans/plan.service.ts:35`) → `ProductPlan.price` (Float). Also stuffs offer config into `ProductPlan.checkoutImages` JSON and dual-writes `priceInCents`.
- **Why it bites:** A merchant can edit a `ProductPlan.price` that has **NO commercial effect** — pricing reads `CheckoutProductPlan` only. (Also `ProductPlanController.createPlan` and `KloelProductSubResourceToolsService` write `ProductPlan` without dual-writing `priceInCents`.)
- **Converge:** Route `ProductPlanController` + chat-tool writes through `CheckoutProductService`; backfill `ProductPlan.priceInCents` from `price*100`; demote `ProductPlan` to a read-through view or retire it.

### `MindPredictionService` shadows the persisted cognitive loop (P0)

- **Canonical:** `MindService.tick` + `MindEventProcessorService.process` — DB-persisted, lease-coordinated, prediction-table-backed.
- **Duplicate:** `MindPredictionService.runCycle` (`mind/mind-prediction.service.ts:51`) — keeps `activePredictions[]` **in memory**, writes only `RAC_AutopilotEvent`, **persists NOTHING to `RAC_MindPrediction`**, and uses a linear `surprise=confidence` instead of `MindSurpriseService.computeSurprise`.
- **Why it bites:** Learning is split across two unreconciled stores; the in-memory loop loses all state on restart and claims to "close the cognitive loop" while doing so.
- **Converge:** Make `MindPredictionService` persist to `RAC_MindPrediction` (or delete the shadow loop); unify surprise math on `MindSurpriseService.computeSurprise`.

### `ChannelTransportRegistry` duplicates the dispatch core (P1)

- **Canonical:** `ChannelDispatchRegistry` (pure transport/routing).
- **Duplicate:** `ChannelTransportRegistry` (`kloel/channel-transport.registry.ts:52`) — keyed by `ChannelName`, `ChannelTransportProvider`, adds MindGuard + audit, flag-gated delegation (`KLOEL_TRANSPORT_CANONICAL_DELEGATE`, default **OFF**, excludes email + tiktok). With the flag OFF, it runs **duplicate legacy `provider.send` bodies**.
- **Converge:** Keep `ChannelTransportRegistry` **only as a guard+audit decorator that always delegates**; flip `KLOEL_TRANSPORT_CANONICAL_DELEGATE` default ON so the legacy provider bodies in `channel-transport.providers.ts` become dead; resolve the email exclusion first (`EmailChannelTransport` uses `EmailCampaignService`, a different mechanism — a latent behavior change). The per-channel twins (`InstagramChannelTransport` vs `InstagramDispatchAdapter`, etc.) collapse with it; `TikTokDispatchAdapter`'s own docstring says it "supersedes" `TikTokChannelTransport`.

### `LeadsService` reads a different store than `CrmService` for the same UI concept (P1 — open MERGE DECISION)

- **Canonical:** `Contact` is the **declared** canonical person (PERSON migration). `CrmService.listContacts` reads it.
- **Duplicate:** `LeadsService` (`backend/src/kloel/leads.service.ts:86`) reads **`KloelLead`** for `GET /kloel/leads/:workspaceId` (the leads-list UI).
- **Why this is NOT a settled alias:** **`KloelLead` (`RAC_KloelLead`, schema:1834) is a separate live table, NOT an alias of `Contact` (`RAC_Contact`, schema:399).** It carries its own `status`/`stage`/`lastMessage`/`lastIntent`/`totalMessages`/`score`, is the live backing store for the WhatsApp lead path, and the cut-over to `Contact` is **incomplete** — the CRM screen (reads `Contact`) and the leads screen (reads `KloelLead`) **can disagree**. Treat Contact-vs-KloelLead as an **open P1 merge decision**, not a settled alias.
- **Converge:** Make `KloelLead` funnel state read-through/derived from `Contact`; repoint `LeadsService.listLeads` to `Contact` (the frontend docstring at `frontend/src/lib/api/leads.ts:4-12` already *claims* Contact-backing — stale); **activate `ContactIdentityMergeService`** (orphan today) to reconcile fragmented rows; then retire `RAC_KloelLead`.

### Three near-identical lead-lifecycle services, each with its own `getOrCreateLead` (P1)

- **Canonical:** `LeadMindCoordinator` (`kloel/mind/coordination/lead-mind-coordinator.service.ts:92`) — self-annotated "canonical per-lead cognitive coordinator."
- **Duplicates:** `KloelLeadProcessorService.processWhatsAppMessage` (`kloel/kloel-lead-processor.service.ts:56` + helper `kloel-lead-processor-helpers.ts:76`); `WhatsAppMindCoordinator.handleIncomingMessage` (`whatsapp-mind-coordinator.service.ts:175`, **passes RAW `msg.from`** — a phone-normalization bug). Each has its own `getOrCreateLead` + `syncCanonicalContact`.
- **Live P0 inside this family:** `KloelLeadProcessorService.processWhatsAppMessageWithPayment` looks up `KloelLead` by **RAW** `senderPhone` (`:285`) while the lead was created under **normalized** phone (`:78-83`) → high-buy-intent payment link **silently not generated** (lost revenue). One-line fix: normalize the lookup key.
- **Converge:** Extract one `getOrCreateLead(workspaceId, normalizedPhone)` + `syncCanonicalContact` helper; delete the 3 drifted copies; normalize phone at the channel boundary before any of them.

### `MetaConnectionStateService` / `resolveInstagramConnection` / ~19 raw finders (P1)

- **Canonical:** `MetaWhatsAppService.resolveConnection` → `ResolvedMetaConnection` (single credential resolver).
- **Duplicates:** `MetaConnectionStateService.forWorkspace` (`meta/meta-connection-state.service.ts:44`); `resolveInstagramConnection` (`marketing/instagram/instagram-marketing.service.ts:24`, bespoke decrypt); **~19 direct `prisma.metaConnection.find*`** callsites across marketing/meta/omnichannel/kloel.
- **Converge:** `MetaConnectionStateService` consumes the resolver; delete `resolveInstagramConnection`; unify token-expiry semantics (`EXPIRED` at `meta-connection-state.service.ts:31` vs `tokenExpired` in `resolveConnection`); replace the raw finders with the resolver.

### `FacebookMessengerService` vs `MessengerService` — same wire endpoint, only one persists (P1)

- **Canonical:** `FacebookMessengerService.sendMessage` (`marketing/facebook-messenger.service.ts:41`) — `ChannelKind.FACEBOOK`, persists `FbMessage` (`RAC_FbMessage`, schema:3911) + full webhook processing.
- **Duplicate:** `MessengerService.sendTextMessage` (`channels/messenger/messenger.service.ts:12`) — `ChannelKind.MESSENGER`, **NO persistence**, same `${pageId}/messages` endpoint.
- **Converge:** Route both kinds through one page-messaging service that always persists `FbMessage` as a provider-native **delivery ledger** (while `RAC_Message` stays the canonical conversation store); verify whether FB inbound is double-persisted into both.

### `MercadoPagoPixService` — ORPHAN PIX charge (P2)

- **Canonical:** `MercadoPagoPixChargeService` (10+ consumers).
- **Duplicate:** `MercadoPagoPixService` (`checkout/mercado-pago-pix.service.ts:146`) — **not registered in `checkout.module.ts`**, only its own specs import it.
- **Converge:** Pure dead-code deletion (~12 KB of payload-building logic that can drift from the live one) + its 2 spec files.

### `KloelGlobalPriorService` — dead global-prior twin (P2)

- **Canonical:** `MindGlobalPriorService` over `RAC_MindGlobalPrior`.
- **Duplicate:** `KloelGlobalPriorService` (`kloel/kloel-global-prior.service.ts:32`) over `RAC_KloelGlobalPrior` — `@deprecated`, registered in `kloel.module` but **ZERO constructor injectors = dead**.
- **Converge:** Drop the service + its provider registration (no consumers; bridge methods already wired into `MindPolicyService.mixWithGlobalPrior`). Table drop is owner-gated.

### `OmnichannelContactResolutionService` bypasses the cross-channel resolver (P2)

- **Canonical:** `ContactIdentityResolverService.resolve` (full cross-channel phone/email/socialHandle match).
- **Duplicate path:** `OmnichannelContactResolutionService.resolveFromMessage` (`omnichannel/contact-resolution.service.ts:19`) calls `ChannelIdentifierService` **directly**, bypassing the cross-channel match → inbound messages create synthetic-phone duplicates instead of merging into verified contacts.
- **Converge:** Make `resolveFromMessage` delegate to `ContactIdentityResolverService.resolve`.

### `AuthPasswordService` — orphan register/login (P2)

- **Canonical:** the standalone functions in `auth-service.register-login.ts`.
- **Duplicate:** `AuthPasswordService` (`backend/src/auth/auth.password.service.ts:36`) — **never injected, absent from `auth.module.ts`**.
- **Converge:** Do not wire it; treat as superseded (deletion candidate).

### Mind read/write bypasses (P2)

- **`recordCase` bypass:** `MindCaseMemoryService.recordCase` (`mind/memory/mind-case-memory.service.ts:40`) is canonical, but `MindMultiModalPerceptionService` (`:103`) and `MindCanonicalService` (`:105`) do `prisma.mindCase.create` directly. Repoint both through `recordCase`.
- **Event-sink bypass:** `MindEventSpine.record` → legacy `RAC_AutopilotEvent` (no idempotency/outbox) vs `recordCommercial`/`recordMany` → `RAC_MindOutboxEvent` (transactional, idempotent). Migrate generic brain/cognition events onto the outbox (note `MindPerceptionService` reads percepts back out of `RAC_AutopilotEvent`, so the read path moves too).
- **Two tick schedulers:** `MindProcessorService` (queue `mind-tick`, 30s, canonical) vs `MindBackgroundScheduler` (queue `mind-bg-tick`, 5s) vs `MindEventIngestor.tickAllWorkspaces` — make one own "who ticks a workspace."

### Naming-collision services to rename (P2/P3)

- **`LongTermMemoryService` vs `MindLongTermMemoryService`:** distinct stores/triggers (`long-term-memory.service.ts:51` → `RAC_MindGraphNode` fact consolidation; `mind-long-term-memory.service.ts:33` → `RAC_MindCase`→belief consolidation + prune). Keep both but **rename for intent** (e.g. `GraphFactMemoryService` vs `CaseConsolidationService`) — a dev will wire the wrong one. `ConsolidationService` (`mind/consolidation.service.ts:52`) is the bg-substrate variant.
- **`MarketplaceService` (FlowTemplate catalog, NOT money) vs `marketplace-treasury/*` (house money) vs `split/MarketplaceFee`:** rename the template store to `TemplateMarketplaceService` so "marketplace" stops meaning both the template catalog and the payments marketplace.
- **`BrainRuntimeService` alias:** `MindRuntime` (`mind/coordination/mind-runtime.service.ts:52`) re-exported as `BrainRuntimeService` (`:438`) + legacy shim `kloel/brain-runtime.service.ts` — an ADR-0013 Wave-M1 alias window; remove once DI tokens migrate. `CiaRuntimeService` (`cia/cia-runtime.service.ts:13`) is a distinct async-autonomy runtime — document the split, do not merge.

### Shared-abstraction extractions (P1/P2)

- **Ledger:** `LedgerService` (Connect), `MarketplaceTreasuryService` (house), `kloel/WalletLedgerService` (seller), `PrepaidWalletTransaction` self-ledger — extract ONE append-only `SharedLedger` (direction/bucket/amountInCents/`balanceAfter`/reason + reconcile + maturation). Each is a genuinely different actor's money — **keep separate stores, share the abstraction.** Note `KloelWalletLedger` + `MarketplaceTreasuryLedger` are missing `balanceAfter` that `ConnectLedgerEntry`/`PrepaidWalletTransaction` carry; `WalletAnticipation` (schema:2855) is still Float while others are BigInt cents.
- **Payout:** `ConnectPayoutService` (`payments/connect/connect-payout.service.ts:78`), `MarketplaceTreasuryPayoutService` (`marketplace-treasury-payout.service.ts:44`), `kloel/WalletService.withdraw` — keep the distinct approval models, share the debit+append+payout core.
- **Recovery cron:** `kloel/CartRecoveryService` (@Cron 30min over `CheckoutOrder` PENDING) vs `checkout/CheckoutSocialRecoveryService` (`checkout-social-recovery.service.ts:46`, @Cron 10min over `CheckoutSocialLead`) — unify behind one scheduler keyed on the person (`Contact`) so a human who is both is recovered **once**.
- **Stripe-sub → workspaceId resolver** copied across `billing-webhook.service.ts:233`, `billing-checkout-helper.service.ts:253`, `billing-checkout-webhook.service.ts:288` — collapse into the injected impl behind the existing `billing-subscription-status.helper.ts:15` port.
- **MindMessage dual-write helper** duplicated 4× (`inbox.service.ts:47`, `kloel-thread.service.ts:67`, `chat.service.ts:86`, `kloel-lead-processor-helpers.ts:147`) — extract one fail-open `MindMessageDualWriteService.mirror(source, …)` reading the single flag.
- **Admin-vs-tenant auth stack:** the entire admin auth stack (`AdminAuthService`/`AdminSessionFactory`/`AdminMfaService`/`AdminLoginAttemptsService` over `AdminUser`/`AdminSession`) duplicates the tenant stack (`AuthService`/`AuthTokenService`/`AccountMfaService`/`RateLimitService` over `Agent`/`RefreshToken`) with no shared core — hoist password hashing, TOTP, session rotation, login throttling, and audit append into `common/`. The access-token-revocation P0 above is a live example of a fix that did not propagate.

---

## In-flight migrations (mid-migration, NOT converged)

These are **not** settled. Do not treat the target as the live source of truth yet.

| Migration | From → To | Flag | State |
|---|---|---|---|
| **KloelMemory → MindMemory** | `RAC_KloelMemory` (schema:1711, **source of truth**, ~89+ callers) → `RAC_MindMemory` (schema:3872) | `KLOEL_MINDMEMORY_DUALWRITE` (default **OFF**, `mind-memory-item.service.ts:96`) | Mid-migration: 2 writers + 2 readers (`kloel-memory-engine.service.ts:232/282/192`), **no backfill**, split-brain risk. Schema comment claiming MindMemory is "canonical-but-dead / ZERO writers" is **STALE**. |
| **Legacy msg tables → MindMessage** | `RAC_KloelMessage` + `RAC_ChatMessage` + `RAC_KloelConversation` + `RAC_Message` → `RAC_MindMessage` (schema:3849) | `KLOEL_MINDMESSAGE_DUALWRITE` (default **OFF**) | **Canonical-but-DEAD-on-read:** 4 flag-gated writers (`inbox`/`chat`/`thread`/`lead-processor`), **ZERO readers** (`StateBuilderService`/`KloelConversationStore` read `.items = prisma.kloelMessage`). Enabling dual-write today = **2× write cost + silent divergence, no benefit**. |
| **ProductPlan.price → CheckoutProductPlan.priceInCents** | `RAC_ProductPlan.price` Float → `RAC_CheckoutProductPlan.priceInCents` Int | (no env flag — additive column) | Half-done: `ProductPlan.priceInCents` populated **only** by `PlanService.create`; `ProductPlanController` + chat tools don't dual-write. Merchant can edit a price with **no commercial effect** (pricing reads `CheckoutProductPlan` only). |
| **Channel transport delegation** | `channel-transport.providers.ts` `provider.send` bodies → `*-dispatch.adapter` via `ChannelDispatchRegistry` | `KLOEL_TRANSPORT_CANONICAL_DELEGATE` (default **OFF**, excludes email+tiktok) | Default OFF → guarded path mostly runs **duplicate** legacy bodies. Email excluded (different delivery mechanism via `EmailCampaignService`). |
| **Instagram DM → canonical dispatch** | `InstagramMarketingService.sendDirectMessage` raw → `ChannelMessageDispatchService` via `InstagramDispatchAdapter` | `instagram-canonical-dispatch.flag` (`isInstagramCanonicalDispatchEnabled`) | Flag-gated delegation landed (commit `a38949d94`); raw fallback dead once flag permanently ON. |
| **Lead funnel: KloelLead → Contact** | `RAC_KloelLead` funnel columns → `RAC_Contact` mirror (schema:426-430) + `Contact.kloelLeadId` (schema:444) | best-effort fail-open dual-write in the 3 lead services + `person-kloel-lead-to-contact.backfill.*` (**no dedicated flag file**) | Mid-migration: columns + backfill landed, **cut-over incomplete** — `LeadsService` reads `KloelLead`, CRM reads `Contact`. **Open P1 MERGE DECISION — Lead is NOT yet an alias of Contact.** |
| **KloelGlobalPrior → MindGlobalPrior** | `RAC_KloelGlobalPrior` (@deprecated) + `KloelGlobalPriorService` → `RAC_MindGlobalPrior` + `MindGlobalPriorService` | (no flag) | Near-complete: bridge methods wired into `MindPolicyService.mixWithGlobalPrior`; `KloelGlobalPriorService` dead (zero injectors); safe to drop service. Table drop owner-gated. |
| **ProductCoupon → CheckoutCoupon** | `RAC_ProductCoupon` (Float, PERCENT/FIXED) → `RAC_CheckoutCoupon` (Int cents, PERCENTAGE/FIXED) | (no flag — one-way `product-coupon-sync.util`) | Mid-migration: one-directional sync only on product-coupon controller writes; divergent validate; silent Float→cents rounding. |
| **BrainRuntimeService → MindRuntime** | `BrainRuntimeService` alias + `kloel/brain-runtime.service.ts` shim → `MindRuntime` | (no flag — ADR-0013 Wave M1 alias window) | Scheduled-for-removal compatibility layer; track until DI tokens migrate. |

---

## Corrections baked in from the v1 docs

The v1 service docs carried these errors; this catalog does **not** repeat them:

1. **`ChannelSession` is FICTIONAL** — zero grep matches in `backend/src` and `schema.prisma`. The real channel-session surface is **`WhatsappSessionService`** (`whatsapp-session.service.ts:19`) over `ChannelSetup` + `MetaConnection`.
2. **`Lead` is NOT an alias of `Contact`.** `KloelLead` (`RAC_KloelLead`, schema:1834) is a distinct live table. Recorded as an **open P1 MERGE DECISION** vs `Contact` (`RAC_Contact`, schema:399), not a settled alias.
3. **`OpsEvent` (schema:1614) and `RiscEvent` (schema:1273) are LIVE models** absent from v1 — included (`OpsEvent` ← `OpsAlertService`; `RiscEvent` ← `ComplianceService.routeRiscEvent`, which **IS** the processor, not an ingest-only stub).
4. **`campaign-jobs`/`voice-jobs`/`media-jobs` are NOT dead queues** — they have **live workers** in the separate `worker/` deployable (`worker/campaign-processor.ts:147` `campaignWorker`, `worker/voice-processor.ts:254` `voiceWorker`, `worker/media-processor.ts:16` `mediaWorker`). Only **`mass-send`** (`backend/src/mass-send/*`) is the genuinely questionable surface.
5. **Three migrations are mid-migration, NOT converged:** KloelMemory→MindMemory dual-write (`KLOEL_MINDMEMORY_DUALWRITE`, default OFF), MindMessage canonical-but-dead-on-read (`KLOEL_MINDMESSAGE_DUALWRITE`), ProductPlan.price→CheckoutProductPlan.priceInCents.
