# Kloel Canonical Vocabulary

> **Mission deliverable #2** of the Architectural Semantic Canonicalization
> effort. Evidence-based dictionary mapping every load-bearing domain term to
> its canonical name, its still-allowed deprecated aliases, and the narrow
> conditions in which each variant is permitted.
>
> All rows are grounded in real artifacts inside this repository:
> `backend/prisma/schema.prisma`, `backend/src/**`, `frontend/src/lib/api/**`,
> and the ADR / plan documents under `docs/`.
>
> Companion docs (read together):
>
> - [CANONICAL_VOCABULARY_FAMILY_GLOSSARY.md](./CANONICAL_VOCABULARY_FAMILY_GLOSSARY.md) — long-form per-family disambiguation.
> - [CANONICAL_DOMAINS.md](./CANONICAL_DOMAINS.md) — bounded contexts that own each term.
> - [DEPRECATION_MAP.md](./DEPRECATION_MAP.md) — symbol-level removal deadlines.
> - [BRAIN_MIND_UNIFICATION_PLAN.md](./BRAIN_MIND_UNIFICATION_PLAN.md) — staged Mind dissolution of Brain.
> - [MIND_SERVICES_CANONICAL.md](./MIND_SERVICES_CANONICAL.md) — Mind service surface.

---

## 1. How to read this file

- **Canonical** is the single name new code MUST use.
- **Deprecated aliases** are names observed in production code that map to the
  canonical concept. They are still live in the runtime; do not rename without
  an ADR-tracked migration.
- **When deprecated still allowed** is the explicit carve-out — outside that
  carve-out the alias is a soft-warning violation that the
  `npm run check:canonical-vocabulary` gate will flag.
- **Backend reference** is the file:line where the canonical or alias is
  declared in code or schema. Frontend references are listed alongside when
  the term also lives there.

The current canonical-vocabulary gate is held at **≤560 soft warnings, 0 hard
violations** (see Wave 54 status at the bottom of this file). Any change that
raises soft warnings without an entry here is rejected by CI.

---

## 2. Canonical Vocabulary table (entity terms)

| Canonical | Deprecated aliases | When deprecated still allowed | Backend reference file |
|---|---|---|---|
| `Workspace` | `Tenant`, `Org`, `Account`, `tenantId`, `workspace context` | `Account` for external provider entities only — Stripe Connect (`ConnectAccountBalance`), Meta Ad Account, bank account; `Tenant` only inside doc comments / test fixture names (e.g. `'Tenant WS'` in `backend/src/marketing/marketing-connect/email-connect.service.spec.ts`); never as a Prisma model name | `backend/prisma/schema.prisma` — `model Workspace` |
| `User` (auth identity) | `AdminUser`, `Operator`, `Member` | `AdminUser` is a distinct admin-panel Prisma model (`model AdminUser`) and must stay separate from workspace users; `Member` may be used as a role label inside `Workspace.members`; `Operator` is forbidden in new code | `backend/prisma/schema.prisma` — `model AdminUser`; auth payload in `backend/src/auth/**` |
| `Agent` (workspace user) | `User` (when referring to operator), `Member`, `Collaborator` | `Member` only as a join-table semantic; `Collaborator` only inside `CollaboratorInvite` (canonical invitation model); `User` allowed inside JWT payload fields (`userId`) because the field name is wire-format canonical | `backend/prisma/schema.prisma` — `model Agent` |
| `Contact` | `Lead` (as person), `Customer` (as person), `Client` (as person), `Prospect`, `User` (in messaging), `buyer` | `Lead` only as funnel-stage label (`KloelLead`, CRM pipeline stage); `Customer` only as denormalized snapshot fields on `CheckoutOrder.customer*`; `Client` only as `@prisma/client` import or `resolveClientIp` infra; `buyer` is legacy and must migrate (see `mercado-pago-pix.service.ts`); `Prospect` is doc-comment only | `backend/prisma/schema.prisma` — `model Contact` |
| `Lead` (CRM stage) | `Prospect`, `PotentialClient`, `socialLead`, `capturedLead` | `Lead` as Prisma entity exists only as `KloelLead` (AI-scored funnel record) and `CheckoutSocialLead` (pre-checkout social auth capture). Both are funnel-stage state, never standalone identity — they link back to `Contact.id`. `socialLead` is informal shorthand allowed in checkout controllers only | `backend/prisma/schema.prisma` — `model KloelLead`, `model CheckoutSocialLead` |
| `Customer` | (no canonical entity; do not introduce) | Allowed only as: (a) denormalized fields on `CheckoutOrder.customerName/customerEmail/customerCPF/customerPhone`; (b) `Workspace.stripeCustomerId` for billing; (c) `Stripe.Customer` external SDK type; (d) admin-view projections (`list-transactions.types.ts`). NEVER a Prisma model | denormalized fields only — `backend/prisma/schema.prisma` — `model CheckoutOrder` |
| `Conversation` | `Thread`, `Chat`, `kloelConversation`, `chatThread` | `ChatThread` is a distinct Prisma model used for the admin/dashboard chat UI surface (not customer-facing); `KloelConversation` is the legacy Brain conversation log tied to `KloelLead` (subject to ADR-0013 Mind unification); `Thread` allowed only as field name inside `ChatThread`. New customer-channel work uses `Conversation` | `backend/prisma/schema.prisma` — `model Conversation` |
| `Message` (channel message) | `KloelMessage`, `MindMessage`, `ChatMessage`, `FbMessage`, `PartnerMessage`, `AdminChatMessage` | Each is a separate Prisma model with a distinct lifecycle: `KloelMessage` = Brain runtime log (will alias to `MindMessage` per Section 6); `ChatMessage` = admin/dashboard chat thread message; `FbMessage` = Facebook DM ingest; `PartnerMessage` = partner-side comms; `AdminChatMessage` = staff chat. `Message` canonical applies only to customer channel messages tied to `Conversation` | `backend/prisma/schema.prisma` — `model Message` |
| `ChannelSession` | `whatsappSession`, `waSession`, `whatsappApiSession`, `connection` (session), `instance` (session), `botSession`, `WAHASession` | `whatsappApiSession` is the live JSON field name on `Workspace.providerSettings` — acceptable at data layer; `WhatsappSessionService` is the canonical NestJS service name at code layer; `connection` allowed only for TCP/socket-level talk; `instance` allowed only for process-lock semantics (watchdog); `waSession` is local-variable legacy and must migrate; `botSession` / `WAHASession` are dead aliases (no current code references) | runtime via `backend/src/kloel/whatsapp/whatsapp-session.service.ts`; data via `providerSettings.whatsappApiSession` on `model Workspace` |
| `Channel` (messaging surface) | `Provider`, `Connection`, `Integration`, `Source` | `Provider` allowed for the transport implementation behind a channel (WAHA vs Meta Cloud API); `Connection` allowed only for `MetaConnection` (OAuth-level entity, distinct from runtime session) and `MailboxConnection` (IMAP/SMTP); `Integration` is its own Prisma model for third-party app installs and is NOT a channel alias; `Source` allowed only as the `Contact.source` field | `backend/prisma/schema.prisma` — `model ChannelConfig`, `model ChannelSetup`, `model ChannelIdentifier`, `model ChannelProduct`, `model ChannelArsenal`, `model MetaConnection`, `model Integration` |
| `Order` | `Sale`, `Purchase`, `Transaction` (as entity) | `KloelSale` is the legacy AI-attributed sale ledger (workspaceId + leadId + amount); `CheckoutOrder` is the canonical purchase record from the checkout flow; `PhysicalOrder` and `UpsellOrder` are distinct lifecycle entities and remain. `Transaction` allowed only for ledger/wallet entries (`KloelWalletTransaction`, `PrepaidWalletTransaction`). `Sale` allowed only inside `backend/src/sales/**` and admin transactions surface | `backend/prisma/schema.prisma` — `model CheckoutOrder`, `model KloelSale`, `model PhysicalOrder`, `model UpsellOrder` |
| `Checkout` | `Cart`, `Purchase` (as process), `Order` (as flow) | `Checkout` names the payment-flow experience (`CheckoutConfig`, `CheckoutOrder`, `CheckoutPayment`, `CheckoutPlanLink`, `CheckoutProductPlan`, `CheckoutCoupon`, `CheckoutPixel`, `CheckoutSocialLead`); `Cart` not used as a Prisma model — KLOEL has no cart, only one-product checkouts. `Purchase` allowed only as informal user-facing copy | `backend/prisma/schema.prisma` — `model CheckoutOrder`, `model CheckoutConfig`, `model CheckoutPayment` |
| `Plan` | `Subscription`, `Membership`, `Product` (when pricing) | `Subscription` is a distinct Prisma model for KLOEL platform billing (`model Subscription`, `model CustomerSubscription`); `Plan` (`model ProductPlan`) is the per-product pricing variant inside the merchant's catalog; `Membership` allowed only for `MemberArea`/`MemberEnrollment` | `backend/prisma/schema.prisma` — `model ProductPlan`, `model Subscription`, `model CustomerSubscription` |
| `Product` | `Item`, `SKU`, `Goods` | All forbidden. Sellable unit is always `Product` (`model Product`) regardless of fulfillment (digital, physical, service). `SKU` allowed only as a field name on `PhysicalOrder` inventory entries | `backend/prisma/schema.prisma` — `model Product`, `model ProductPlan`, `model ProductCheckout`, `model ProductCommission`, `model ProductCoupon`, `model ProductUrl`, `model ProductReview`, `model ProductAIConfig`, `model ProductCampaign` |
| `Pipeline` (CRM funnel) | `Funnel`, `Stage` (as pipeline), `Board` | `Stage` is a distinct entity (`model Stage`) — a column within a Pipeline; `Funnel` allowed only inside marketing copy and the unbuilt `Funnels` page (Tier-3 fachada per CLAUDE.md); `Board` is forbidden | `backend/prisma/schema.prisma` — `model Pipeline`, `model PipelineState`, `model Stage`, `model Deal` |
| `Webhook` | `Hook`, `Callback`, `Notification`, `IncomingEvent` | `Notification` allowed only for in-product user notifications (push, in-app); `Callback` allowed only for OAuth callback routes; `Hook` and `IncomingEvent` are forbidden | `backend/prisma/schema.prisma` — `model WebhookEvent`, `model WebhookSubscription` |

---

## 3. Service & architecture vocabulary

| Canonical | Deprecated aliases | When deprecated still allowed | Backend reference file |
|---|---|---|---|
| `MessageDispatchService` | `WahaService.sendMessage`, `WhatsappApiService.sendText`, `MessageWorker.process` (direct) | All allowed as provider-internal hops; new product code MUST go through `MessageDispatchService` | `backend/src/inbox/**`, `backend/src/whatsapp/**` |
| `ChannelTransportRegistry` | `ProviderRegistry`, `ChannelAdapter` | Forbidden in new code | `backend/src/kloel/**` |
| `SpineEmitterService` / `Spine` | `EventBus`, `MessageBus`, `EventEmitter2.emit` | EventEmitter2 still used inside `backend/src/products/product.service.ts:107` and `backend/src/plans/plan.service.ts:120` — flagged in `DEPRECATION_MAP.md#17`, +8wk migration | `backend/src/kloel/mind/coordination/mind-event-spine.service.ts` |
| `Mind*` (cognitive prefix) | `Brain*`, `AI*`, `ML*`, `Intelligence*` | `Brain*` allowed only on legacy services that still have a `Mind*` re-export shim — see `DEPRECATION_MAP.md` items #2-#10 (10 services, ADR-0013 +4wk deadline); after that date all `Brain*` paths fail the gate. See Section 6 for full status | `backend/src/kloel/mind/**` (canonical); `backend/src/admin/brain/**` and `backend/src/kloel/whatsapp-brain.controller.ts` (legacy alive) |
| `Capability` | `Skill`, `Action`, `Tool` (executor context) | `Tool` allowed only for LLM tool-call payloads (e.g., `agent-tools.ts`); `Action` allowed only inside ad-rules engine (`model AdRule`) | `backend/src/kloel/mind/coordination/mind-capability-registry.service.ts` |
| `Outbox` | `EventLog`, `AuditTrail` (when durable event) | `AuditLog` is its own Prisma model for compliance/audit trail and must not be conflated with Outbox; `EventLog` forbidden | `backend/prisma/schema.prisma` — `model MindOutboxEvent`; also `model AuditLog` (distinct) |
| `DomainService` | `Service` (generic) | `Service` suffix allowed for infrastructure (`PrismaService`, `HttpService`); `DomainService` suffix preferred when the class owns business invariants | `backend/src/**` |

---

## 4. Data / cognitive state vocabulary

| Canonical | Deprecated aliases | When deprecated still allowed | Backend reference file |
|---|---|---|---|
| `Belief` | `Probability`, `Confidence`, `Score` (cognitive) | `score` allowed as plain numeric on `KloelLead.score`, `MindConceptDetection.confidence`; in cognitive-loop logic always use `MindBelief` | `backend/prisma/schema.prisma` — `model MindBelief` |
| `Prediction` | `Forecast`, `Projection` | Forbidden in cognitive context; allowed as analytics copy only | `backend/prisma/schema.prisma` — `model MindPrediction` |
| `Percept` | `Observation`, `Signal`, `Event` (raw) | `Event` is broader (Spine); `Signal` allowed for non-cognitive integration signals (Meta pixel signals, `Workspace.providerSettings` heartbeats) | `backend/src/kloel/mind/**` |
| `Valence` | `Sentiment`, `Tone`, `Polarity` | `sentiment` allowed only on `KloelConversation.sentiment` legacy field — flagged for migration | `backend/src/kloel/mind/**` |
| `BanditArm` | `Variant`, `Option`, `Strategy` | `variant` allowed for `ProductPlan` UI variants only | `backend/prisma/schema.prisma` — `model MindBanditArm` |
| `Ledger` | `Statement`, `Account` (transactions) | `Statement` allowed for user-facing PDFs; `Account` allowed only for Stripe Connect entity (`ConnectAccountBalance`) | `backend/prisma/schema.prisma` — `model ConnectLedgerEntry`, `model KloelWalletLedger`, `model MarketplaceTreasuryLedger` |
| `Wallet` | `Balance`, `Funds`, `Account` (money) | `KloelWallet` is the legacy AI-merchant wallet; `PrepaidWallet` is the prepaid platform wallet — both canonical for their context. `Balance` allowed only as a sub-field | `backend/prisma/schema.prisma` — `model KloelWallet`, `model PrepaidWallet`, `model ConnectAccountBalance` |

---

## 5. Identity / auth boundary clarifications

These pairs caused real bugs in the past — keep them sharply separated.

| Concept | Canonical | NOT to be confused with | Reason |
|---|---|---|---|
| Authenticated human operating KLOEL | `Agent` / `AdminUser` | `Contact` | `Agent` has login + workspace membership; `Contact` has a phone/email and is a messaging-side party only. Bug class: agent-vs-contact context bleed in inbox routing. |
| Person on the other side of a channel | `Contact` | `User` | `User` belongs to the auth domain. `Contact` belongs to the CRM/messaging domain. |
| OAuth integration | `MetaConnection` / `Integration` / `MailboxConnection` | `ChannelSession` | OAuth tokens are long-lived credentials; ChannelSession is a runtime live socket lifecycle. Confusing them caused QR-flow regression PR-class. |
| Stripe platform identity | `Workspace.stripeCustomerId` | `Customer` Prisma model | KLOEL has no Customer entity. Stripe Customer ID is just a field on Workspace for billing the merchant. |
| Merchant-side audience entity | `Contact` (+ `KloelLead` for funnel stage) | `Customer` | `CheckoutOrder.customer*` fields are denormalized snapshots, not a separate identity. |
| Order-side party | `CheckoutOrder.customer*` | `Contact.id` reference | A CheckoutOrder may have NO matching Contact in the workspace (anonymous social checkout). Do not assume FK joins. |

---

## 6. Mind vs Brain — status and rules

This section is the canonical status of the **Brain → Mind dissolution** work
declared in [ADR-0013](../adr/0013-kloel-mind-unification.md) and tracked in
[BRAIN_MIND_UNIFICATION_PLAN.md](./BRAIN_MIND_UNIFICATION_PLAN.md). It
incorporates findings from PI tasks **K61** (Mind canonical surface) and
**K66** (Brain re-export shims).

### 6.1 What is canonical today

- **Cognitive engine namespace**: `Mind*` is the canonical prefix for ALL
  cognitive-loop services (`MindBelief`, `MindPrediction`, `MindPolicy`,
  `MindBanditArm`, `MindCase`, `MindGraphNode`, `MindGuardAudit`,
  `MindDailyReport`, `MindWorkspaceState`, `MindOutboxEvent`,
  `MindConceptDetection`, `MindGlobalPrior`, `MindGraphEdge`). All 13 are
  live Prisma models with the `RAC_Mind*` table prefix.
- **Mind service surface**: `backend/src/kloel/mind/**` is the canonical home
  for the cognitive loop. The 10 coordinator services (`MindRuntime`,
  `MindEventSpine`, `MindCommercialGraph`, `MindCapabilityRegistry`,
  `MindCapabilityExecutor`, `MindAutonomyCoordinator`, `LeadMindCoordinator`,
  `WhatsAppMindCoordinator`, `MindMessageService`, `MindMemoryItemService`)
  are the canonical surface for any new code.
- **`MindMessage` is canonical**: `backend/src/kloel/mind/aliases/mind-message.service.ts`
  exposes `MindMessageService` and re-exports `type MindMessage = KloelMessage`.
  New code MUST call `MindMessageService` — it is a thin typed wrapper around
  the same Postgres rows that the legacy `prisma.kloelMessage.*` callers see.

### 6.2 What is deprecated-but-still-live

- **`KloelMessage` Prisma table** (`RAC_KloelMessage`) is the underlying
  storage. Phase 1 of the unification keeps the table untouched. A later PR
  (PR-5 in `BRAIN_MIND_UNIFICATION_PLAN.md`) will introduce
  `RAC_MindMessage` and a backfill — until then the table name `KloelMessage`
  is permitted at the data layer.
- **`Brain*` services** are live re-exports with `@deprecated` JSDoc. The 10
  services listed in `DEPRECATION_MAP.md` items #2 through #10 (e.g.
  `BrainRuntimeService`, `BrainEventSpineService`,
  `BrainCapabilityRegistryService`, `WhatsAppBrainService`, `CiaService`,
  `KloelLeadBrainService`) compile and run, but every call site is
  forbidden in new code and must be removed before the **ADR-0013 +4 weeks**
  deadline.
- **`backend/src/admin/brain/`** and **`backend/src/kloel/whatsapp-brain.controller.ts`**
  remain as admin-surface controllers. They forward to `Mind*` services
  internally; new admin endpoints should NOT add new `Brain*` controllers.

### 6.3 Hard rules

1. New Prisma models in the cognitive domain MUST use the `Mind*` prefix.
2. New NestJS services in the cognitive domain MUST live under
   `backend/src/kloel/mind/<sub-area>/` and use the `Mind*` class name prefix.
3. Existing `Brain*` symbol references are tolerated only while their
   `Mind*` shim exists. The shim is the SOURCE OF TRUTH; the `Brain*` name
   is the alias.
4. The string `Brain` is permitted in product copy (the user-facing feature
   is still marketed as "Kloel Brain") — only the code symbol is migrating.
5. `KloelMessage`/`KloelLead`/`KloelConversation`/`KloelSale`/`KloelWallet`/
   `KloelMemory`/`KloelSite`/`KloelDesign`/`KloelGlobalPrior` Prisma models
   stay until their respective Mind* counterparts ship per the unification
   plan. Do NOT remove or rename them outside that plan.

### 6.4 Frontend implication

- `frontend/src/lib/api/brain.ts` is the current canonical API client for
  brain operations and will be renamed to `mind.ts` in PR-7 of the
  unification plan. Until then, `brain` is the allowed alias at the frontend
  API-client layer.

---

## 7. Open disambiguation questions

These are pairs where the evidence in the codebase is ambiguous and a human
decision is required. They are intentionally NOT in the table above.

1. **`Persona` vs `Agent` vs `AdminUser`** — `model Persona` exists and is
   used by `Mind*` services to characterize an LLM voice; it overlaps with
   `Agent` in the inbox-assignment context (an `Agent` can have a `Persona`).
   The line between "operator identity" and "configured AI persona" is not
   formally drawn anywhere yet. ADR needed.
2. **`AffiliatePartner` vs `Agent` vs `AffiliateLink`** — partners can be
   workspaces themselves, or external commission recipients. The Prisma
   schema has `model AffiliatePartner` (party) and `model AffiliateLink`
   (relationship), but the boundary with `Workspace` and `Agent` is fuzzy in
   `affiliate.service.*`. Needs a family-glossary entry.
3. **`MemberArea`, `MemberEnrollment`, `MemberLesson`, `MemberModule`** —
   the "Member" prefix is used for the digital-product-access feature, which
   is unrelated to `Workspace.members` (`Agent`). The reused noun is a
   collision risk. Recommended: rename `MemberArea` → `Course` or
   `MembershipArea` (ADR required; not in scope this round).
4. **`Variable` vs `KnowledgeSource` vs `KnowledgeBase`** — three models hold
   user-supplied content for the AI. The split between them is undocumented;
   `MIND_SERVICES_CANONICAL.md` covers part of it but not the data-model
   level.
5. **`Pipeline` vs `Stage` vs `PipelineState`** — three Prisma models for
   what is presented in UI as "the kanban board". `PipelineState` looks
   like a runtime snapshot but is referenced by both deal and contact
   surfaces; canonical role is unclear.
6. **`SocialAccount` vs `MetaConnection` vs `Integration`** — three Prisma
   models that all store third-party auth state. `SocialAccount` is used by
   `frontend/src/lib/api/apple.ts` and Google sign-in; `MetaConnection` is
   per-channel OAuth; `Integration` is the generic app-install record.
   Boundary needs an ADR.
7. **`ApiKey` vs `IntegrationCredential` vs `RefreshToken` vs
   `MagicLinkToken`** — four credential-shaped models with overlapping
   semantics. The canonical owner of each lifecycle is not stated.
8. **`Queue` vs `AgentQueue` vs `BullMQ queues`** — `model Queue` and
   `model AgentQueue` are inbox-routing entities; the BullMQ runtime
   `worker/` queues share the noun but are operational, not domain.
   Disambiguation needed in `QUEUES_CATALOG.md` cross-reference.
9. **`Vector` vs `KloelMemory.embedding` vs `KnowledgeSource`** — the
   embedding-vector storage path is split across three places. Which one is
   canonical for "store an embedding" is undefined.
10. **`Tag` vs `BannedKeyword` vs `Variable`** — three different
    string-bucket entities; canonical scope of each is not declared.

These items are tracked for the next canonicalization wave; do NOT resolve
them inside this document. Update `CANONICALIZATION_MISSION.md` to schedule.

---

## 8. How to add an entry

1. Locate the duplicate or alias via `git grep` / `rg` and confirm it is
   in `backend/src/`, `frontend/src/`, `worker/`, or
   `backend/prisma/schema.prisma`.
2. Decide the canonical name following the rules: domain-clear, no
   abbreviation, match existing prefix conventions (`Mind*`, `Channel*`,
   `Checkout*`, `Member*`).
3. Verify all aliases (`rg --type ts '<Alias>'`).
4. Add a row to the table in Section 2, 3, or 4 (whichever fits). If the
   canonical answer is ambiguous, add to Section 7 instead — never invent.
5. If introducing a new deprecation, also add a row to
   [DEPRECATION_MAP.md](./DEPRECATION_MAP.md) with deadline and replacement
   symbol.
6. Run the gate: `npm run check:canonical-vocabulary` must not exceed the
   current 560 soft-warning ceiling. If it does, the new entry must include
   an explicit migration plan in `DEPRECATION_MAP.md`.

---

## 9. Gate status (Wave 54)

- **560 soft warnings** — all audited as domain-correct (see
  [VOCABULARY_FLOOR_REACHED.md](./VOCABULARY_FLOOR_REACHED.md)).
- **0 hard violations**.
- **0 strict-mode blocking**.
- Breakdown of remaining soft warnings:
  - `Contact` aliases — 247
  - `ChannelSession` aliases — 242
  - `Workspace` aliases — 62
  - `Webhook` aliases — 9
- Brain→Mind unification: **Phase 1 (alias) active**; Phase 2 (table backfill)
  and Phase 3 (`Brain*` removal) gated on ADR-0013 +4wk deadline.
- Mind canonical surface: **13 Prisma models live**, **10 Mind coordinator
  services live**, **2 Mind alias services live**
  (`MindMessageService`, `MindMemoryItemService`).
