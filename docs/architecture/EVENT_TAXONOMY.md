# Kloel Event Taxonomy (canonical)

> Generated 2026-05-21 from grep over `backend/src/**/*.ts` for `eventName:` literals.
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
- `ViewContent`                ❌ analytics shorthand, not a domain event

### Top-level namespaces

| Namespace | Count | Purpose | Status |
|---|---:|---|---|
| `commerce.*` | 54 | Business domain — leads, sales, payments, lifecycle | ✅ canonical |
| `cognition.*` | 5 | KLOEL cognitive organism — beliefs, decisions | ✅ canonical |
| `lineage.*` | 6 | Append-only audit chain — genesis, skill consolidation | ✅ canonical |
| `pulse.*` | 3 | PULSE health/gate signals | ✅ canonical |
| `auth.*` | 1 | Identity events | ✅ canonical |
| `workspace.*` | 1 | Tenant-level events | ✅ canonical |
| `mercado_entrada.*` | 1 | Onboarding/entry funnel | ⚠️ rename to `commerce.onboarding.*` |

## Full canonical event inventory (70 events)

### commerce.affiliate.* (5)

`click_registered`, `commission_calculated`, `commission_received`, `link_created`, `performance_measured`

### commerce.campaign.* (5)

`audience_reached`, `clicked`, `conversion_associated`, `creative_swapped`, `performance_drop_detected`

### commerce.cart.* (3)

`abandoned`, `checkout_initiated`, `created`

### commerce.checkout.* (1)

`created`

### commerce.crm.* (5)

`deal_lost`, `deal_won`, `next_step_defined`, `owner_assigned`, `stage_changed`

### commerce.error.* (1)

`recovery_proof_packaged`

### commerce.kyc.* (3)

`approved`, `document_submitted`, `rejected`

### commerce.lead.* (8)

`contacted`, `converted`, `created`, `lost`, `objection_raised`, `qualified`, `replied`, `went_silent`

### commerce.member_area.* (3)

`dropped_out`, `enrolled`, `progressed`

### commerce.payment.* (6)

`approved`, `charged_back`, `declined`, `failed`, `initiated`, `refunded`

### commerce.post_sale.* (8)

`activation_started`, `churn_risk_detected`, `delivery_completed`, `first_value_obtained`, `no_regret_confirmed`, `repurchase_window_opened`, `satisfaction_signal_observed`, `win_back_window_opened`

### commerce.product.* (2)

`created`, `updated`

### commerce.whatsapp.* (4)

`handoff_to_human`, `message_received`, `message_replied`, `session_lifecycle`

### cognition.* (5)

`analysis_completed`, `analysis_started`, `belief_updated`, `decision_made`, `valence_assigned`

### lineage.* (6)

`capability_acquired`, `ciclo_pulse_nao_regressivo`, `genesis`, `skill_consolidated`, `something_else` (⚠️ rename), `tampered`

### pulse.* (3)

`capability_promoted`, `gate_failed`, `gate_passed`

### auth.* (1)

`refresh_token_expired`

### workspace.* (1)

`settings.updated`

### mercado_entrada.* (1) — rename candidate

- `mercado_entrada.declared` → migrate to `commerce.onboarding.declared`

## Non-canonical / cleanup candidates

Detected but do NOT match canonical schema:

| Name | Action |
|---|---|
| `a`, `b.c`, `d`, `p`, `x`, `some.event` | Test fixtures — keep, scoped to `*.spec.ts` |
| `evolution.something` | Audit + rename or remove |
| `CORE.thing` | Audit + rename |
| `Lead.qualified` | Mixed case — duplicate of `commerce.lead.qualified`, merge |
| `ViewContent`, `Purchase` | Meta Pixel analytics — route through analytics module, not Spine |
| `lineage.something_else` | Generic name — rename to specific or remove |

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
