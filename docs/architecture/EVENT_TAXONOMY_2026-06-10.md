# Taxonomia Canônica de Eventos — Sistema Inteiro (2026-06-10)

> **Artefato derivado 100% de código-fonte** (`backend/src`, `worker/`, `frontend/src`), não de docs.
> Complementa (não substitui) o `docs/architecture/EVENT_TAXONOMY.md` gerado por `tools/canonicalize/scan.mjs`,
> que cobre apenas `.emit(`/`.on(`/`eventName:` — este documento cobre **as 6 camadas de transporte**,
> mapeia emissor→consumidor por arquivo, agrupa por ocorrência semântica e entrega o DE→PARA executável.
>
> Convenção canônica: **`domínio.entidade.fato`** em past-tense (`commerce.payment.approved`),
> já adotada parcialmente pelo ADR-0013 / `protocol_hub_asyncapi`. Este documento consolida e estende.

---

## 0. Sumário executivo

| Métrica | Valor |
|---|---|
| Camadas de transporte de eventos distintas | **6** (Spine, Mind-Outbox, EventEmitter2, Redis Pub/Sub, WebSocket/SSE, BullMQ) |
| Nomes de eventos/canais/jobs catalogados | **~140** |
| Famílias semânticas com nomes duplicados | **9** (pior caso: "mensagem recebida" = **8 nomes**) |
| Eventos órfãos (emitidos sem consumidor) | **13** |
| Eventos fantasma (consumidos sem emissor) | **6** |
| Barramento estruturalmente morto | **1** (EventEmitter2 — zero `@OnEvent` no repo inteiro) |
| Mapas de alias já existentes no código | 3 (`MIND_EVENT_ALIASES`, `LEGACY_TO_COMMERCE_ALIAS`, `KLOEL_TO_COGNITION_ALIAS`) |

---

## 1. As 6 camadas de transporte (leia antes de migrar qualquer coisa)

| # | Camada | Mecanismo | Arquivo-âncora | Persistência | Consumo |
|---|---|---|---|---|---|
| T1 | **Spine** | `SpineEmitterService.emit(SpineEventInput)` | `backend/src/kloel/spine/spine-emitter.service.ts` | Ring buffer in-memory + Redis Stream `spine:events:{workspaceId}` (XADD, MAXLEN ~) | Subscribers in-process (`spine.subscribe`) + leitores ad-hoc do ring (`readRecent`) |
| T2 | **Mind-Outbox** | `MindEventSpineService.recordCommercial({eventType,...})` | `backend/src/kloel/mind/coordination/mind-event-spine.service.ts` | Tabela Prisma `RAC_MindOutboxEvent` | Poll: `mind-event-ingestor.service.ts` (drena `cognition.decision_made`, `cognition.consolidation_scan`, `cognition.self_modification.proposed`) + `readReplayEvents` (filtros Prisma `in`) |
| T3 | **EventEmitter2 (NestJS)** | `eventEmitter.emit(name, payload)` | `backend/src/products/product.service.ts`, `backend/src/plans/plan.service.ts` | Nenhuma | **NENHUM** — zero `@OnEvent` no repo; `EventEmitter2` é provider isolado por módulo (`products.module.ts:9`, `plans.module.ts:9`), sem `EventEmitterModule.forRoot()` → cada módulo tem instância própria; barramento morto |
| T4 | **Redis Pub/Sub** | `redis.publish(channel, json)` | worker e backend (ver §2.4) | Nenhuma (fire-and-forget) | Gateways NestJS via `subscribe`/`psubscribe` |
| T5 | **WebSocket (Socket.IO) + SSE** | `server.to(room).emit(event, payload)` / `text/event-stream` | `backend/src/inbox/inbox.gateway.ts` etc. | Nenhuma | Frontend `useSocket().subscribe(event)` / `EventSource`/fetch-stream |
| T6 | **BullMQ (filas = comandos)** | `queue.add(jobName, data)` | `backend/src/queue/queue-names.const.ts`, `worker/queue.ts` | Redis | Workers BullMQ (worker/ e alguns in-backend) |

**Regra de ouro da migração:** T1/T2 carregam *fatos de domínio* (devem seguir `domínio.entidade.fato`);
T4/T5 carregam *projeções para UI* (devem seguir a mesma taxonomia com namespace de canal);
T6 carrega *comandos* (imperativo `verbo-objeto`, não entram na taxonomia de fatos).

---

## 2. Inventário completo: evento → emissores → consumidores

### 2.1 T1 Spine — eventos `commerce.*` (fatos de negócio)

| Evento | Emissores (arquivos) | Consumidores (arquivos) |
|---|---|---|
| `commerce.checkout.created` / `commerce.checkout.updated` | `kloel/checkout-emitter/checkout-event-emitter.service.ts` (chamado por `checkout/checkout.service.ts`, `checkout-order.service.ts`, `checkout-payment.service.ts`, `checkout-payment.arms.ts`, `kloel/cart-recovery.service.ts`) | leitores do ring/stream; `spine-coverage-auditor.service.ts` (catálogo) |
| `commerce.cart.created` / `commerce.cart.abandoned` / `commerce.cart.checkout_initiated` | `kloel/checkout-emitter/checkout-event-emitter.service.ts` | detectores `kloel/insight/detectors/funnel-bottleneck.detector.ts`, `kloel/goal-field/detectors/*` |
| `commerce.payment.initiated` / `approved` / `declined` / `refunded` / `charged_back` | `kloel/checkout-emitter/checkout-event-emitter.service.ts`; `payments/ledger/ledger.spine-events.helpers.ts` | **maior fan-in do sistema**: `kloel/postsale-consumers/*.ts` (75 refs a `commerce.payment.approved`), `kloel/healthy-money/*.ts`, `kloel/goal-field/detectors/financial.detectors.ts`, `kloel/commem/value-quantifier.service.ts`, `kloel/daily-dashboard/daily-dashboard.service.ts` |
| `commerce.crm.stage_changed` / `owner_assigned` / `next_step_defined` / `deal_won` / `deal_lost` | `kloel/crm-emitter/crm-event-emitter.service.ts` | `kloel/postsale-consumers/*`, `kloel/goal-field/detectors/commercial.detectors.ts` |
| `commerce.lead.objection_raised` | `kloel/crm-emitter/crm-event-emitter.service.ts` | `kloel/postsale-consumers/*`, detectores `kloel/offer/*`, `kloel/role/role.detector.ts` |
| `commerce.lead.converted` | `kloel/checkout-emitter/checkout-event-emitter.service.ts`; `kloel/commem/value-quantifier.service.ts` | `kloel/postsale-consumers/*` |
| `commerce.lead.went_silent` | `kloel/whatsapp-emitter/whatsapp-event-emitter.service.ts:152` (`emitLeadWentSilent`) — **método sem chamador** (ver §5) | `kloel/creator/creator-trust-capital.tracker.ts:132` |
| `commerce.whatsapp.message_received` | `kloel/whatsapp-emitter/whatsapp-event-emitter.service.ts:68` ← `marketing/channels/whatsapp/inbound-processor.service.ts:234`; também T2 via `omnichannel/channel-inbound-hook.service.ts:151` | detectores diversos; `spine-coverage-auditor` (transition `message_received`) |
| `commerce.whatsapp.message_read` | `whatsapp-event-emitter.service.ts:90` ← `whatsapp-session.service.ts:302` | catálogo auditor |
| `commerce.whatsapp.message_replied` | `whatsapp-event-emitter.service.ts:110` ← `whatsapp-message-dispatcher.service.ts:290` | `kloel/postsale-consumers/*`, `daily-dashboard.service.ts` |
| `commerce.whatsapp.session_lifecycle` (payload `event: qr\|connected\|disconnected\|banned`) | `whatsapp-event-emitter.service.ts:192` ← `whatsapp-session.service.ts:75`, `controllers/internal-whatsapp-runtime.controller.ts:127` | catálogo auditor |
| `commerce.whatsapp.handoff_to_human` / `conversation_resumed` | `whatsapp-event-emitter.service.ts:133/173` — **métodos sem chamador** (ver §5) | `kloel/postsale-consumers/*` (17 refs a handoff) — **fantasma** |
| `commerce.campaign.clicked` / `audience_reached` / `conversion_associated` / `creative_swapped` / `performance_drop_detected` | `kloel/campaign-emitter/campaign-event-emitter.service.ts` | `kloel/postsale-consumers/*`, detectores creator |
| `commerce.kyc.document_submitted` / `approved` / `rejected` | `kloel/kyc-emitter/kyc-event-emitter.service.ts` | catálogo auditor |
| `commerce.member_area.enrolled` / `progressed` / `dropped_out` | `kloel/member-area-emitter/member-area-event-emitter.service.ts` | `kloel/postsale-consumers/*` (36 refs a progressed) |
| `commerce.affiliate.performance_measured` / `commission_calculated` | `kloel/member-area-emitter/member-area-event-emitter.service.ts` | catálogo auditor |
| `commerce.post_sale.activation_started` / `delivery_completed` | `checkout/checkout-post-payment-effects.service.ts:163,181` | `kloel/postsale-consumers/*` |
| `commerce.post_sale.churn_risk_detected` | `kloel/postsale-consumers/churn-risk.detector.ts`; `kloel/channel/ban-risk.detector.ts:142` | `kloel/postsale-consumers/no-regret-pipeline.service.ts` |
| `commerce.post_sale.first_value_obtained` | `kloel/postsale-consumers/first-value.detector.ts`; `kloel/commem/value-quantifier.service.ts` | `kloel/postsale-consumers/*` (36 refs) |
| `commerce.post_sale.satisfaction_signal_observed` | `kloel/postsale-consumers/satisfaction-collector.service.ts`; `value-quantifier.service.ts` | `kloel/postsale-consumers/*` (41 refs) |
| `commerce.post_sale.repurchase_window_opened` / `win_back_window_opened` | `kloel/postsale-consumers/repurchase-window.detector.ts` / `winback-window.advisor.ts`; `value-quantifier.service.ts` | `kloel/postsale-consumers/*` |
| `commerce.post_sale.no_regret_confirmed` | `kloel/postsale-consumers/no-regret-pipeline.service.ts` | `kloel/postsale-consumers/*` |
| `commerce.onboarding.declared` | `kloel/mercado-entrada/mercado-entrada.declarator.service.ts:270,361` | leitores do ring |

### 2.2 T1/T2 — eventos `cognition.*` (telemetria cognitiva durável)

| Evento | Emissores | Consumidores |
|---|---|---|
| `cognition.decision_made` | `admin/chat/admin-chat.service.ts:159`, `kloel/kloel-reply-engine.helpers.ts:379`, `kloel/guest-chat.sse.helpers.ts:21`, `kloel/conversational-onboarding.mind-deps.helpers.ts:154` | **`mind-event-ingestor.service.ts:43`** (poll do outbox) |
| `cognition.consolidation_scan` | `kloel/mind/mind-cognitive-consolidation.helper.ts:306` | `mind-event-ingestor.service.ts` |
| `cognition.self.modification_proposed` | `kloel/mind/self-evolution/mind-self-modification.service.ts` | `mind-event-ingestor.service.ts` (poll string `cognition.self_modification.proposed` — **grafia divergente do emit**, ver §5) |
| `cognition.belief_updated` | `kloel/mind/inference/mind-belief.service.ts`, `kloel/hypproof/belief-update.ts:61` | `kloel/observability/runtime-metrics.service.ts:44` (subscriber genérico) |
| `cognition.prediction_made` / `cognition.surprise_observed` | `mind-predictor.service.ts:73` / `mind-surprise.service.ts:40` | runtime-metrics |
| `cognition.causal.inferred` / `simulated` / `edge_reinforced` | `kloel/mind/causal/mind-causal-model.service.ts:282,314,334` | runtime-metrics |
| `cognition.curiosity.gap_identified` | `kloel/mind/curiosity/mind-curiosity.service.ts:72,110` | runtime-metrics |
| `cognition.autonomy.goal_proposed` | `kloel/mind/autonomy/mind-autonomy.service.ts:100` | runtime-metrics |
| `cognition.emotional.inferred` | `kloel/mind/emotional/mind-emotional-intelligence.service.ts` | runtime-metrics |
| `cognition.memory.consolidated` | `kloel/mind/memory/mind-long-term-memory.service.ts:141` | runtime-metrics |
| `cognition.perception.multimodal_observed` | `kloel/mind/perception/mind-multimodal-perception.service.ts` | runtime-metrics |
| `cognition.consciousness.experience_recorded` | `kloel/mind/consciousness/mind-consciousness.service.ts` (via `.emit(`) | runtime-metrics |
| `cognition.valence_assigned` | `kloel/mind/valence-tagger.service.ts:104` | runtime-metrics |
| `cognition.cia_backlog_action` | `kloel/mind/cia/cia-send-helpers.service.ts` | leitores ad-hoc |
| `cognition.flow.node_completed` | `flows/flows-percept-emit.helper.ts` (flag-gated) | nenhum poll dedicado (telemetria durável by design — taxonomy `mind-event-taxonomy.ts:103-121`) |
| `cognition.cia.decision_made` / `cognition.cia.action_executed` | `kloel/mind/cia/cia-percept-emit.helper.ts` | idem |
| `cognition.voice.clone_created` / `cognition.voice.action_executed` | `voice/voice-percept-emit.helper.ts` | idem |
| `cognition.copilot.chat_reply` | `copilot/copilot-percept-emit.helper.ts` | idem |
| `cognition.autopilot.decision_made` / `action_executed` | `autopilot/autopilot-percept-emit.helper.ts` | idem |
| `cognition.money.lead_scan` / `cognition.money.campaign_generated` | `growth/money-percept-emit.helper.ts:15,23` (dual-emit com legado `money_machine.reactivation`) | idem |
| `kloel.chat.turn` → dual-emit `cognition.chat.turn` | `kloel/kloel-thinker.helpers.ts:236`, `kloel-thinker-spine.helpers.ts:54` via `emitCognitionAlias` (`kloel/event-taxonomy.canonical-aliases.ts:156`) | filtros `AutopilotEvent.action` em mind-observability; label UI `frontend/src/app/(main)/autopilot/page.ui.tsx:54` |
| `kloel.handoff.confidence` / `.blocking` → `cognition.handoff.confidence*` | `kloel/kloel-thinker.abi.helpers.ts:289,305` | structured-log/observabilidade |
| `chat.replied` / `chat.degraded` / `chat.error` (outcome) | `kloel/kloel-reply-engine.service.ts:506`, `kloel-copilot-loop.helpers.ts:151`, `kloel-thinker-think-loop.helpers.ts:154`, `conversational-onboarding.cognitive-hooks.helper.ts:85`, `kloel-reply-engine.degraded-path.helper.ts`, `guest-chat.terminal-hooks.helper.ts:44`, `admin-chat.service.ts:200` (`outcomeName`) | resolutores de outcome (decision-outcome) |
| `lineage.genesis` / `lineage.capability_acquired` | `kloel/lineage/genesis-event.ts:192`, `lineage-ledger.service.ts:69` | `kloel/lineage/lineage-guard.service.ts:176` |
| `readiness.gate_passed` / `readiness.gate_failed` | `kloel/event-emit-audit-emitter/event-emit-audit-event-emitter.service.ts:41` | `kloel/goal-field/detectors/cognitive.detectors.ts:169,201` |
| `sale.created` / `payment.pending` | `sales/sales.service.v1-shared.ts:100,106` (envelope spine); `kloel/payment.service.ts:191` (`eventType: 'sale.created'` via T2) | `kloel/capability-registry-v2/partitions/tier-5-sales.ts` (declara `emits:`), leitores replay |
| eventos mapeados por capability (`checkout.created`, `checkout.updated`, `checkout.generated`, `coupon.*`, `plan.*`, `product.*`, `lead.qualified`, `message.sent`, `contact.segmented`) | `kloel/mind/coordination/mind-action-event-mapper.ts` (ação `checkouts.create` → evento `checkout.created` etc., gravado via T2 pelo `mind-capability-executor.service.ts`) | `commerce-outcome-learner.service.ts`, decision-catalog, agregadores SQL (via `expandEventNameAliases`) |
| `pipeline.state.changed` / `pipeline.auto_fallback` / `pipeline.shadow_recorded` → `cognition.pipeline.*` | `admin/pipeline/admin-pipeline.service.ts:82,123,153` (T2 `recordCommercial`) | mind-observability |
| `case_memory.consulted` / `predecided_actions.built` → `cognition.*` | `kloel/commercial-decision-orchestrator/telemetry.ts:238-392` | filtros `AutopilotEvent` WHERE (alargados via `expandEventNameAliases`) |
| `concept.detected` | `kloel/mind/memory/mind-concepts.service.ts:103` | decision-catalog |
| `inbound.received` | `omnichannel/channel-inbound-hook.service.ts:151` (T2) | decision-catalog / mind-runtime |

### 2.3 T3 EventEmitter2 — **barramento morto** (zero listeners no repo)

| Evento | Emissor | Consumidor |
|---|---|---|
| `mind.product.observed` | `products/product.service.ts:69` | **nenhum** |
| `product.updated` + `commerce.product.updated` (dual) | `product.service.ts:138,224` via `emitCommerceAlias` | **nenhum** |
| `product.activated` / `product.deactivated` | `product.service.ts:313` — **fora de qualquer taxonomia** | **nenhum** |
| `product.deleted` + `commerce.product.deleted` | `product.service.ts:354` | **nenhum** |
| `product.published` + `commerce.product.published` | `product.service.ts:268` | **nenhum** |
| `mind.plan.observed` | `plans/plan.service.ts:73` | **nenhum** |
| `plan.updated` / `plan.deleted` + aliases `commerce.plan.*` | `plan.service.ts:151,211` | **nenhum** |

Prova: `grep -rn "@OnEvent" backend/src` → só comentários em `mind-event-taxonomy.ts`. `EventEmitterModule.forRoot()` inexistente; `EventEmitter2` registrado como provider avulso em `products.module.ts:9` e `plans.module.ts:9` (instâncias separadas — mesmo que houvesse listener em outro módulo, não receberia).

### 2.4 T4 Redis Pub/Sub — canais

| Canal | Publishers | Subscribers | Payload `type` |
|---|---|---|---|
| `ws:inbox` | `worker/send-message.persist-success.ts:69-96`, `worker/send-message.persist-failure.ts:62`, `worker/flow-message-sender.helpers.ts:124-203`, `worker/processors/autopilot/execution-audit.ts:51-71`, `backend/src/webhooks/webhooks.service.ts:303-305` | `backend/src/inbox/inbox-events.service.ts:33` → re-emite via `InboxGateway.emitToWorkspace` | `message:new`, `conversation:update`, `message:status` |
| `ws:agent` | `worker/providers/agent-events.ts:109`; `backend/src/marketing/channels/whatsapp/agent-events.service.ts:180` | `agent-events.service.ts:109` (subscribe) → SSE `whatsapp-api.controller.ts:163,220` → frontend `frontend/src/app/api/whatsapp-api/agent/stream/route.ts` → `AgentConsole` | `thought\|status\|error\|backlog\|prompt\|contact\|summary\|sale\|heartbeat\|typing\|action\|proof\|account` (tipo `AgentEventType`) |
| `ws:copilot:{workspaceId}` | `backend/src/marketing/channels/whatsapp/whatsapp-reconciler.service.ts:256` (`type: 'new_message'`) | `backend/src/copilot/copilot.gateway.ts:30` (`psubscribe('ws:copilot:*')`) → WS `copilot:suggestion` | `new_message` |
| `alerts` | `worker/providers/watchdog.ts:26` (`type: 'SESSION_UNHEALTHY'`), `worker/providers/health-monitor.ts:107` | `backend/src/alerts/alerts.gateway.ts:33` → WS `alert:event` | variados |
| `alerts:{workspaceId}` | `worker/processor.ts:367` (`type: 'job_failed'`), `worker/providers/rate-limiter.ts:66` | `backend/src/flows/flows.gateway.ts:61` (`psubscribe('alerts:*')`) → WS `alert` | `job_failed`, rate-limit |
| `flow:log:{workspaceId}` | `worker/flow-engine-global.ts:192` (`type: 'flow_start'`), `worker/flow-engine-lifecycle.ts:50,91` (`type: 'flow_end'`) via `worker/context-store.ts:91` | `backend/src/flows/flows.gateway.ts:60` (`psubscribe('flow:log:*')`) → WS `flow:log` | `flow_start`, `flow_end` |
| `events:ban` | `worker/providers/health-monitor.ts:53` | **NENHUM** (órfão) | — |
| `ops-alerts` | `backend/src/webhooks/payment-webhook-generic.helpers.ts:70` | **NENHUM** (órfão) | — |
| `spine:events:{workspaceId}` (Stream, não pub/sub) | `spine-emitter.service.ts:88` (XADD) | `spine-emitter.service.ts:123` (XRANGE — leitura própria) | envelope `SpineEventEnvelope` |

### 2.5 T5 WebSocket (Socket.IO) e SSE — backend → frontend

| Evento WS | Gateway emissor | Listener frontend |
|---|---|---|
| `message:new` | `inbox/inbox.gateway.ts` (via `inbox-events.service.ts:61`) | `frontend/src/components/kloel/inbox/useInboxRealtime.ts:32`, `frontend/src/components/kloel/inbox/parts/SuggestionChips.tsx:27` |
| `conversation:update` | `inbox-events.service.ts:64` | `useInboxRealtime.ts:46` |
| `message:status` | `inbox-events.service.ts:71` | **NENHUM** (órfão) |
| `copilot:suggestion` | `copilot/copilot.gateway.ts:36,38` | **NENHUM** (órfão) |
| `alert:event` | `alerts/alerts.gateway.ts:40,42` | **NENHUM** (órfão) |
| `alert` | `flows/flows.gateway.ts:73` | **NENHUM** (órfão) |
| `flow:log` | `flows/flows.gateway.ts:68` | **NENHUM** (órfão) |
| `join` (client→server) | `frontend/src/hooks/useSocket.ts` (`socket.emit('join', {workspaceId})`) | `inbox/inbox.gateway.ts:64` (`@SubscribeMessage('join')`) |
| `inbox:new-message` | **ninguém** — existe só no docstring de `useSocket.ts:19` (nome fantasma) | — |

SSE endpoints (event-stream): `kloel/kloel.controller.ts:429` + `kloel/kloel-stream-writer.ts:1264` (chat streaming; chunks `message_start`/`message_delta`/`message_stop` estilo Anthropic), `kloel/guest-chat.sse.helpers.ts:57`, `kloel/conversational-onboarding.helpers.ts:5`, `mind/coordination/mind-runtime.controller.ts:148`, `marketing/channels/whatsapp/controllers/whatsapp-api.controller.ts:163,220` (agent live stream). Proxies frontend: `frontend/src/app/api/whatsapp-api/{proxy.ts,agent/stream/route.ts,live/route.ts}`, consumidores `frontend/src/lib/kloel-conversations.ts:228`, `frontend/src/lib/api/kloel-api.ts:41`, `frontend/src/hooks/useCiaSurface.ts:102`, `frontend/src/components/kloel/landing/FloatingChat.tsx`.

### 2.6 T6 BullMQ — filas e jobs (comandos)

Registro backend: `backend/src/queue/queue-names.const.ts` (`QUEUE_NAMES`). Registro worker (independente por convenção): `worker/queue.ts:305-341`.

| Fila | Produtores (exemplos com path) | Consumidor | Jobs |
|---|---|---|---|
| `flow-jobs` | `flows/flows.controller.ts:118,248`, `autopilot/autopilot.service.ts:361-442`, `autopilot-cycle-executor.service.ts:267`, `marketing/channels/whatsapp/{inbound-processor.service.ts:309,423, whatsapp-message-dispatcher.service.ts:96,150, whatsapp-reconciler.service.ts:151,199}`, `prisma/checkout-paid-effects/whatsapp.ts:145`, `kloel/unified-agent-actions-crm.service.ts:429`, `kloel/mind/cia/cia.service.ts:193`; worker: `scheduled-followup-handler.ts:74` | `worker/processor.ts:237,258` | `run-flow`, `resume-flow`, `send-message`, `incoming-message`, `scheduled-followup` |
| `campaign-jobs` | `campaigns/campaigns.service.ts:210` (`process-campaign`), `autopilot/autopilot-cycle-money.service.ts:167`; worker `providers/campaigns.ts:14,27` (`process-campaign`, `process-campaign-action`) | `worker/campaign-processor.ts:147` | `process-campaign`, `process-campaign-action` |
| `scraper-jobs` | `scrapers/scrapers.service.ts:56` | `worker/scraper-processor.ts:137` | `run-scraper` |
| `media-jobs` | `media/media.service.ts:84` | `worker/media-processor.ts:15` | `generate-video` |
| `voice-jobs` | `voice/voice.service.ts:70` (`generate-audio`), `inbound-processor.service.ts:248` (`transcribe-audio`); worker `flow-engine-voice-producer.ts` | `worker/voice-processor.ts:253` | `generate-audio`, `transcribe-audio` |
| `autopilot-jobs` | `autopilot/autopilot-ops*.ts`, `followup/followup.service.ts:77` (`followup-contact`), `marketing/channels/whatsapp/{account-agent,whatsapp-catchup-orchestrator,whatsapp.service.catalog,whatsapp-reconciler}`, `kloel/mind/cia/{cia-backlog-run,cia-runtime-state}.service.ts`; worker `voice-processor.ts:236` (`process-message`), `processors/autopilot/{followup.ts:136,execution-dispatcher.ts:302}` | `worker/processors/autopilot-processor.ts:27` | `cycle-all`, `cia-cycle-all`, `cycle-workspace`, `cia-cycle-workspace`, `followup-contact`, `process-message` |
| `memory-jobs` | `kloel/mind/knowledge/knowledge-base.service.ts:259`; worker `flow-node-executor.ai.ts:179` (`extract-facts`), `flow-engine-global.ts:225` (`analyze-contact`) | `worker/processors/memory-processor.ts:299` | `extract-facts`, `analyze-contact` |
| `crm-jobs` | `checkout/checkout-social-lead.service.ts:385` | `worker/processors/crm-processor.ts:16` (`ghostCloserWorker`) | `analyze-contact` |
| `webhook-jobs` | `webhooks/webhook-dispatcher.service.ts` | `worker/processors/webhook-processor.ts:13` | dispatch de webhooks externos |
| `mass-send` | `mass-send/mass-send.service.ts:44` (`dispatch`) | `worker/processors/mass-send-processor.ts:55` | `dispatch` |
| `google-ads-sync-jobs` / `ads-sync-meta` | `integrations/ads-sync.processor.ts:282-369` | **o próprio backend** (`ads-sync.processor.ts:64,125` — `new Worker` in-backend) | `sync-accounts`, `sync-campaigns`, `sync-insights`, `refresh-google-token`, `sync-meta-*`, `refresh-meta-token` |
| `email-marketing-jobs` | `marketing/email-marketing.service.ts:35,82` | o próprio service (Worker in-backend, :84) | campanha de e-mail |
| `onboarding-email-jobs` | `notifications/welcome-onboarding-email.service.ts:14,40` | o próprio service (:42) | template de boas-vindas |
| `mind-bg-tick` | `kloel/mind/mind-bg.scheduler.ts:17,93` | o próprio (:103) | `tick` |
| `mind-scheduler` / `mind-tick` | `kloel/mind/runtime/mind-processor.service.ts:17,18,76,86` | o próprio (:103,117) | scheduler/tick |
| `silent-24h-resolver` | worker (repeatable) | `worker/processors/silent-24h-resolver-processor.ts:28` | resolver |
| `mind-self-evolution` | worker (cron 6h) | `worker/processors/mind-self-evolution-cron.ts:126` → HTTP `POST /internal/mind-self-evolution/trigger` no backend | cron |
| `flow-engine` | `worker/flow-engine-global.ts:75` (interna ao worker) | worker | continuação de flows |
| `{fila}-dlq` | `worker/processor-base.ts` (em falha) | `worker/dlq-monitor.ts:43,114`; reprocesso `worker/reprocess-dlq.ts:10` | DLQ |

Webhook externo do provedor WhatsApp (entrada): `marketing/channels/whatsapp/providers/whatsapp-api.provider.helpers.ts:192` assina `['messages', 'message_template_status_update', 'comments']` — nomes ditados pelo provedor, fora da taxonomia interna.

---

## 3. Agrupamento por ocorrência semântica (os duplicados reais)

| Ocorrência semântica | Nomes encontrados (camada) | Contagem |
|---|---|---|
| **Mensagem recebida (inbound)** | `message.received` (T2 legado), `commerce.whatsapp.message_received` (T1), `mind.message.received` (alias ADR-0013), `inbound.received` / `commerce.inbound.received` (T2), `message:new` (T4/T5), `new_message` (T4 `ws:copilot`), `incoming-message` (T6 job), `message_received` (transition do auditor + filtro UI `AgentConsole.types.ts:15`) | **8** |
| **Mensagem enviada / resposta do bot** | `message.sent` (T2), `commerce.whatsapp.message_replied` (T1), `chat.replied` (outcome), `cognition.copilot.chat_reply` (percept), `message_replied`/`message_sent` (transition/UI), `send-message` (T6 job), `kloel.chat.turn`→`cognition.chat.turn` (turno) | 7 |
| **Pagamento aprovado / venda fechada** | `commerce.payment.approved` (T1), `sale.created` (T2 legado), `commerce.sale.created` (alias), `checkout.paid` (taxonomy), `sale.completed` (taxonomy), `payment_approved` (transition), `Purchase` (pixel CAPI externo — `checkout-post-payment-effects.service.ts`, fora da taxonomia interna) | 6 interno + 1 externo |
| **Pagamento pendente/iniciado** | `payment.pending` (T1, `sales.service.v1-shared.ts:106` — **fora da taxonomia**), `commerce.payment.initiated` (T1), `commerce.cart.checkout_initiated` (T1) | 3 |
| **Decisão de IA tomada** | `cognition.decision_made`, `cognition.cia.decision_made`, `cognition.autopilot.decision_made`, `mind.decision.created` (taxonomy), `brain.decide` (taxonomy, nunca emitido) | 5 |
| **Ação/capability executada** | `capability.executed` (T2), `mind.action.executed` (alias), `cognition.cia.action_executed`, `cognition.voice.action_executed`, `cognition.autopilot.action_executed`, `brain.capability.invoked` (taxonomy) | 6 |
| **Canal conectado/desconectado** | `channel.connected`/`channel.disconnected`/`channel.externally_blocked` (taxonomy) vs `commerce.whatsapp.session_lifecycle` (payload `event: connected\|disconnected\|banned`) — **dois modelos: fato-por-evento vs fato-no-payload** | 2 modelos |
| **Alerta operacional** | `alert` (WS), `alert:event` (WS), canal `alerts`, canal `alerts:{ws}`, canal `ops-alerts`, types `SESSION_UNHEALTHY`/`job_failed` | 6 |
| **Produto alterado** | `product.updated` + `commerce.product.updated` (dual T3), `product.activated`/`product.deactivated` (T3, fora de taxonomia), `mind.product.observed` (T3) | 5 |

---

## 4. Taxonomia canônica proposta + DE→PARA

### 4.1 Regras

1. Formato **`domínio.entidade.fato`**, fato em past-tense snake_case. Máx. 3 segmentos (sub-entidade entra no fato: `member_area.enrolled` ✔).
2. Domínios canônicos: **`commerce`** (fatos de negócio), **`cognition`** (telemetria mente/IA), **`channel`** (transporte de conversa, canal-agnóstico — alinhado ao `WHATSAPP_DISSOLUTION_PLAN.md`: o canal vai no payload `channel: 'whatsapp'`), **`ops`** (alertas/saúde), **`flow`** (runtime de flows), **`lineage`**, **`readiness`**, **`identity`**.
3. UI/WS usa **o mesmo nome canônico** do fato (sem dialeto `foo:bar`); jobs BullMQ permanecem imperativos `verbo-objeto` e fora da taxonomia.
4. Dual-emit obrigatório por 4 semanas (padrão já implementado em `emitCommerceAlias`/`emitCognitionAlias` — reutilizar).
5. Todo nome novo DEVE ser adicionado a `BRAIN_EVENT_TAXONOMY` (`mind-event-taxonomy.ts`) antes do flip do emit-site (padrão "Aliased canonical" documentado no próprio arquivo).

### 4.2 Tabela DE→PARA (cada nome legado → canônico)

Status: ✅ alias já existe no código · 🔧 criar alias · 🗑 deletar (órfão) · ⏸ manter (já canônico)

| DE (legado) | PARA (canônico) | Camada | Status / Ação |
|---|---|---|---|
| `message.received` | `channel.message.received` (payload `channel`) — intermediário atual: `commerce.whatsapp.message_received` | T2 | ✅ alias p/ `commerce.whatsapp.message_received` em `LEGACY_TO_COMMERCE_ALIAS`; 🔧 fase 2: `channel.message.received` |
| `commerce.whatsapp.message_received` | `channel.message.received` | T1 | 🔧 (dissolução WhatsApp) |
| `commerce.whatsapp.message_read` | `channel.message.read` | T1 | 🔧 |
| `commerce.whatsapp.message_replied` | `channel.message.sent` (payload `author`) | T1 | 🔧 |
| `commerce.whatsapp.session_lifecycle` | dividir: `channel.session.connected` / `channel.session.disconnected` / `channel.session.banned` / `channel.session.qr_issued` | T1 | 🔧 — elimina fato-no-payload; aposenta também `channel.connected/disconnected/externally_blocked` da taxonomy (nunca emitidos) |
| `commerce.whatsapp.handoff_to_human` | `channel.conversation.handed_off` | T1 | 🔧 (hoje sem emissor — religar emissor primeiro, §5) |
| `commerce.whatsapp.conversation_resumed` | `channel.conversation.resumed` | T1 | 🔧 |
| `inbound.received` | `commerce.inbound.received` | T2 | ✅ `LEGACY_TO_COMMERCE_ALIAS` |
| `message:new` (WS/pub-sub) | `channel.message.received` (outbound UI: manter payload) | T4/T5 | 🔧 renomear evento WS no gateway + hooks |
| `conversation:update` | `channel.conversation.updated` | T4/T5 | 🔧 |
| `message:status` | `channel.message.status_changed` | T4/T5 | 🔧 (ou 🗑 — sem listener hoje) |
| `new_message` (`ws:copilot`) | `channel.message.received` | T4 | 🔧 |
| `message.sent` (mapper) | `channel.message.sent` | T2 | 🔧 em `mind-action-event-mapper.ts` |
| `sale.created` | `commerce.sale.created` | T1/T2 | ✅ |
| `payment.pending` | `commerce.payment.initiated` | T1 | 🔧 (`sales.service.v1-shared.ts:106`) |
| `sale.completed` / `sale.refunded` / `sale.cancelled` (taxonomy, sem emissor) | `commerce.payment.approved` / `commerce.payment.refunded` / `commerce.payment.declined` | — | 🗑 da taxonomy após janela |
| `checkout.created` / `checkout.updated` / `checkout.generated` | `commerce.checkout.created` / `commerce.checkout.updated` / `commerce.checkout.generated` | T2 mapper | 🔧 |
| `checkout.paid` / `checkout.cancelled` / `checkout.viewed` / `checkout.abandoned` (taxonomy) | `commerce.payment.approved` / `commerce.checkout.cancelled` / `commerce.checkout.viewed` / `commerce.cart.abandoned` | — | 🔧/🗑 conforme emissor real |
| `product.created` | `mind.product.observed` (ADR-0013) e `commerce.product.created` | T3 | ✅ ambos os mapas — mas ver §5: barramento T3 morto |
| `product.updated` / `product.published` / `product.deleted` | `commerce.product.*` | T3 | ✅ `LEGACY_TO_COMMERCE_ALIAS` |
| `product.activated` / `product.deactivated` | `commerce.product.activated` / `commerce.product.deactivated` (novos) **ou** payload em `commerce.product.updated` | T3 | 🔧 registrar na taxonomy — hoje fora de qualquer mapa (`product.service.ts:313`) |
| `plan.created` | `mind.plan.observed` | T3 | ✅ |
| `plan.updated` / `plan.deleted` | `commerce.plan.*` | T3 | ✅ |
| `coupon.created` / `coupon.updated` / `coupon.deleted` | `commerce.coupon.*` | T2 mapper | ✅ (created) / 🔧 (updated/deleted) |
| `lead.created` / `lead.qualified` / `lead.transferred` / `lead.abandoned` | `commerce.lead.*` | T2 | ✅ (created) / 🔧 demais |
| `campaign.scheduled` | `commerce.campaign.scheduled` | T2 | ✅ |
| `concept.detected` | `commerce.concept.detected` | T2 | ✅ |
| `capability.executed` | `mind.action.executed` | T2 | ✅ |
| `kloel.chat.turn` | `cognition.chat.turn` | log/spine | ✅ `KLOEL_TO_COGNITION_ALIAS` |
| `kloel.handoff.confidence` / `.blocking` | `cognition.handoff.confidence` / `.blocking` | log | ✅ |
| `pipeline.state.changed` / `pipeline.auto_fallback` / `pipeline.shadow_recorded` | `cognition.pipeline.state_changed` / `auto_fallback` / `shadow_recorded` | T2 | ✅ `MIND_EVENT_ALIASES` |
| `identity.contact.resolved` | `cognition.identity.contact_resolved` | T2 | ✅ |
| `case_memory.consulted` / `predecided_actions.built` | `cognition.case_memory.consulted` / `cognition.predecided.actions_built` | T2 | ✅ |
| `cognition.self.modification_proposed` (emit) vs `cognition.self_modification.proposed` (poll) | unificar em `cognition.self_modification.proposed` | T1/T2 | 🔧 **bug de grafia** — emit em `mind-self-modification.service.ts` não casa com o poll do `mind-event-ingestor.service.ts` |
| `money_machine.reactivation` | `cognition.money.reactivation_triggered` | T1 | 🔧 (dual-emit já existe no helper `growth/money-percept-emit.helper.ts`) |
| `chat.replied` / `chat.degraded` / `chat.error` | `cognition.chat.reply_succeeded` / `reply_degraded` / `reply_failed` | outcome | 🔧 |
| `alert` + `alert:event` (WS) | `ops.alert.raised` | T5 | 🔧 unificar os dois gateways num único evento |
| canais `alerts` + `alerts:{ws}` + `ops-alerts` | canal único `ops:alerts:{workspaceId}` com payload canônico | T4 | 🔧 |
| `flow:log` (WS) + `flow_start`/`flow_end` (payload) | `flow.run.started` / `flow.run.completed` | T4/T5 | 🔧 |
| `copilot:suggestion` (WS) | `cognition.copilot.suggestion_created` | T5 | 🔧 ou 🗑 (sem listener) |
| `events:ban` (canal) | `channel.session.banned` via spine | T4 | 🗑 canal; religar via T1 |
| `SESSION_UNHEALTHY` / `job_failed` (types) | `ops.session.unhealthy` / `ops.job.failed` | T4 | 🔧 |
| `brain.*` (`brain.decide`, `brain.observe`, `brain.autonomy.propose`, `brain.capability.invoked`) | `cognition.*` equivalentes | taxonomy | 🗑 — nunca emitidos; remoção da `BRAIN_EVENT_TAXONOMY` após confirmação por drift query |
| `Purchase` | — (nome exigido pelo Facebook CAPI; **excluir da taxonomia interna**, marcar como egress) | egress | ⏸ |
| filas `ads-sync-meta`, `mass-send` | `meta-ads-sync-jobs`, `mass-send-jobs` (padrão `*-jobs`) | T6 | 🔧 opcional — exige drenagem de fila na migração |

---

## 5. Órfãos e fantasmas (candidatos a deleção/religação)

### 5.1 Emitidos sem nenhum consumidor (deletar emissor ou religar)

| # | Evento | Local do emit | Recomendação |
|---|---|---|---|
| 1 | **Todo o barramento T3** — `mind.product.observed`, `mind.plan.observed`, `product.updated`+alias, `product.published`+alias, `product.deleted`+alias, `product.activated`, `product.deactivated`, `plan.updated`+alias, `plan.deleted`+alias | `products/product.service.ts`, `plans/plan.service.ts` | **Religar ao spine (T1) via `recordCommercial`** (os mesmos services já chamam `brainSpine?.recordCommercial` — o emit EventEmitter2 é redundante e morto) ou deletar os emits T3 |
| 2 | canal `events:ban` | `worker/providers/health-monitor.ts:53` | Deletar publish; substituir por `channel.session.banned` no spine |
| 3 | canal `ops-alerts` | `backend/src/webhooks/payment-webhook-generic.helpers.ts:70` | Deletar ou assinar no `alerts.gateway` |
| 4 | WS `message:status` | `inbox-events.service.ts:71` | Adicionar listener no inbox do frontend (status de entrega) ou deletar o relay |
| 5 | WS `copilot:suggestion` | `copilot/copilot.gateway.ts:36` | Sem listener no frontend — gateway inteiro candidato a remoção |
| 6 | WS `alert:event` | `alerts/alerts.gateway.ts:40` | idem — duplicado de `alert` do flows.gateway, ambos sem listener |
| 7 | WS `alert` | `flows/flows.gateway.ts:73` | idem |
| 8 | WS `flow:log` | `flows/flows.gateway.ts:68` | Sem listener (provável consumidor era um console de flows removido) |
| 9 | `cognition.flow.node_completed`, `cognition.voice.*`, `cognition.cia.*`, `cognition.copilot.chat_reply`, `cognition.autopilot.*`, `cognition.money.*` | percept-helpers (§2.2) | **NÃO deletar** — telemetria durável by design (flag-gated, nunca re-processada; ver comentário `mind-event-taxonomy.ts:103-116`) |
| 10 | `commerce.kyc.*`, `commerce.affiliate.*` | emitters §2.1 | Manter — consumidor é o catálogo do auditor + replay analítico |
| 11 | `cognition.consciousness.experience_recorded` e demais `cognition.*` de mente | services de mind | Manter — consumidos por `runtime-metrics.service.ts` (subscriber genérico) |
| 12 | `mind-self-evolution` percepts: emit `cognition.self.modification_proposed` | `mind-self-modification.service.ts` | **Corrigir grafia** para casar com poll `cognition.self_modification.proposed` do ingestor — hoje o poll nunca encontra o evento (órfão por typo) |
| 13 | `commerce.onboarding.declared` | `mercado-entrada.declarator.service.ts:270,361` | Verificar leitor; se só auditoria, marcar como telemetria durável |

### 5.2 Consumidos sem nenhum emissor (fantasmas — limpar consumidores ou religar emissor)

| # | Evento | Consumidores | Causa |
|---|---|---|---|
| 1 | `commerce.lead.replied` | ~20 detectores (`kloel/creator/*`, `kloel/offer/*`, `kloel/goal-field/*`, `kloel/healthy-money/*`, `daily-dashboard.service.ts:101`) | Nenhum `safeEmit`/`recordCommercial` com esse nome — detectores nunca disparam |
| 2 | `commerce.lead.contacted` | detectores goal-field/commercial | idem |
| 3 | `commerce.whatsapp.handoff_to_human` | 17 refs em `postsale-consumers/*` | `emitHandoffToHuman` existe (`whatsapp-event-emitter.service.ts:133`) mas **não tem chamador** |
| 4 | `commerce.whatsapp.conversation_resumed` | catálogo auditor | `emitConversationResumed` sem chamador |
| 5 | `commerce.whatsapp.conversation_cooldown` | `postsale-consumers/*` (1 ref) | Nome nem existe em emitter algum |
| 6 | `commerce.post_sale.testimonial_requested` | catálogo + 1 detector | Sem emissor |
| — | `channel.connected` / `channel.disconnected` / `channel.externally_blocked`, `brain.*`, `message.delivered` / `message.read` / `message.failed` / `message.converted`, `lead.transferred` / `lead.abandoned`, `contact.segmented`, `campaign.sent` / `campaign.converted`, `mind.decision.*` / `mind.prediction.*` / `mind.surprise.recorded` | só na `BRAIN_EVENT_TAXONOMY` | Declarados e nunca emitidos — remover da taxonomy após drift query de 7 dias zerada (processo descrito em `event-taxonomy.canonical-aliases.ts:28-31`) |
| — | `inbox:new-message` | docstring `useSocket.ts:19` | Corrigir comentário para `message:new` |

---

## 6. Plano de migração executável (ordem segura)

1. **Correções de bug (sem janela):**
   a. Unificar grafia `cognition.self.modification_proposed` → `cognition.self_modification.proposed` no emit (`mind-self-modification.service.ts`) — o ingestor já espera a segunda.
   b. Corrigir docstring `useSocket.ts:19` (`inbox:new-message` → `message:new`).
2. **Religar T3 ao spine:** em `product.service.ts`/`plan.service.ts`, mover os payloads dos `eventEmitter.emit(...)` para `brainSpine.recordCommercial`/`spine.emit` (já injetados nos mesmos métodos) e deletar o provider `EventEmitter2` de `products.module.ts:9` e `plans.module.ts:9`. Registrar `commerce.product.activated`/`deactivated` na `BRAIN_EVENT_TAXONOMY` antes.
3. **Deletar órfãos T4/T5:** `events:ban`, `ops-alerts`, e decidir destino de `copilot:suggestion`/`alert:event`/`alert`/`flow:log`/`message:status` (religar UI ou remover gateway). Cada remoção = grep de confirmação + teste de gateway.
4. **Fantasmas:** religar `emitHandoffToHuman` (chamar de `whatsapp-mind-coordinator`/ponto de handoff real) e `emitConversationResumed`; ou remover os branches mortos dos `postsale-consumers`.
5. **Fase `channel.*`:** adicionar nomes `channel.message.received/sent/read`, `channel.session.*`, `channel.conversation.*` à `BRAIN_EVENT_TAXONOMY` + novo mapa `WHATSAPP_TO_CHANNEL_ALIAS` em `event-taxonomy.canonical-aliases.ts`; dual-emit nos 7 emit-sites do `whatsapp-event-emitter.service.ts`; alargar leitores via `expandEventNameAliases`; flip; janela de 4 semanas; remoção dos legados.
6. **Limpeza da taxonomy:** após drift query zerada por 7 dias (nightly já previsto em `event-taxonomy.canonical-aliases.ts:29-30`), remover `brain.*`, `sale.completed/refunded/cancelled`, `checkout.viewed/cancelled`, `channel.connected/disconnected/externally_blocked` e os pares legados dos 3 mapas de alias.
7. **Renome de filas (opcional, último):** `ads-sync-meta` → `meta-ads-sync-jobs`, `mass-send` → `mass-send-jobs`; exige drenar fila antiga + deploy coordenado backend/worker (registros independentes: `queue-names.const.ts` ↔ `worker/queue.ts` mantidos idênticos *por convenção*).

> Ferramentas de verificação já existentes: `tools/canonicalize/scan.mjs` (regenera o inventário estático),
> `spine-coverage-auditor.service.ts` (cobertura evento→transição PCI.6),
> `expandEventNameAliasesAll` (filtros dual-name em consultas Prisma/SQL).
