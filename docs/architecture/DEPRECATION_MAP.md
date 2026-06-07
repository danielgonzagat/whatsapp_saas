# Kloel Deprecation Map

**What this answers.** For every canonical vocabulary surface in Kloel, this doc states the verdict — **KEPT**, **MIGRATED (to where)**, or **DEPRECATED (with the evidence-of-non-use bar that must clear before deletion)** — plus the required tests gating each migration. It also surfaces the **nine in-flight migrations that are mid-flight (NOT converged)**: dual-write windows where the canonical target is written but not yet read, or read but not yet backfilled. Use this as the authoritative "what can I delete, what must I finish first" reference. Every model/service/file name below is real (grep/AST-verified against `backend/prisma/schema.prisma` + `backend/src/**` + `worker/**`); no invented names. The four v1-doc errors are corrected inline and flagged `[CRITIC]`.

**Last generated:** 2026-06-07 — from `docs/architecture/inventory/_CONSOLIDATED.json` (7 source clusters) + live source verification.

---

## How to read a verdict

| Verdict | Meaning | Deletion bar |
|---|---|---|
| **KEPT** | Canonical. Stays. Other surfaces converge onto it. | n/a |
| **MIGRATED** | A target is declared and partially wired. The legacy surface is being phased out. | Listed per row — backfill + read cut-over + parity tests. |
| **DEPRECATED** | Superseded; retirement is the goal. | The **evidence-of-non-use bar** column — the concrete grep/runtime check that must come back empty before the row/service/file is dropped. |
| **MID-MIGRATION** | A dual-write or delegation window is OPEN. Target is NOT yet load-bearing on read. **Do not delete the legacy surface, and do not blindly flip the flag.** | See [In-flight migrations](#in-flight-migrations-mid-migration--not-converged). |

**Severity** carries through from the consolidated digest (P0 = data-correctness/revenue/security; P1 = canonicalization decisions with live drift; P2/P3 = naming/dead-code hygiene).

---

## Critic corrections baked in

These four claims were **wrong in the v1 docs** and are corrected throughout this map. Do not reintroduce them.

| # | v1 error | Correction (grounded) |
|---|---|---|
| 1 | `ChannelSession` listed as a canonical channel-session model. | **`ChannelSession` is FICTIONAL** — zero grep matches in `backend/src/**` and `schema.prisma` (verified). The real channel-session surface is **`WhatsappSessionService`** (`backend/src/marketing/channels/whatsapp/whatsapp-session.service.ts:19`) over **`ChannelSetup`** (schema:3492) + **`MetaConnection`** (schema:3467). |
| 2 | `Lead` treated as a settled alias of `Contact`. | **`KloelLead` (`RAC_KloelLead`, schema:1834) is a distinct LIVE table**, not an alias of `Contact` (`RAC_Contact`, schema:399). Recorded as an **open P1 MERGE DECISION**, not a settled alias. |
| 3 | `OpsEvent` and `RiscEvent` absent from the model map. | Both are **LIVE models**: `OpsEvent` (schema:1614 ← `OpsAlertService`, `observability/ops-alert.service.ts`) and `RiscEvent` (schema:1273 ← `ComplianceService.routeRiscEvent`, `compliance/compliance.service.ts:140`). `RiscEvent` is **processed**, not an ingest-only stub. |
| 4 | `campaign-jobs`/`voice-jobs`/`media-jobs` flagged as "dead queues". | **They have LIVE workers** in the separate `worker/` deployable: `campaignWorker` (`worker/campaign-processor.ts:147`), `voiceWorker` (`worker/voice-processor.ts:253`), `mediaWorker` (`worker/media-processor.ts:15`). Only **`mass-send`** (`backend/src/mass-send/*`) is the genuinely questionable surface. |

---

## Canonical vocabulary verdicts

One row per canonical surface, ordered by safety + value (settled keeps first, then open merges, then dead-code).

### KEPT — settled canonical surfaces

| Canonical | Backing model / service | Verdict | Why it wins |
|---|---|---|---|
| **Workspace / Tenant** | `Workspace` (`RAC_Workspace`, schema:119) | **KEPT** | The tenancy boundary (`workspaceId` FK) for nearly every model. No separate `Tenant`/`Account` root. Membership is implicit on `Agent` (`@@unique([workspaceId, email])`). Request→`workspaceId` MUST route through the secure `resolveWorkspaceId` (`auth/workspace-access.ts:119`) — see P0 IDOR below. |
| **Contact** | `Contact` (`RAC_Contact`, schema:399, unique `workspaceId_phone`) via `CrmService` (`crm/crm.service.ts:18`) | **KEPT (canonical person)** | Declared canonical person. `CrmService.upsertContact` is the only contact write using structured `normalizePhone()`. **`Lead` is a forbidden alias** `[CRITIC #2]` — `KloelLead` is a separate table pending merge, below. |
| **Conversation / Thread** | `Conversation` (`RAC_Conversation`, schema:682) for inbox; `ChatThread` (`RAC_ChatThread`, schema:1885) for dashboard assistant chat | **KEPT (two distinct surfaces)** | `Conversation` = customer-facing omnichannel thread (singleton-open per workspace,contact,channel). `ChatThread` = internal dashboard chat container. Forbidden to use "thread"/"conversation" interchangeably across the two. |
| **Channel / Session** | `ChannelSetup` (schema:3492) + `MetaConnection` (schema:3467); service = **`WhatsappSessionService`** (`marketing/channels/whatsapp/whatsapp-session.service.ts:19`) | **KEPT** `[CRITIC #1]` | **There is NO `ChannelSession` model or service** (zero grep matches). Session state lives in `ChannelSetup` (wizard progress) + `MetaConnection` (credentials). `SessionStatus` is a provider-registry type, not a model. |
| **Checkout / Order / Payment** | `CheckoutOrder` (`RAC_CheckoutOrder`, schema:3220) + `CheckoutPayment` (`RAC_CheckoutPayment`, schema:3330) via `CheckoutPaymentService` (`checkout/checkout-payment.service.ts:52`) | **KEPT** | `CheckoutOrder.totalInCents` is the GMV source of truth. `Payment` and `KloelSale` are NOT canonical order records (see DEPRECATED + open-merge rows). |
| **GlobalPrior** | `MindGlobalPrior` (`RAC_MindGlobalPrior`, schema:3800) via `MindGlobalPriorService` (`mind/memory/mind-global-prior.service.ts:55`) | **KEPT** | Canonical cross-workspace anonymized prior by `(domain,predicate,context)`, injected via `MindPolicyService.mixWithGlobalPrior`. Legacy `KloelGlobalPrior` is dead (below). |
| **Ops eventing** | `OpsEvent` (`RAC_OpsEvent`, schema:1614) via `OpsAlertService` (`observability/ops-alert.service.ts`) | **KEPT** `[CRITIC #3]` | Operational error/degradation/recovery sink for dashboard alerting. **Distinct from** the cognitive event spine (Mind owns `AutopilotEvent`/`MindOutboxEvent`) — `mustNotOwn` cognitive events. |
| **RISC compliance eventing** | `RiscEvent` (`RAC_RiscEvent`, schema:1273) via `ComplianceService.routeRiscEvent` (`compliance/compliance.service.ts:140`) | **KEPT** `[CRITIC #3,#6]` | Google cross-account-protection events: ingest + classify + route + mark-processed. **`routeRiscEvent` IS the processor** — v1 wrongly called it an unprocessed stub. |
| **Cognitive loop** | `MindService.tick` + `MindEventProcessorService.process` (`mind.service.ts:46`; `mind/runtime/mind-event-processor.service.ts:27`) | **KEPT** | The only DB-persisted, lease-coordinated, `RAC_MindPrediction`-backed loop. Shadow loops below migrate onto it. |
| **Tick scheduling** | `MindProcessorService` (`mind/runtime/mind-processor.service.ts:30`, queue `mind-tick`, 30s) | **KEPT** | The persisted cognitive tick. `MindBackgroundScheduler` (5s `mind-bg-tick`) demotes to a substrate sub-tick. |
| **Surprise math** | `MindSurpriseService.computeSurprise` (`mind/inference/mind-surprise.service.ts:135`, Shannon `-log(p)`) | **KEPT** | Information-theoretic; used by belief update + causal model. `MindPredictionService`'s linear `surprise=confidence` migrates onto it. |
| **Outbound transport core** | `ChannelDispatchRegistry` (`common/channel-dispatch/channel-dispatch.registry.ts:31`) fronted by `ChannelMessageDispatchService.dispatch` (`marketing/channel-message-dispatch.service.ts:72`) | **KEPT** | Pure `ChannelKind`→adapter router. `ChannelTransportRegistry` becomes a guard+audit decorator that always delegates (see mid-migration #4). |
| **Per-channel adapters** | `marketing/channels/*-dispatch.adapter` (`ChannelDispatchPort`) | **KEPT** | `TikTokDispatchAdapter`'s own docstring says it "supersedes" `TikTokChannelTransport`. The `*ChannelTransport` provider bodies are the deprecation target. |
| **Meta credential resolver** | `MetaWhatsAppService.resolveConnection` (`meta/meta-whatsapp.service.ts:71`) | **KEPT** | Single canonical resolver. `MetaConnectionStateService` should consume it; `resolveInstagramConnection` + ~19 raw `prisma.metaConnection.find*` callsites converge onto it. |
| **PIX charge** | `MercadoPagoPixChargeService` (`payments/mercadopago/mercadopago-pix-charge.service.ts:27`, 10+ consumers) | **KEPT** | Canonical adapter. Orphan duplicate below is delete-on-sight. |
| **Coupon-at-order** | `CheckoutCoupon` (`RAC_CheckoutCoupon`, schema:3178) + `validateCouponHelper` (`checkout/checkout-catalog.helpers.ts:79`) | **KEPT** | The only coupon priced at order time; enforces `minOrderValue`/`appliesTo`/`discountAmount`. `ProductCoupon` migrates onto it (mid-migration #8). |
| **Product CRUD** | `ProductService` (`products/product.service.ts:39`) | **KEPT** | The only product write stack that emits `mind.product.observed` + `AuditService` + `MindEventSpine`. `CheckoutProductService.createProduct` bypasses all three — products created via checkout are invisible to cognition/audit. |
| **Plan / pricing (money)** | `CheckoutProductPlan` (`RAC_CheckoutProductPlan`, schema:2969, `priceInCents`) via `CheckoutProductService` (`checkout/checkout-product.service.ts:23`) | **KEPT** | The only plan model read by order pricing (`checkout-order-pricing.util.ts`). `ProductPlan.price` is never consulted at order time — see mid-migration #3 (P0). |
| **Tenant session/token** | `AuthTokenService` (`auth/auth.token.service.ts:29`) — key `jti:revoked:<jti>` | **KEPT** | The namespace `JwtAuthGuard` actually reads (`jwt-auth.guard.ts:92`). `AuthService.logout`'s `access-token-revoked:<jti>` write is dead — see DEPRECATED dead-write below (P0). |
| **TOTP/MFA engine** | `AccountMfaService` (`auth/account-mfa.service.ts:99`) | **KEPT, hoist target** | Identical engine duplicated in `AdminMfaService`; hoist the HOTP/codec math into `common/totp.ts`, both import. Secret encryption is already shared (`admin-crypto`). |

### OPEN MERGE DECISIONS — canonical declared, cut-over incomplete (P0/P1)

These are NOT settled aliases. A target is declared but the legacy surface is still load-bearing on read. **Do not delete the legacy table.**

| Concept | Canonical (target) | Legacy (still authoritative for) | Severity | Verdict |
|---|---|---|---|---|
| **Contact vs KloelLead** `[CRITIC #2]` | `Contact` (`RAC_Contact`, schema:399) — declared PERSON canonical | `KloelLead` (`RAC_KloelLead`, schema:1834) — still read by `LeadsService` (`kloel/leads.service.ts:86`) for `GET /kloel/leads/:workspaceId` and is the live backing store for the WhatsApp lead-processing path | **P1** | **MID-MIGRATION (open merge)** — see in-flight #6. Funnel state mirrored onto `Contact` via best-effort dual-write + `Contact.kloelLeadId` bridge, but cut-over is NOT complete. The CRM screen (reads `Contact`) and the leads-list screen (reads `KloelLead`) can disagree. |
| **Sale/Order/Payment split** | `CheckoutOrder` + `CheckoutPayment` | `KloelSale` (`RAC_KloelSale`, schema:1917, chat-driven revenue, double-orphaned from GMV); `Payment` (`RAC_Payment`, schema:2744, unowned raw webhook sink); `PhysicalOrder` (schema:2706, `saleId` no FK) | **P0** | **MIGRATED-in-progress.** `KloelSale` becomes a thin originator that ALWAYS materializes a `CheckoutOrder`. One Stripe webhook currently fans out to 3 tables → a record can be PAID in one and PENDING in another. `Payment` is DEPRECATED (below). |
| **Coupon model** | `CheckoutCoupon` (Int cents) | `ProductCoupon` (`RAC_ProductCoupon`, schema:2297, Float, `PERCENT`/`FIXED`) — divergent validate omits `minOrderValue`/`appliesTo` | **P0** | **MID-MIGRATION** — see in-flight #8. One-way sync only; enum spellings differ; silent Float→cents rounding. |
| **Memory KV store** | `MindMemory` (`RAC_MindMemory`, schema:3872) | `KloelMemory` (`RAC_KloelMemory`, schema:1711, `@deprecated`) — STILL source of truth, ~89+ `prisma.kloelMemory` callers | **P1** | **MID-MIGRATION** — see in-flight #1. Schema comment claiming `MindMemory` is "canonical-but-dead / ZERO writers" is **STALE** (2 writers + 2 readers exist). |
| **Unified message store** | `MindMessage` (`RAC_MindMessage`, schema:3849) | `KloelMessage` (brain), `ChatMessage` (dashboard thread), `KloelConversation` (lead funnel), `Message` (`RAC_Message`, omnichannel) — all 4 de-facto canonical per surface | **P1** | **MID-MIGRATION** — see in-flight #2. `MindMessage` is **canonical-but-DEAD-on-read**: flag-gated writers, ZERO readers. Schema comment claiming "ZERO writers" is STALE. |
| **Workspace invitation** | (UNDECIDED — pick one) | `Invitation` (schema:1286, richer flow: email + accept→create-`Agent`) vs `CollaboratorInvite` (schema:2768, better schema: status enum + `invitedBy`) | **P1** | **OPEN DECISION.** Two co-equal models+services (`TeamService.inviteMember` vs `PartnershipsService.inviteCollaborator`). Merge into one taking `Invitation`'s flow + `CollaboratorInvite`'s columns. |

### DEPRECATED — superseded, retire once the bar clears

| Surface | Superseded by | Severity | Evidence-of-non-use bar (must be empty before delete) |
|---|---|---|---|
| **`access-token-revoked:<jti>` Redis write** in `AuthService.logout` (`auth.service.ts:329`) | `AuthTokenService.revokeAccessToken` (key `jti:revoked:<jti>`) | **P0** | No reader of `access-token-revoked:` namespace exists (`grep -rn "access-token-revoked"`); repoint `logout` to `revokeAccessToken`, delete the bespoke set. Bar: logged-out access JWT is rejected by a regression test. |
| **`MercadoPagoPixService`** (`checkout/mercado-pago-pix.service.ts:146`) | `MercadoPagoPixChargeService` | **P2** | ORPHAN — not registered in `checkout.module.ts`; only its own 2 spec files import it. Bar: `grep -rn "MercadoPagoPixService" backend/src --include=*.ts | grep -v spec | grep -v mercado-pago-pix.service.ts` returns empty. Then delete service + 2 specs (~12KB). |
| **`KloelGlobalPriorService`** (`kloel/kloel-global-prior.service.ts:32`) + its `kloel.module.ts` provider registration | `MindGlobalPriorService` | **P2** | `@deprecated`; appears ONLY in `kloel.module.ts` provider arrays (lines 443, 560), **ZERO constructor injectors** (verified — the only in-constructor match is its own `logger` line). Replacing bridge methods already wired into `MindPolicyService.mixWithGlobalPrior`. Bar: remove the 2 provider registrations, confirm DI graph builds. `RAC_KloelGlobalPrior` table drop is owner-gated. |
| **`MindPredictionService.runCycle`** shadow loop (`mind/mind-prediction.service.ts:51`) | `MindService.tick` + `MindEventProcessorService` | **P0** | Persists NOTHING to `RAC_MindPrediction`; in-memory `activePredictions[]` lost on restart; linear `surprise=confidence`. Bar: either make it persist to `RAC_MindPrediction` and use `MindSurpriseService.computeSurprise`, or delete the loop. |
| **`AuthPasswordService`** (`auth/auth.password.service.ts:36`) | `auth-service.register-login.ts` standalone functions | (hygiene) | ORPHAN — never injected, absent from `auth.module.ts`. Bar: confirm no provider/injector references, delete. |
| **`MessengerService.sendTextMessage`** (`channels/messenger/messenger.service.ts:12`) | `FacebookMessengerService.sendMessage` (persists `FbMessage`, full webhook processing) | **P1** | Same Meta `${pageId}/messages` endpoint, NO persistence. Bar: route both `ChannelKind.MESSENGER`/`FACEBOOK` through one page-messaging service; verify FB inbound isn't double-persisted into both `RAC_Message` and `RAC_FbMessage`. |
| **`Payment`** (`RAC_Payment`, schema:2744) | `CheckoutOrder` + `CheckoutPayment` | **P0** | Unowned raw webhook sink (writers: `mercadopago-webhook.controller.ts`, `payment-webhook-generic.helpers.ts`, `payment-webhook-stripe.handlers2.helpers.ts`; NO `@Injectable` owner). Bar: repoint webhook helpers to one canonical resolver, confirm zero readers besides webhook helpers, then drop `RAC_Payment`. |
| **`ProductPlan.checkoutImages.orderBump` JSON** (via `PlanService.setOrderBump`, `plan.service.ts:419`) | typed `OrderBump`/`Upsell` tables (schema:3132/3154) | **P1** | JSON variant never read by checkout pricing — merchant edits never surface on the actual checkout. Bar: stop writing the JSON slot, migrate data into typed rows. |
| **`ProductPlan.aiConfig` JSON** (schema:2261) | `ProductAIConfig` table (schema:2394) + `services-v2/product-ai-config.service.ts` | **P2** | No reader-consistency guarantee between the two. Bar: migrate JSON into typed table, confirm single reader. |
| **`Product.metadata.pixels` + `ProductCampaign.pixelId`** | `CheckoutPixel` table (fired by `checkout/facebook-capi.service.ts`) | **P2** | Only `CheckoutPixel` is fired at checkout. Bar: consolidate or explicitly document the other two as attribution-only. |
| **Duplicate `MetaWebhookController`** (`meta/meta-webhook.controller.ts:46`, log-only, aliased `MetaCoreWebhookController`) | shared HMAC-verify + Redis-NX + `WebhookEvent`-dedup util; one thin handler each | **P2** | Two same-named controllers collide in `meta.module.ts`. Bar: extract the verify util, rename one class, unify verify-token env precedence. |

---

## In-flight migrations (MID-MIGRATION — NOT converged)

`[CRITIC #5]` These nine windows are **open**. The canonical target exists but is not yet load-bearing on read (or not yet backfilled). **Treat the legacy surface as still authoritative. Do not delete it, and do not flip a dual-write flag ON without first landing the reader path** — a write-only dual-write is pure cost + silent divergence.

Ordered by safety + value (lowest-risk / highest-leverage first).

### 1. KloelGlobalPrior → MindGlobalPrior — **near-complete, safest**

| | |
|---|---|
| From → To | `RAC_KloelGlobalPrior` (`@deprecated`) + `KloelGlobalPriorService` → `RAC_MindGlobalPrior` + `MindGlobalPriorService` |
| Flag | (none — service already wired; legacy has zero injectors) |
| State | Replacing bridge methods wired into `MindPolicyService.mixWithGlobalPrior`. `KloelGlobalPriorService` is **dead** (zero constructor injectors, verified). |
| Next step | Drop the service + its 2 `kloel.module.ts` provider registrations. Table drop owner-gated. |
| **Required tests** | DI graph builds with provider removed; `MindGlobalPriorService.mixWithGlobalPrior` returns the same blended prior the bridge methods produce (regression on `mind/memory/mind-global-prior.service.ts`). |

### 2. Instagram DM send → canonical dispatch — **flag landed, low-risk**

| | |
|---|---|
| From → To | `InstagramMarketingService.sendDirectMessage` raw `InstagramService.sendMessage` → `ChannelMessageDispatchService` via `InstagramDispatchAdapter` |
| Flag | `instagram-canonical-dispatch.flag` (`isInstagramCanonicalDispatchEnabled`, `marketing/instagram/instagram-canonical-dispatch.flag.ts:37`; gate at `instagram-marketing.service.ts:288`) |
| State | Flag-gated delegation landed (commit `a38949d94`). Raw fallback dead once flag permanently ON. |
| **Required tests** | With flag ON, IG DM routes through `InstagramDispatchAdapter` (assert `ChannelMessageDispatchService.dispatch` called, raw path not hit); with flag OFF, raw path still works (no regression during rollout). |

### 3. BrainRuntimeService → MindRuntime (DI rename) — **scheduled-for-removal shim**

| | |
|---|---|
| From → To | `BrainRuntimeService` alias + `kloel/brain-runtime.service.ts` shim → `MindRuntime` (`mind/coordination/mind-runtime.service.ts:52`, re-exported `export { MindRuntime as BrainRuntimeService }` at line 438) |
| Flag | (none — ADR-0013 Wave M1 4-week alias window) |
| State | Compatibility layer; remove once DI tokens migrate. |
| **Required tests** | All injectors resolve `MindRuntime` directly; removing the alias export and shim leaves the DI graph buildable (compile-time + module-init test). |

### 4. Channel transport: legacy guarded providers → canonical dispatch adapters

| | |
|---|---|
| From → To | `kloel/channel-transport.providers.ts` `provider.send` bodies → `marketing/channels/*-dispatch.adapter` (`ChannelDispatchPort`) via `ChannelDispatchRegistry` |
| Flag | `KLOEL_TRANSPORT_CANONICAL_DELEGATE` (default **OFF**; `channel-transport-canonical-delegate.flag.ts`; **EXCLUDES email + tiktok**) |
| State | Default OFF → the guarded path mostly runs DUPLICATE legacy provider bodies. **Email excluded** because `EmailChannelTransport` uses a different delivery mechanism (`EmailCampaignService`) — a behavior-change risk that blocks delegation (`canDelegate` exclusion at `channel-transport.registry.ts:169`). |
| Blocker to resolve first | The `EmailChannelTransport` mechanism divergence (it changes delivery behavior). |
| Next step | Resolve email mechanism split → flip default ON → legacy `provider.send` bodies become dead → collapse `*ChannelTransport` into thin guard-only decorations; collapse the two `ChannelSendResult`/`ChannelCapability` DTOs (port-side OPTIONAL vs transport-side REQUIRED). |
| **Required tests** | With flag ON, each channel (WhatsApp/IG/Messenger/TikTok) delegates to its `*-dispatch.adapter` and the `MindGuard`+audit decorator still fires; email delivery parity test BEFORE including email in delegation; `ChannelSendResult` shape parity across the two registries. |

### 5. ProductPlan.price (Float) → CheckoutProductPlan.priceInCents (P0 — merchant edits a price with no commercial effect)

| | |
|---|---|
| From → To | `RAC_ProductPlan.price` Float (+ additive nullable `priceInCents`) → `RAC_CheckoutProductPlan.priceInCents` (the only plan read by order pricing) |
| Flag | (none — PHASE A additive-column migration) |
| State | **Half-done.** `ProductPlan.priceInCents` populated ONLY by `PlanService.create`. `ProductPlanController` (`kloel/product-sub-resources/product-plan.controller.ts:83`) + chat tools (`kloel-product-sub-resource-tools.service.ts:107`) do **NOT** dual-write it. A merchant editing `ProductPlan.price` via those paths has NO commercial effect because pricing reads `CheckoutProductPlan` only. |
| Next step | Backfill `ProductPlan.priceInCents = price*100` for all rows → route `ProductPlanController` + `KloelProductSubResourceToolsService` writes through `CheckoutProductService` → demote `ProductPlan.price` to read-through or retire. |
| **Required tests** | Order pricing reflects a price edited via `ProductPlanController` and via the chat tool (currently fails — this is the bug); backfill correctness (`priceInCents == round(price*100)`); `checkout-order-pricing.util.ts` remains the single reader. |

### 6. Lead funnel: KloelLead → Contact (PERSON migration) — open P1 merge `[CRITIC #2]`

| | |
|---|---|
| From → To | `RAC_KloelLead` funnel columns (`status/stage/lastMessage/lastIntent/totalMessages/score`) → `RAC_Contact` mirror columns (`leadStatus/leadStage/...`, schema:426-430) + `Contact.kloelLeadId` bridge |
| Flag | (none — **no dedicated `*.flag.ts` file**) — best-effort fail-open dual-write is implemented directly across the 3 lead services (`kloel-lead-processor.service.ts`, `lead-mind-coordinator.service.ts`, `whatsapp-mind-coordinator.service.ts`) + `person-kloel-lead-to-contact.backfill.*` |
| State | **MID-MIGRATION.** Additive columns + backfill landed; cut-over incomplete — `LeadsService` (`kloel/leads.service.ts:86`) still reads `KloelLead` while `CrmService` reads `Contact`. Dual-write can silently drift; the two screens can disagree. **This is an open merge decision, NOT a settled alias.** |
| Aggravating factors (P0) | Phone-normalization divergence fragments identity (`CrmService` BR-promoting vs `CheckoutSocialLeadService` digits-only vs raw-JID in `WhatsAppMindCoordinator`); `processWhatsAppMessageWithPayment` looks up `KloelLead` by RAW `senderPhone` (`kloel-lead-processor.service.ts:285`) while the lead was created normalized → payment link silently not generated (lost revenue). |
| Next step | Normalize phone at the channel boundary via `phone-normalization.util.ts:150` → fix the raw lookup at `:285` → make `KloelLead` funnel state read-through from `Contact` → repoint `LeadsService` to `Contact` (fix the stale `frontend/src/lib/api/leads.ts:4-12` docstring that already claims Contact-backing) → activate the **orphan** `ContactIdentityMergeService` (`contacts/contact-identity-merge.service.ts:19`, zero production callers) to reconcile fragmented rows → retire `RAC_KloelLead`. |
| **Required tests** | Payment link fires for a `(11) 98765-4321`-format sender (regression for the `:285` bug); CRM screen and leads-list screen show identical funnel state for the same person; `ContactIdentityMergeService.mergeContacts` re-points relations + writes `ContactIdentityLink`; dual-write parity (no drift between `KloelLead` and `Contact` mirror). |

### 7. KloelMemory → MindMemory (KV/semantic memory) — split-brain risk

| | |
|---|---|
| From → To | `RAC_KloelMemory` (schema:1711, source of truth, ~89+ callers) → `RAC_MindMemory` (schema:3872, canonical target) |
| Flag | `KLOEL_MINDMEMORY_DUALWRITE` (default **OFF**; `mind-memory-item.service.ts:96`) |
| State | **MID-MIGRATION.** 2 writers (`mind-memory-item` upsert, `kloel-memory-engine` upsert) + 2 readers (`kloel-memory-engine.service.ts:232/282/192` findMany) exist; **NO backfill**. Schema "canonical-but-dead / ZERO writers" comment is **STALE** — correct it. Split-brain if a key is written to one and read from the other. |
| Next step | Backfill `RAC_KloelMemory` → `RAC_MindMemory` → repoint the ~89 `prisma.kloelMemory` callers through `MindMemoryItemService` → flip dual-write ON, verify parity → cut reads fully to `RAC_MindMemory`. |
| **Required tests** | A memory item written under dual-write is byte-identical in both tables; reader returns the same item regardless of source (no split-brain); backfill covers all `RAC_KloelMemory` rows; correct the stale schema comment (doc test optional). |

### 8. ProductCoupon → CheckoutCoupon (coupon canonicalization) — P0 divergent validate

| | |
|---|---|
| From → To | `RAC_ProductCoupon` (Float, `PERCENT`/`FIXED`) → `RAC_CheckoutCoupon` (Int cents, `PERCENTAGE`/`FIXED`) |
| Flag | (none — one-way `product-coupon-sync.util` via `syncWorkspaceCheckoutCouponForProduct`, `kloel/product-coupon-sync.util.ts:54`) |
| State | **MID-MIGRATION.** One-directional sync fires only on `ProductCoupon` controller writes; coupons created via `CheckoutCatalogService.createCoupon` have NO `ProductCoupon` row; divergent validate (`ProductCouponController.validate` omits `minOrderValue`/`appliesTo`/`discountAmount`); silent Float→cents rounding; two enum spellings. |
| Next step | Make `ProductCouponController.validate` delegate to `validateCouponHelper` → make `ProductCoupon` writes always upsert `CheckoutCoupon` → unify enum spelling at the model → store cents on both to kill the rounding round-trip. |
| **Required tests** | `ProductCoupon` and `CheckoutCoupon` validate paths return identical accept/reject + discount for the same cart (incl. `minOrderValue`/`appliesTo`); no Float→cents rounding drift; enum spelling unified. |

### 9. Legacy message tables → MindMessage (unified store) — **canonical-but-DEAD-on-read, do NOT enable blindly**

| | |
|---|---|
| From → To | `RAC_KloelMessage` + `RAC_ChatMessage` + `RAC_KloelConversation` + `RAC_Message` → `RAC_MindMessage` (schema:3849, source discriminator `brain\|dashboard\|lead_conversation\|thread\|channel`) |
| Flag | `KLOEL_MINDMESSAGE_DUALWRITE` (default **OFF**) |
| State | **MID-MIGRATION, riskiest.** 4 flag-gated writers (`inbox.service.ts:60`, `chat.service.ts:86`, `kloel-thread.service.ts:79`, `kloel-lead-processor-helpers.ts:161`) but **ZERO readers** (`StateBuilderService.resolveShortTermMemory` + `KloelConversationStore` read `.items = prisma.kloelMessage`). **Enabling dual-write today = 2x write cost + silent divergence with NO benefit.** Schema "ZERO writers" comment is STALE. The per-surface dual-write helper is hand-rolled 4x — extract one `MindMessageDualWriteService.mirror(source, ...)`. |
| Next step (order matters) | (1) Wire ONE reader path (state-builder + conversation-store) onto `RAC_MindMessage` behind a READ flag. (2) Backfill the 4 source tables (incl. `KloelConversation`/`Message`). (3) Flip dual-write ON, verify parity. (4) Cut reads over. **Until (1)–(2), do NOT flip the write flag.** |
| **Required tests** | Reader path returns the same history window from `RAC_MindMessage` as from the legacy tables (parity per source discriminator); `MindCanonicalService.getConversationHistory` window semantics preserved; extracted `MindMessageDualWriteService.mirror` fail-open behavior (a mirror failure never breaks the primary write); backfill completeness across all 4 sources. |

---

## Convergence backlog (non-migration canonicalizations)

Same-capability duplicates that converge onto a KEPT surface (no dual-write window; these are refactors, not migrations). Ordered by severity.

| Capability | Converge onto | Drifted surfaces | Severity | Required tests |
|---|---|---|---|---|
| Request→`workspaceId` resolution (IDOR) | `resolveWorkspaceId` (`auth/workspace-access.ts:119`, token-verified) | `kloel-security.guard.ts:45` (ignores JWT), `common.helpers.ts:20` (yields `''`), `route-class.guard.ts:25` (trusts header — keep for throttle keying only). `partnerships.controller.ts:45` already converged. | **P0** | Cross-tenant request with mismatched `workspaceId` is `Forbidden`; throttle keying still works off the header. |
| Phone normalization at Contact/KloelLead write | `normalizePhone()` (`common/phone/phone-normalization.util.ts:150`, BR-promoting) | `CheckoutSocialLeadService` digits-only (aliased `normalizePhone`), `crm.deals.helpers` raw, `scrapers.service` raw, `WhatsAppMindCoordinator` raw JID | **P0** | One human via 3 entry formats yields ONE `Contact` row; remove the misleading `import digitsOrNull as normalizePhone` alias. |
| Checkout payment capture (revenue silos) | `CheckoutPaymentService.capture` | `SalesService`→`KloelSale`, `kloel/PaymentService`+`SmartPaymentService`→`KloelSale` | **P0** | Every `KloelSale` confirm materializes a `CheckoutOrder`+`CheckoutPayment`; one webhook updates ONE canonical row; `KloelSale` revenue appears in `admin gmv.query` + `dashboard.service` GMV. |
| Cognitive-loop unification | `MindService.tick` + `MindEventProcessorService` | `MindPredictionService.runCycle` (non-durable), `MindBackgroundProcessor.tick`, `MindEventIngestor.tickAllWorkspaces` | **P0** | Learning state survives restart; one surprise unit (`MindSurpriseService.computeSurprise`) drives self-modification thresholds. |
| Conversation-history read | `MindCanonicalService.getConversationHistory` (take=50, asc) | 5 other callers with take=20/30/50, divergent order/projection | **P1** | All callers return the same window for an explicit window param. |
| Cross-channel identity resolution | `ContactIdentityResolverService.resolve` | `OmnichannelContactResolutionService.resolveFromMessage` (bypasses cross-channel match) | **P2** | Inbound message merges into an existing verified contact instead of creating a synthetic-phone duplicate. |
| `recordCase` capability | `MindCaseMemoryService.recordCase` | direct `prisma.mindCase.create` in `MindMultiModalPerceptionService:103` + `MindCanonicalService:105` | **P2** | Both bypasses route through `recordCase` (token extraction/dedup not skipped). |
| Event spine sink | `RAC_MindOutboxEvent` (idempotent) | generic events landing in `RAC_AutopilotEvent` (no idempotency); `MindPerceptionService` reads percepts back out of `AutopilotEvent` | **P1** | Generic brain/cognition events are idempotent + dispatchable; perception read path moved with the writes. |
| Member enrollment | `MemberEnrollmentsController.enrollStudent` (emits `member.enrolled` + shared stats) | `CheckoutPostPaymentEffectsService.autoEnrollInMemberAreas` (no event, inline stats, re-keys by email) | **P1** | Auto-enroll on payment emits `member.enrolled` + `MemberAreaStatsService.recalculate`; enrollment links to `CheckoutOrder.customerEmail`. |
| Cart/abandonment recovery | one Recovery scheduler keyed on `Contact` | `kloel/CartRecoveryService` (30min, `CheckoutOrder` PENDING) + `checkout/CheckoutSocialRecoveryService` (10min, `CheckoutSocialLead`) | **P1** | A person who is both a PENDING order and a social lead is recovered ONCE. |
| Append-only money ledger | one `SharedLedger` interface | `LedgerService`, `MarketplaceTreasuryService`, `kloel/WalletLedgerService`, `PrepaidWalletTransaction` self-ledger | **P1** | All four carry `balanceAfter`; `WalletAnticipation` Float→BigInt cents; reconcile/mature share one impl. |
| `WalletService` name collision | rename to `SellerWalletService` / `PrepaidWalletService` | `kloel/wallet.service.ts:49` vs `wallet/wallet.service.ts:73` (same class name, different tables) | **P1** | Both renamed with new provider tokens; injectors resolve the intended class (wrong-import bug is silent today). |
| Admin vs tenant auth core | extract shared credential/MFA/session core into `common/` | `AdminAuthService`/`AdminMfaService`/`AdminSessionFactory` duplicate the tenant stack | **P1** | A security fix (e.g. the P0 revocation bug) propagates to both stacks from one place. |
| Token-at-rest policy | sha256(token) for all bearer tokens | `RefreshToken.token` + `PasswordResetToken.token` PLAINTEXT (schema:1155/1184); `AdminSession`/`MagicLinkToken` already hashed | **P1** | Tokens stored hashed; query-by-hash works; a DB read leak no longer exposes live tokens. |
| ApiKey validation (DoS) | indexed `lookupHash` column | `ApiKeysService.validateKey` O(n) `findMany(take:1000)` + PBKDF2 per row | **P1** | `WHERE lookupHash = sha256(rawKey)` then single PBKDF2 verify; constant-time secret compare preserved. |

---

## Appendix: surfaces explicitly NOT deprecated (anti-false-positive)

| Surface | Why it is KEPT (not dead) |
|---|---|
| `campaign-jobs` queue + `campaignWorker` (`worker/campaign-processor.ts:147`) | `[CRITIC #4]` LIVE worker in the separate `worker/` deployable. |
| `voice-jobs` queue + `voiceWorker` (`worker/voice-processor.ts:253`) | `[CRITIC #4]` LIVE worker. |
| `media-jobs` queue + `mediaWorker` (`worker/media-processor.ts:15`) | `[CRITIC #4]` LIVE worker. |
| `OpsEvent` / `OpsAlertService` | `[CRITIC #3]` LIVE — distinct from the cognitive spine. |
| `RiscEvent` / `ComplianceService.routeRiscEvent` | `[CRITIC #3,#6]` LIVE + processed — NOT an ingest-only stub. |
| `WhatsappSessionService` | `[CRITIC #1]` The REAL channel-session surface; `ChannelSession` does not exist. |
| `KloelLead` (`RAC_KloelLead`) | `[CRITIC #2]` Still authoritative for `LeadsService` reads; an open merge, not deletable until cut-over completes. |
| Five wallet/ledger systems | Each is a genuinely different actor's money (seller / prepaid usage / Connect / house treasury / receivable) — keep separate, share one ledger abstraction. |
| Three `*LongTermMemory*`/consolidation services | Different stores/triggers (`RAC_MindGraphNode` facts vs `RAC_MindCase`→belief vs bg-substrate). Keep all three; rename to remove the naming trap. |

**Genuinely questionable (audit, not yet deprecated):** `backend/src/mass-send/*` — the only send surface without a confirmed live worker `[CRITIC #4]`.
