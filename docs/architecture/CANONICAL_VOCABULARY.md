# Kloel — Canonical Vocabulary (Ubiquitous Language)

**What this answers:** When two developers (or two services) say "lead", "session", "plan", "wallet", or "memory", do they mean the same row in the same table? This doc fixes ONE official term per domain concept, names the real backing model behind it, and lists the FORBIDDEN aliases that have caused split-brain bugs. Every term is grounded in a real Prisma model or service file — no invented names. Use this as the tiebreaker in PRs, ADRs, and chat-tool naming.

**Last generated:** 2026-06-07 — grounded in `backend/prisma/schema.prisma` + `backend/src/**` + `worker/**` (separate deployable). Source digest: `docs/architecture/inventory/_CONSOLIDATED.json`.

---

## How to read this

- **OFFICIAL term** — the only phrase you should use in new code, comments, ADRs, and UI labels for this concept.
- **Backing model / service** — the real Prisma `model` (with `schema.prisma` line) or `@Injectable` service that the term resolves to. If you can't point at this row, you're using the term loosely.
- **FORBIDDEN aliases** — names that look like synonyms but resolve to a *different* table/service (or to nothing at all). Using them silently routes data to the wrong store.
- **Allowed narrow uses** — places the term legitimately means something adjacent. Honor the scope; don't widen it.

> **Five corrections baked into this v2** (the v1 stub got these wrong — do not regress):
> 1. **`ChannelSession` is FICTIONAL** — zero grep matches in `src/` and `schema.prisma`. It is NOT a canonical term. The real channel-session surface is `WhatsappSessionService` over `ChannelSetup` + `MetaConnection`.
> 2. **`Lead` is NOT an alias of `Contact`.** `KloelLead` (`RAC_KloelLead`) is a distinct live table pending an open **P1 merge decision** against `Contact` (`RAC_Contact`) — not a settled synonym.
> 3. **`OpsEvent` and `RiscEvent` are LIVE models** (absent from v1) — included below.
> 4. **`campaign-jobs` / `voice-jobs` / `media-jobs` are NOT dead queues** — they have live workers in `worker/`. Only `mass-send` is genuinely questionable.
> 5. **Three migrations are mid-flight, not converged** — `KloelMemory→MindMemory`, `MindMessage` (canonical-but-dead-on-read), and `ProductPlan.price→CheckoutProductPlan.priceInCents`. Treat the "target" name as aspirational until cut-over lands.

---

## 1. Canonical term table

| # | OFFICIAL term | Backing model / service | FORBIDDEN aliases | Allowed narrow uses |
|---|---|---|---|---|
| 1 | **Contact** | `Contact` — `RAC_Contact`, `schema.prisma:399`; written canonically by `CrmService.upsertContact` (`crm/crm.service.ts`) | `Lead` (as a synonym for Contact); `Person`; `Customer`/`Client`/`Prospect`/`User` (as a distinct model) | CRM pipeline read aliases a `Deal` as `"lead"` in `getPipeline` (`stage.leads = deals`) — a pipeline naming overload, **distinct** from the Lead entity. `Customer`/`Lead` are acceptable only as funnel-stage *labels*, never as a separate model |
| 2 | **KloelLead** | `KloelLead` — `RAC_KloelLead`, `schema.prisma:1834`; read by `LeadsService` (`kloel/leads.service.ts`) | "alias of Contact"; "settled duplicate of Contact" | The live backing store for the WhatsApp lead-processing path and for `GET /kloel/leads/:workspaceId` |
| 3 | **Message** | `Message` — `RAC_Message`, `schema.prisma:721` (omnichannel inbox); per-surface legacy tables `KloelMessage`/`ChatMessage`/`KloelConversation` remain de-facto canonical for brain/thread/lead | `MindMessage` treated as if live (it is **canonical-but-dead-on-read**) | `FbMessage` (`RAC_FbMessage`) as a provider-native **delivery ledger only**, not a parallel conversation history; `AdminChatMessage`/`PartnerMessage` as separate-audience surfaces |
| 4 | **Conversation / Thread** | `Conversation` — `RAC_Conversation`, `schema.prisma:682` (inbox); `ChatThread` — `RAC_ChatThread`, `schema.prisma:1885` (dashboard assistant); `AdminChatSession` (admin copilot) | Using "thread" and "conversation" **interchangeably** across inbox vs dashboard | `ChatThread` is the UI-facing assistant grouping, a different surface from the inbox `Conversation` |
| 5 | **Channel / Session** | `ChannelSetup` — `RAC_ChannelSetup`, `schema.prisma:3492` (wizard progress) + `MetaConnection` — `RAC_MetaConnection`, `schema.prisma:3467` (credentials); the channel-session SERVICE is `WhatsappSessionService` (`marketing/channels/whatsapp/whatsapp-session.service.ts:19`) | **`ChannelSession`** (FICTIONAL — zero grep matches in `src/` and `schema.prisma`; do NOT use); also `whatsappSession`/`waSession`/`connection`/`instance`/`botSession` as the session entity | `ChannelKind` enum (`common/channel-dispatch/channel-dispatch.port.ts:14`) as the one channel-name discriminator; `OmniChannel`/identifier casing should be derived `Uppercase` views |
| 6 | **Workspace / Tenant** | `Workspace` — `RAC_Workspace`, `schema.prisma:119` | `Tenant`/`Org`/`Account` (as a separate model or the tenant root) | `customDomain @unique` enables white-label reseller resolution; `Org`/`Account` acceptable only as scope-context prose, never as a model |
| 7 | **Product / Plan / Offer** | `Product` — `RAC_Product`, `schema.prisma:1734`; **`CheckoutProductPlan`** — `RAC_CheckoutProductPlan`, `schema.prisma:2969` (`priceInCents`) is the CANONICAL plan/offer read by pricing; `CheckoutConfig` — `schema.prisma:3025` is the offer presentation | `ProductPlan.price` (Float) as the live price — never consulted at order time; `ProductCheckout` JSON config as the canonical offer config | `ProductPlan` (`RAC_ProductPlan`, `schema:2213`) as a legacy/UI plan model mid-migration to `priceInCents`; `CheckoutProductPlan(kind=CHECKOUT)` reused as a checkout-template grouping via `CheckoutPlanLink` |
| 8 | **Checkout / Order / Payment** | `CheckoutOrder` — `RAC_CheckoutOrder`, `schema.prisma:3220` + `CheckoutPayment` — `RAC_CheckoutPayment`, `schema.prisma:3330`; captured by `CheckoutPaymentService.capture` | `Payment` (`RAC_Payment`, `schema:2744`) as a canonical order/payment — it is an unowned raw webhook sink; `KloelSale` as a parallel GMV silo excluded from platform GMV | `KloelSale` (`RAC_KloelSale`, `schema:1917`) as the chat-driven direct-sale originator that **should** materialize a `CheckoutOrder`; `PhysicalOrder` for fulfillment (soft-linked via `saleId`, no FK) |
| 9 | **Wallet / Balance / Ledger** | FIVE distinct actors' money: `KloelWallet`+`KloelWalletLedger` (seller earnings, `schema:1949`); `PrepaidWallet`+`PrepaidWalletTransaction` (usage, `schema:4472`); `ConnectAccountBalance`+`ConnectLedgerEntry` (Stripe Connect, `schema:4397`); `MarketplaceTreasury`+`MarketplaceTreasuryLedger` (house, `schema:4255`); `WalletAnticipation` (receivable, `schema:2855`) | **`WalletService` as an unqualified name** — TWO different classes share it: `kloel/WalletService` (seller earnings) vs `wallet/WalletService` (prepaid usage) | Each ledger is a legitimately different actor's money — keep separate, but share ONE append-only ledger abstraction |
| 10 | **Campaign** | `ProductCampaign` — `RAC_ProductCampaign`, `schema.prisma:2378` (per-product attribution); campaign execution runs on BullMQ queue `campaign-jobs` with a LIVE worker (`worker/campaign-processor.ts:147` `campaignWorker`) | "dead queue" label for `campaign-jobs`/`voice-jobs`/`media-jobs` — they have **live workers** in the separate `worker/` deployable | `voice-jobs` (`worker/voice-processor.ts:253` `voiceWorker`) and `media-jobs` (`worker/media-processor.ts:15` `mediaWorker`) are also LIVE |
| 11 | **Memory** | `KloelMemory` — `RAC_KloelMemory`, `schema.prisma:1711` is the CURRENT source of truth (~89+ callers via `MindMemoryItemService.items`); `MindMemory` — `RAC_MindMemory`, `schema.prisma:3872` is the canonical TARGET (dual-write + partial reads) | `MindMemory` as if fully live (migration incomplete); `MindMessage` as a memory store (it is a **message** store) | `MindCase` (case memory), `MindGraphNode`/`Edge` (semantic graph), `MindBelief` (beliefs) are distinct typed memory surfaces, not KV memory |
| 12 | **GlobalPrior** | `MindGlobalPrior` — `RAC_MindGlobalPrior`, `schema.prisma:3800` via `MindGlobalPriorService` (`mind/memory/mind-global-prior.service.ts:55`) | `KloelGlobalPrior` (`RAC_KloelGlobalPrior`, `schema:3897`) as live — `@deprecated`, its service has ZERO injectors (dead) | `KloelGlobalPrior` table retained for data safety until owner-gated drop |
| 13 | **OpsEvent** | `OpsEvent` — `RAC_OpsEvent`, `schema.prisma:1614`; written by `OpsAlertService` (`observability/ops-alert.service.ts`) | "cognitive event" — `OpsEvent` is operational alerting, NOT the Mind spine; do not conflate with `AutopilotEvent`/`MindOutboxEvent` | Dashboard alerting on `critical_error`/`degradation`/`recovery` |
| 14 | **RiscEvent** | `RiscEvent` — `RAC_RiscEvent`, `schema.prisma:1273`; written + routed by `ComplianceService.routeRiscEvent` (`compliance/compliance.service.ts:140`) | "ingest-only stub" / "unprocessed" — STALE; `routeRiscEvent` **is** the processor | Google RISC (cross-account protection) event ingest + classify + route + mark-processed |

> **Carried over from v1 (still valid):** `ChannelMessageDispatchService` (`marketing/channel-message-dispatch.service.ts`) is the single backend send entrypoint — forbidden aliases `WhatsappApiService.sendText` / `MessageWorker.process` in a send role; it routes through `ChannelDispatchRegistry.send`. `Webhook` is canonical over `Hook`/`Callback`/`Notification`/`IncomingEvent` for the provider→internal event boundary.

---

## 2. Per-term notes (why the forbidden aliases bite)

### 1. Contact
Canonical person, unique `(workspaceId, phone)`. **KloelLead is NOT an alias of Contact** — it is a separate live table pending merge (see term 2 and §3). The phone key MUST be written through the structured `normalizePhone()` (`common/phone/phone-normalization.util.ts`); the digits-only / raw-phone shortcuts elsewhere fragment one human into multiple `Contact` rows (P0).

### 2. KloelLead
**EXPLICIT MERGE DECISION (P1), NOT a settled alias.** Overlaps `Contact` funnel columns (`status`/`stage`/`lastMessage`/`lastIntent`/`totalMessages`/`score`); bridged via `Contact.kloelLeadId` (schema:444) + best-effort dual-write implemented directly in the three lead services (`kloel-lead-processor.service.ts`, `lead-mind-coordinator.service.ts`, `whatsapp-mind-coordinator.service.ts`) + `person-kloel-lead-to-contact.backfill.*` — there is **no dedicated flag file** for this migration. The cut-over to `Contact` is **incomplete**: `LeadsService` still reads `KloelLead` while CRM reads `Contact`, so the leads-list screen and the CRM screen can disagree. Do not write code that assumes `Lead == Contact`.

### 3. Message
`RAC_MindMessage` (`schema:3849`) is the DECLARED unified target (with a `source` discriminator: `brain`/`dashboard`/`lead_conversation`/`thread`/`channel`) but has **ZERO readers** and only flag-gated writers (`KLOEL_MINDMESSAGE_DUALWRITE`, default OFF). Until backfill + a read cut-over lands, the four source tables (`Message`/`KloelMessage`/`ChatMessage`/`KloelConversation`) remain de-facto canonical per surface. Reads today resolve to `prisma.kloelMessage` via `StateBuilderService.resolveShortTermMemory` + `KloelConversationStore`.

### 4. Conversation / Thread
`Conversation` is the customer-facing omnichannel thread (singleton-open per `workspace,contact,channel`). `ChatThread` is the internal dashboard chat container. They are different surfaces — using "thread" for an inbox conversation (or vice-versa) misroutes a UI query.

### 5. Channel / Session
**There is NO `ChannelSession` model or service.** Channel session state lives in `ChannelSetup` (wizard progress) + `MetaConnection` (credentials), resolved by `WhatsappSessionService` and `MetaWhatsAppService.resolveConnection`. `SessionStatus` is a provider-registry type, not a model. Credential resolution should funnel through `MetaWhatsAppService.resolveConnection` rather than the ~19 raw `prisma.metaConnection.find*` callsites.

### 6. Workspace / Tenant
The tenancy boundary (`workspaceId` FK) for nearly every model. Membership is implicit: `Agent.workspaceId` with `@@unique([workspaceId, email])` — there is no membership join table; role lives on `Agent`. Request → `workspaceId` MUST go through the secure `resolveWorkspaceId` (`auth/workspace-access.ts:119`), which proves the caller owns the workspace. The variants in `kloel-security.guard.ts`, `common.helpers.ts`, and `route-class.guard.ts` are NOT safe for data access (P0 IDOR).

### 7. Product / Plan / Offer
Money lives in **two unsynced tables with different units** (`ProductPlan.price` Float reais vs `CheckoutProductPlan.priceInCents` Int cents). Only `CheckoutProductPlan.priceInCents` drives what the buyer is charged. A merchant editing `ProductPlan.price` can change a number that has **no commercial effect**.

### 8. Checkout / Order / Payment
`CheckoutOrder.totalInCents` is the GMV source of truth. `KloelSale` chat revenue is currently double-orphaned (not in `admin gmv.query` nor `dashboard.service`). A single Stripe webhook fans out to **3 tables** — a record can be PAID in one and PENDING in another. `Payment` (`RAC_Payment`) has no owning `@Injectable` service.

### 9. Wallet / Balance / Ledger
Append/reconcile/mature logic is hand-rolled ~3-4× with inconsistent contracts (some carry `balanceAfter`, some don't; `WalletAnticipation` is still Float while others are BigInt cents). The identical class name `WalletService` across `kloel/` and `wallet/` is a live DI/import trap — both call payment adapters, so a wrong import is silent.

### 10. Campaign
**CORRECTION:** the recon falsely flagged campaign/voice/media queues as dead. They have LIVE workers in the separate `worker/` deployable (`campaignWorker`/`voiceWorker`/`mediaWorker`, all `new Worker(...)`). Only `mass-send` (`backend/src/mass-send/*`) is the genuinely questionable surface. The `worker/` package has its own queue registry.

### 11. Memory
`KloelMemory → MindMemory` is **IN-FLIGHT** (flag `KLOEL_MINDMEMORY_DUALWRITE`, default OFF; `mind-memory-item.service.ts:96`). 2 writers + 2 readers exist (`kloel-memory-engine.service.ts` reads `MindMemory`). No backfill yet → split-brain risk if a key is written to one store and read from the other. The schema comment on `MindMemory` claiming "canonical-but-dead / ZERO writers" is **STALE**.

### 12. GlobalPrior
Canonical cross-workspace anonymized prior by `(domain, predicate, context)`. `KloelGlobalPriorService` is dead code (provider registered in `kloel.module` with no constructor injectors); the replacing bridge methods are already wired into `MindPolicyService.mixWithGlobalPrior`.

### 13. OpsEvent
Operational error/degradation/recovery sink for dashboard alerting — **distinct** from the cognitive event spine. The Mind domain owns `AutopilotEvent`/`MindOutboxEvent`; `OpsEvent` must not be conflated with them.

### 14. RiscEvent
**CORRECTION:** v1 wrongly called `RiscEvent` an ingest-only stub "with no processor." `ComplianceService.routeRiscEvent` (`compliance.service.ts:140`) IS the processor — it classifies, routes, writes/updates `riscEvent` rows, and marks them processed.

---

## 3. The open Contact-vs-KloelLead merge (do NOT treat as a settled alias)

This is the single most error-prone naming question in the codebase, so it gets its own section.

| Aspect | `Contact` (`RAC_Contact`, `schema:399`) | `KloelLead` (`RAC_KloelLead`, `schema:1834`) |
|---|---|---|
| Unique key | `@@unique([workspaceId, phone])` | `@@unique([workspaceId, phone])` |
| Funnel columns | `leadStatus`/`leadStage`/`lastMessage`/`lastIntent`/`totalMessages` (mirror) | `status`/`stage`/`lastMessage`/`lastIntent`/`totalMessages`/`score` (native) |
| Read by | `CrmService` / CRM UI | `LeadsService` → `GET /kloel/leads/:workspaceId` (leads-list UI); WhatsApp lead-processing path |
| Status | **DECLARED canonical person** (PERSON migration target) | Live backing store, mirrored onto `Contact` via best-effort dual-write |
| Bridge | `Contact.kloelLeadId` (schema:444) + best-effort dual-write in the 3 lead services + `person-kloel-lead-to-contact.backfill.*` (no dedicated flag file) | — |

**Verdict:** `Contact` is the declared canonical person, but the cut-over is **not complete**. Until `LeadsService` reads `Contact`, `KloelLead` funnel state is derived/read-through, and `ContactIdentityMergeService` (currently orphaned, zero production callers) is activated to reconcile fragmented rows, this remains an **open P1 merge decision**. Adjacent lead-identity surfaces that are also NOT the same row: `CheckoutSocialLead.status/stepReached` (`schema:3273`, separate status machine) and `ScrapedLead.phone` (`schema:779`, distinct until imported).

---

## 4. In-flight migrations — when "the canonical name" is still aspirational

Use the **`from`** model in production code paths until the cut-over lands; the **`to`** model is the target name, not yet the live store.

| Migration | From (live today) | To (target) | Flag | State |
|---|---|---|---|---|
| KV/semantic memory | `RAC_KloelMemory` (`schema:1711`, ~89+ callers) | `RAC_MindMemory` (`schema:3872`) | `KLOEL_MINDMEMORY_DUALWRITE` (default OFF) | Mid-migration: 2 writers + 2 readers, NO backfill, split-brain risk |
| Unified message store | `RAC_KloelMessage` + `RAC_ChatMessage` + `RAC_KloelConversation` + `RAC_Message` | `RAC_MindMessage` (`schema:3849`) | `KLOEL_MINDMESSAGE_DUALWRITE` (default OFF) | **Canonical-but-DEAD-on-read**: 4 flag-gated writers, ZERO readers. Enabling dual-write today = 2× write cost + silent divergence, no benefit |
| Plan pricing | `RAC_ProductPlan.price` (Float) | `RAC_CheckoutProductPlan.priceInCents` (Int cents) | (no env flag — additive column) | Half-done: `ProductPlan.priceInCents` populated only by `PlanService.create`; controller + chat tools do NOT dual-write it |
| Channel transport | `kloel/channel-transport.providers.ts` `provider.send` bodies | `marketing/channels/*-dispatch.adapter` via `ChannelDispatchRegistry` | `KLOEL_TRANSPORT_CANONICAL_DELEGATE` (default OFF; EXCLUDES email+tiktok) | Mid-migration: default OFF runs duplicate legacy bodies; email excluded (different delivery mechanism) |
| Instagram DM send | `InstagramMarketingService.sendDirectMessage` raw | `ChannelMessageDispatchService` via `InstagramDispatchAdapter` | `instagram-canonical-dispatch.flag` | Mid-migration: flag-gated delegation landed (commit `a38949d94`) |
| Lead funnel (PERSON) | `RAC_KloelLead` funnel columns | `RAC_Contact` mirror columns + `Contact.kloelLeadId` (schema:444) | best-effort dual-write in the 3 lead services + `person-kloel-lead-to-contact.backfill.*` (no dedicated flag file) | Mid-migration: columns + backfill landed, cut-over incomplete — see §3 |
| Global prior | `RAC_KloelGlobalPrior` (`@deprecated`) | `RAC_MindGlobalPrior` | (no flag — service already wired) | Near-complete: legacy service has zero injectors; safe to drop service, table drop owner-gated |
| Coupon | `RAC_ProductCoupon` (Float, `PERCENT`/`FIXED`) | `RAC_CheckoutCoupon` (Int cents, `PERCENTAGE`/`FIXED`) | (no flag — one-way `product-coupon-sync.util`) | Mid-migration: one-directional sync, divergent validate logic, silent Float→cents rounding |
| Brain→Mind DI rename | `BrainRuntimeService` alias + `kloel/brain-runtime.service.ts` shim | `MindRuntime` (`mind/coordination/mind-runtime.service.ts:52`) | (no flag — ADR-0013 Wave M1 alias window) | Scheduled-for-removal compatibility layer |

---

## 5. Quick "did I pick the right name?" checklist

- Saying **"lead"**? → Decide explicitly: the CRM person (`Contact`) or the live `KloelLead` row. They are NOT the same table yet (§3).
- Saying **"channel session"**? → There is no `ChannelSession`. You mean `WhatsappSessionService` over `ChannelSetup` + `MetaConnection`.
- Saying **"plan price"**? → Pricing reads `CheckoutProductPlan.priceInCents` only. `ProductPlan.price` (Float) is inert at order time.
- Saying **"the wallet"**? → Qualify which one (seller earnings vs prepaid usage vs Connect vs treasury vs anticipation). `WalletService` alone is ambiguous.
- Saying **"memory"** or **"message"** and pointing at `MindMemory`/`MindMessage`? → Those are migration *targets*; today's live store is `KloelMemory` / the four legacy message tables.
- Logging an error event? → `OpsEvent` (ops dashboard), NOT the Mind spine (`AutopilotEvent`/`MindOutboxEvent`).
- Resolving `workspaceId` from a request? → `resolveWorkspaceId` (`auth/workspace-access.ts:119`) only. The guard/helper variants are IDOR-unsafe.

---

## How to add an entry

1. Find duplication: see `DUPLICATION_REGISTER.md` / `CAPABILITY_MAP.md` or `inventory/_CONSOLIDATED.json`.
2. Pick the canonical name (domain-clear, no abbreviation). Verify it is a real `model`/service via `grep` before committing — do NOT invent names (this is how `ChannelSession` slipped into v1).
3. List the forbidden aliases AND the allowed narrow uses; if it's a mid-flight migration, record the flag + state in §4 rather than declaring the target name canonical.
4. A migration codemod can read the §1 table to perform safe renames via `mcp__atomic-edit__atomic_rename_symbol_cross_file`.

---

## Machine-enforced forbidden aliases

> Parsed by `scripts/ops/check-canonical-vocabulary.mjs` (column 1 = canonical term in backticks, column 2 = forbidden aliases in backticks). The rich table above is the human reference; this is the machine contract. Vocab/deprecation docs and `*.spec`/`*.test` files are exempt; `--strict` fails on alias usage.

| Canonical | Forbidden aliases | Allowed narrow use |
|---|---|---|
| `ChannelSetup` | `ChannelSession`, `whatsappSession`, `waSession`, `connection`, `instance`, `botSession` | `ChannelSession` is FICTIONAL (zero grep matches) — real surface is `WhatsappSessionService` over `ChannelSetup` + `MetaConnection` |
| `Contact` | `Lead`, `Client`, `Customer`, `Prospect`, `User` | `Lead`/`Customer` allowed only as funnel-stage labels, never a separate person model |
| `ChannelMessageDispatchService` | `WhatsappApiService.sendText`, `MessageWorker.process` | single backend send entrypoint routing through `ChannelDispatchRegistry.send` |
| `Webhook` | `Hook`, `Callback`, `Notification`, `IncomingEvent` | external provider to internal event boundary |
| `Workspace` | `Tenant`, `Org`, `Account` | the multi-tenant unit, resolved via the secure `resolveWorkspaceId` |
