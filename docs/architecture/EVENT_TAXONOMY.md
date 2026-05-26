# Kloel Event Taxonomy

> Authored by PI atomic subagent `w5-event-taxonomy` (DeepSeek V4 Pro,
> ~37k events). Artifact #4 of the Architectural Semantic Canonicalization
> mission. Materialized 2026-05-26.


> **Artifact #4** — Architectural Semantic Canonicalization mission.
> Generated 2026-05-26. **68 canonical events** across 8 surfaces.

## Naming convention

Every event name is **kebab-case dot-separated**: `<domain>.<entity>.<verb>`

- **domain** — canonical domain from [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md)
- **entity** — the noun the event is about (e.g., `cart`, `payment`, `lead`, `message`)
- **verb** — past-tense or state (e.g., `created`, `approved`, `went_silent`)

Examples:  `commerce.payment.approved` ✅  /  `paymentApproved` ❌  /  `Lead.qualified` ❌

### Two parallel event systems

| System | Transport | Namespace | Consumers |
|---|---:|---|---|
| **Spine** (`spine.emit`) | In-process ring buffer (PCI.6) | `commerce.*`, `cognition.*`, `pulse.*`, `lineage.*` | Post-sale detectors, PULSE gates, V-Tier |
| **Brain Event Spine** (`recordCommercial`) | PostgreSQL outbox (`mindOutboxEvent`) | Unprefixed: `sale.*`, `checkout.*`, `message.*` etc. | MIND, GOAL, LOCAL-IDENT, autopilot replay |

> Both are canonical but live in different namespaces.

---

## Section I — Spine Domain Events (37 production-emitted)

All events flow through `SpineEmitterService.emit({ eventName, ... })`.
Truth-mode: `observed` (confirmed) or `inferred` (classifier output).

### commerce.cart.* — Cart lifecycle

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `commerce.cart.created` | `checkout-event-emitter.service.ts:23` | user action |
| `commerce.cart.abandoned` | `checkout-event-emitter.service.ts:56` | scheduled |
| `commerce.cart.checkout_initiated` | `checkout-event-emitter.service.ts:90` | user action |

**Owning domain**: checkout
**Subscribers**: V-TierCertifierService, SpineCoverageAuditorService, drift-attribution
**Payload**: `{ workspaceId, entityRef: { entityType: 'order', entityId }, payload?: { orderId } }`
**Status**: ✅ canonical (3/3)

### commerce.payment.* — Payment lifecycle

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `commerce.payment.initiated` | `checkout-event-emitter.service.ts:125` | user action |
| `commerce.payment.approved` | `checkout-event-emitter.service.ts:159` | external webhook (Stripe/MP) |
| `commerce.payment.declined` | `checkout-event-emitter.service.ts:193` | external webhook |
| `commerce.payment.refunded` | `checkout-event-emitter.service.ts:232` | user action |
| `commerce.payment.charged_back` | `checkout-event-emitter.service.ts:272` | external webhook |

**Owning domain**: payments
**Subscribers**: PostSaleConsumer, V-Tier, daily-dashboard
**Payload**: `{ workspaceId, entityRef: { entityType: 'order', entityId }, payload?: { orderId, amountInCents?, paymentMethod?, provider? } }`
**Status**: ✅ canonical (5/5)

### commerce.lead.* — Lead lifecycle

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `commerce.lead.converted` | `checkout-event-emitter.service.ts:307` | internal cascade |
| `commerce.lead.went_silent` | `whatsapp-event-emitter.service.ts:224` (emitLeadWentSilent) | internal cascade |
| `commerce.lead.objection_raised` | `crm-event-emitter.service.ts:124` | internal cascade |

**Owning domain**: kloel (lead)
**Subscribers**: AutopilotService, GoalField
**Payload**: `{ workspaceId, entityRef, payload?: { leadId, contactId?, source?, silenceHours?, reason? } }`
**Status**: ✅ canonical (3/3)

### commerce.crm.* — CRM pipeline

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `commerce.crm.stage_changed` | `crm-event-emitter.service.ts:19` | user action |
| `commerce.crm.owner_assigned` | `crm-event-emitter.service.ts:40` | user action |
| `commerce.crm.next_step_defined` | `crm-event-emitter.service.ts:61` | user action |
| `commerce.crm.deal_won` | `crm-event-emitter.service.ts:82` | user action |
| `commerce.crm.deal_lost` | `crm-event-emitter.service.ts:103` | user action |

**Owning domain**: crm
**Subscribers**: V-Tier, GoalField, daily-dashboard
**Payload**: `{ workspaceId, entityRef: { entityType: 'deal', entityId }, payload?: { dealId, previousStage?, newStage? } }`
**Status**: ✅ canonical (5/5)### commerce.campaign.* — Campaign lifecycle

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `commerce.campaign.clicked` | `campaign-event-emitter.service.ts:52` | external webhook / user |
| `commerce.campaign.conversion_associated` | `campaign-event-emitter.service.ts:72` | internal cascade |
| `commerce.campaign.audience_reached` | `campaign-event-emitter.service.ts:92` | scheduled |
| `commerce.campaign.creative_swapped` | `campaign-event-emitter.service.ts:112` | user action |
| `commerce.campaign.performance_drop_detected` | `campaign-event-emitter.service.ts:133` | scheduled (classifier) |

**Owning domain**: campaigns
**Subscribers**: V-Tier, GoalField
**Payload**: `{ workspaceId, entityRef, payload?: { campaignId, channel?, recipientCount?, templateId? } }`
**Status**: ✅ canonical (5/5)

### commerce.kyc.* — Identity verification

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `commerce.kyc.document_submitted` | `kyc-event-emitter.service.ts:37` | user action |
| `commerce.kyc.approved` | `kyc-event-emitter.service.ts:65` | admin action / scheduled |
| `commerce.kyc.rejected` | `kyc-event-emitter.service.ts:96` | admin action / scheduled |

**Owning domain**: kyc
**Subscribers**: V-Tier, connect-payout flow
**Payload**: `{ workspaceId, entityRef: { entityType: 'agent', entityId }, payload?: { agentId, documentType?, reason? } }`
**Status**: ✅ canonical (3/3)

### commerce.post_sale.* — Post-purchase lifecycle

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `commerce.post_sale.delivery_completed` | `checkout-post-payment-effects.service.ts:115` | internal cascade |
| `commerce.post_sale.activation_started` | `checkout-post-payment-effects.service.ts:131` | internal cascade |
| `commerce.post_sale.first_value_obtained` | `first-value.detector.ts:161` | internal (inferred) |
| `commerce.post_sale.no_regret_confirmed` | `no-regret-pipeline.service.ts:169` | internal (inferred) |
| `commerce.post_sale.satisfaction_signal_observed` | `satisfaction-collector.service.ts:175` | user action |
| `commerce.post_sale.testimonial_requested` | `post-sale-event-emitter.service.ts` (emitTestimonialRequested) | scheduled |
| `commerce.post_sale.repurchase_window_opened` | `repurchase-window.detector.ts:123` | scheduled (inferred) |
| `commerce.post_sale.churn_risk_detected` | `ban-risk.detector.ts:150` / `churn-risk.detector.ts:188` | scheduled (inferred) |
| `commerce.post_sale.win_back_window_opened` | `winback-window.advisor.ts:88` | scheduled (inferred) |

**Owning domain**: post-sale
**Subscribers**: PostSaleConsumers module, LTV-projection, expansion-fit
**Payload**: `{ workspaceId, entityRef, payload?: { ...event-specific } }`
**Status**: ✅ canonical (9/9)

### commerce.whatsapp.* — Messaging channel

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `commerce.whatsapp.message_received` | `whatsapp-event-emitter.service.ts:224` (emitMessageReceived) | external webhook (Meta Cloud API) |
| `commerce.whatsapp.message_read` | `whatsapp-event-emitter.service.ts:224` (emitMessageRead) | external webhook |
| `commerce.whatsapp.message_replied` | `whatsapp-event-emitter.service.ts:224` (emitMessageReplied) | internal cascade |
| `commerce.whatsapp.handoff_to_human` | `whatsapp-event-emitter.service.ts:224` (emitHandoffToHuman) | internal cascade |
| `commerce.whatsapp.conversation_resumed` | `whatsapp-event-emitter.service.ts:224` (emitConversationResumed) | user action / scheduled |
| `commerce.whatsapp.session_lifecycle` | `whatsapp-event-emitter.service.ts:224` (emitSessionLifecycle) | external webhook |

**Owning domain**: whatsapp
**Subscribers**: drift-attribution, GoalField, V-Tier
**Payload**: varies by event — see `WhatsAppEmitInput` subtypes
**Status**: ✅ canonical (6/6)
**Aliases**: `session_lifecycle` has sub-events by `input.event` field: `qr`, `connected`, `disconnected`, `banned`

### commerce.onboarding.* — Workspace setup

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `commerce.onboarding.declared` | `mercado-entrada.declarator.service.ts:268,358` | internal cascade |

**Owning domain**: kloel (mercado-entrada)
**Subscribers**: GoalField
**Payload**: `{ workspaceId, entityRef, payload?: { marketEntryType, confidence? } }`
**Status**: ✅ canonical (1/1)
**Aliases**: emitted under legacy namespace `mercado_entrada` — canonicalized to `commerce.onboarding`

### commerce.affiliate.* — Affiliate program

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `commerce.affiliate.commission_calculated` | `member-area-event-emitter.service.ts:145` | internal cascade |
| `commerce.affiliate.performance_measured` | `member-area-event-emitter.service.ts:126` | scheduled |

**Owning domain**: affiliate
**Subscribers**: V-Tier
**Payload**: `{ workspaceId, entityRef, payload?: { affiliateId, commissionInCents? } }`
**Status**: ✅ canonical (2/2)

### commerce.member_area.* — Member portal

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `commerce.member_area.enrolled` | `member-area-event-emitter.service.ts:60` | user action |
| `commerce.member_area.progressed` | `member-area-event-emitter.service.ts:82` | user action |
| `commerce.member_area.dropped_out` | `member-area-event-emitter.service.ts:105` | scheduled (inferred) |

**Owning domain**: member-area
**Subscribers**: V-Tier, GoalField, ActivationCompanion
**Payload**: `{ workspaceId, entityRef: { entityType: 'member', entityId }, payload?: { courseId?, moduleId?, progress? } }`
**Status**: ✅ canonical (3/3)

**Commerce Spine sub-total**: 37 events across 11 sub-domains### cognition.* — Cognitive organism

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `cognition.belief_updated` | `belief-update.ts:62` | internal cascade (Hypproof) |
| `cognition.valence_assigned` | `operator-feedback.loop.ts:68` | user action (operator feedback) |

**Owning domain**: kloel (cognitive core)
**Subscribers**: MIND valence-aggregator, GoalField
**Payload**: `{ workspaceId, entityRef?, payload?: { beliefId, priorConfidence?, newConfidence?, evidence? } }`
**Status**: ✅ canonical (2/2)

### lineage.* — Audit chain

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `lineage.genesis` | `lineage-ledger.service.ts:118` | internal (workspace bootstrap) |

**Owning domain**: kloel (lineage)
**Subscribers**: lineage-integrity gate
**Payload**: `{ workspaceId, payload: { genesisHash, timestamp } }`
**Status**: ✅ canonical (1/1)

### pulse.* — PULSE gate signals

| Event | Emitter (file:line) | Trigger |
|---|---|---|
| `pulse.gate_passed` | `pulse-spine.bridge.ts:28` / `event-emit-audit-event-emitter.service.ts:41` | internal (gate evaluation) |
| `pulse.gate_failed` | `pulse-spine.bridge.ts:28` / `event-emit-audit-event-emitter.service.ts:41` | internal (gate evaluation) |

**Owning domain**: pulse
**Subscribers**: PULSE auditors, V-Tier
**Payload**: `{ gateName: string, mode: string, reason: string, evidence?: unknown }`
**Status**: ✅ canonical (2/2)

---

## Section II — Brain Event Taxonomy (49 event types)

These events flow through `BrainEventSpineService.recordCommercial()` into the
`mindOutboxEvent` + `autopilotEvent` tables. They use **unprefixed** names
(no `commerce.` dot-namespace). Source: `brain-event-taxonomy.ts`.

### Commerce brain events

| Event | Intent | Payload |
|---|---|---|
| `sale.created` | `sale_lifecycle` | `{ amount, externalPaymentId?, leadId?, paymentMethod?, productName?, status }` |
| `sale.completed` | `sale_lifecycle` | same |
| `sale.refunded` | `sale_lifecycle` | same |
| `sale.cancelled` | `sale_lifecycle` | same |
| `checkout.created` | `checkout_lifecycle` | `{ customerEmail?, orderId, paymentMethod, priceBand, status, totalInCents, utmSource? }` |
| `checkout.paid` | `checkout_lifecycle` | same |
| `checkout.cancelled` | `checkout_lifecycle` | same |
| `checkout.viewed` | `checkout_lifecycle` | same |
| `checkout.abandoned` | `checkout_lifecycle` | same |
| `checkout.generated` | `checkout_lifecycle` | same |
| `lead.created` | `lead_lifecycle` | `{ leadId, previousStatus?, source?, assignedTo?, campaignId? }` |
| `lead.qualified` | `lead_lifecycle` | same |
| `lead.transferred` | `lead_lifecycle` | same |
| `lead.abandoned` | `lead_lifecycle` | same |
| `campaign.scheduled` | `campaign_lifecycle` | `{ campaignId, channel?, recipientCount?, templateId? }` |
| `campaign.sent` | `campaign_lifecycle` | same |
| `campaign.clicked` | `campaign_lifecycle` | same |
| `campaign.converted` | `campaign_lifecycle` | same |
| `product.created` | `product_lifecycle` | `{ productId, name, priceInCents? }` |

### Messaging brain events

| Event | Intent | Payload |
|---|---|---|
| `message.received` | `message_lifecycle` | `{ contentPreview, direction: 'INBOUND'|'OUTBOUND', messageId, messageType, channel? }` |
| `message.sent` | `message_lifecycle` | same |
| `message.delivered` | `message_lifecycle` | generic `CommercialEventPayload` |
| `message.read` | `message_lifecycle` | generic |
| `message.failed` | `message_lifecycle` | generic |
| `message.converted` | `message_lifecycle` | generic |
| `contact.segmented` | `contact_lifecycle` | generic |### Channel / Pipeline / Identity brain events

| Event | Intent | Status |
|---|---|---|
| `channel.connected` | `channel_lifecycle` | `executed` |
| `channel.disconnected` | `channel_lifecycle` | `skipped` |
| `channel.externally_blocked` | `channel_lifecycle` | `error` |
| `pipeline.state.changed` | `pipeline_lifecycle` | — |
| `pipeline.auto_fallback` | `pipeline_lifecycle` | — |
| `pipeline.shadow_recorded` | `pipeline_lifecycle` | — |
| `identity.contact.merged` | `identity_lifecycle` | — |
| `identity.contact.resolved` | `identity_lifecycle` | — |
| `identity.merge_candidate.created` | `identity_lifecycle` | — |

### Cognitive & brain-cycle events

| Event | Intent |
|---|---|
| `concept.detected` | `concept_lifecycle` |
| `mind.decision.created` | `decision_lifecycle` |
| `mind.decision.resolved` | `decision_lifecycle` |
| `mind.prediction.created` | `prediction_lifecycle` |
| `mind.prediction.resolved` | `prediction_lifecycle` |
| `mind.surprise.recorded` | `surprise_lifecycle` |
| `case_memory.consulted` | `case_memory_lifecycle` |
| `predecided_actions.built` | `predecided_actions_lifecycle` |
| `brain.decide` | `brain_cycle` |
| `brain.observe` | `brain_cycle` |
| `brain.autonomy.propose` | `brain_cycle` |
| `brain.capability.invoked` | `brain_cycle` |
| `capability.executed` | `capability_cycle` |
| `capability.failed` | `capability_cycle` |

**Emitter**: `BrainEventSpineService.record()` / `recordCommercial()` — `brain-event-spine.service.ts`
**Owning domain**: kloel (cognitive core)
**Total**: 49 event types in `BRAIN_EVENT_TAXONOMY` const
**Status**: ✅ canonical (49/49)

---

## Section III — External Webhook Events (received, not emitted)

Events consumed from external providers. All logged to `webhookEvent` table
with deduplication via `provider_externalId` unique constraint.

### Stripe webhook event types (11 handled)

| Event type | Handler | Effect |
|---|---|---|
| `checkout.session.completed` | `handleCheckoutSessionCompleted` (`payment-webhook-stripe.handlers2.ts`) | Post-payment effects, flow activation |
| `payment_intent.succeeded` | `handlePaymentIntentEvent` (controller line 297) | Payment confirmation |
| `payment_intent.processing` | `handlePaymentIntentEvent` | Payment processing |
| `payment_intent.payment_failed` | `handlePaymentIntentEvent` | Payment declined |
| `payment_intent.canceled` | `handlePaymentIntentEvent` | Payment canceled |
| `refund.created` | `handleRefundCreated` (`payment-webhook-stripe.handlers.ts`) | Refund ledger entry |
| `charge.dispute.created` | `handleDisputeCreated` | Chargeback detection |
| `charge.dispute.closed` | `handleDisputeClosed` | Chargeback resolution |
| `payout.paid` | `handlePayoutEvent` | Connect payout confirmed |
| `payout.failed` | `handlePayoutEvent` | Connect payout failed |
| `account.updated` | `handleAccountUpdated` | Connect account update |

**Controller**: `payment-webhook-stripe.controller.ts`
**Owning domain**: payments / connect
**Payload**: `StripeEventLike { id: string, type: string, data: { object: Record<string,unknown> } }`
**Status**: ✅ canonical (11/11)

### Meta webhook event channels

| Event source | Controller | Effect |
|---|---|---|
| Meta WhatsApp (Cloud API) | `MetaWebhookController` (`meta-webhook.controller.ts`) | Inbound message processing via `InboundProcessorService` |
| Meta Messenger (page) | `MetaWebhookController` | Messenger routing |
| Meta Instagram | `MetaWebhookController` | Instagram routing |
| Meta Ads insights | (queue-driven) — `integrations/ads-sync.processor.ts` | Ads sync via BullMQ |

**Owning domain**: meta
**Payload**: `{ object: string, entry: [{ changes: [{ value: { messages?, statuses?, ... } }] }] }`
**Status**: ✅ canonical (4 channels)

### Other webhook controllers

| Provider | Controller | File |
|---|---|---|
| MercadoPago | `MercadoPagoWebhookController` | `mercadopago-webhook.controller.ts` |
| TikTok | `TikTokWebhookController` | `tiktok-webhook.controller.ts` |
| WAHA (legacy) | `WhatsAppApiWebhookController` (disabled) | `whatsapp-api-webhook.controller.ts` |

**Status**: MercadoPago ✅ (1) / TikTok ✅ (1) / WAHA ⛔ disabled---

## Section IV — BullMQ Queues & Job Events

### Queue inventory (13 production queues)

| Queue name | Purpose | Created in |
|---|---|---|
| `flow-jobs` | Flow execution engine | `queue.ts` (flowQueue) |
| `campaign-jobs` | Campaign processing | `queue.ts` / `campaigns.service.ts` |
| `scraper-jobs` | Web scraping | `queue.ts` (scraperQueue) / `scrapers.service.ts` |
| `media-jobs` | Audio/video generation | `queue.ts` (mediaQueue) / `media.service.ts` |
| `voice-jobs` | Voice profile / TTS | `queue.ts` (voiceQueue) / `voice.service.ts` |
| `autopilot-jobs` | Autopilot tick scheduler | `queue.ts` (autopilotQueue) |
| `memory-jobs` | Memory persistence | `queue.ts` (memoryQueue) |
| `crm-jobs` | CRM background work | `queue.ts` (crmQueue) |
| `webhook-jobs` | Outbound webhook dispatch | `queue.ts` (webhookQueue) |
| `google-ads-sync-jobs` | Google Ads campaign sync | `queue.ts` (googleAdsSyncQueue) |
| `ads-sync-meta` | Meta Ads campaign sync | `queue.ts` (metaAdsSyncQueue) |
| `mass-send` | Bulk messaging | `mass-send.service.ts` |
| `mind-bg` | MIND background processing | `mind-bg.scheduler.ts` |

**Owning domain**: queue (shared infrastructure)
**Naming**: `<domain>-jobs` suffix convention.
**DLQ**: All queues have a dead-letter queue for failed jobs.
**Status**: ✅ canonical (13 queues)

### BullMQ job names (canonical worker tasks)

| Job name | Queue | Dispatched from |
|---|---|---|
| `send-message` | `flow-jobs` | `autopilot-cycle-executor.service.ts:298` / `autopilot.service.ts:372` |
| `run-flow` | `flow-jobs` | `autopilot-ops-conversion.service.ts:287` / `flows.controller.ts:118` |
| `tick` | `mind-bg` | `mind-bg.scheduler.ts:58` (repeating every short interval) |
| `dispatch` | `mass-send` | `mass-send.service.ts:43` |
| `run-scraper` | `scraper-jobs` | `scrapers.service.ts:36` |
| `generate-audio` | `voice-jobs` | `voice.service.ts:53` |
| `transcribe-audio` | `voice-jobs` | `inbound-processor.service.ts:238` |
| `generate-video` | `media-jobs` | `media.service.ts:52` |
| `send-webhook` | `webhook-jobs` | `webhook-dispatcher.service.ts:42` |
| `sync-accounts` | `google-ads-sync-jobs` | `ads-sync.processor.ts:281` |
| `sync-campaigns` | `google-ads-sync-jobs` | `ads-sync.processor.ts:292` |
| `sync-insights` | `google-ads-sync-jobs` | `ads-sync.processor.ts:308` |
| `refresh-google-token` | `google-ads-sync-jobs` | `ads-sync.processor.ts:318` |
| `sync-meta-accounts` | `ads-sync-meta` | `ads-sync.processor.ts:331` |
| `sync-meta-campaigns` | `ads-sync-meta` | `ads-sync.processor.ts:342` |
| `sync-meta-insights` | `ads-sync-meta` | `ads-sync.processor.ts:358` |
| `refresh-meta-token` | `ads-sync-meta` | `ads-sync.processor.ts:368` |

**Convention**: `<verb>-<noun>` kebab-case.
**Status**: ✅ canonical (17 job types)

### Worker lifecycle (implicit BullMQ events)

Each job transitions through: `queued → started → completed | failed → (dead-lettered)`.
The DLQ mechanism is defined in `queue.ts` (attachDlq / handleQueueFailedEvent / moveJobToDlq).## Section V — WebSocket Gateway Events

Real-time push to connected Socket.IO clients.

| Event name | Emitter | File:Line | Target |
|---|---|---|---|
| `alert:event` | `AlertGateway` | `alerts.gateway.ts:44` | `workspace:<id>` or broadcast |
| `copilot:suggestion` | `CopilotGateway` | `copilot.gateway.ts:40` | `workspace:<id>` or broadcast |
| `flow:log` | `FlowsGateway` | `flows.gateway.ts:72` | `workspace:<id>` |
| `alert` | `FlowsGateway` | `flows.gateway.ts:77` | `workspace:<id>` |
| (dynamic) | `InboxGateway.emitToWorkspace` | `inbox.gateway.ts:80` | `workspace:<id>` — generic dispatch |

**Owning domain**: alerts / copilot / flows / inbox
**Payload**: JSON-serializable `{ type, workspaceId, ... }`
**Status**: ✅ canonical (5 channels)

---

## Section VI — Deprecated, Stale & Cleanup Candidates

### Deprecated Spine events (no production emit, need wiring or removal)

| Event name | Where found | Action |
|---|---|---|
| `commerce.affiliate.click_registered` | spec fixtures | Remove or wire emitter |
| `commerce.affiliate.commission_received` | spec fixtures | Remove or wire |
| `commerce.affiliate.link_created` | spec fixtures | Remove or wire |
| `commerce.checkout.created` | old doc | Removed — use `commerce.cart.created` |
| `commerce.lead.contacted` | spec fixtures | Remove or wire |
| `commerce.lead.created` | spec fixtures | Use brain event `lead.created` |
| `commerce.lead.lost` | spec fixtures | Remove or wire |
| `commerce.lead.qualified` | spec fixtures | Use brain event `lead.qualified` |
| `commerce.lead.replied` | ring buffer tests | Use `commerce.whatsapp.message_replied` |
| `commerce.payment.failed` | old doc | Removed — use `commerce.payment.declined` |
| `commerce.product.created` | spec fixtures | Use brain event `product.created` |
| `commerce.product.updated` | spec fixtures | Remove or wire |
| `cognition.analysis_completed` | spec fixtures | Remove or wire |
| `cognition.analysis_started` | spec fixtures | Remove or wire |
| `cognition.decision_made` | spec fixtures | Remove or wire |
| `lineage.capability_acquired` | spec fixtures | Remove or wire |
| `lineage.ciclo_pulse_nao_regressivo` | old doc | Removed |
| `lineage.skill_consolidated` | spec fixtures | Remove or wire |
| `lineage.tampered` | spec fixtures | Remove or wire |
| `auth.refresh_token_expired` | spec fixtures | Remove or wire |
| `workspace.settings.updated` | spec fixtures | Remove or wire |

### Non-canonical / misleading names

| Name | Location | Issue |
|---|---|---|
| `evolution.gap_detected` | `drift-attribution.service.ts:19` | Config reference only, no `spine.emit` |
| `mercado_entrada` namespace | `mercado-entrada.declarator.service.ts:268` | Non-canonical — canonicalized to `commerce.onboarding` |
| `Purchase` | `checkout-post-payment-effects.service.ts:172` | Meta Pixel event, not Spine |
| `ViewContent` | Meta Pixel | Analytics shorthand |

### Notes on previously stale events now live

`commerce.whatsapp.message_received` and `commerce.whatsapp.message_replied` were listed
as deprecated in v2026-05-21 of this document. They are **now emitted with production
truth-mode** by `WhatsAppEventEmitterService` (confirmed 2026-05-26).

---

## Gates

`scripts/ops/check-canonical-events.mjs` enforces in pre-push and CI:
1. Scans `backend/src/**/*.ts` for `eventName: '<name>'`
2. Validates each against canonical namespaces
3. Rejects unauthorized namespaces
4. Test fixtures scoped to `*.spec.ts` are excluded

## How to add a new event

1. Pick namespace: `commerce` / `cognition` / `pulse` / `lineage`
2. Pick sub-domain matching existing unless 3+ events justify new
3. Verb in past tense / state in snake_case
4. Add to this inventory
5. `await this.spine.emit({ eventName, ... })` in emitter
6. Add subscriber if reactive
7. `npm run canonical:check` must pass

## Related

- [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md)
- [CAPABILITY_MAP.md](CAPABILITY_MAP.md)
- [QUEUES_CATALOG.md](QUEUES_CATALOG.md)
- [SERVICE_CATALOG.md](SERVICE_CATALOG.md)
- [CANONICAL_VOCABULARY.md](CANONICAL_VOCABULARY.md)

---

## Round 2 expansion — 2026-05-26

> Authored by `w21-canonical-vocabulary-r2`. This section fills gaps
> discovered during the Contact/Lead/Customer/Prospect/Client/User family
> analysis and the ChannelSession/WaSession/Connection session audit.

### Section VII — channel.session.* canonical events

`commerce.whatsapp.session_lifecycle` is the unified Spine event for WhatsApp
session state changes. It carries `input.event` as a sub-event discriminator.
This round canonicalizes those sub-events as **standalone canonical names**
under the `channel.session.*` namespace.

#### Canonical channel.session.* events

| Canonical | Legacy alias | Emitter | Description |
|---|---|---|---|
| `channel.session.qr_generated` | `commerce.whatsapp.session_lifecycle` (event=qr) | `whatsapp-session.service.ts:65` | QR code ready for WhatsApp Web scan |
| `channel.session.connected` | `commerce.whatsapp.session_lifecycle` (event=connected) | `whatsapp-session.service.ts:75`, `internal-whatsapp-runtime.controller.ts:127` | Session authenticated and live |
| `channel.session.disconnected` | `commerce.whatsapp.session_lifecycle` (event=disconnected) | `whatsapp-session.service.ts:134` | Session torn down (manual or error) |
| `channel.session.banned` | `commerce.whatsapp.session_lifecycle` (event=banned) | _(inferred from type union)_ | Session terminated by provider policy |

**Migration plan**: `commerce.whatsapp.session_lifecycle` continues to be emitted
as the legacy envelope. New subscribers SHOULD consume `channel.session.*` events.
The legacy envelope will be deprecated in Round 3 once all subscribers migrate.

**Legacy aliases mapping**:

| Legacy | Canonical |
|---|---|
| `wa_connected` | `channel.session.connected` |
| `qr_authenticated` | `channel.session.qr_generated` |
| `sessionOpen` | `channel.session.connected` |
| `wa_disconnected` | `channel.session.disconnected` |
| `sessionClose` | `channel.session.disconnected` |
| `channel.connected` (brain) | `channel.session.connected` (Spine) |
| `channel.disconnected` (brain) | `channel.session.disconnected` (Spine) |
| `channel.externally_blocked` (brain) | `channel.session.banned` (Spine) |

---

### Section VIII — conversation.* canonical events

Conversation lifecycle events currently live in `commerce.whatsapp.*` namespace
but semantically belong to a cross-channel `conversation.*` domain. This round
canonicalizes the mapping.

#### Canonical conversation.* events

| Canonical | Legacy alias | Emitter | Description |
|---|---|---|---|
| `conversation.started` | `commerce.whatsapp.message_received` (first message) | `whatsapp-event-emitter.service.ts` | New conversation initiated |
| `conversation.assigned` | `commerce.whatsapp.handoff_to_human` | `whatsapp-event-emitter.service.ts` | Conversation assigned to human agent |
| `conversation.unassigned` | _(not yet emitted)_ | — | Conversation returned to bot/autopilot |
| `conversation.resumed` | `commerce.whatsapp.conversation_resumed` | `whatsapp-event-emitter.service.ts` | Silent conversation reactivated |
| `conversation.closed` | _(not yet emitted)_ | — | Conversation resolved/closed |

**Legacy aliases mapping**:

| Legacy | Canonical |
|---|---|
| `commerce.whatsapp.handoff_to_human` | `conversation.assigned` |
| `commerce.whatsapp.conversation_resumed` | `conversation.resumed` |
| `thread_created` | `conversation.started` |
| `newConversation` | `conversation.started` |
| `conversationDirty` | (dropped — not an event) |
| `thread_touched` | (dropped — not an event) |

---

### Section IX — commerce.checkout.* canonical events

Brain event taxonomy defines `checkout.*` (unprefixed): `checkout.created`,
`checkout.paid`, `checkout.cancelled`, `checkout.viewed`, `checkout.abandoned`,
`checkout.generated`. The Spine emits `commerce.cart.*` for cart lifecycle.
This round clarifies the dual-namespace mapping.

#### Canonical cross-namespace map

| Spine (commerce.cart.*) | Brain (checkout.*) | Description |
|---|---|---|
| `commerce.cart.created` | `checkout.created` | Cart/item selection initiated |
| `commerce.cart.abandoned` | `checkout.abandoned` | Cart abandoned before payment |
| `commerce.cart.checkout_initiated` | `checkout.generated` | Checkout flow started (form visible) |
| — | `checkout.viewed` | Checkout page viewed |
| — | `checkout.paid` | Payment confirmed |
| — | `checkout.cancelled` | Checkout cancelled |
| `commerce.checkout.created` | — | Role detector only; use `commerce.cart.created` |
| `commerce.checkout.completed` | — | Role detector only; use `commerce.payment.approved` |

**Note**: `commerce.checkout.created` and `commerce.checkout.completed` appear only
in `role.detector.ts` (event name filter set). They are NOT emitted by any production
service. These are legacy filter names; migrate to `commerce.cart.*` equivalents.

---

### Section X — lead.qualified canonical events

`lead.qualified` is a **Brain event** (unprefixed, emitted via `recordCommercial`).
It has no direct Spine equivalent. The mapping is:

| System | Event | Source |
|---|---|---|
| Brain | `lead.qualified` | `brain-action-event-mapper.ts:11` (`qualify_lead` → `lead.qualified`) |
| Spine | `commerce.lead.converted` | `checkout-event-emitter.service.ts:307` (post-payment lead conversion) |
| Spine | `commerce.lead.went_silent` | `whatsapp-event-emitter.service.ts` (`emitLeadWentSilent`) |
| Spine | `commerce.lead.objection_raised` | `crm-event-emitter.service.ts:124` |

**Key distinction**: `lead.qualified` (Brain) means the AI has evaluated the lead
and determined it meets qualification criteria. `commerce.lead.converted` (Spine)
means a purchase has occurred. These are NOT synonyms — qualification precedes
conversion in the funnel.

**Legacy aliases mapping**:

| Legacy | Canonical |
|---|---|
| `qualifyLead` | `lead.qualified` (Brain) |
| `leadQualified` | `lead.qualified` (Brain) |
| `commerce.lead.created` (spec fixtures) | Use `lead.created` (Brain) |
| `commerce.lead.qualified` (spec fixtures) | Use `lead.qualified` (Brain) |
| `commerce.lead.lost` (spec fixtures) | Use `lead.abandoned` (Brain) |
| `commerce.lead.contacted` (spec fixtures) | Remove or wire emitter |
| `commerce.lead.replied` (ring buffer tests) | Use `commerce.whatsapp.message_replied` |

---

### Section XI — cognition.* and commerce.* boundary clarification

Events crossing the cognitive/commercial boundary:

| Canonical | System | Description |
|---|---|---|
| `cognition.belief_updated` | Spine | A belief about a lead/customer changed (Hypproof) |
| `cognition.valence_assigned` | Spine | Operator feedback assigned emotional valence |
| `mind.decision.created` | Brain | A commercial decision was proposed |
| `mind.decision.resolved` | Brain | A commercial decision completed |
| `brain.capability.invoked` | Brain | A tool/capability was executed |
| `brain.capability.failed` | Brain | A tool/capability execution failed |

**Rule**: Cognitive events (`cognition.*`, `mind.*`, `brain.*`) describe the
agent's internal reasoning. Commerce events (`commerce.*`) describe business
outcomes. Never emit a commerce event for cognitive state; never emit a cognitive
event for a business transaction.

---

### Deprecated-to-canonical event summary (new in Round 2)

| Deprecated | Canonical | Notes |
|---|---|---|
| `commerce.whatsapp.session_lifecycle` sub-event `qr` | `channel.session.qr_generated` | New standalone event |
| `commerce.whatsapp.session_lifecycle` sub-event `connected` | `channel.session.connected` | New standalone event |
| `commerce.whatsapp.session_lifecycle` sub-event `disconnected` | `channel.session.disconnected` | New standalone event |
| `commerce.whatsapp.session_lifecycle` sub-event `banned` | `channel.session.banned` | New standalone event |
| `commerce.whatsapp.handoff_to_human` | `conversation.assigned` | Cross-channel canonical |
| `commerce.whatsapp.conversation_resumed` | `conversation.resumed` | Cross-channel canonical |
| `commerce.checkout.created` (role detector) | `commerce.cart.created` | Legacy filter only |
| `commerce.checkout.completed` (role detector) | `commerce.payment.approved` | Legacy filter only |
| `qualifyLead` / `leadQualified` | `lead.qualified` (Brain) | Naming convention |
| `wa_connected` / `qr_authenticated` / `sessionOpen` | `channel.session.connected` | Legacy provider names |
| `wa_disconnected` / `sessionClose` | `channel.session.disconnected` | Legacy provider names |
| `thread_created` / `newConversation` | `conversation.started` | Legacy naming |
| `commerce.lead.created` (spec fixtures) | `lead.created` (Brain) | Spec-only aliases |
| `commerce.lead.qualified` (spec fixtures) | `lead.qualified` (Brain) | Spec-only aliases |
