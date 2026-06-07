# Kloel Event Taxonomy (canonical)

**What this answers:** the one official, dotted event catalog for Kloel — every raw
event string the backend emits, its canonical form, who produces it, where it lands
(spine outbox vs legacy log vs realtime socket vs webhook vs BullMQ queue), and which
names are inconsistent and being migrated. It folds in the `cognition.*` percept family
and the in-source canonical registries (`mind-event-taxonomy.ts`,
`event-taxonomy.canonical-aliases.ts`). Use it before adding a new event name or wiring
a new listener, so the name you pick is already in the taxonomy.

**Last generated:** 2026-06-07 — grounded in `backend/src/kloel/mind/coordination/mind-event-taxonomy.ts`,
`backend/src/kloel/event-taxonomy.canonical-aliases.ts`, and verified emit sites under
`backend/src/**` + `worker/**`. Supersedes the v1 alphabetical scan-dump (which mixed
domain events with raw socket/process signals like `SIGINT`, `mouse:move`, `close`).

---

## Table of contents

1. [The two authoritative registries in source](#1-the-two-authoritative-registries-in-source)
2. [Naming convention — the canonical shape](#2-naming-convention--the-canonical-shape)
3. [Event sinks (where an event physically lands)](#3-event-sinks-where-an-event-physically-lands)
4. [`cognition.*` — Mind cognitive + percept family](#4-cognition--mind-cognitive--percept-family)
5. [`commerce.*` — commercial spine events](#5-commerce--commercial-spine-events)
6. [`mind.*` / `brain.*` — runtime + capability events](#6-mind--brain--runtime--capability-events)
7. [Bare legacy names → canonical (dual-emit window)](#7-bare-legacy-names--canonical-dual-emit-window)
8. [Percept bridge (`MindPerceptEvent`)](#8-percept-bridge-mindperceptevent)
9. [Realtime (WebSocket) + outbound webhook events](#9-realtime-websocket--outbound-webhook-events)
10. [BullMQ queue names (NOT EventEmitter events)](#10-bullmq-queue-names-not-eventemitter-events)
11. [Non-cognitive operational sinks: OpsEvent + RiscEvent](#11-non-cognitive-operational-sinks-opsevent--riscevent)
12. [Inconsistent naming — flagged for canonicalization](#12-inconsistent-naming--flagged-for-canonicalization)
13. [Domains that emit NO events](#13-domains-that-emit-no-events)

---

## 1. The two authoritative registries in source

The canonical event name set is NOT this doc — it is two TypeScript constants. This doc
documents them; they enforce them at compile time.

| Registry | File | What it pins |
|---|---|---|
| `BRAIN_EVENT_TAXONOMY` (+ type `MindEventName`) | `backend/src/kloel/mind/coordination/mind-event-taxonomy.ts:1` | The complete union of every spine event name (legacy + canonical). A name not in this list is a type error at `recordCommercial` call sites. |
| `MIND_EVENT_ALIASES` | `backend/src/kloel/mind/coordination/mind-event-taxonomy.ts:161` | Legacy → canonical map (one-way). Drives `resolveCanonicalEventName` / `expandEventNameAliases` so readers match BOTH spellings during cutover. |
| `KLOEL_TO_COGNITION_ALIAS` | `backend/src/kloel/event-taxonomy.canonical-aliases.ts:32` | `kloel.*` → `cognition.*` dual-emit helper map (`emitCognitionAlias`). |
| `LEGACY_TO_COMMERCE_ALIAS` | `backend/src/kloel/event-taxonomy.canonical-aliases.ts:57` | Bare-name → `commerce.*` dual-emit helper map (`emitCommerceAlias`). |

> The `BrainEventName` type (`mind-event-taxonomy.ts:130`) is a `@deprecated` alias of
> `MindEventName`, retained for the ADR-0013 Brain→Mind naming sweep. Write new code
> against `MindEventName`.

---

## 2. Naming convention — the canonical shape

Canonical event names are **dotted, lowercase, `<domain>.<entity-or-faculty>.<verb>`**.

| Segment | Allowed values (domains) | Source of the domain set |
|---|---|---|
| domain | `cognition` · `commerce` · `mind` · `brain` · `capability` · `member` | `BRAIN_EVENT_TAXONOMY` prefixes |
| entity / faculty | e.g. `payment`, `crm`, `lead`, `product`, `plan`, `checkout`, `cart`, `campaign`, `post_sale`, `whatsapp` (commerce); `autonomy`, `curiosity`, `causal`, `emotional`, `self`, `perception`, `pipeline`, `identity`, `cia`, `voice`, `flow` (cognition) | emit sites |
| verb | past-tense / state: `created`, `updated`, `approved`, `declined`, `refunded`, `observed`, `inferred`, `proposed`, `consolidated`, `node_completed` | emit sites |

**Three legacy shapes still fire during the cutover window** and are NOT canonical:

1. **Bare names** (no domain prefix): `product.updated`, `sale.created`, `message.received`,
   `lead.created`, `concept.detected`. → aliased to `commerce.*` / `mind.*`.
2. **`kloel.*`**: `kloel.chat.turn`, `kloel.handoff.confidence`. → aliased to `cognition.*`.
3. **Wrong-domain 3-segment**: `pipeline.state.changed`, `identity.contact.resolved`,
   `case_memory.consulted`, `predecided_actions.built`. → aliased to `cognition.*`.

---

## 3. Event sinks (where an event physically lands)

A single "event" in Kloel is not one mechanism. There are **five distinct sinks**, and
the same business fact may fan out to several. This is the most common source of
confusion, so the catalog tables below tag each event with its sink.

| Sink | Backing | Writer entrypoint | Idempotent? | Read back? |
|---|---|---|---|---|
| **Outbox (canonical spine)** | `RAC_MindOutboxEvent` (schema:—, via `MindEventSpine`) | `MindEventSpine.recordCommercial` / `recordMany` (`mind/coordination/mind-event-spine.service.ts:73,142`) | YES (`idempotencyKey`) | YES (dispatchable) |
| **Legacy log spine** | `RAC_AutopilotEvent` | `MindEventSpine.record` (`mind-event-spine.service.ts:43`) | NO | YES — `MindPerceptionService` reads percepts back, and `MindEventIngestor` polls `cognition.decision_made` |
| **NestJS EventEmitter** | in-process bus (`eventBus.emit`) | various emitters | n/a | `@OnEvent()` listeners |
| **Realtime socket** | Socket.IO gateway | `gateway.emitToWorkspace(...)` (`inbox.service.ts:242`) | n/a | frontend clients |
| **Outbound webhook** | HTTP POST to tenant URL | `WebhookDispatcherService.dispatch` (`inbox.service.ts:249`) | n/a | external systems |

> **P1 spine consolidation (from the inventory):** generic `brain`/`cognition` events
> currently land in the non-idempotent `RAC_AutopilotEvent`, while only `recordCommercial`
> events reach `RAC_MindOutboxEvent`. The target is one outbox sink — but note
> `MindPerceptionService` READS percepts out of `RAC_AutopilotEvent`, so the read path
> must move with the writes.

---

## 4. `cognition.*` — Mind cognitive + percept family

The cognitive loop and emergent faculties. Every name below is registered or emitted in
source. Sink is `RAC_AutopilotEvent` (legacy log) unless the emit site routes through
`recordCommercial` (outbox).

### 4a. Core cognitive loop (inference)

| Canonical event | Emit site | Notes |
|---|---|---|
| `cognition.belief_updated` | `mind/inference/mind-belief.service.ts:143`; also `kloel/hypproof/belief-update.ts:62`; consumed by `owner-criterion/observers/correction.observer.ts:91` | Belief revision after surprise. |
| `cognition.prediction_made` | `mind/inference/mind-predictor.service.ts:74` | Canonical predictor (`MindPredictorService`). |
| `cognition.surprise_observed` | `mind/inference/mind-surprise.service.ts:41`; weighted in `kloel/commem/value-quantifier.service.ts:49` | Shannon `-log(p)` surprise (`MindSurpriseService`). |
| `cognition.decision_made` | `admin/chat/admin-chat.service.ts:160`, `kloel/guest-chat.sse.helpers.ts:22`, `kloel/conversational-onboarding.mind-deps.helpers.ts:155`, `kloel/kloel-reply-engine.helpers.ts:380` | **Ingestor poll string** — `MindEventIngestor` (`mind/coordination/mind-event-ingestor.service.ts:23,53`) claims+reprocesses these. The `cognition.*` percepts below are deliberately NOT this string so they are not reprocessed. |
| `cognition.valence_assigned` | `kloel/team/operator-feedback.loop.ts:64`; consumed by `goal-field/detectors/cognitive.detectors.ts:90`, `defens/asset-registry.ts:84`, `daily-dashboard/daily-dashboard.helpers.ts:266`, `local-identity/...derivations.ts:192` | Affective tag on an outcome. |
| `cognition.memory.consolidated` | `mind/memory/mind-long-term-memory.service.ts:141` | Case→belief consolidation tick. |

### 4b. Emergent faculties

| Canonical event | Emit site |
|---|---|
| `cognition.autonomy.goal_proposed` | `mind/autonomy/mind-autonomy.service.ts:97` |
| `cognition.curiosity.gap_identified` | `mind/curiosity/mind-curiosity.service.ts:73,111` |
| `cognition.emotional.inferred` | `mind/emotional/mind-emotional-intelligence.service.ts:216` |
| `cognition.causal.inferred` | `mind/causal/mind-causal-model.service.ts:315` |
| `cognition.causal.edge_reinforced` | `mind/causal/mind-causal-model.service.ts:283` |
| `cognition.causal.simulated` | `mind/causal/mind-causal-model.service.ts:335` |
| `cognition.self.modification_proposed` | `mind/self-evolution/mind-self-modification.service.ts:184` (const `SELF_EVOLUTION_EVENT_TYPE = 'cognition.self_modification.proposed'` at :56 — **note the spelling drift**, see §12) |
| `cognition.perception.multimodal_observed` | `mind/perception/mind-multimodal-perception.service.ts:330` |
| `cognition.consciousness.experience_recorded` | `mind/consciousness/mind-consciousness.service.ts:133` |
| `cognition.cia_backlog_action` | `mind/cia/cia-send-helpers.service.ts:159` (**bare-faculty spelling drift**, see §12) |

### 4c. Durable percept family (additive, flag-gated, outbox)

Registered in `BRAIN_EVENT_TAXONOMY:117-121`. These are **single best-effort percepts per
business event, NEVER reprocessed by the decision ingestor** (deliberately distinct from
the `cognition.decision_made` poll string). Emit-site constants:

| Canonical event | Emit-site constant |
|---|---|
| `cognition.flow.node_completed` | `flows/flows-percept-emit.helper.ts:11` (`FLOW_NODE_COMPLETED_EVENT_TYPE`) |
| `cognition.cia.decision_made` | `kloel/mind/cia/cia-percept-emit.helper.ts:13` (`CIA_DECISION_MADE_EVENT_TYPE`) |
| `cognition.cia.action_executed` | `kloel/mind/cia/cia-percept-emit.helper.ts:19` (`CIA_ACTION_EXECUTED_EVENT_TYPE`) |
| `cognition.voice.clone_created` | `voice/voice-percept-emit.helper.ts:11` (`VOICE_CLONE_CREATED_EVENT_TYPE`) |
| `cognition.voice.action_executed` | `voice/voice-percept-emit.helper.ts:17` (`VOICE_ACTION_EXECUTED_EVENT_TYPE`) |

### 4d. Pipeline / identity routing (wrong-domain → cognition canonical)

These are orchestrator internals, not commerce. Legacy bare names dual-emit alongside.

| Legacy (still fires) | Canonical | Alias source |
|---|---|---|
| `pipeline.state.changed` | `cognition.pipeline.state_changed` | `MIND_EVENT_ALIASES:192` |
| `pipeline.shadow_recorded` | `cognition.pipeline.shadow_recorded` | `:193` — emitted at `admin/pipeline/admin-pipeline.service.ts:126`, `kloel/commercial-decision-orchestrator/telemetry.ts:340` |
| `pipeline.auto_fallback` | `cognition.pipeline.auto_fallback` | `:194` |
| `identity.contact.resolved` | `cognition.identity.contact_resolved` | `:195` |
| `case_memory.consulted` | `cognition.case_memory.consulted` | `:202` |
| `predecided_actions.built` | `cognition.predecided.actions_built` | `:203` (also registered canonical at telemetry.ts:288) |

### 4e. `kloel.*` → `cognition.*` (chat / handoff)

`KLOEL_TO_COGNITION_ALIAS` (`event-taxonomy.canonical-aliases.ts:32`), via `emitCognitionAlias`:

| Legacy `kloel.*` (still fires) | Canonical `cognition.*` |
|---|---|
| `kloel.chat.turn` | `cognition.chat.turn` (emitted `kloel/kloel-thinker.helpers.ts:208`) |
| `kloel.handoff.confidence` | `cognition.handoff.confidence` |
| `kloel.handoff.confidence.blocking` | `cognition.handoff.confidence.blocking` |

---

## 5. `commerce.*` — commercial spine events

The customer-/money-facing spine. Most are also catalog entries in the PCI transition
table (`spine-coverage-auditor.service.ts`).

### 5a. CRM + lead lifecycle — `CrmEventEmitterService`

File: `backend/src/kloel/crm-emitter/crm-event-emitter.service.ts`.

| Canonical event | Emit line | entity |
|---|---|---|
| `commerce.crm.stage_changed` | :19 | deal |
| `commerce.crm.owner_assigned` | :40 | deal |
| `commerce.crm.next_step_defined` | :61 | deal |
| `commerce.crm.deal_won` | :82 | deal |
| `commerce.crm.deal_lost` | :107 | deal |
| `commerce.lead.objection_raised` | :132 (truthMode `inferred`) | lead |
| `commerce.lead.contacted` / `commerce.lead.replied` / `commerce.lead.converted` | lead lifecycle on the Spine (`commerce.lead.converted` 2 emit sites) | lead |

### 5b. Payment + ledger — `LedgerService`

File: `backend/src/payments/ledger/ledger.service.ts`; name union at `ledger.spine-events.helpers.ts:11-13`.

| Canonical event | Emit line |
|---|---|
| `commerce.payment.approved` | :155, :263 |
| `commerce.payment.refunded` | :537 |
| `commerce.payment.charged_back` | :443 |
| `commerce.payment.initiated` / `commerce.payment.declined` | spine + `CheckoutEventEmitterService` (NestJS-emitter layer) |

### 5c. Cart / checkout

| Canonical event | Producer |
|---|---|
| `commerce.cart.created` · `commerce.cart.abandoned` · `commerce.cart.checkout_initiated` | `SpineEmitterService` via `LedgerService` + `CheckoutEventEmitterService` |
| `commerce.checkout.created` · `commerce.checkout.updated` · `commerce.checkout.completed` · `commerce.checkout.deleted` | `CheckoutPostPaymentEffectsService` + `CheckoutEventEmitterService` |

### 5d. Post-sale + WhatsApp commerce

| Canonical event | Producer |
|---|---|
| `commerce.post_sale.delivery_completed` | `checkout/checkout-post-payment-effects.service.ts:117` |
| `commerce.post_sale.activation_started` | `checkout/checkout-post-payment-effects.service.ts:135` |
| `commerce.post_sale.churn_risk_detected` · `repurchase_window_opened` · `satisfaction_signal_observed` · `first_value_obtained` · `no_regret_confirmed` · `win_back_window_opened` | post-sale commerce spine |
| `commerce.whatsapp.message_received` | canonical of bare `message.received` (`LEGACY_TO_COMMERCE_ALIAS:70`) |

### 5e. Campaign — `campaign-event-emitter.service.ts`

File: `backend/src/kloel/campaign-emitter/campaign-event-emitter.service.ts`.

| Canonical event | Emit line |
|---|---|
| `commerce.campaign.clicked` | :52 |
| `commerce.campaign.conversion_associated` | :72 |
| `commerce.campaign.audience_reached` | :92 |
| `commerce.campaign.creative_swapped` | :112 |
| `commerce.campaign.performance_drop_detected` | :133 |
| `commerce.campaign.scheduled` | canonical of bare `campaign.scheduled` (`MIND_EVENT_ALIASES:182`) |

---

## 6. `mind.*` / `brain.*` — runtime + capability events

Registered in `BRAIN_EVENT_TAXONOMY`. These are the cognitive-runtime action rows written
as `RAC_AutopilotEvent` actions, plus the `mind.*` canonical aliases of bare names.

| Canonical / registered name | Origin | Notes |
|---|---|---|
| `brain.decide` · `brain.observe` · `brain.autonomy.propose` · `brain.capability.invoked` | `BRAIN_EVENT_TAXONOMY:2-5` | Brain runtime action rows. `brain.*` prefix predates the Brain→Mind rename. |
| `capability.executed` → `mind.action.executed` | alias `MIND_EVENT_ALIASES:164` | Capability execution. |
| `capability.failed` | `BRAIN_EVENT_TAXONOMY:7` | |
| `mind.decision.created` · `mind.decision.resolved` · `mind.prediction.created` · `mind.prediction.resolved` · `mind.surprise.recorded` | `BRAIN_EVENT_TAXONOMY:46-50` | Persisted-loop bookkeeping (`MindService.tick` + `MindEventProcessorService`). |
| `product.created` → `mind.product.observed` | alias `:165` | `ProductService` dual-emits the `mind.*` observation **and** the `commerce.*` alias. `CheckoutProductService` bypasses BOTH (products created via checkout are invisible to cognition). |
| `plan.created` → `mind.plan.observed` | alias `:166` | `PlanService` dual-emit. |
| `channel.connected` · `channel.disconnected` · `channel.externally_blocked` | `BRAIN_EVENT_TAXONOMY:53-55` | Channel lifecycle. |

---

## 7. Bare legacy names → canonical (dual-emit window)

During the ADR-0013 cutover, the bare name **and** its canonical fire together
(`emitCommerceAlias`, `event-taxonomy.canonical-aliases.ts:101`). Readers should match
both via `expandEventNameAliases`.

| Bare legacy (still fires) | Canonical | Alias source |
|---|---|---|
| `product.created` | `commerce.product.created` | `LEGACY_TO_COMMERCE_ALIAS:58` |
| `product.updated` | `commerce.product.updated` | `:59` / `MIND_EVENT_ALIASES:174` |
| `product.published` | `commerce.product.published` | `:60` / `:175` |
| `product.deleted` | `commerce.product.deleted` | `:61` / `:176` |
| `plan.updated` | `commerce.plan.updated` | `:62` / `:177` |
| `plan.deleted` | `commerce.plan.deleted` | `:63` / `:178` |
| `sale.created` | `commerce.sale.created` | `:64` / `:179` |
| `coupon.created` | `commerce.coupon.created` | `:65` / `:180` |
| `lead.created` | `commerce.lead.created` | `:66` / `:181` |
| `campaign.scheduled` | `commerce.campaign.scheduled` | `:67` / `:182` |
| `inbound.received` | `commerce.inbound.received` | `:68` / `:183` |
| `concept.detected` | `commerce.concept.detected` | `:69` / `:184` |
| `message.received` | `commerce.whatsapp.message_received` | `:70` |

> Names registered in `BRAIN_EVENT_TAXONOMY` but **without an alias entry yet** (legacy-only
> for now): `sale.completed/refunded/cancelled`, `checkout.*` (paid/cancelled/viewed/abandoned/generated),
> `message.sent/delivered/read/failed/converted`, `lead.qualified/transferred/abandoned`,
> `contact.segmented`, `coupon.updated/deleted`, `campaign.sent/clicked/converted`,
> `identity.contact.merged`, `identity.merge_candidate.created`.

---

## 8. Percept bridge (`MindPerceptEvent`)

Inbound channel messages cross into the Mind via a typed `MindPerceptEvent`, NOT a string
event. Defined `backend/src/kloel/mind.types.ts`; bridged by `ChannelInboundHookService`
(`backend/src/omnichannel/channel-inbound-hook.service.ts`).

| `MindPerceptEvent.kind` | Bridge line | Mirrored to spine as |
|---|---|---|
| `message.received` | `channel-inbound-hook.service.ts:47` | `recordCommercial({ eventType: 'message.received' })` (`:155`, direction `INBOUND`) |
| `message.sent` | `:77` | `recordCommercial({ eventType: 'message.sent' })` (`:155`, direction `OUTBOUND`) |

The `recordCommercial` mirror carries an `idempotencyKey` → these land in the **outbox**
(`RAC_MindOutboxEvent`), unlike most `cognition.*` percepts which land in the legacy log.

---

## 9. Realtime (WebSocket) + outbound webhook events

These are NOT spine events — they are Socket.IO frames and HTTP webhook payloads emitted by
`InboxService` (`backend/src/inbox/inbox.service.ts`). Distinct namespace; do not register
them in `BRAIN_EVENT_TAXONOMY`.

| Channel | Event name | Line | Payload |
|---|---|---|---|
| WebSocket (`gateway.emitToWorkspace`) | `message:new` | :242 | new inbox message |
| WebSocket | `conversation:update` | :243, :307, :357, :393 | conversation state delta |
| Outbound webhook (`webhookDispatcher.dispatch`) | `message.received` | :249 | post-commit message webhook |

> Other realtime surfaces in the v1 scan (`copilot:suggestion`, `flow:log`, `alert:event`,
> graph-canvas `object:*` / `mouse:*` / `selection:*`) are UI/socket frames, not domain
> events, and are intentionally excluded from the canonical taxonomy.

---

## 10. BullMQ queue names (NOT EventEmitter events)

Queue names are a separate vocabulary from spine events. Canonical set:
`QUEUE_NAMES` (`backend/src/queue/queue-names.const.ts:17`). Mind-tick queues are declared
locally (not in `QUEUE_NAMES`).

| Queue name | Constant / source | Live worker? |
|---|---|---|
| `flow-jobs` | `QUEUE_NAMES.FLOW` | yes (backend) |
| `campaign-jobs` | `QUEUE_NAMES.CAMPAIGN` | **YES — `worker/campaign-processor.ts:147` `campaignWorker`** |
| `voice-jobs` | `QUEUE_NAMES.VOICE` | **YES — `worker/voice-processor.ts:253` `voiceWorker`** |
| `media-jobs` | `QUEUE_NAMES.MEDIA` | **YES — `worker/media-processor.ts:15` `mediaWorker`** |
| `scraper-jobs` | `QUEUE_NAMES.SCRAPER` | yes |
| `autopilot-jobs` | `QUEUE_NAMES.AUTOPILOT` | yes |
| `memory-jobs` | `QUEUE_NAMES.MEMORY` | yes |
| `crm-jobs` | `QUEUE_NAMES.CRM` (checkout-social-lead-enrich) | yes |
| `webhook-jobs` | `QUEUE_NAMES.WEBHOOK` | yes |
| `google-ads-sync-jobs` | `QUEUE_NAMES.GOOGLE_ADS_SYNC` | yes |
| `ads-sync-meta` | `QUEUE_NAMES.META_ADS_SYNC` | yes |
| `mass-send` | `QUEUE_NAMES.MASS_SEND` | **questionable — no live `new Worker('mass-send')` in the main `worker/` tree** |
| `mind-scheduler` | `mind/runtime/mind-processor.service.ts:17` | yes (`MindProcessorService`, 30s) |
| `mind-tick` | `mind/runtime/mind-processor.service.ts:18` | yes |
| `mind-bg-tick` | `mind/mind-bg.scheduler.ts:12` | yes (`MindBackgroundScheduler`, 5s) |

> **CORRECTION (v1 was wrong):** the recon flagged `campaign-jobs` / `voice-jobs` /
> `media-jobs` as "dead queues." They are NOT — each has a live `new Worker(...)` in the
> separate `worker/` deployable (verified at the lines above). Only **`mass-send`** is the
> genuinely questionable surface (its only `new Worker('mass-send')` lives in worktrees,
> not the shipped `worker/` tree). Do not re-apply the "dead queue" label to the three live
> queues.

---

## 11. Non-cognitive operational sinks: OpsEvent + RiscEvent

Two **live** models that are NOT part of the cognitive spine and were absent from v1.

### OpsEvent (`RAC_OpsEvent`, schema:1614)

- **Writer:** `OpsAlertService` (`backend/src/observability/ops-alert.service.ts`).
- **Shape:** `opsEvent.create({ data: { type, service, error, stack, workspaceId, metadata } })`
  (`:115-122`). The `type` field is the operational-event kind — observed value
  `'critical_error'` (`:117`); the inventory also names `degradation` / `recovery`.
- **Purpose:** dashboard alerting on errors/degradation/recovery. Forwarded to Sentry first
  (`:103`), then persisted. **Must NOT** be conflated with the Mind spine — it does not feed
  cognition (Mind owns `AutopilotEvent` / `MindOutboxEvent`).

### RiscEvent (`RAC_RiscEvent`, schema:1273)

- **Writer + processor:** `ComplianceService` (`backend/src/compliance/compliance.service.ts`).
- **Flow:** `tx.riscEvent.create({ data: { eventType, ... } })` (`:140`) →
  `routeRiscEvent(eventType, subject)` (`:148,165`) → `classifyRiscEvent(eventType)` (`:166`)
  → `tx.riscEvent.update(...)` marks processed (`:150`).
- **Purpose:** Google RISC (cross-account protection) ingest + routing.
- **CORRECTION (v1 was wrong):** v1 called RiscEvent an "ingest-only stub with no processor."
  `routeRiscEvent` **IS** the processor — it classifies, routes, and stamps the row processed.

> `eventType` here is the **Google RISC event vocabulary** (e.g. session-revoked,
> account-disabled), an external taxonomy — NOT a Kloel `commerce.*`/`cognition.*` name. Keep
> it in its own namespace.

---

## 12. Inconsistent naming — flagged for canonicalization

Real drifts found in source. Each is a single-name fix.

| Issue | Where | Canonical target |
|---|---|---|
| **Self-modification name vs constant disagree** | emit fires `cognition.self.modification_proposed` (`mind-self-modification.service.ts:184`) but the exported const is `cognition.self_modification.proposed` (`:56`, `SELF_EVOLUTION_EVENT_TYPE`). Two spellings (`self.modification_proposed` vs `self_modification.proposed`) for one fact. | Pick ONE — register it in `BRAIN_EVENT_TAXONOMY` and make the const + emit agree. Neither spelling is currently in `BRAIN_EVENT_TAXONOMY`. |
| **CIA backlog event is bare-faculty** | `cognition.cia_backlog_action` (`cia-send-helpers.service.ts:159`) breaks the `cognition.<faculty>.<verb>` shape (it is `cognition.<faculty_verb>`). | Rename to `cognition.cia.backlog_action` to match the `cognition.cia.*` family (`cia.decision_made`, `cia.action_executed`). |
| **`message.received` aliases to TWO canonicals** | bare `message.received` → `mind.message.received` (`MIND_EVENT_ALIASES:163`) AND → `commerce.whatsapp.message_received` (`LEGACY_TO_COMMERCE_ALIAS:70`). One bare name, two canonical homes. | Decide whether the bare percept is a Mind observation or a commerce fact (or keep both deliberately and document the fan-out). Today it is ambiguous. |
| **Catalog-only names never emitted** | v1 lists many `commerce.whatsapp.*` / `commerce.kyc.*` / `commerce.post_sale.testimonial_requested` as `0 emit / 1 catalog`. They are declared in the PCI transition catalog but have no producer. | Either wire a producer or mark as catalog-reserved; do not assume they fire. |
| **`brain.*` vs `mind.*` prefix split** | `brain.decide/observe/...` (`BRAIN_EVENT_TAXONOMY:2-5`) coexist with `mind.*` canonical aliases; the Brain→Mind rename is mid-flight (`BrainEventName` is `@deprecated`). | Complete the ADR-0013 sweep; new code uses `mind.*` / `MindEventName`. |

> **Variant count:** the v1 scan reported "0 naming variants" — that scan only compared
> case/separator variants of the *same* string. The drifts above are *semantic* (two
> different strings for one fact, or one string with two canonical targets) and are NOT
> caught by that check.

---

## 13. Domains that emit NO events

For completeness — these surfaces deliberately produce no spine/EventEmitter/BullMQ events;
their side effects are direct method calls + synchronous audit writes.

| Domain | Modules | Side-effect mechanism (instead of events) |
|---|---|---|
| Identity / Auth / Tenant | `auth`, `api-keys`, `team`, `workspaces`, `admin/auth` | fire-and-forget calls (`triggerWelcomeFlow`, `sendTeamInviteEmail`) + synchronous `AuditService.log` DB writes |

> This is grounded: the `identity-auth` inventory cluster found zero domain
> events / `EventEmitter` / BullMQ producers across the whole auth stack. If you add
> auth eventing later, register names under a new `identity.*` domain in
> `BRAIN_EVENT_TAXONOMY` first.

---

## Appendix — quick canonicalization recipe

When you need to emit a new event:

1. Add the canonical `<domain>.<entity>.<verb>` name to `BRAIN_EVENT_TAXONOMY`
   (`mind-event-taxonomy.ts`). The type system then accepts it at `recordCommercial`.
2. If you are renaming an existing bare/`kloel.*` name, add the legacy→canonical pair to
   `MIND_EVENT_ALIASES` (or `KLOEL_TO_COGNITION_ALIAS` / `LEGACY_TO_COMMERCE_ALIAS`) and emit
   via `emitCommerceAlias` / `emitCognitionAlias` so both fire during the 4-week window.
3. Widen any reader filters with `expandEventNameAliases` so they match both spellings.
4. Choose the sink deliberately: `recordCommercial` (idempotent outbox) for anything a
   downstream system consumes; `record` (legacy log) only for fire-and-forget telemetry that
   the perception/ingestor path already reads.

---

> Machine-readable registry parsed by `scripts/ops/check-canonical-events.mjs` — every `.emit()` name in code must appear as a `- name` bullet below.

## All events (alphabetical)

- `Purchase` — 2 emit / 0 listen
- `SIGINT` — 0 emit / 2 listen
- `SIGTERM` — 0 emit / 2 listen
- `active` — 0 emit / 1 listen
- `alert` — 1 emit / 0 listen
- `alert:event` — 2 emit / 0 listen
- `chat.replied` — 4 emit / 0 listen
- `close` — 0 emit / 5 listen
- `cognition.autonomy.goal_proposed` — 1 emit / 0 listen
- `cognition.belief_updated` — 2 emit / 0 listen
- `cognition.causal.edge_reinforced` — 1 emit / 0 listen
- `cognition.causal.inferred` — 1 emit / 0 listen
- `cognition.causal.simulated` — 1 emit / 0 listen
- `cognition.cia.action_executed` — 1 emit / 0 listen
- `cognition.cia.decision_made` — 1 emit / 0 listen
- `cognition.cia_backlog_action` — 1 emit / 0 listen
- `cognition.consciousness.experience_recorded` — 1 emit / 0 listen
- `cognition.curiosity.gap_identified` — 2 emit / 0 listen
- `cognition.decision_made` — 4 emit / 0 listen
- `cognition.emotional.inferred` — 1 emit / 0 listen
- `cognition.flow.node_completed` — 1 emit / 0 listen
- `cognition.memory.consolidated` — 1 emit / 0 listen
- `cognition.perception.multimodal_observed` — 1 emit / 0 listen
- `cognition.prediction_made` — 1 emit / 0 listen
- `cognition.self.modification_proposed` — 1 emit / 0 listen
- `cognition.surprise_observed` — 1 emit / 0 listen
- `cognition.valence_assigned` — 1 emit / 0 listen
- `cognition.voice.action_executed` — 1 emit / 0 listen
- `cognition.voice.clone_created` — 1 emit / 0 listen
- `commerce.affiliate.commission_calculated` — 1 emit / 0 listen / 1 catalog
- `commerce.affiliate.performance_measured` — 1 emit / 0 listen / 1 catalog
- `commerce.campaign.audience_reached` — 1 emit / 0 listen / 1 catalog
- `commerce.campaign.clicked` — 1 emit / 0 listen / 1 catalog
- `commerce.campaign.conversion_associated` — 1 emit / 0 listen / 1 catalog
- `commerce.campaign.creative_swapped` — 1 emit / 0 listen / 1 catalog
- `commerce.campaign.performance_drop_detected` — 1 emit / 0 listen / 1 catalog
- `commerce.cart.abandoned` — 1 emit / 0 listen / 1 catalog
- `commerce.cart.checkout_initiated` — 1 emit / 0 listen / 1 catalog
- `commerce.cart.created` — 1 emit / 0 listen / 1 catalog
- `commerce.checkout.created` — 1 emit / 0 listen
- `commerce.checkout.updated` — 1 emit / 0 listen
- `commerce.crm.deal_lost` — 1 emit / 0 listen / 1 catalog
- `commerce.crm.deal_won` — 2 emit / 0 listen / 1 catalog
- `commerce.crm.next_step_defined` — 1 emit / 0 listen / 1 catalog
- `commerce.crm.owner_assigned` — 1 emit / 0 listen / 1 catalog
- `commerce.crm.stage_changed` — 1 emit / 0 listen / 1 catalog
- `commerce.kyc.approved` — 1 emit / 0 listen / 1 catalog
- `commerce.kyc.document_submitted` — 1 emit / 0 listen / 1 catalog
- `commerce.kyc.rejected` — 1 emit / 0 listen / 1 catalog
- `commerce.lead.converted` — 2 emit / 0 listen
- `commerce.lead.objection_raised` — 1 emit / 0 listen / 1 catalog
- `commerce.member_area.dropped_out` — 1 emit / 0 listen / 1 catalog
- `commerce.member_area.enrolled` — 1 emit / 0 listen / 1 catalog
- `commerce.member_area.progressed` — 1 emit / 0 listen / 1 catalog
- `commerce.onboarding.declared` — 2 emit / 0 listen
- `commerce.payment.approved` — 2 emit / 0 listen / 1 catalog
- `commerce.payment.charged_back` — 1 emit / 0 listen / 1 catalog
- `commerce.payment.declined` — 1 emit / 0 listen / 1 catalog
- `commerce.payment.initiated` — 1 emit / 0 listen / 1 catalog
- `commerce.payment.refunded` — 1 emit / 0 listen / 1 catalog
- `commerce.post_sale.activation_started` — 1 emit / 0 listen / 1 catalog
- `commerce.post_sale.churn_risk_detected` — 2 emit / 0 listen / 1 catalog
- `commerce.post_sale.delivery_completed` — 1 emit / 0 listen / 1 catalog
- `commerce.post_sale.first_value_obtained` — 2 emit / 0 listen / 1 catalog
- `commerce.post_sale.no_regret_confirmed` — 1 emit / 0 listen
- `commerce.post_sale.repurchase_window_opened` — 2 emit / 0 listen / 1 catalog
- `commerce.post_sale.satisfaction_signal_observed` — 2 emit / 0 listen / 1 catalog
- `commerce.post_sale.testimonial_requested` — 0 emit / 0 listen / 1 catalog
- `commerce.post_sale.win_back_window_opened` — 2 emit / 0 listen / 1 catalog
- `commerce.whatsapp.conversation_resumed` — 0 emit / 0 listen / 1 catalog
- `commerce.whatsapp.handoff_to_human` — 0 emit / 0 listen / 1 catalog
- `commerce.whatsapp.message_read` — 0 emit / 0 listen / 1 catalog
- `commerce.whatsapp.message_received` — 0 emit / 0 listen / 1 catalog
- `commerce.whatsapp.message_replied` — 0 emit / 0 listen / 1 catalog
- `commerce.whatsapp.session_lifecycle` — 0 emit / 0 listen / 1 catalog
- `completed` — 0 emit / 5 listen
- `connect` — 0 emit / 2 listen
- `connect_error` — 0 emit / 1 listen
- `copilot:suggestion` — 2 emit / 0 listen
- `data` — 0 emit / 1 listen
- `disconnect` — 0 emit / 1 listen
- `error` — 0 emit / 13 listen
- `failed` — 0 emit / 9 listen
- `finish` — 0 emit / 1 listen
- `flow:log` — 1 emit / 0 listen
- `join` — 1 emit / 0 listen
- `lineage.genesis` — 3 emit / 0 listen
- `message` — 0 emit / 3 listen
- `mind.plan.observed` — 2 emit / 0 listen
- `mind.product.observed` — 2 emit / 0 listen
- `mouse:down` — 0 emit / 2 listen
- `mouse:move` — 0 emit / 1 listen
- `mouse:up` — 0 emit / 1 listen
- `mouse:wheel` — 0 emit / 2 listen
- `object:added` — 0 emit / 1 listen
- `object:modified` — 0 emit / 2 listen
- `object:moving` — 0 emit / 1 listen
- `object:removed` — 0 emit / 1 listen
- `payment.pending` — 1 emit / 0 listen
- `pmessage` — 0 emit / 2 listen
- `ready` — 0 emit / 3 listen
- `sale.created` — 1 emit / 0 listen
- `selection:cleared` — 0 emit / 1 listen
- `selection:created` — 0 emit / 1 listen
- `selection:updated` — 0 emit / 1 listen
- `unhandledRejection` — 0 emit / 2 listen
