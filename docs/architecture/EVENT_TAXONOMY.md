# Kloel Event Taxonomy (canonical)

> Generated 2026-05-21 from all `spine.emit` call sites in `backend/src/`.
> **44 production events** found. Previous doc claimed 70 — 26 were stale/deprecated entries removed.
> Gate: `scripts/ops/check-canonical-events.mjs` enforces no new event outside the documented namespaces.

## Canonical event namespaces

Every domain event in Kloel flows through `SpineEventEmitter.emit({ eventName, ... })`.
Names follow the schema:

```
<namespace>.<sub-domain>.<verb_phrase_in_past_or_state>
```

Examples:
- `commerce.payment.approved`  ✅ canonical
- `commerce.lead.qualified`    ✅ canonical
- `cognition.decision_made`    ✅ canonical (no sub-domain — root concern)
- `paymentApproved`            ❌ non-canonical, lacks namespace
- `Lead.qualified`             ❌ non-canonical, mixed case
- `ViewContent`                ❌ analytics shorthand, not a Spine event

### Top-level namespaces

| Namespace | Count | Purpose | Status |
|---|---:|---|---|
| `commerce.*` | 31 | Business domain — leads, sales, payments, lifecycle | ✅ canonical |
| `cognition.*` | 2 | KLOEL cognitive organism — beliefs, decisions | ✅ canonical |
| `lineage.*` | 1 | Append-only audit chain — genesis | ✅ canonical |
| `pulse.*` | 2 | PULSE health/gate signals | ✅ canonical |

**Note:** `evolution.gap_detected` is referenced in `drift-attribution.service.ts` config but has NO `spine.emit` call site — excluded from counts. `auth.*`, `workspace.*`, and `mercado_entrada.*` had events only in tests/spec fixtures, not in production emitters — removed until emitters exist.

## Full canonical event inventory (36 production-emitted Spine events)

### commerce.affiliate.* (2)

| Event | Emitter | File:Line |
|---|---|---|
| `commission_calculated` | `MemberAreaEventEmitterService` | `member-area-event-emitter.service.ts:145` |
| `performance_measured` | `MemberAreaEventEmitterService` | `member-area-event-emitter.service.ts:126` |

### commerce.campaign.* (5)

| Event | Emitter | File:Line |
|---|---|---|
| `audience_reached` | `CampaignEventEmitterService` | `campaign-event-emitter.service.ts:92` |
| `clicked` | `CampaignEventEmitterService` | `campaign-event-emitter.service.ts:52` |
| `conversion_associated` | `CampaignEventEmitterService` | `campaign-event-emitter.service.ts:72` |
| `creative_swapped` | `CampaignEventEmitterService` | `campaign-event-emitter.service.ts:112` |
| `performance_drop_detected` | `CampaignEventEmitterService` | `campaign-event-emitter.service.ts:133` |

### commerce.cart.* (3)

| Event | Emitter | File:Line |
|---|---|---|
| `abandoned` | `CheckoutEventEmitterService` | `checkout-event-emitter.service.ts:56` |
| `checkout_initiated` | `CheckoutEventEmitterService` | `checkout-event-emitter.service.ts:90` |
| `created` | `CheckoutEventEmitterService` | `checkout-event-emitter.service.ts:23` |

### commerce.crm.* (5)

| Event | Emitter | File:Line |
|---|---|---|
| `deal_lost` | `CrmEventEmitterService` | `crm-event-emitter.service.ts:103` |
| `deal_won` | `CrmEventEmitterService` | `crm-event-emitter.service.ts:82` |
| `next_step_defined` | `CrmEventEmitterService` | `crm-event-emitter.service.ts:61` |
| `owner_assigned` | `CrmEventEmitterService` | `crm-event-emitter.service.ts:40` |
| `stage_changed` | `CrmEventEmitterService` | `crm-event-emitter.service.ts:19` |

### commerce.kyc.* (3)

| Event | Emitter | File:Line |
|---|---|---|
| `approved` | `KycEventEmitterService` | `kyc-event-emitter.service.ts:65` |
| `document_submitted` | `KycEventEmitterService` | `kyc-event-emitter.service.ts:37` |
| `rejected` | `KycEventEmitterService` | `kyc-event-emitter.service.ts:96` |

### commerce.lead.* (2)

Only events with concrete `spine.emit` call sites:

| Event | Emitter | File:Line |
|---|---|---|
| `converted` | `CheckoutEventEmitterService` | `checkout-event-emitter.service.ts:307` |
| `objection_raised` | `CrmEventEmitterService` | `crm-event-emitter.service.ts:124` |

### commerce.member_area.* (3)

| Event | Emitter | File:Line |
|---|---|---|
| `dropped_out` | `MemberAreaEventEmitterService` | `member-area-event-emitter.service.ts:105` |
| `enrolled` | `MemberAreaEventEmitterService` | `member-area-event-emitter.service.ts:60` |
| `progressed` | `MemberAreaEventEmitterService` | `member-area-event-emitter.service.ts:82` |

### commerce.onboarding.* (1)

| Event | Emitter | File:Line |
|---|---|---|
| `declared` | `MercadoEntradaDeclaratorService` | `mercado-entrada.declarator.service.ts:268,358` |

### commerce.payment.* (5)

| Event | Emitter | File:Line |
|---|---|---|
| `approved` | `CheckoutEventEmitterService` | `checkout-event-emitter.service.ts:159` |
| `charged_back` | `CheckoutEventEmitterService` | `checkout-event-emitter.service.ts:272` |
| `declined` | `CheckoutEventEmitterService` | `checkout-event-emitter.service.ts:193` |
| `initiated` | `CheckoutEventEmitterService` | `checkout-event-emitter.service.ts:125` |
| `refunded` | `CheckoutEventEmitterService` | `checkout-event-emitter.service.ts:232` |

### commerce.post_sale.* (8)

| Event | Emitter | File:Line |
|---|---|---|
| `activation_started` | `CheckoutPostPaymentEffectsService` | `checkout-post-payment-effects.service.ts:131` |
| `churn_risk_detected` | `BanRiskDetector` | `ban-risk.detector.ts:150` |
| `delivery_completed` | `CheckoutPostPaymentEffectsService` | `checkout-post-payment-effects.service.ts:115` |
| `first_value_obtained` | `FirstValueDetector` | `first-value.detector.ts:161` |
| `no_regret_confirmed` | `NoRegretPipelineService` | `no-regret-pipeline.service.ts:169` |
| `repurchase_window_opened` | `RepurchaseWindowDetector` | `repurchase-window.detector.ts:123` |
| `satisfaction_signal_observed` | `SatisfactionCollectorService` | `satisfaction-collector.service.ts:175` |
| `win_back_window_opened` | `WinbackWindowAdvisor` | `winback-window.advisor.ts:88` |

### commerce.whatsapp.* (1)

| Event | Emitter | File:Line |
|---|---|---|
| `handoff_to_human` | `WhatsappEventEmitterService` | `whatsapp-event-emitter.service.ts:224` |

**Note:** `session_lifecycle` is referenced in `drift-attribution.service.ts:25` but has no `spine.emit` call site — config reference only, excluded.

### cognition.* (2)

| Event | Emitter | File:Line |
|---|---|---|
| `belief_updated` | `BeliefUpdate` | `belief-update.ts:62` |
| `valence_assigned` | `OperatorFeedbackLoop` | `operator-feedback.loop.ts:68` |

### lineage.* (1)

| Event | Emitter | File:Line |
|---|---|---|
| `genesis` | `LineageLedgerService` | `lineage-ledger.service.ts:118` |

### pulse.* (2)

| Event | Emitter | File:Line |
|---|---|---|
| `gate_passed` | `PulseSpineBridge` / `EventEmitAuditEventEmitterService` | `pulse-spine.bridge.ts:28`, `event-emit-audit-event-emitter.service.ts:41` |
| `gate_failed` | `PulseSpineBridge` / `EventEmitAuditEventEmitterService` | `pulse-spine.bridge.ts:28`, `event-emit-audit-event-emitter.service.ts:41` |

## Deprecated events (doc claimed, code has NO production emit — 26 stale entries removed)

- `commerce.affiliate.click_registered`, `commission_received`, `link_created`
- `commerce.checkout.created`
- `commerce.error.recovery_proof_packaged`
- `commerce.lead.contacted`, `created`, `lost`, `qualified`, `replied`, `went_silent`
- `commerce.payment.failed`
- `commerce.product.created`, `updated`
- `commerce.whatsapp.message_received`, `message_replied`
- `cognition.analysis_completed`, `analysis_started`, `decision_made`
- `lineage.capability_acquired`, `ciclo_pulse_nao_regressivo`, `skill_consolidated`, `tampered`
- `auth.refresh_token_expired`
- `workspace.settings.updated`

These names appear in spec fixtures or consumer filters but lack a `spine.emit` call. They should either be:
- Wired to a real emitter service, or
- Removed from spec fixtures if unused.

The PULSE auditor (`scripts/pulse/no-hardcoded-reality-audit.ts`) will report these as hardcode debt.

## Non-canonical / cleanup candidates

| Name | File | Notes |
|---|---|---|
| `evolution.gap_detected` | `drift-attribution.service.ts:19` | Config reference only, no `spine.emit` |
| `commerce.whatsapp.session_lifecycle` | `drift-attribution.service.ts:25` | Config reference only, no `spine.emit` |
| `Purchase` | `checkout-post-payment-effects.service.ts:172` | Meta Pixel event, not Spine |
| `ViewContent` | Meta Pixel | Analytics shorthand, not a Spine event |
| `a.b.c`, `d.e.f`, `p.q.r`, `x.y.z` | Spec tests | Test fixtures |

## Non-Spine event surfaces

### BullMQ queue names (15)

Worker-side processing queues — see [QUEUES_CATALOG.md](QUEUES_CATALOG.md):

```
autopilot       campaign        campaign-jobs   crm
flow            mass-send       media           media-jobs
memory          scraper         scraper-jobs    voice
voice-jobs      webhook
```

### WebSocket gateway emits (2)

Real-time UI push:
- `alert:event` — admin alert push (AlertGateway)
- `copilot:suggestion` — CRM copilot suggestion push (CopilotGateway)

### BullMQ job names (~23)

`send-message`, `tick`, `dispatch`, `sync-meta-insights`, `run-flow`,
`run-scraper`, `generate-audio`, `transcribe-audio`, `generate-video`,
`refresh-google-token`, `refresh-meta-token`, `login`, `whatsapp`,
`instagram`, `facebook`, `first_feature_use`, `first_result_achieved`,
`platform_configured`, `sync-accounts`, `sync-campaigns`, `sync-insights`,
`sync-meta-accounts`, `sync-meta-campaigns`

Naming convention: `<verb>-<noun>` kebab-case.

## Gates

`scripts/ops/check-canonical-events.mjs` runs in pre-push and CI:

1. Scans `backend/src/**/*.ts` for `eventName: '<name>'`
2. Validates each against canonical namespaces above
3. Fails if a new event uses unauthorized namespace
4. Test fixtures scoped to `*.spec.ts`

## How to add a new event (canonical flow)

1. Pick namespace: commerce / cognition / lineage / pulse / auth / workspace
2. Pick sub-domain matching existing (lead, payment, crm) — avoid new sub-domains until 3+ events justify
3. Verb in past tense / state: `created`, `failed`, `approved`, `qualified` (snake_case)
4. Add to this file inventory
5. `await this.spine.emit({ eventName: 'commerce.foo.bar', ... })`
6. Add subscriber if reactive
7. `npm run canonical:check` must pass

## Related

- [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md)
- [CAPABILITY_MAP.md](CAPABILITY_MAP.md)
- [QUEUES_CATALOG.md](QUEUES_CATALOG.md)
