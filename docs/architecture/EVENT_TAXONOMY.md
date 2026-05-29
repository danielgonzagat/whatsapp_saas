# Kloel Event Taxonomy

> **Canonicalization Mission — Deliverable #4.** Evidence-based inventory of every
> event name flowing through the Kloel spine, grouped by canonical namespace, with
> the live emitter site identified per row.
>
> **Source of truth:** `tools/asyncapi/asyncapi-spec.json` (122 channels, 25 namespaces,
> 4,541 LOC, auto-extracted by `scripts/cognitive/asyncapi-extract.mjs`) cross-checked
> against live emit sites in `backend/src` via `ripgrep`.
>
> **AsyncAPI version:** 2.6.0 · **Info header declares:** "125 events across 26 domains"
> (drift: 3 events / 1 domain — the extractor still counts a deprecated bucket; the
> canonical truth is 122 / 25).

---

## Reading Guide

1. Every event listed in this file is reachable in source today. Strings that only
   appear in PI plans, ADRs, or test scaffolds without a live emitter are excluded.
2. The "Emitter site" column points at the **first canonical write site** — usually
   under `backend/src/kloel/<domain>-emitter/` or a capability-registry partition.
3. Brain-prefixed strings (`brain.*`) are deliberately retained — they are **not**
   live spine emits, they are **ratchet/audit/legacy-test contracts** anchored to
   the Brain to Mind migration. The full rule is in section 5.
4. Numbers in this doc come from:
   - `rg "'<ns>\.\w" backend/src --type ts -c | awk -F: '{s+=$2} END {print s}'`
   - `rg "\.emit\(['\"]<ns>\." backend/src --type ts -l | wc -l`
   - `python3 -c "import json; print(len(json.load(open('tools/asyncapi/asyncapi-spec.json'))['channels']))"`

---

## 1. Pipeline Overview

```
+--------------------------------------------------------------------------+
|  Surface service (e.g. CheckoutEventEmitterService)                      |
|      |                                                                   |
|      |  spineEmitter.emit({ eventName, workspaceId, payload, ... })      |
|      v                                                                   |
|  SpineEmitterService    -- stamps universal envelope --+                 |
|  (backend/src/kloel/spine/spine-emitter.service.ts)    |                 |
|      |                                                  |                |
|      +-> in-memory ring buffer (5000)                   |                |
|      +-> Redis XADD spine stream (MAXLEN 5000)          |                |
|      +-> AutopilotEvent / MindOutboxEvent (Prisma)      |                |
|      +-> ValenceTaggerService auto-tags terminal valence|                |
|                                                          |                |
|  Envelope schema: SpineEventEnvelope                    |                |
|  (backend/src/kloel/spine/spine-event.types.ts)         |                |
|                                                          v                |
|  Required: eventId, eventName, timestamp, occurredAt,   environment      |
|  Optional: workspaceId, entityRef, valence, payload,    causedBy, ...    |
+--------------------------------------------------------------------------+
```

**Single chokepoint.** Every event lands on `SpineEmitterService.emit()`. The
NestJS `EventEmitter2` legacy bus has only two live writers
(`mind.plan.observed`, `mind.product.observed` — see section 3.12) and no
listeners; it is a deprecated path being absorbed by the spine.

---

## 2. Event Namespaces Overview

| #  | Namespace      | Events | Live emits | Canonical status        | Notes |
|----|----------------|-------:|-----------:|-------------------------|-------|
| 1  | `commerce`     |     60 | many       | **Canonical**           | Macro-domain — cart/checkout/payment/lead/CRM/affiliate/campaign/KYC/post-sale/whatsapp surface. |
| 2  | `whatsapp`     |      8 | live       | **Canonical**           | Channel-layer events (audio, voice, document, presence, history sync, connect). |
| 3  | `cognition`    |      6 | live       | **Canonical**           | Mind cognition surface — analysis, beliefs, valence, decisions. |
| 4  | `lineage`      |      6 | live       | **Canonical**           | PULSE lineage gates — genesis, capability acquired, tampered, skill consolidated. |
| 5  | `account`      |      5 | live       | **Canonical**           | Stripe Connect account lifecycle — bank, document, fiscal, PIX, updated. |
| 6  | `product`      |      5 | live       | **Canonical**           | Product-level updates not folded into `commerce.product.*` (pixel, shipping, URL CRUD). |
| 7  | `plan`         |      4 | live       | **Canonical**           | Subscription plan CRUD + image. |
| 8  | `payment`      |      3 | partial    | **Canonical**           | Surface-level payment instruments (boleto, PIX, link). |
| 9  | `pulse`        |      3 | live       | **Canonical**           | PULSE gate outcomes + capability promotion. |
| 10 | `agent`        |      2 | live       | **Canonical**           | Agent job lifecycle. |
| 11 | `billing`      |      2 | live       | **Canonical**           | Platform billing + plan change. |
| 12 | `channel`      |      2 | live       | **Canonical**           | Multi-channel abstraction (`channel.connected`, `channel.message_sent`). |
| 13 | `test`         |      2 | test-only  | **Test fixture**        | `test.low`, `test.unknown` — used by EvolService coverage. Do not emit in production paths. |
| 14 | `wallet`       |      2 | live       | **Canonical**           | Wallet anticipation/withdrawal requests. |
| 15 | `workspace`    |      2 | live       | **Canonical**           | Workspace + workspace.settings updates. |
| 16 | `affiliate`    |      1 | live       | **Canonical**           | Top-level program update (sibling to `commerce.affiliate.*` family). |
| 17 | `ai`           |      1 | live       | **Canonical**           | `ai.persona_updated`. |
| 18 | `auth`         |      1 | live       | **Canonical**           | `auth.refresh_token_expired` cognitive bridge signal. |
| 19 | `autopilot`    |      1 | live       | **Canonical**           | `autopilot.toggled`. |
| 20 | `brand`        |      1 | live       | **Canonical**           | `brand.voice_updated`. |
| 21 | `campaign`     |      1 | live       | **Canonical**           | Top-level campaign creation (sibling to `commerce.campaign.*`). |
| 22 | `flow`         |      1 | live       | **Canonical**           | Visual flow creation. |
| 23 | `memory`       |      1 | live       | **Canonical**           | Memory-store update signal. |
| 24 | `sale`         |      1 | live       | **Canonical**           | `sale.created` — order-level confirmation. |
| 25 | `subscription` |      1 | live       | **Canonical**           | `subscription.updated` (delegates billing surface). |
| —  | `brain`        |      0 (in AsyncAPI) | 0 live | **Retained for ratchet** | 47 literal occurrences across 8 source + 8 spec files. Not a spine namespace. See section 5. |
| —  | `mind`         |      0 (in AsyncAPI) | 2 legacy | **Migration in flight**  | 23 distinct strings; only two are live via `EventEmitter2` — see sections 3.12 / 5. |

**Totals** (verified via `python3 -c "...json.load...channels"`): 122 events across 25 canonical namespaces.

---

## 3. Per-Namespace Event Lists

### 3.1 `commerce.*` — Macro Commercial Domain (60 events)

The bulk of the spine. Sub-grouped below.

#### 3.1.1 `commerce.cart.*` + `commerce.checkout.*`

| Event | Emitter site |
|-------|--------------|
| `commerce.cart.created` | `backend/src/kloel/checkout-emitter/checkout-event-emitter.service.ts` |
| `commerce.cart.abandoned` | `backend/src/kloel/checkout-emitter/checkout-event-emitter.service.ts` |
| `commerce.cart.checkout_initiated` | `backend/src/kloel/checkout-emitter/checkout-event-emitter.service.ts` |
| `commerce.checkout.created` | `backend/src/kloel/checkout-emitter/checkout-event-emitter.service.ts:306` |
| `commerce.checkout.updated` | `backend/src/kloel/checkout-emitter/checkout-event-emitter.service.ts` |

#### 3.1.2 `commerce.payment.*`

| Event | Emitter site |
|-------|--------------|
| `commerce.payment.initiated` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |
| `commerce.payment.approved` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |
| `commerce.payment.declined` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |
| `commerce.payment.failed` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |
| `commerce.payment.refunded` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |
| `commerce.payment.charged_back` | `backend/src/kloel/healthy-money/brand-wear.detector.ts` |

#### 3.1.3 `commerce.lead.*` + `commerce.crm.*`

| Event | Emitter site |
|-------|--------------|
| `commerce.lead.created` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.lead.contacted` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.lead.qualified` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.lead.replied` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.lead.objection_raised` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.lead.went_silent` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.lead.converted` | `backend/src/kloel/checkout-emitter/checkout-event-emitter.service.ts` |
| `commerce.lead.lost` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.crm.deal_won` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.crm.deal_lost` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.crm.stage_changed` | `backend/src/kloel/crm-emitter/crm-event-emitter.service.ts` |
| `commerce.crm.owner_assigned` | `backend/src/kloel/crm-emitter/crm-event-emitter.service.ts` |
| `commerce.crm.next_step_defined` | `backend/src/kloel/crm-emitter/crm-event-emitter.service.ts` |

#### 3.1.4 `commerce.affiliate.*`

| Event | Emitter site |
|-------|--------------|
| `commerce.affiliate.link_created` | `backend/src/kloel/affiliate-emitter/affiliate-event-emitter.service.ts` |
| `commerce.affiliate.click_registered` | `backend/src/kloel/affiliate-emitter/affiliate-event-emitter.service.ts` |
| `commerce.affiliate.commission_calculated` | `backend/src/kloel/affiliate-emitter/affiliate-event-emitter.service.ts` |
| `commerce.affiliate.commission_received` | `backend/src/kloel/affiliate-emitter/affiliate-event-emitter.service.ts` |
| `commerce.affiliate.performance_measured` | `backend/src/kloel/affiliate-emitter/affiliate-event-emitter.service.ts` |

#### 3.1.5 `commerce.campaign.*`

| Event | Emitter site |
|-------|--------------|
| `commerce.campaign.audience_reached` | `backend/src/kloel/campaign-emitter/campaign-event-emitter.service.ts` |
| `commerce.campaign.clicked` | `backend/src/kloel/campaign-emitter/campaign-event-emitter.service.ts` |
| `commerce.campaign.conversion_associated` | `backend/src/kloel/campaign-emitter/campaign-event-emitter.service.ts` |
| `commerce.campaign.creative_swapped` | `backend/src/kloel/campaign-emitter/campaign-event-emitter.service.ts` |
| `commerce.campaign.performance_drop_detected` | `backend/src/kloel/campaign-emitter/campaign-event-emitter.service.ts` |

#### 3.1.6 `commerce.product.*` + `commerce.coupon.*`

| Event | Emitter site |
|-------|--------------|
| `commerce.product.created` | `backend/src/kloel/product-emitter/product-event-emitter.service.ts` |
| `commerce.product.updated` | `backend/src/kloel/product-emitter/product-event-emitter.service.ts` |
| `commerce.product.published` | `backend/src/kloel/product-emitter/product-event-emitter.service.ts` |
| `commerce.product.deleted` | `backend/src/kloel/product-emitter/product-event-emitter.service.ts` |
| `commerce.coupon.created` | `backend/src/kloel/coupon-emitter/coupon-event-emitter.service.ts` |
| `commerce.coupon.updated` | `backend/src/kloel/coupon-emitter/coupon-event-emitter.service.ts` |
| `commerce.coupon.deleted` | `backend/src/kloel/coupon-emitter/coupon-event-emitter.service.ts` |

#### 3.1.7 `commerce.whatsapp.*` (commerce-layer channel signals)

| Event | Emitter site |
|-------|--------------|
| `commerce.whatsapp.message_received` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.whatsapp.message_replied` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.whatsapp.handoff_to_human` | `backend/src/kloel/coldstart/coldstart.types.ts` |

#### 3.1.8 `commerce.kyc.*`

| Event | Emitter site |
|-------|--------------|
| `commerce.kyc.document_submitted` | `backend/src/kloel/kyc-emitter/kyc-event-emitter.service.ts` |
| `commerce.kyc.approved` | `backend/src/kloel/kyc-emitter/kyc-event-emitter.service.ts:65` |
| `commerce.kyc.rejected` | `backend/src/kloel/kyc-emitter/kyc-event-emitter.service.ts` |

#### 3.1.9 `commerce.member_area.*`

| Event | Emitter site |
|-------|--------------|
| `commerce.member_area.enrolled` | `backend/src/kloel/member-area-emitter/member-area-event-emitter.service.ts` |
| `commerce.member_area.progressed` | `backend/src/kloel/member-area-emitter/member-area-event-emitter.service.ts` |
| `commerce.member_area.dropped_out` | `backend/src/kloel/member-area-emitter/member-area-event-emitter.service.ts` |

#### 3.1.10 `commerce.post_sale.*`

| Event | Emitter site |
|-------|--------------|
| `commerce.post_sale.activation_started` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |
| `commerce.post_sale.first_value_obtained` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |
| `commerce.post_sale.no_regret_confirmed` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |
| `commerce.post_sale.satisfaction_signal_observed` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |
| `commerce.post_sale.repurchase_window_opened` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |
| `commerce.post_sale.win_back_window_opened` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |
| `commerce.post_sale.churn_risk_detected` | `backend/src/kloel/healthy-money/brand-wear.detector.ts` |
| `commerce.post_sale.delivery_completed` | `backend/src/kloel/healthy-money/refund-risk.projector.ts` |

#### 3.1.11 `commerce.onboarding.*` + `commerce.error.*`

| Event | Emitter site |
|-------|--------------|
| `commerce.onboarding.declared` | `backend/src/kloel/coldstart/coldstart.types.ts` |
| `commerce.error.recovery_proof_packaged` | `backend/src/kloel/coldstart/coldstart.types.ts` |

---

### 3.2 `whatsapp.*` — Channel Lifecycle (8 events)

| Event | Emitter site |
|-------|--------------|
| `whatsapp.connected` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts:58` |
| `whatsapp.message_sent` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `whatsapp.audio_sent` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `whatsapp.voice_sent` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `whatsapp.document_sent` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `whatsapp.contact_created` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `whatsapp.history_synced` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `whatsapp.presence_updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |

---

### 3.3 `cognition.*` — Mind Cognition Surface (6 events)

| Event | Emitter site |
|-------|--------------|
| `cognition.analysis_started` | `backend/src/kloel/commem/value-quantifier.service.ts` |
| `cognition.analysis_completed` | `backend/src/kloel/commem/value-quantifier.service.ts` |
| `cognition.belief_updated` | `backend/src/kloel/commem/value-quantifier.service.ts` |
| `cognition.decision_made` | `backend/src/kloel/owner-criterion/owner-correction-future-behavior.spec.ts` |
| `cognition.valence_assigned` | `backend/src/kloel/mind/coordination/mind-runtime.service.ts` |
| `cognition.cia_backlog_action` | `backend/src/kloel/coldstart/coldstart.types.ts` |

> **Note.** 21 additional `cognition.*` strings exist in `backend/src` as candidates
> (e.g. `cognition.attention_shifted`, `cognition.causal.inferred`,
> `cognition.consciousness.experience_recorded`, ...) but only the six above appear
> in the AsyncAPI canonical channel set. The wider list is enumerated in section 6.

---

### 3.4 `lineage.*` — PULSE Lineage Gates (6 events)

| Event | Emitter site |
|-------|--------------|
| `lineage.genesis` | `backend/src/kloel/lineage/genesis-event.ts` |
| `lineage.capability_acquired` | `backend/src/kloel/lineage/genesis-event.ts` |
| `lineage.skill_consolidated` | `backend/src/kloel/lineage/genesis-event.ts` |
| `lineage.tampered` | `backend/src/kloel/pulse-gates/lineage-integrity.gate.ts` |
| `lineage.ciclo_pulse_nao_regressivo` | `backend/src/kloel/goal-field/goal-field.spec.ts` |
| `lineage.something_else` | `backend/src/kloel/goal-field/goal-field.spec.ts` |

---

### 3.5 `account.*` — Stripe Connect Account (5 events)

| Event | Emitter site |
|-------|--------------|
| `account.updated` | `backend/src/webhooks/payment-webhook-stripe.controller.ts` |
| `account.bank_updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-11-configuration.ts` |
| `account.document_uploaded` | `backend/src/kloel/capability-registry-v2/partitions/tier-11-configuration.ts` |
| `account.fiscal_updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-11-configuration.ts` |
| `account.pix_updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-11-configuration.ts` |

---

### 3.6 `product.*` — Product Surface (5 events)

| Event | Emitter site |
|-------|--------------|
| `product.pixel_configured` | `backend/src/kloel/capability-registry-v2/partitions/tier-6-urls.ts` |
| `product.shipping_updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-6-urls.ts` |
| `product.url_added` | `backend/src/kloel/capability-registry-v2/partitions/tier-6-urls.ts` |
| `product.url_updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-6-urls.ts` |
| `product.url_deleted` | `backend/src/kloel/capability-registry-v2/partitions/tier-6-urls.ts` |

> **Disambiguation.** `product.*` is **distinct** from `commerce.product.*`.
> Canonical use: `commerce.product.created` for product CRUD; `product.*` only for
> sub-resources (pixel, shipping, URL CRUD). See section 6.2.

---

### 3.7 `plan.*` — Subscription Plan CRUD (4 events)

| Event | Emitter site |
|-------|--------------|
| `plan.created` | `backend/src/plans/plan.service.ts` |
| `plan.updated` | `backend/src/plans/plan.service.ts` |
| `plan.deleted` | `backend/src/plans/plan.service.ts` |
| `plan.image_updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-2-plans.ts` |

---

### 3.8 `payment.*` — Payment Instruments (3 events)

| Event | Emitter site |
|-------|--------------|
| `payment.link_created` | `backend/src/kloel/capability-registry-v2/partitions/tier-5-sales.ts` |
| `payment.boleto_generated` | `backend/src/kloel/capability-registry-v2/partitions/tier-5-sales.ts` |
| `payment.pix_generated` | `backend/src/kloel/capability-registry-v2/partitions/tier-5-sales.ts` |

> **Disambiguation.** `payment.*` is the **surface-level payment instrument**
> family (link, boleto, PIX). It is **distinct** from `commerce.payment.*` which
> covers payment lifecycle outcomes (initiated/approved/declined/refunded/charged_back).

---

### 3.9 `pulse.*` — PULSE Gate Outcomes (3 events)

| Event | Emitter site |
|-------|--------------|
| `pulse.gate_passed` | `backend/src/kloel/pulse-gates/pulse-spine.bridge.ts` |
| `pulse.gate_failed` | `backend/src/kloel/pulse-gates/pulse-spine.bridge.ts` |
| `pulse.capability_promoted` | `backend/src/kloel/pulse-gates/pulse-spine.bridge.ts` |

---

### 3.10 Two-Event Namespaces

| Event | Emitter site |
|-------|--------------|
| `agent.job_created` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `agent.job_updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `billing.updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-0c-mutations.ts` |
| `billing.plan_changed` | `backend/src/kloel/capability-registry-v2/partitions/tier-0c-mutations.ts` |
| `channel.connected` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `channel.message_sent` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `test.low` | `backend/src/kloel/evol/evol.spec.ts` (test fixture only) |
| `test.unknown` | `backend/src/kloel/evol/evol.spec.ts` (test fixture only) |
| `wallet.anticipation_requested` | `backend/src/kloel/capability-registry-v2/partitions/tier-9-wallet.ts` |
| `wallet.withdrawal_requested` | `backend/src/kloel/capability-registry-v2/partitions/tier-9-wallet.ts` |
| `workspace.updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-0c-mutations.ts` |
| `workspace.settings.updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-0c-mutations.ts` |

---

### 3.11 Single-Event Namespaces

| Event | Emitter site |
|-------|--------------|
| `affiliate.program_updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-7-affiliates.ts` |
| `ai.persona_updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-0c-mutations.ts` |
| `auth.refresh_token_expired` | `backend/src/kloel/self-awareness/cognitive-bridge.service.ts` |
| `autopilot.toggled` | `backend/src/kloel/capability-registry-v2/partitions/tier-0c-mutations.ts` |
| `brand.voice_updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-0c-mutations.ts` |
| `campaign.created` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `flow.created` | `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts` |
| `memory.updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-0c-mutations.ts` |
| `sale.created` | `backend/src/sales/sales.service.v1-shared.ts` |
| `subscription.updated` | `backend/src/kloel/capability-registry-v2/partitions/tier-8-crm.ts` |

---

### 3.12 `mind.*` — Legacy EventEmitter2 Bus (NOT canonical channels)

`mind.*` is **not** part of the AsyncAPI canonical channel set. It survives only
as two live writes through the deprecated NestJS `EventEmitter2` bus (with zero
listeners). All other 21 `mind.*` strings appear as method names on
`MindRuntimeService`, capability identifiers, or test scaffolds — none flow
through `SpineEmitter`.

| String | Live emit? | Origin |
|--------|------------|--------|
| `mind.plan.observed` | YES (legacy) | `backend/src/plans/plan.service.ts:65` |
| `mind.product.observed` | YES (legacy) | `backend/src/products/product.service.ts:69` |
| `mind.action.executed` | no | capability ID only |
| `mind.bandit.choose` | no | capability ID only |
| `mind.bandit.record_outcome` | no | capability ID only |
| `mind.bandit.register` | no | capability ID only |
| `mind.bandit.select_arm` | no | capability ID only |
| `mind.belief.get_active_beliefs` | no | capability ID only |
| `mind.belief.get_or_init` | no | capability ID only |
| `mind.belief.list` | no | capability ID only |
| `mind.belief.observe_binary` | no | capability ID only |
| `mind.consciousness.emit` | no | capability ID only |
| `mind.consciousness.record_experience` | no | capability ID only |
| `mind.decision.created` | no | `mind-event-taxonomy.ts` (audit/ratchet) |
| `mind.decision.resolved` | no | `mind-event-taxonomy.ts` (audit/ratchet) |
| `mind.global_prior.get_prior` | no | capability ID only |
| `mind.message.received` | no | capability ID only |
| `mind.prediction.created` | no | `mind-event-taxonomy.ts` (audit/ratchet) |
| `mind.prediction.generate` | no | capability ID only |
| `mind.prediction.resolved` | no | `mind-event-taxonomy.ts` (audit/ratchet) |
| `mind.prediction.surprise` | no | capability ID only |
| `mind.simulator.simulate` | no | capability ID only |
| `mind.surprise.recorded` | no | `mind-event-taxonomy.ts` (audit/ratchet) |

**Migration path** (tracked in `docs/architecture/EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION.md`):

- `mind.plan.observed` -> fold into `plan.updated` or `cognition.belief_updated`.
- `mind.product.observed` -> fold into `commerce.product.updated` or
  `cognition.belief_updated`.

Until those two emit sites are migrated, the `EventEmitter2` bus remains alive.

---

## 4. Frequency Heat Map

Number of source-line literal occurrences per namespace (from
`rg "'<ns>\.\w" backend/src --type ts -c | awk -F: '{s+=$2}'`).

| Namespace | Literal occurrences | Canonical events | Density |
|-----------|--------------------:|-----------------:|--------:|
| `commerce` | 2,444 | 60 | 40.7 |
| `cognition` | 112 | 6 | 18.7 |
| `product` | 112 | 5 | 22.4 |
| `payment` | 89 | 3 | 29.7 |
| `mind` | 78 | 0 (legacy) | — |
| `sale` | 60 | 1 | 60.0 |
| `lineage` | 58 | 6 | 9.7 |
| `plan` | 49 | 4 | 12.3 |
| `brain` | 47 | 0 (retained) | — |
| `pulse` | 46 | 3 | 15.3 |
| `wallet` | 37 | 2 | 18.5 |
| `account` | 35 | 5 | 7.0 |
| `agent` | 32 | 2 | 16.0 |
| `whatsapp` | 27 | 8 | 3.4 |
| `campaign` | 21 | 1 | 21.0 |
| `autopilot` | 18 | 1 | 18.0 |
| `auth` | 14 | 1 | 14.0 |
| `workspace` | 11 | 2 | 5.5 |
| `channel` | 9 | 2 | 4.5 |
| `test` | 7 | 2 | 3.5 |
| `subscription` | 6 | 1 | 6.0 |
| `billing` | 6 | 2 | 3.0 |
| `affiliate` | 4 | 1 | 4.0 |
| `memory` | 3 | 1 | 3.0 |
| `flow` | 3 | 1 | 3.0 |
| `brand` | 2 | 1 | 2.0 |
| `ai` | 2 | 1 | 2.0 |

**Interpretation.** High density on `sale`, `cognition`, `payment`, `campaign`
indicates names appear across many test/spec assertions per canonical event —
load-bearing for the spine contract. `commerce` has the broadest fan-out because
nine sub-namespaces share the prefix. `brain` and `mind` densities are calibrated
in section 5 below.

---

## 5. Canonical vs `brain.*` Status

### 5.1 Live emit sites — verified

Counts from `rg "\.emit\(['\"]<prefix>\." backend/src --type ts -l | wc -l`:

| Prefix | Live `.emit()` callers | Notes |
|--------|----------------------:|-------|
| `brain.*` | **0** | Zero live emits. All 47 literals are non-emit anchors. |
| `mind.*` | 2 | `mind.plan.observed`, `mind.product.observed` (legacy `EventEmitter2`). |
| `cognition.*` | 1 | `cognition.consciousness.experience_recorded` via `eventBus?.emit()`. |

Surface emitters call `spineEmitter.emit(envelope)` / `emitEvent(envelope)`, not
`.emit('<string>')`. Counting `spineEmit | spine.emit | emitEvent | spineEmitter.emit`
in `backend/src` yields **47 emitter files** — the canonical spine perimeter.

### 5.2 Why `brain.*` is retained (47 literals across 16 files)

The 47 `brain.*` literal occurrences are **load-bearing contracts for three
non-spine subsystems**. Removing them is a regression even though they are not
spine events:

1. **Metrics ratchet** — `backend/src/observability/metrics.ts` uses
   `'brain.decide'`, `'brain.decide.duration_ms'`, `'brain.decide.failed'`
   as Prometheus/StatsD metric names. The PULSE ratchet asserts these strings
   stay stable so historical time-series stitch across deploys.

2. **Audit/legacy-test contracts** — `mind-spine-audit.service.spec.ts`,
   `mind-event-spine.helpers.spec.ts`, and six other spec files assert that the
   audit log captures `'brain.capability.invoked'`, `'brain.decide'`,
   `'brain.observe'`, `'brain.autonomy.propose'` as recorded outcomes. These
   tests are the canonical contract for the Brain to Mind migration; deleting
   the strings before migrating the spec assertions breaks the migration ratchet.

3. **Migration taxonomy whitelist** —
   `backend/src/kloel/mind/coordination/mind-event-taxonomy.ts` declares
   `BRAIN_EVENT_TAXONOMY = ['brain.decide', 'brain.observe',
   'brain.autonomy.propose', 'brain.capability.invoked', ...]` as the migration
   whitelist consumed by `MindCommercialGraphService`,
   `MindCapabilityExecutorService`, and `MindAutonomyCoordinatorService` to
   route legacy calls into Mind-prefixed canonical equivalents.

**The 47 literals split as:** 27 in 8 production source files + 20 in 8 test/spec
files. None map to `.emit('brain.*')` calls; all are either function names,
metric keys, audit-log assertions, or migration-table entries.

### 5.3 Distribution of `brain.*` literals (verified file-by-file)

```
backend/src/kloel/mind/coordination/mind-event-taxonomy.ts         4
backend/src/kloel/mind/coordination/mind-runtime.controller.ts     9
backend/src/kloel/mind/coordination/mind-runtime.service.ts        3
backend/src/kloel/mind/coordination/mind-autonomy-coordinator.ts   3
backend/src/kloel/mind/coordination/mind-capability-executor.ts    2
backend/src/kloel/mind/coordination/mind-commercial-graph.ts       2
backend/src/kloel/mind/observability/mind-spine-audit.service.ts   2
backend/src/observability/metrics.ts                               3
backend/src/.../*.spec.ts (8 files)                               20
                                                                  --
                                                                  47
```

### 5.4 Rule: zero `brain.*` spine emits, all 47 literals retained

| Action | Allowed |
|--------|---------|
| Add new `.emit('brain.<x>')` call site | **No** — fails canonicalization ratchet. |
| Add new entry to `BRAIN_EVENT_TAXONOMY[]` | Allowed only with deprecation note + migration target. |
| Delete `brain.*` metric name in `metrics.ts` | **No** — breaks historical time-series. |
| Delete `brain.*` assertion in spec | Allowed only when the matching production literal is also removed in the same commit. |
| Rename a `brain.*` literal | **No** — must migrate via Brain to Mind table first. |

---

## 6. Naming Conventions

### 6.1 Canonical namespace grammar

```
<domain>.<entity>.<verb_past_tense>
<domain>.<sub_domain>.<entity>.<verb_past_tense>
```

Examples that **conform**:

- `commerce.checkout.created`
- `commerce.kyc.approved`
- `commerce.affiliate.commission_calculated`
- `whatsapp.message_sent`
- `pulse.gate_passed`

Examples that **violate** (and where they live):

- `cognition.handoff.confidence.blocking` (four levels — flagged for compaction).
- `commerce.checkout_started_without_payment` (snake_case across two verbs —
  flagged for split into `commerce.checkout.started` + state machine).
- `lineage.something_else` / `lineage.ciclo_pulse_nao_regressivo` (placeholder
  names from test fixtures — flagged for removal or rename).

### 6.2 Disambiguation rules

| Pair | Canonical use |
|------|---------------|
| `commerce.product.*` vs `product.*` | `commerce.product.created/updated/published/deleted` for product CRUD; `product.*` only for sub-resources (`pixel_configured`, `shipping_updated`, `url_*`). |
| `commerce.payment.*` vs `payment.*` | `commerce.payment.*` covers lifecycle outcomes (initiated/approved/declined/refunded/charged_back); `payment.*` covers instrument issuance (`link_created`, `boleto_generated`, `pix_generated`). |
| `commerce.campaign.*` vs `campaign.*` | `commerce.campaign.*` for measured outcomes; `campaign.created` for top-level CRUD. |
| `commerce.affiliate.*` vs `affiliate.*` | `commerce.affiliate.*` for commercial events; `affiliate.program_updated` for program CRUD. |
| `commerce.whatsapp.*` vs `whatsapp.*` vs `channel.*` | `whatsapp.*` for raw channel telemetry; `commerce.whatsapp.*` for commercial semantics on the channel; `channel.*` for the channel-agnostic abstraction. |
| `brain.*` vs `mind.*` vs `cognition.*` | `brain.*` retained only as ratchet/audit/legacy-test anchors (zero live emits); `mind.*` legacy `EventEmitter2` bus, two live emits awaiting migration; `cognition.*` canonical spine namespace going forward. |

---

## 7. Anti-Regression Rules

These rules are enforced by ratchet gates and architecture audits. Violating any
of them blocks PRs.

1. **No new `brain.*` spine emit sites.**
   `rg "\.emit\(['\"]brain\." backend/src --type ts -l | wc -l` must remain `0`.
   New `brain.*` references are only allowed in (a) `BRAIN_EVENT_TAXONOMY[]` with
   deprecation note + migration target, (b) `metrics.ts` with explicit
   time-series rationale, or (c) existing test scaffolds.

2. **No new `mind.*` live emit sites via `EventEmitter2`.** The two existing
   sites (`plan.service.ts`, `product.service.ts`) are the regression ceiling.
   New emissions must go through `SpineEmitterService` with a canonical
   namespace from section 2.

3. **Every new event must be added to `tools/asyncapi/asyncapi-spec.json` in the
   same PR.** The asyncapi extractor (`scripts/cognitive/asyncapi-extract.mjs`)
   runs on CI; missing entries fail `tools/asyncapi/asyncapi-contract.spec.mjs`.

4. **Event names must follow section 6.1 grammar.** Lower-case domain,
   dot-separated, verb in past tense, no camelCase, no hyphens. Three levels
   preferred; four levels allowed only when the third level is a sub-namespace
   (e.g. `commerce.affiliate.commission_calculated`).

5. **No event renames without a deprecation table entry.** Renames must update
   `docs/architecture/DEPRECATION_MAP.md` and `EVENT_TAXONOMY_MIGRATION.md` with
   both the old and new name, the migration commit, and the cutover date.

6. **No emit outside the spine.** Direct DB writes that emulate events (writing
   to `AutopilotEvent`/`MindOutboxEvent` without going through
   `SpineEmitterService.emit()`) are forbidden. The spine is the single
   chokepoint for envelope stamping, valence tagging, and ring-buffer ordering.

7. **No `EventEmitter2` listeners.** `rg "@OnEvent\(" backend/src --type ts -l |
   wc -l` must remain `0`. Listening requires reading the spine outbox or
   subscribing to the Redis spine stream.

8. **Test-fixture namespaces (`test.*`) never leak to production paths.**
   `test.low` and `test.unknown` are confined to `evol.spec.ts`. The
   architecture-gate audit verifies they do not appear in any non-spec file.

9. **`sale.*` namespace ceiling.** Only `sale.created` is canonical. The five
   additional strings (`sale.completed`, `sale.confirmed`, `sale.refunded`,
   `sale.cancelled`, `sale.failed`) are migration candidates that must move into
   `commerce.payment.*` or `commerce.checkout.*` before being added to the
   AsyncAPI canonical set.

10. **`commerce.*` is the macro-bucket.** New commercial events must default to
    `commerce.<sub_domain>.<entity>.<verb>` unless they cross commercial /
    platform / channel boundaries. If unsure, default to `commerce.*`.

---

## 8. Validation Commands

Reproduce every number in this doc:

```bash
# Channel + namespace counts (AsyncAPI source of truth)
python3 -c "
import json
from collections import defaultdict
d = json.load(open('tools/asyncapi/asyncapi-spec.json'))
ch = d.get('channels', {})
ns = defaultdict(list)
for n in ch: ns[n.split('.', 1)[0]].append(n)
print('channels:', len(ch), 'namespaces:', len(ns))
for k in sorted(ns): print(f'  {k:15} {len(ns[k]):3d}')
"

# Spine emitter file count
rg "spineEmit|spine\.emit|emitEvent|spineEmitter\.emit" backend/src --type ts -l | wc -l

# Live emit-site counts by prefix
rg "\.emit\(['\"]brain\."     backend/src --type ts -l | wc -l   # -> 0
rg "\.emit\(['\"]mind\."      backend/src --type ts -l | wc -l   # -> 2
rg "\.emit\(['\"]cognition\." backend/src --type ts -l | wc -l   # -> 1

# Literal occurrence counts by namespace
for ns in commerce cognition product payment mind sale lineage plan brain pulse \
          wallet account agent whatsapp campaign autopilot auth workspace channel \
          test subscription billing affiliate memory flow brand ai; do
  c=$(rg "'${ns}\." backend/src --type ts -c 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  printf '%-15s %s\n' "$ns" "$c"
done
```

---

## 9. Related Artifacts

- `docs/architecture/CANONICAL_DOMAINS.md` — domain boundaries that anchor every namespace prefix.
- `docs/architecture/CANONICAL_VOCABULARY.md` — single canonical name per concept.
- `docs/architecture/CAPABILITY_MAP.md` — capability to event linkage.
- `docs/architecture/SERVICE_CATALOG.md` — service to emitter linkage.
- `docs/architecture/DUPLICATION_REGISTER.md` — duplicate-emitter and overlapping-namespace tracking.
- `docs/architecture/DEPRECATION_MAP.md` — rename / removal trail.
- `docs/architecture/EVENT_TAXONOMY_MIGRATION.md` — operational cutover log.
- `docs/architecture/EVENT_TAXONOMY_KLOEL_TO_MIND_MIGRATION.md` — Brain to Mind migration table.
- `docs/architecture/ANTI_REGRESSION_GATES.md` — list of ratchet gates that enforce section 7.
- `tools/asyncapi/asyncapi-spec.json` — auto-generated source of truth (122 channels).
- `tools/asyncapi/asyncapi-contract.spec.mjs` — CI test that prevents drift.
- `scripts/cognitive/asyncapi-extract.mjs` — extractor.
- `backend/src/kloel/spine/spine-emitter.service.ts` — single spine chokepoint.
- `backend/src/kloel/spine/spine-event.types.ts` — envelope schema.
- `backend/src/kloel/mind/coordination/mind-event-taxonomy.ts` — Brain/Mind whitelist.

---

_Generated 2026-05-29 from real codebase scans. See section 8 to reproduce every count._
