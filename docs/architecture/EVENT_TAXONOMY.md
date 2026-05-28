# Kloel Event Taxonomy

> **PI Task K24** — Current event inventory + proposed canonical taxonomy.
> Source: `SpineEmitterService.emit()` sites (not NestJS EventEmitter2 — which has zero listeners).

---

## 1. Current Event Names (from codebase)

All events flow through `SpineEmitterService` → DB outbox (`AutopilotEvent` / `MindOutboxEvent`).
No NestJS `@OnEvent()` decorators exist anywhere in the codebase.

### 1.1 Commerce — Cart & Checkout

| Event | Emitter |
|---|---|
| `commerce.cart.created` | `CheckoutEventEmitterService` |
| `commerce.cart.abandoned` | `CheckoutEventEmitterService` |
| `commerce.cart.checkout_initiated` | `CheckoutEventEmitterService` |
| `commerce.checkout.created` | `CheckoutEventEmitterService` |
| `commerce.checkout.updated` | `CheckoutEventEmitterService` |

### 1.2 Commerce — Payment

| Event | Emitter |
|---|---|
| `commerce.payment.initiated` | `CheckoutEventEmitterService` |
| `commerce.payment.approved` | `CheckoutEventEmitterService` |
| `commerce.payment.declined` | `CheckoutEventEmitterService` |
| `commerce.payment.refunded` | `CheckoutEventEmitterService` |
| `commerce.payment.charged_back` | `CheckoutEventEmitterService` |

### 1.3 Commerce — Lead / CRM

| Event | Emitter |
|---|---|
| `commerce.lead.converted` | `CheckoutEventEmitterService` |
| `commerce.lead.created` | `coldstart.types.ts` |
| `commerce.lead.contacted` | `coldstart.types.ts` |
| `commerce.lead.replied` | `coldstart.types.ts` |
| `commerce.lead.objection_raised` | `ChannelPolicyRegistry` |
| `commerce.lead.went_silent` | `ChannelPolicyRegistry` |
| `commerce.crm.deal_won` | `coldstart.types.ts` |
| `commerce.crm.deal_lost` | `coldstart.types.ts` |
| `commerce.crm.stage_changed` | `CrmEventEmitterService` |

### 1.4 Commerce — WhatsApp / Channel

| Event | Emitter |
|---|---|
| `commerce.whatsapp.message_received` | `ChannelPolicyRegistry`, `mind-perception.service.ts` |
| `commerce.whatsapp.message_replied` | `ChannelPolicyRegistry`, `channel-health.monitor.service.ts` |
| `commerce.whatsapp.handoff_to_human` | `ChannelPolicyRegistry` |
| `commerce.whatsapp.session_lifecycle` | `ChannelPolicyRegistry` |
| `commerce.whatsapp.conversation_resumed` | `ChannelPolicyRegistry` |
| `commerce.whatsapp.sent` | `channel.spec.ts` (test) |
| `commerce.whatsapp.failed` | `channel.spec.ts` (test) |
| `commerce.whatsapp.policy_violation` | `channel.spec.ts` (test) |
| `commerce.whatsapp.restriction` | `channel.spec.ts` (test) |

### 1.5 Commerce — Campaign

| Event | Emitter |
|---|---|
| `commerce.campaign.clicked` | `CampaignEventEmitterService` |
| `commerce.campaign.conversion_associated` | `CampaignEventEmitterService` |
| `commerce.campaign.audience_reached` | `CampaignEventEmitterService` |
| `commerce.campaign.creative_swapped` | `CampaignEventEmitterService` |
| `commerce.campaign.performance_drop_detected` | `CampaignEventEmitterService` |

### 1.6 Commerce — Post-Sale

| Event | Emitter |
|---|---|
| `commerce.post_sale.delivery_completed` | `CheckoutPostPaymentEffectsService` |
| `commerce.post_sale.activation_started` | `CheckoutPostPaymentEffectsService` |
| `commerce.post_sale.churn_risk_detected` | `BanRiskDetector` |
| `commerce.post_sale.first_value_obtained` | `channel-policy.registry.spec.ts` (test) |
| `commerce.post_sale.satisfaction_signal_observed` | `channel-policy.registry.spec.ts` (test) |
| `commerce.post_sale.repurchase_window_opened` | `channel-policy.registry.spec.ts` (test) |
| `commerce.post_sale.win_back_window_opened` | `channel-policy.registry.spec.ts` (test) |

### 1.7 Commerce — KYC

| Event | Emitter |
|---|---|
| `commerce.kyc.document_submitted` | `KycEventEmitterService` |
| `commerce.kyc.approved` | `KycEventEmitterService` |
| `commerce.kyc.rejected` | `KycEventEmitterService` |

### 1.8 Cognition

| Event | Emitter |
|---|---|
| `cognition.decision_made` | `KloelReplyEngineService`, `GuestChatService`, `conversational-onboarding.mind-deps.helpers.ts`, `admin-chat.service.ts` |
| `cognition.belief_updated` | `BeliefUpdateService` (`hypproof/belief-update.ts`) |

### 1.9 Socket.IO (client-facing)

| Event | Emitter |
|---|---|
| `alert:event` | `AlertsGateway` |
| `copilot:suggestion` | `CopilotGateway` |
| `flow:log` | `FlowsGateway` |
| `alert` | `FlowsGateway` |

### 1.10 Raw EventEmitter2 (legacy — NO listeners)

| Event | Emitter | Notes |
|---|---|---|
| `product.created` | `ProductService` (line 107) | Dead — no `@OnEvent` consumer |
| `product.updated` | `ProductService` (line 171) | Dead |
| `product.deleted` | `ProductService` (line 480) | Dead |
| `product.published` | `ProductService` (line 360) | Dead |
| `plan.created` | `PlanService` (line 120) | Dead |
| `plan.updated` | `PlanService` (line 232) | Dead |
| `plan.deleted` | `PlanService` (line 281) | Dead |

---

## 2. Proposed Canonical Taxonomy

Prefix family: `domain.subdomain.action_past_tense`. All events MUST be past-tense.

### 2.1 `commerce.cart.*`

| Current | Proposed canonical | Status |
|---|---|---|
| `commerce.cart.created` | ✅ Already canonical | — |
| `commerce.cart.abandoned` | ✅ Already canonical | — |
| `commerce.cart.checkout_initiated` | 🔄 `commerce.checkout.initiated` | Same domain, clearer grouping |

### 2.2 `commerce.checkout.*`

| Current | Proposed canonical | Status |
|---|---|---|
| `commerce.checkout.created` | ✅ Already canonical | — |
| `commerce.checkout.updated` | ✅ Already canonical | — |

### 2.3 `commerce.payment.*`

| Current | Proposed canonical | Status |
|---|---|---|
| `commerce.payment.initiated` | ✅ Already canonical | — |
| `commerce.payment.approved` | ✅ Already canonical | — |
| `commerce.payment.declined` | ✅ Already canonical | — |
| `commerce.payment.refunded` | ✅ Already canonical | — |
| `commerce.payment.charged_back` | ✅ Already canonical | — |

### 2.4 `commerce.lead.*`

| Current | Proposed canonical | Status |
|---|---|---|
| `commerce.lead.created` | ✅ Already canonical | — |
| `commerce.lead.contacted` | ✅ Already canonical | — |
| `commerce.lead.replied` | ✅ Already canonical | — |
| `commerce.lead.converted` | ✅ Already canonical | — |
| `commerce.lead.objection_raised` | ✅ Already canonical | — |
| `commerce.lead.went_silent` | ✅ Already canonical | — |

### 2.5 `commerce.crm.*`

| Current | Proposed canonical | Status |
|---|---|---|
| `commerce.crm.deal_won` | ✅ Already canonical | — |
| `commerce.crm.deal_lost` | ✅ Already canonical | — |
| `commerce.crm.stage_changed` | ✅ Already canonical | — |

### 2.6 `channel.message.*` (NEW — consolidate WhatsApp events)

| Current | Proposed canonical | Status |
|---|---|---|
| `commerce.whatsapp.message_received` | 🔄 `channel.message.received` | Channel-agnostic |
| `commerce.whatsapp.message_replied` | 🔄 `channel.message.sent` | Channel-agnostic |
| `commerce.whatsapp.sent` | 🔄 `channel.message.dispatched` | Channel-agnostic |
| `commerce.whatsapp.failed` | 🔄 `channel.message.failed` | Channel-agnostic |

### 2.7 `channel.session.*` (NEW)

| Current | Proposed canonical | Status |
|---|---|---|
| `commerce.whatsapp.session_lifecycle` | 🔄 `channel.session.changed` | Channel-agnostic |
| `commerce.whatsapp.conversation_resumed` | 🔄 `channel.session.resumed` | Channel-agnostic |
| `commerce.whatsapp.handoff_to_human` | 🔄 `channel.session.handoff` | Channel-agnostic |

### 2.8 `campaign.action.*` (NEW)

| Current | Proposed canonical | Status |
|---|---|---|
| `commerce.campaign.clicked` | 🔄 `campaign.action.clicked` | Clearer domain prefix |
| `commerce.campaign.conversion_associated` | 🔄 `campaign.action.converted` | Simpler |
| `commerce.campaign.audience_reached` | 🔄 `campaign.audience.reached` | Separate subdomain |
| `commerce.campaign.creative_swapped` | 🔄 `campaign.creative.swapped` | Separate subdomain |
| `commerce.campaign.performance_drop_detected` | 🔄 `campaign.health.degraded` | Metric event |

### 2.9 `cognition.*`

| Current | Proposed canonical | Status |
|---|---|---|
| `cognition.decision_made` | ✅ Already canonical | — |
| `cognition.belief_updated` | ✅ Already canonical | — |

### 2.10 `post_sale.*`

| Current | Proposed canonical | Status |
|---|---|---|
| `commerce.post_sale.*` | 🔄 `post_sale.*` (drop `commerce.`) | Separate lifecycle phase |

---

## 3. Migration Strategy

**Phase 1 (now)**: This taxonomy becomes canonical reference. No code changes.

**Phase 2 (ADR-0013 Wave M6)**: Extend `BRAIN_EVENT_TAXONOMY` constant in `backend/src/kloel/brain-event-taxonomy.ts` with alias map:

```ts
export const EVENT_ALIASES = {
  'commerce.whatsapp.message_received': 'channel.message.received',
  'commerce.whatsapp.message_replied': 'channel.message.sent',
  'commerce.campaign.clicked': 'campaign.action.clicked',
  // …
} as const;
```

**Phase 3 (Wave M7+)**: Update emitters to write canonical names; consumers use alias map during transition.

---

## Raw EventEmitter2 Output

<details>
<summary>Complete raw scan from `tools/canonicalize/scan.mjs` (39 events)</summary>

- `SIGINT` — 0 emit / 2 listen
- `SIGTERM` — 0 emit / 2 listen
- `active` — 0 emit / 1 listen
- `alert` — 1 emit / 0 listen
- `alert:event` — 2 emit / 0 listen
- `close` — 0 emit / 5 listen
- `completed` — 0 emit / 5 listen
- `connect` — 0 emit / 2 listen
- `connect_error` — 0 emit / 1 listen
- `copilot:suggestion` — 2 emit / 0 listen
- `data` — 0 emit / 1 listen
- `disconnect` — 0 emit / 1 listen
- `error` — 0 emit / 12 listen
- `failed` — 0 emit / 9 listen
- `finish` — 0 emit / 1 listen
- `flow:log` — 1 emit / 0 listen
- `join` — 1 emit / 0 listen
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
- `plan.deleted` — 2 emit / 0 listen
- `plan.updated` — 2 emit / 0 listen
- `pmessage` — 0 emit / 2 listen
- `product.deleted` — 2 emit / 0 listen
- `product.published` — 2 emit / 0 listen
- `product.updated` — 4 emit / 0 listen
- `ready` — 0 emit / 3 listen
- `selection:cleared` — 0 emit / 1 listen
- `selection:created` — 0 emit / 1 listen
- `selection:updated` — 0 emit / 1 listen
- `unhandledRejection` — 0 emit / 2 listen

</details>