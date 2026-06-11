# MIND_UNIFICATION_PLAN — Brain + Mind + camadas cognitivas → um único órgão "Kloel Mind"

> **Status**: plano executável · **Data da auditoria de código**: 2026-06-10
> **Método**: 100% derivado de leitura de código-fonte (`backend/src`, `worker/`, `backend/prisma/schema.prisma`). Documentos `.md` citados apenas como referência cruzada (ADR-0013), nunca como fonte de verdade.
> **Relação com ADR-0013** (`docs/adr/0013-kloel-mind-unification.md`): este plano é o sucessor executável do escopo expandido (2026-06-02). As ondas M1–M5 do ADR já estão **concluídas no código** (provas na §1.4 e §6). Este documento cobre o que falta: ledger de decisão único, unificação física de mensagens/memória, absorção de Autopilot/Copilot/Voice/Flows/Money Machine, e colapso das 3 espinhas de evento.
> **Anti-decisões herdadas e em vigor**: nenhum `DROP TABLE`, nenhum rename sem alias, UnifiedAgent e ToolDispatcher intocáveis, nenhum gate desabilitado.

---

## 0. Sumário executivo

O Kloel hoje tem **um Mind canônico real e funcional** (`backend/src/kloel/mind/`, 80 arquivos `.service.ts` em 18 subpastas, 16 modelos Prisma `Mind*`) — mas o loop cognitivo `estado → percepção → decisão → ação → consequência → aprendizado` ainda está **fatiado entre 7+ órgãos paralelos**:

| Sintoma | Prova |
|---|---|
| **3 espinhas de evento** coexistem | `SpineEmitterService` (ring buffer + Redis, `kloel/spine/spine-emitter.service.ts`), `MindEventSpine` (grava na tabela `AutopilotEvent`!, `mind/coordination/mind-event-spine.service.ts:44-56`), `MindOutboxEvent` durável (`percept-emit.factory.ts`) |
| **2 ledgers de decisão** | `DecisionOutcomeService` → `RAC_DecisionOutcome` (`kloel/decision-outcome.service.ts`) vs `MindPolicyService` → `RAC_MindPolicy` — dual-write atrás de `KLOEL_DECISION_LEDGER_DUALWRITE` default OFF (`decision-outcome.service.ts:58-62`) |
| **5 tabelas de mensagem** | `RAC_KloelMessage`, `RAC_ChatMessage`, `RAC_KloelConversation`, `RAC_Message`, `RAC_FbMessage` — canônica `RAC_MindMessage` existe mas é "dead-on-READ" (comentário no próprio schema, linha 3925-3935) |
| **2 sistemas de memória de longo prazo** | `RAC_KloelMemory`/`RAC_MindMemory` (KV por workspace) vs `RAC_MemoryNode`/`RAC_MemoryEdge` (grafo tipado por usuário, `mind/memory/memory.service.ts`) |
| **2 runtimes de background do Mind** | `MindProcessorService` (fila `mind-tick`, `mind/runtime/mind-processor.service.ts`) e `MindBackgroundScheduler` (fila `mind-bg-tick`, `mind/mind-bg.scheduler.ts`) |
| **Percepção/decisão duplicadas fora do Mind** | `worker/providers/commercial-intelligence.core.ts` (máquina de estados por keywords), `copilot.service.ts:22-24` (regex de intenção própria), `autopilot-cycle-executor` (baseline própria) |
| **Reward degenerado no chat** | documentado no próprio código: `kloel/real-reward-signal.flag.ts` — "o loop é curto-circuitado em 'ação'; a consequência nunca é observada" (flag `KLOEL_REAL_REWARD_SIGNAL`, default OFF) |

A infraestrutura de unificação **já existe e está desligada por flag** (6 flags `*_PERCEPT_ENABLED`, 3 pares dual-write/backfill/read-canonical, sweep de timeout, reward real). A maior parte deste plano é **ligar, validar e cortar** — não construir.

---

## 1. Inventário do Brain (camada conversacional legada)

### 1.1 Entidades Prisma (`backend/prisma/schema.prisma`)

| Modelo | Linha | Tabela física | Conteúdo | Status de migração (verificado no código) |
|---|---:|---|---|---|
| `KloelMessage` | 1693 | `RAC_KloelMessage` | mensagens role/content por workspace (chat do dono) | dual-write para `MindMessage` atrás de `KLOEL_MINDMESSAGE_DUALWRITE` (OFF) — `mind/aliases/mindmessage-dualwrite.flag.ts` |
| `KloelMemory` | 1713 | `RAC_KloelMemory` | KV `(workspaceId, key)` + embedding pgvector 1536 | banner `@deprecated` no schema apontando para `MindMemoryItemService`; dual-write `KLOEL_MINDMEMORY_DUALWRITE` (OFF) |
| `KloelLead` | 1836 | `RAC_KloelLead` | leads do canal WhatsApp | sem mudança planejada nesta unificação (entidade comercial, não cognitiva) |
| `KloelConversation` | 1867 | `RAC_KloelConversation` | mensagens por lead (role/content/intent/sentiment) | dual-write para `MindMessage` `source='lead_conversation'` (spec `kloel/lead-conversation-mindmessage-dualwrite.spec.ts`) |
| `ChatThread` | 1887 | `RAC_ChatThread` | threads do chat do dashboard | permanece como índice de thread; mensagens migram |
| `ChatMessage` | 1901 | `RAC_ChatMessage` | mensagens do dashboard (threadId, userId) | dual-write via `MindChatMessageService` (`mind/aliases/mind-chat-message.service.ts`) |
| `MindMessage` | 3936 | `RAC_MindMessage` | **canônica** — converge as 3 legadas via discriminador `source` + `sourceId` p/ backfill idempotente | escrita dual-write best-effort; **nenhum read path** consome ainda (comentário no schema) |
| `MindMemory` | 3974 | `RAC_MindMemory` | **canônica** — KV com coluna extra `namespace` | **LIVE on read** só para namespace `umem:<userId>` via `KloelMemoryEngineService.recall()` |

> **`KloelSession` NÃO existe no schema.** A menção do ADR-0013 resolve para `InputCollectionSession` (linha 1523, `RAC_InputCollectionSession`) — sessões de coleta de input, não sessões de chat. Nenhuma migração de "KloelSession" é necessária; o item é vazio.

### 1.2 Serviços orquestradores do Brain (`backend/src/kloel/`, raiz)

| Serviço | Arquivo | Papel no loop | Tabelas tocadas |
|---|---|---|---|
| `KloelService` | `kloel.service.ts` | orquestrador fino do chat do dono ("thin orchestrator over focused sub-services") | delega; já injeta `MindCanonicalService`, `MindMessageService`, `MindMemoryItemService` |
| `KloelThinkerService` | `kloel-thinker.service.ts` | loop think (streaming, tool-planning, ABI) | via `KloelThreadService` / `MindCapabilityExecutor` |
| `KloelReplyEngineService` | `kloel-reply-engine.service.ts` | geração de resposta; **já consome sinais do Mind** (`MindService`, `AttentionService`, `Valence*`, `MindBeliefService`, `MindConceptService`) | `RAC_DecisionOutcome` (decisão `chat_reply`), bandit arms |
| `KloelThreadService` | `kloel-thread.service.ts` | persistência dashboard-chat | `chatThread` direto; `chatMessage` via delegate `mindChatMessage?.items ?? prisma.chatMessage` (linha 50-51) |
| `KloelConversationStore` | `kloel-conversation-store.ts` | histórico do chat do dono | delegates `mindMemory?.items ?? prisma.kloelMemory` e `mindMessage?.items ?? prisma.kloelMessage` (linhas 36-41) |
| `KloelMemoryEngineService` | `kloel-memory-engine.service.ts` | memória por usuário estilo Mem0 (slots determinísticos, DeepSeek p/ extração) | **escreve direto em `MindMemory`** namespace `umem:` |
| `MemorySearchService` + crud/management/stats | `memory-search.service.ts` etc. | busca/gestão da memória de workspace | `mindMemory?.items ?? prisma.kloelMemory` (`memory-search.service.ts:42`) |
| `KloelLeadProcessorService` | `kloel-lead-processor.service.ts` | pipeline de lead WhatsApp | `kloelLead`, `kloelConversation` + dual-write MindMessage |
| `DecisionOutcomeService` | `decision-outcome.service.ts` | **ledger de decisão→consequência** (abre/fecha outcomes, alimenta bandit) | `RAC_DecisionOutcome`, espelho flag-gated p/ `RAC_MindPolicy` |
| `DecisionSweepScheduler` | `decision-sweep.scheduler.ts` | cron de loss-por-timeout (`inbound.silent_24h`) | gated `KLOEL_DECISION_SWEEP_ENABLED` (OFF) |
| `CommercialDecisionOrchestratorService` | `commercial-decision-orchestrator.service.ts` | decisão inbound comercial (gate→conceito→score→compose) | injeta `MindEventSpine`, `MindConceptService`, `MindService` |
| `KloelToolDispatcherService` / `KloelToolExecutor*` | `kloel-tool-dispatcher.service.ts` etc. | **camada de tools — fora do Mind por ADR-0006** | — |
| `UnifiedAgentService` + 7 sub-actions | `unified-agent*.ts` | **executor — fora do Mind por ADR-0006** | — |

### 1.3 Eventos `kloel.*` — estado real

O grep por `kloel.message.created` / `kloel.action.executed` retorna **zero emissores** no backend. O estado atual, verificado em código:

| Mapa de alias | Arquivo | Conteúdo |
|---|---|---|
| `KLOEL_TO_COGNITION_ALIAS` | `kloel/event-taxonomy.canonical-aliases.ts` | só restam 3 nomes `kloel.*` vivos: `kloel.handoff.confidence`, `kloel.handoff.confidence.blocking`, `kloel.chat.turn` → `cognition.*` (dual-emit, janela de 4 semanas) |
| `MIND_EVENT_ALIASES` | `kloel/mind/coordination/mind-event-taxonomy.ts:161-204` | os antigos `kloel.message.created`/`kloel.action.executed` viraram `message.received → mind.message.received` e `capability.executed → mind.action.executed`; mais 15 aliases `commerce.*` e 6 `cognition.*` |
| `BRAIN_EVENT_TAXONOMY` | mesmo arquivo, linhas 1-122 | taxonomia completa (única fonte de verdade de nomes), incluindo a família de percepts `cognition.{flow,cia,voice,autopilot,money}.*` |

**Conclusão do inventário de eventos**: a migração de nomes (M6) está em janela de dual-emit; o que falta é o **gate de remoção** (M7) — ver fatia F8.

### 1.4 O que do ADR-0013 já está concluído (prova em código)

| Onda ADR | Prova de conclusão |
|---|---|
| M1 (renames Brain→Mind) | `ls backend/src/kloel/brain-*` → vazio; canônicos vivem em `mind/coordination/` (`mind-event-spine.service.ts`, `mind-autonomy-coordinator.service.ts`, `mind-runtime.service.ts`, `whatsapp-mind-coordinator.service.ts`, `lead-mind-coordinator.service.ts`) |
| M2 (ai-brain merge) | `backend/src/ai-brain/` **não existe**; conteúdo em `mind/knowledge/` (`mind-knowledge-base.service.ts`, `mind-vector-store.service.ts`, `mind-media-factory.service.ts`, `mind-hidden-data-extractor.service.ts`, `mind-knowledge-assist.service.ts`) |
| M3 (brain merge) | `backend/src/brain/` **não existe**; `mind/observability/mind-spine-audit.service.ts` |
| M4 (CIA scoped) | `backend/src/cia/` **não existe**; tudo em `mind/cia/` (11 serviços) |
| M5 (reestruturação interna) | subpastas `mind/{perception,inference,policy,memory,runtime,coordination,observability,knowledge,synthetic,cia,aliases,autonomy,...}` existem e estão populadas |

---

## 2. Inventário do Mind (`backend/src/kloel/mind/`)

### 2.1 Modelos Prisma `Mind*` (16) + grafo de memória por usuário

| Modelo | Linha schema | Papel | Escritor canônico |
|---|---:|---|---|
| `MindBelief` | 3580 | crença bayesiana `(subject, predicate, context)` com `mean/variance/alpha/beta` | `mind/inference/mind-belief.service.ts` |
| `MindPrediction` | 3602 | predição com deadline + `surprise` na resolução | `mind/inference/mind-predictor.service.ts` + `mind-surprise.service.ts` |
| `MindPolicy` | 3624 | **ledger canônico de decisão** (candidates, chosen, baseline, outcome, calcSteps, epsilon) | `mind/policy/mind-policy.service.ts` |
| `MindWorkspaceState` | 3652 | estado do tick (watermark, lease, janelas de surprise) + JSON `health` (abriga pesos hebbianos) | `mind/memory/mind-workspace-state.service.ts` |
| `MindCase` | 3673 | memória de casos (tokens, features, action, outcome) | `mind/memory/mind-case-memory.service.ts` |
| `MindConceptDetection` | 3693 | conceitos detectados por evidência | `mind/memory/mind-concepts.service.ts` |
| `MindGraphNode` / `MindGraphEdge` | 3711/3727 | grafo comercial hebbiano por workspace | `mind/coordination/mind-commercial-graph.persistence.ts:70` (upsert) |
| `MemoryNode` / `MemoryEdge` | 3760/3795 | grafo de memória **por usuário** (taxonomia tipada, pgvector, lifecycle) | `mind/memory/memory.service.ts` |
| `MindOutboxEvent` | 3809 | **outbox durável de percepts** `(workspaceId, idempotencyKey)` único | `mind/coordination/percept-emit.factory.ts` (fábrica única dos 6 helpers) |
| `MindBanditArm` | 3831 | braços Thompson/UCB `(workspaceId, decisionType, arm)` α/β/pulls/wins | `mind/policy/mind-bandit.service.ts` |
| `MindGuardAudit` | 3852 | auditoria de guards (allowed/reason) | `mind/policy/mind-guards.service.ts` |
| `MindDailyReport` | 3869 | relatório diário por workspace | `mind/observability/mind-report.service.ts` via `MindProcessorService` |
| `MindGlobalPrior` | 3884 | priors globais anonimizados por domínio | `mind/memory/mind-global-prior.service.ts` |
| `MindSelfModel` | 3908 | self-model versionado append-only (contradições inline) | `mind/self-model/mind-self-model.service.ts` |
| `MindMessage` / `MindMemory` | 3936/3974 | armazéns canônicos (ver §1.1) | aliases + `KloelMemoryEngineService` |
| `KloelGlobalPrior` | 3999 | **@deprecated** no schema — superado por `MindGlobalPrior`; manter por segurança de dados | — |

### 2.2 Submódulos e serviços (80 arquivos `.service.ts`, 18 subpastas)

| Subpasta | Serviços (não-spec) | Estágio do loop |
|---|---|---|
| `perception/` | `MindPerceptionService` (classifyIntent/salience/subject), `MindMultimodalPerceptionService` | percepção |
| `inference/` | `MindBeliefService`, `MindPredictorService`, `MindSurpriseService`, `mind-belief-by-channel.ts` | estado→predição→surpresa |
| `policy/` | `MindPolicyService`, `MindBanditService` (**Thompson/UCB**: `score = mean + sqrt(log(totalPulls+1)/pulls)` sobre Beta(α,β), `mind-bandit.service.ts:26-30`), `MindGuardsService`, `MindQualityService`, catálogo `MIND_DECISION_CATALOG` com **11 decisionTypes** (`mind-decision-catalog.ts`: followup_timing, message_format, objection_response, coupon_offer, human_transfer, channel_choice, product_offer, broadcast_window, cart_recovery, ad_alert_action, autopilot_action) + resolvers catalog/commercial/recovery | decisão |
| `memory/` | `MindCaseMemoryService`, `MindConceptService`, `MindGlobalPriorService`, `MindWorkspaceStateService`, `CaseConsolidationService` (`mind-long-term-memory.service.ts`), `MemoryService` (grafo por usuário), `ConversationArchiveService`, `EpisodeService` | estado + aprendizado |
| `runtime/` | `MindProcessorService` (BullMQ `mind-scheduler`/`mind-tick`, 30s), `MindEventProcessorService` (processa percepts → predição/política/casos/conceitos), `MindReplayService` | percepção→decisão (tick) |
| `coordination/` | `MindEventSpine` (grava `AutopilotEvent`), `MindEventIngestor` (drena `cognition.decision_made` do outbox → Hebbian), `MindAutonomyCoordinator`, `MindCapabilityExecutor/Registry`, `MindCommercialGraph` (+persistência em `MindGraphNode/Edge`), `CommerceOutcomeLearner`, `WhatsAppMindCoordinator`, `LeadMindCoordinator`, `percept-emit.factory.ts`, taxonomia | percepção+ação+aprendizado |
| `observability/` | `MindObservabilityService` (lê `mindOutboxEvent` E `autopilotEvent` — linhas 120-190), `MindLiftReportService`, `MindReportService`, `MindSpineAuditService` | telemetria |
| `cia/` | 11 serviços (ver §3.1) | adaptador de aprendizado |
| `knowledge/` | KB, vector store, media factory, hidden-data, agent-assist (ex-ai-brain) | percepção/conhecimento |
| `aliases/` | `MindMessageService`, `MindChatMessageService`, `MindMemoryItemService`, backfills, `MindCutoverBootstrapService`, 7 flags | superfície dual-write |
| raiz `mind/` | `MindService` ⚠️ (em `kloel/mind.service.ts`, FORA da pasta), `AttentionService`, `HebbianService`, `ConsolidationService` (dry-run), `MultiTimescaleCoordinator` (4 timescales), `ValenceTagger/Aggregator`, `MindBackgroundProcessor/Scheduler`, `MindPredictionService` ⚠️ (duplicata de nome com `inference/mind-predictor.service.ts`), `MindCanonicalService`, `build-mind-signals.helper.ts` | núcleo do tick |
| `autonomy/` | `MindAutonomyService` (propõe goals por anomalia) ⚠️ coexiste com `coordination/mind-autonomy-coordinator.service.ts` | decisão/autonomia |
| `consciousness/ emotional/ curiosity/ causal/ self-model/ self-evolution/ synthetic/` | 1 serviço cada (`MindConsciousnessService`, `MindEmotionalIntelligenceService`, `MindCuriosityService`, `MindCausalModelService`, `MindSelfModelService`, `MindSelfModificationService`, `MindSimulatorService`/`MindSyntheticGeneratorService`/`MindVerbalizerService`) | metacognição |

### 2.3 Consolidação hebbiana e de memória — 4 implementações

| Mecanismo | Arquivo | Persistência | Estado |
|---|---|---|---|
| `HebbianService` (co-ativação B6) | `mind/hebbian.service.ts` | in-memory + best-effort em `MindWorkspaceState.health.hebbian` (sem migração) | ativo; alimentado pelo `MindEventIngestor` |
| `ConsolidationService` (working→episodic→consolidated, B8) | `mind/consolidation.service.ts` | **dry-run** — só emite propostas | promoção a `real` pendente (CONS-002) |
| `CaseConsolidationService` | `mind/memory/mind-long-term-memory.service.ts` | `MindCase` | ativo via `MindProcessorService` |
| `runCognitiveConsolidation` | `mind/mind-cognitive-consolidation.helper.ts` | outbox `cognition.consolidation_scan` | gated por `isCognitiveConsolidationEnabled` no `MindBackgroundScheduler` |

### 2.4 Os dois runtimes de background (duplicação interna)

| Runtime | Fila | Intervalo | Faz |
|---|---|---|---|
| `MindProcessorService` (`mind/runtime/mind-processor.service.ts`) | `mind-scheduler` + `mind-tick` | 30s, concorrência 4 | `MindService.tick()` por workspace: percepção→predição→política→casos; relatório diário; autonomy/curiosity/long-term/self-model opcionais |
| `MindBackgroundScheduler` (`mind/mind-bg.scheduler.ts`) | `mind-bg-tick` | 5s (`SHORT_INTERVAL_MS`) | janelas curtas do spine in-proc, consolidação cognitiva, `CiaCognitiveHealthService` |

---

## 3. Inventário das demais camadas cognitivas

### 3.1 CIA (`backend/src/kloel/mind/cia/` — já fisicamente dentro do Mind)

| Serviço | O que decide/aprende | Prova |
|---|---|---|
| `CiaService` (= `MindLearningAdapter` canônico) | adaptador de aprendizado por ADR-0006: alimenta priors/baselines, **não decide comercialmente**; human-tasks, highlights | docblock `cia.service.ts:1-14` |
| `CiaRuntimeService` | bootstrap, backlog, presença heartbeat, autonomia viva | usa `MindBackgroundScheduler` + `MindMemoryItemService` com fallback `prisma.kloelMemory` (`cia-runtime.service.ts:37-41`) |
| `CiaAutonomyAdvisorService` | **aprende**: lê `RAC_DecisionOutcome` por decisionType, calcula z-score de sucesso e propõe ajustes de autonomia (pesos `OUTCOME_WEIGHTS` hardcoded) | `cia-autonomy-advisor.service.ts:5-35` |
| `CiaCognitiveHealthService` | escala tensões do `GoalFieldService` ≥0.7 → grava alertas em `kloelMemory` categoria `cognitive_health_alert` | `cia-cognitive-health.service.ts:9-35` |
| `cia-percept-emit.helper.ts` | percepts `cognition.cia.decision_made` / `cognition.cia.action_executed` (flag `KLOEL_CIA_PERCEPT_ENABLED`) | linhas 22, 95-109 |
| demais (bootstrap, backlog-run, chat-filter, inline-fallback, remote-backlog, runtime-state, send-helpers) | operacionais, sem cognição própria | — |

### 3.2 Flows (`backend/src/flows/` + `worker/flow-*`)

- **O que é**: engine determinística de automação (nós/arestas, wait-for-reply, cron de expiração) — `flows.service.ts`. Execução real no worker: `flow-engine-*.ts`, `flow-node-executor*.ts`.
- **O que decide**: nada cognitivo — política pré-compilada. `FlowOptimizerService` (`flow-optimizer.service.ts`) sugere otimizações (camada de decisão paralela leve).
- **Seam com o Mind**: percept `cognition.flow.node_completed` (`flows-percept-emit.helper.ts`, flag `KLOEL_FLOWS_PERCEPT_ENABLED` OFF). O worker já consulta o Mind por HTTP para decisão de variante: `worker/providers/mind-client.ts` → `POST /mind/:workspaceId/variant-decision`.

### 3.3 Autopilot (`backend/src/autopilot/`)

- **O que decide**: ação de resposta autônoma por conversa. `AutopilotCycleExecutorService` **já roteia a decisão pelo Mind**: injeta `MindPolicyService` + `DecisionOutcomeService` (`autopilot-cycle-executor.service.ts:10-11`), decisionType `autopilot_action` (presente no catálogo), baseline própria em `autopilot-cycle-executor.helpers.ts`.
- **O que aprende**: fecha outcomes via `DecisionOutcomeService`; `autopilot-analytics-*.service.ts` produz insights (camada de relatório própria).
- **Seam**: percepts `cognition.autopilot.decision_made` / `cognition.autopilot.action_executed` (`autopilot-percept-emit.helper.ts`, flag `KLOEL_AUTOPILOT_PERCEPT_ENABLED` OFF).
- **Resíduo legado**: a tabela `AutopilotEvent` (schema linha 1402) virou de fato o **ledger comercial do Mind** — `MindEventSpine.record()` escreve nela (`mind-event-spine.service.ts:44`), e `build-mind-signals.helper.ts` lê dela para atenção/valência.

### 3.4 Copilot (`backend/src/copilot/`)

- **O que decide**: sugestões human-in-the-loop. Tem **percepção própria por regex** (`PRE_O_VALOR_QUANTO_CUSTA_RE` etc., `copilot.service.ts:22-24`) — duplicação cognitiva.
- **One-Mind loop já implantado, OFF**: `kloel/kloel-copilot-loop.helpers.ts` + injeção opcional de `DecisionOutcomeService`, `MindBeliefService`, `MindSurpriseService`, `MindGlobalPriorService`, `MindPredictorService` (`copilot.service.ts:36-45`), flag `KLOEL_COPILOT_LOOP_ENABLED`.
- **Seam**: percept via `copilot-percept-emit.helper.ts` (flag `KLOEL_COPILOT_PERCEPT_ENABLED`).

### 3.5 Voice (`backend/src/voice/` + `worker/voice-processor.ts` + `kloel/kloel-audio.module.ts`)

- **O que decide**: nada — perfis de voz + fila BullMQ `VOICE` (`voice.service.ts`). STT/TTS executados no worker.
- **Seam**: percepts `cognition.voice.clone_created` / `cognition.voice.action_executed` (`voice-percept-emit.helper.ts`, flag `KLOEL_VOICE_PERCEPT_ENABLED` OFF). Conforme ADR-0013, Voice é **canal**, não cognição.

### 3.6 Money Machine (`backend/src/growth/money-machine.service.ts`)

- **O que decide**: scan de leads inativos (30d) → auto-gera Flow + Campaign com copy **mockada** ("Mocked for speed", linha ~50). É um gerador de goals/campanhas, não um motor de aprendizado.
- **Seam**: percepts `cognition.money.lead_scan` / campaign_generated (`growth/money-percept-emit.helper.ts`, flag `KLOEL_MONEY_PERCEPT_ENABLED` OFF).

### 3.7 Worker (`worker/providers/`)

| Arquivo | Papel | Diagnóstico |
|---|---|---|
| `mind-client.ts` | ADAPTER correto: decisão de variante via HTTP no Mind | manter como padrão |
| `commercial-intelligence.core.ts` (+signals/persistence/tasks) | máquina de estados de demanda por keywords (`BUYING_KEYWORDS`...) → `CommercialDecisionEnvelope` | **segunda cabeça de percepção+decisão** fora do Mind |
| `fact-extractor.ts`, `semantic-memory.ts`, `context-store.ts`, `conversation-agent-state.ts` | memória/estado paralelos no worker | candidatos a ADAPTER via API do Mind |
| `autopilot-scanner.engine.ts` | scan de conversas para o autopilot | mantém, emite percepts |

### 3.8 Infra cognitiva transversal em `kloel/`

| Módulo | Papel |
|---|---|
| `spine/spine-emitter.service.ts` | espinha in-proc (ring 5000 + Redis stream) com valência automática — **não durável** |
| `goal-field/goal-field.service.ts` | campo de tensões (detectores) consumido pelo CIA health |
| `self-awareness/` (`self-health`, `self-gaps`) | sinais de saúde injetados no reply engine |
| `abi/` (`abi-builder.service.ts`) | snapshot de identidade/contexto do agente para prompts |
| `agent-runtime/` | contexto comprimido de runtime |
| `risk-class/`, `guards/`, `trust/`, `wisdom/`, `maturity/`, `evol/`, `drift/`, `clarity/`... | sinais auxiliares; fora do caminho crítico deste plano |

---

## 4. O loop estado→percepção→decisão→ação→consequência→aprendizado: quem implementa HOJE

### 4.1 Mapa por estágio

| Estágio | Implementação canônica (Mind) | Implementações paralelas (duplicação cognitiva) |
|---|---|---|
| **Estado** | `MindWorkspaceState` + `MindBelief` + `MindSelfModel` | `CiaRuntimeStateService`; `worker/context-store.ts` + `conversation-agent-state.ts`; `AgentRuntimeContextService` |
| **Percepção** | `MindPerceptionService.perceive()`; percepts duráveis via `percept-emit.factory.ts` → `MindOutboxEvent`; `build-mind-signals.helper.ts` injeta percepção no prompt | regex do Copilot (`copilot.service.ts:22-24`); keywords do worker-CI (`commercial-intelligence.core.ts:15-40`); extractors do guest-chat (`guest-chat.action-intent.extractors.ts`); `SpineEmitterService` (espinha 2); `MindEventSpine`→`AutopilotEvent` (espinha 3) |
| **Decisão** | `MindPolicyService` + `MindBanditService` + `MindGuardsService` + catálogo de 11 decisionTypes; `MindCanonicalService` como fachada | `DecisionOutcomeService` (ledger paralelo `RAC_DecisionOutcome`); `CommercialDecisionOrchestratorService` (scoring próprio em `commercial-decision-orchestrator/scoring.ts`); worker-CI envelope; `FlowOptimizerService`; baseline do Autopilot em helpers |
| **Ação** | `UnifiedAgentService` + `KloelToolDispatcherService` (executores por ADR-0006, **clientes** do Mind); `MindCapabilityExecutor` | `AutopilotCycleExecutorService` (modo autônomo); flow-engine no worker (modo determinístico); fila `VOICE`; `MoneyMachineService.activate()` |
| **Consequência** | resolução de `MindPrediction` (`MindSurpriseService`); `DecisionOutcomeService.closeOutcome`/`closeOpenChatReplies`/`sweepExpired`; webhook de pagamento fecha `commerce_decision_link` (`commerce-decision-link.flag.ts`) | **chat_reply degenerado** sem `KLOEL_REAL_REWARD_SIGNAL` (auto-win imediato, prova em `real-reward-signal.flag.ts`); valência dupla (`ValenceTaggerService` no spine in-proc e no tick) |
| **Aprendizado** | `MindBanditService.recordOutcome` (Thompson α/β); `MindBeliefService`; `HebbianService` (drenado por `MindEventIngestor`); `CaseConsolidationService`; `MindGlobalPriorService`; `CommerceOutcomeLearner` | `CiaAutonomyAdvisorService` (z-score próprio sobre `DecisionOutcome`); `autopilot-analytics-*`; `KloelGlobalPrior` (deprecated); `ConsolidationService` dry-run paralelo |

### 4.2 As 7 duplicações que este plano elimina

| # | Duplicação | Módulos em conflito | Resolução (§6/§7) |
|---|---|---|---|
| D1 | espinha de eventos ×3 | `SpineEmitterService` / `MindEventSpine`→`AutopilotEvent` / `MindOutboxEvent` | `MindOutboxEvent` = único durável; spine in-proc vira cache-de-leitura; `AutopilotEvent` congelada como ledger legado de leitura |
| D2 | ledger de decisão ×2 | `RAC_DecisionOutcome` vs `RAC_MindPolicy` | dual-write (flag já existe) → read canonical → `DecisionOutcomeService` vira ADAPTER |
| D3 | mensagens ×3 (+2 de canal) | `KloelMessage`/`ChatMessage`/`KloelConversation` vs `MindMessage` | flags dual-write+backfill+read-canonical já existem em `mind/aliases/` |
| D4 | memória ×2 | `KloelMemory` vs `MindMemory` (e `KloelGlobalPrior` vs `MindGlobalPrior`) | idem D3; `umem:` já é live-on-read |
| D5 | percepção textual ×4 | `MindPerceptionService` vs Copilot-regex vs worker-CI-keywords vs guest-chat extractors | percepção é serviço do Mind; demais viram chamadas/ADAPTERs |
| D6 | runtime de background ×2 | `MindProcessorService` vs `MindBackgroundScheduler` | fusão sob `MultiTimescaleCoordinator` (que já existe exatamente para isso, `multi-timescale.coordinator.ts:5-16`) |
| D7 | autonomia ×2 + predição ×2 | `autonomy/mind-autonomy.service.ts` vs `coordination/mind-autonomy-coordinator.service.ts`; `mind-prediction.service.ts` vs `inference/mind-predictor.service.ts` | fusão por absorção com alias `@deprecated` |

---

## 5. Topologia canônica proposta — "Kloel Mind", um módulo com estágios explícitos

```
backend/src/kloel/mind/                  ← ÚNICO órgão cognitivo (nome oficial: Kloel Mind)
├── state/        ← MindWorkspaceState, MindBelief, MindSelfModel, watermarks
├── perception/   ← MindPerceptionService + percept-emit.factory (ÚNICA porta de entrada:
│                    tudo vira percept durável em RAC_MindOutboxEvent)
├── decision/     ← (= policy/ atual) MindPolicyService + MindBanditService + Guards +
│                    catálogo de decisionTypes; RAC_MindPolicy = ledger ÚNICO
├── action/       ← superfícies de execução (NÃO motores):
│   ├── autonomous/    ← adapter Autopilot (cycle-executor chama decide() e reporta)
│   ├── assisted/      ← adapter Copilot (human-in-the-loop, mesmo decide())
│   ├── deterministic/ ← adapter Flows (flow = política pré-compilada selecionável)
│   └── channels/      ← voice (STT→percept, decisão→TTS), whatsapp, chat
├── outcome/      ← DecisionOutcome-ADAPTER + sweeps + resolução de predições + valência
├── learning/     ← bandit.recordOutcome, beliefs, hebbian, consolidation, global-prior,
│                    commerce-outcome-learner, CIA-advisor (adaptador, ADR-0006)
├── memory/       ← MindMemory (KV) + MemoryNode/Edge (grafo por usuário) + cases + concepts
├── knowledge/    ← KB/vector/media (como está)
├── runtime/      ← UM scheduler (MultiTimescaleCoordinator dirige os 4 timescales)
├── observability/← reports, lift, audit (como está)
└── coordination/ ← event-spine/taxonomia/capability-executor (como está)
```

**Contratos de fronteira (os 3 únicos pontos de contato com o resto do sistema):**

1. **Percept in** — qualquer subsistema reporta fatos via `emitPerceptToMindSpine` (`percept-emit.factory.ts`): `{eventType: 'cognition.*', workspaceId, subject, idempotencyKey, payload}`. Best-effort, nunca quebra o caller.
2. **Decide out** — qualquer subsistema pede decisão via `MindPolicyService.decide()` (in-process) ou `POST /mind/:workspaceId/...` (worker, padrão `mind-client.ts`). Nunca decide sozinho.
3. **Reward in** — toda consequência fecha pelo funil único `outcome/` (hoje `DecisionOutcomeService.closeOutcome` → bandit). Decisão sem outcome fechado é varrida como LOSS pelo sweep.

**Papéis preservados (ADR-0006)**: UnifiedAgent executa, ToolDispatcher despacha, LLM verbaliza — todos **clientes** do Mind, fora do órgão.

---

## 6. Destino de cada módulo: ABSORB / ADAPTER / DELETE (com prova)

Legenda: **ABSORB** = código move para dentro de `kloel/mind/` (com alias 4 semanas) · **ADAPTER** = permanece onde está, mas toda cognição passa pelos 3 contratos da §5 · **DELETE** = remoção após gate de 0 callers (nunca tabela).

| Módulo / artefato | Destino | Prova que sustenta a decisão |
|---|---|---|
| `kloel/mind.service.ts` + `mind.types.ts` (fora da pasta `mind/`) | **ABSORB** → `mind/runtime/mind.service.ts` | é o tick do loop e importa só de `mind/*` (linhas 1-28) |
| `kloel/decision-outcome.service.ts` | **ADAPTER** (fachada sobre `MindPolicyService`) e depois **DELETE** da escrita própria | espelho já implementado: `mirrorDecisionToMindPolicy` atrás de `KLOEL_DECISION_LEDGER_DUALWRITE` (`decision-outcome.service.ts:58-62`) |
| `kloel/decision-sweep.scheduler.ts`, `real-reward-signal.flag.ts`, `commerce-decision-link.flag.ts` | **ABSORB** → `mind/outcome/` | são exatamente o estágio consequência; hoje órfãos na raiz |
| `kloel/commercial-decision-orchestrator*` | **ABSORB** → `mind/decision/orchestrator/` | já injeta `MindEventSpine`, `MindService`, `MindConceptService` (header do service); o scoring próprio vira resolver do catálogo |
| `kloel/spine/spine-emitter.service.ts` | **ADAPTER** (cache in-proc de leitura sobre o outbox) | não-durável por construção ("in-memory ring buffer", docblock); durabilidade já é do `MindOutboxEvent` |
| `MindEventSpine.record()` → tabela `AutopilotEvent` | **ADAPTER** congelado: leitura histórica apenas; novas gravações migram p/ `MindOutboxEvent` com dual-write | `mind-event-spine.service.ts:44` grava `autopilotEvent`; leitores: `mind-observability.service.ts:136-190`, `build-mind-signals.helper.ts:51` |
| `kloel/goal-field/`, `self-awareness/`, `abi/` | **ABSORB** → `mind/state/` (goal-field, self-awareness) e `mind/perception/abi/` | consumidos exclusivamente por CIA-health e reply-engine via sinais do Mind |
| `mind/cia/*` (11 serviços) | **ADAPTER permanente** (já dentro do Mind; papel fixado por ADR-0006 como learning adapter) | `cia.service.ts:1-14`; advisor lê ledger e propõe — não decide |
| `backend/src/autopilot/` | **ADAPTER** → `mind/action/autonomous/` registra o executor; decisão já é do Mind | `autopilot-cycle-executor.service.ts:10-11` injeta `MindPolicyService`+`DecisionOutcomeService`; decisionType `autopilot_action` no catálogo |
| `autopilot-analytics-*.service.ts` | **ABSORB** → `mind/observability/` | relatório sobre eventos cognitivos; duplica `MindLiftReportService` |
| `backend/src/copilot/` | **ADAPTER** → `mind/action/assisted/`; regexes locais **DELETE** após roteamento por `MindPerceptionService` | loop one-Mind já embutido OFF (`copilot.service.ts:36-45` + `kloel-copilot-loop.helpers.ts`) |
| `backend/src/voice/` + `worker/voice-processor.ts` | **ADAPTER** (canal puro) | sem cognição própria; percepts prontos (`voice-percept-emit.helper.ts`) |
| `backend/src/flows/` + worker flow-engine | **ADAPTER** → flow = política selecionável; `FlowOptimizerService` **ABSORB** → `mind/decision/` | seam pronto (`flows-percept-emit.helper.ts`); decisão de variante já via `worker/providers/mind-client.ts` |
| `backend/src/growth/money-machine.service.ts` | **ADAPTER** → gerador de goals que submete propostas ao `MindAutonomyCoordinator` em vez de criar Flow/Campaign direto | hoje cria flow+campaign sem decisão do Mind (corpo de `activate()`); percept pronto (`money-percept-emit.helper.ts`) |
| `worker/providers/commercial-intelligence.*` | **ADAPTER** (envelope vira proposta enviada ao Mind via HTTP) e keywords **DELETE** após paridade | duplica percepção+decisão (`commercial-intelligence.core.ts:15-40`); padrão correto já existe em `mind-client.ts` |
| `worker/providers/{fact-extractor,semantic-memory,context-store}.ts` | **ADAPTER** via API de memória do Mind | escrevem memória paralela fora do órgão |
| `mind/autonomy/mind-autonomy.service.ts` | **ABSORB** (fundir em `MindAutonomyCoordinator`, alias `@deprecated`) | dois serviços de autonomia (D7) |
| `mind/mind-prediction.service.ts` | **ABSORB** (fundir em `inference/mind-predictor.service.ts`, alias) | dois serviços de predição (D7) |
| `MindBackgroundScheduler`/`MindBackgroundProcessor` | **ABSORB** → `mind/runtime/` sob `MultiTimescaleCoordinator` | D6; coordinator já modela os 4 timescales |
| `KloelGlobalPrior` (modelo + leitores) | **DELETE** de código (tabela congelada, sem drop) | `@deprecated` no schema linha 3995-3998 |
| eventos legados (`message.received`, `capability.executed`, 15 `commerce.*`, 6 `cognition.*`, 3 `kloel.*`) | **DELETE** após janela (M7) | mapas de alias completos + `expandEventNameAliases` para leitores |
| `KloelMessage`/`ChatMessage`/`KloelConversation`/`KloelMemory` (tabelas) | **congeladas** (read-legacy) — drop só via ADR-0014 com backup verificado | proibição explícita do ADR-0013 §Schema |
| `UnifiedAgent*`, `KloelToolDispatcher*`, `KloelToolExecutor*` | **mantidos intactos** (clientes do Mind) | ADR-0006/0013 §5-6; anti-decisão |

---

## 7. Fatias de migração (cada uma = 1 PR, reversível, com gate)

> Convenção: toda fatia entra **flag-OFF**, liga em homolog, observa, liga em prod, e só então a fatia seguinte começa. Rollback = desligar a flag (nenhuma fatia destrutiva antes da F10).

### F0 — Ligar a percepção unificada (zero código novo)
- **Ação**: setar `KLOEL_AUTOPILOT_PERCEPT_ENABLED`, `KLOEL_CIA_PERCEPT_ENABLED`, `KLOEL_COPILOT_PERCEPT_ENABLED`, `KLOEL_FLOWS_PERCEPT_ENABLED`, `KLOEL_VOICE_PERCEPT_ENABLED`, `KLOEL_MONEY_PERCEPT_ENABLED` = `true` em homolog.
- **Gate**: `SELECT eventType, count(*) FROM "RAC_MindOutboxEvent" WHERE "eventType" LIKE 'cognition.%' GROUP BY 1` mostra as 6 famílias crescendo; latência p95 dos endpoints emissores inalterada (emissão é fire-and-forget pela fábrica).
- **Rollback**: flags OFF.

### F1 — Fechar o loop de consequência do chat
- **Ação**: ligar `KLOEL_DECISION_SWEEP_ENABLED` (cron de loss `inbound.silent_24h`), depois `KLOEL_REAL_REWARD_SIGNAL` (chat_reply deixa de auto-vencer), mantendo `KLOEL_COMMERCE_DECISION_LINK` (vitória por venda) — os três compõem por design (documentado em `real-reward-signal.flag.ts`).
- **Gate**: em `RAC_DecisionOutcome`, % de `chat_reply` com `wonVsBaseline=false` sai de ~0% para faixa 10–40%; `MindBanditArm` de `reply_style`/`chat_strategy` mostra `beta` crescendo (`pulls > wins`).
- **Rollback**: flags OFF (decisões abertas serão varridas e o ledger se normaliza sozinho — `sweepExpired` é idempotente).

### F2 — Ledger de decisão único
- **Ação**: ligar `KLOEL_DECISION_LEDGER_DUALWRITE`; criar leitor de paridade (job que compara `RAC_DecisionOutcome` × espelho em `RAC_MindPolicy` por `outcomeKey`); depois flag nova `KLOEL_DECISION_LEDGER_READ_CANONICAL` flipa os leitores (`CiaAutonomyAdvisorService`, lift-report) para `MindPolicy`.
- **Gate**: 7 dias com divergência de paridade = 0 linhas; `cia-autonomy-advisor` produz os mesmos ajustes nas duas fontes (spec de paridade).
- **Rollback**: read-canonical OFF (dual-write continua, sem perda).

### F3 — Mensagens → `RAC_MindMessage`
- **Ação**: ligar `KLOEL_MINDMESSAGE_DUALWRITE` → rodar `MindMessageBackfillService` (`KLOEL_MINDMESSAGE_BACKFILL`; idempotente por `@@unique([workspaceId, source, sourceId])`) → ligar `KLOEL_MINDMESSAGE_READ_CANONICAL`.
- **Gate**: contagem `RAC_MindMessage` por `source` ≥ contagem das 3 legadas no mesmo período; diff amostral de 1k threads byte-idêntico; specs existentes `lead-conversation-mindmessage-dualwrite.spec.ts` e `mind-chat-message` verdes.
- **Rollback**: read-canonical OFF; legadas seguem sendo escritas (dual-write nunca para nesta fatia).

### F4 — Memória → `RAC_MindMemory`
- **Ação**: idêntico a F3 com o trio `KLOEL_MINDMEMORY_{DUALWRITE,BACKFILL,READ_CANONICAL}`; consumidores via delegate já preparado (`mindMemory?.items ?? prisma.kloelMemory` em `cia-runtime.service.ts:37-41`, `memory-search.service.ts:42`, `kloel-conversation-store.ts:36`).
- **Gate**: namespace `default` com paridade 100% sobre `(workspaceId, key)`; `umem:` (já live) inalterado; busca vetorial retorna mesmos top-k em amostra de 100 queries.
- **Rollback**: read-canonical OFF.

### F5 — Copilot no loop (ação assistida)
- **Ação**: ligar `KLOEL_COPILOT_LOOP_ENABLED`; substituir as 3 regexes locais por chamada a `MindPerceptionService.perceive()` (mesma assinatura usada em `build-mind-signals.helper.ts:22-35`); regexes ficam como fallback `@deprecated`.
- **Gate**: `cognition.copilot.*` no outbox por sugestão; decisões `copilot_*` abertas/fechadas no ledger; precisão de intent ≥ regex em shadow-comparison de 1 semana.
- **DELETE**: remover regexes após 4 semanas + 0 divergências.

### F6 — Autopilot como superfície autônoma
- **Ação**: registrar o cycle-executor como executor do `MindAutonomyCoordinator` (proposta→aprovação→execução auditável); mover `autopilot-analytics-*` para `mind/observability/` com alias.
- **Gate**: 100% dos ciclos com par `cognition.autopilot.decision_made` + `action_executed` no outbox; `MindGuardAudit` cobrindo ações de risco do autopilot; zero mudança no texto enviado (shadow por 1 semana comparando `responseText`).
- **Rollback**: desregistrar executor (volta ao caminho atual, que já decide via `MindPolicyService`).

### F7 — Flows como política pré-compilada + worker sem cabeça própria
- **Ação**: (a) expor `flow_select` como decisionType no catálogo, resolvido por `MindPolicyService` (o `FlowOptimizerService` vira resolver); (b) trocar a decisão do `commercial-intelligence.core.ts` por chamada HTTP estilo `mind-client.ts` (endpoint novo `POST /mind/:ws/commercial-decision`), mantendo keywords como fallback offline.
- **Gate**: lift A/B medido por `MindLiftReportService` para `flow_select`; no worker, % de decisões servidas pelo Mind ≥ 95% (fallback < 5%); timeout budget 15s já padrão do client.
- **DELETE**: keywords do worker-CI após 4 semanas de fallback < 1%.

### F8 — Colapso das espinhas de evento (D1) + remoção de aliases (M7)
- **Ação**: (a) `MindEventSpine.recordCommercial` passa a dual-write `AutopilotEvent` + `MindOutboxEvent`; leitores (`mind-observability.service.ts`, `build-mind-signals.helper.ts:51`) flipam para outbox com flag; (b) rodar a query noturna de drift dos nomes legados; quando 0 hits por 7 dias consecutivos, remover entradas de `MIND_EVENT_ALIASES`, `KLOEL_TO_COGNITION_ALIAS`, `LEGACY_TO_COMMERCE_ALIAS`.
- **Gate**: contagem por nome legado = 0 em `AutopilotEvent.action` e nos emits NestJS (grep CI `scripts/ops/check-canonical-*`); observability lê outbox com mesmos números (paridade ±0).
- **Rollback**: flag de leitura volta para `AutopilotEvent` (dual-write preserva tudo).

### F9 — Um runtime, uma autonomia, uma predição (D6/D7)
- **Ação**: fundir `MindBackgroundScheduler` dentro de `MindProcessorService` dirigido por `MultiTimescaleCoordinator` (immediate/short/medium/long já especificados em `multi-timescale.coordinator.ts:25-30`); fundir `MindAutonomyService`→`MindAutonomyCoordinator` e `MindPredictionService`→`MindPredictorService` com aliases `export const Old = New` + `@deprecated`.
- **Gate**: uma única fila BullMQ de tick (`mind-tick`); DLQs vazias por 7 dias; `ConsolidationService` promovido de `dry_run` para `real` somente após métricas de DB saudáveis (condição já codificada no docblock CONS-002).
- **Rollback**: revert do commit (fusão é só DI + filas).

### F10 — Limpeza física (BLOQUEADA — exige ADR-0014)
- **Pré-condições duras**: F2–F4 com read-canonical ON em prod por ≥4 semanas; backup verificado com restore testado; aprovação do dono.
- **Ação**: renomear tabelas legadas para `*_frozen` (sem drop), remover serviços-fachada com 0 callers (gate `check-canonical-services.mjs`), mover `kloel/mind.service.ts` para dentro de `mind/runtime/`.
- **Gate**: grep 0 referências; boot smoke; e2e `cognitive-loop-realdb.proof.integration.spec.ts` e `cognitive-loop-liveness.proof.spec.ts` verdes (já existem em `kloel/`).

### Dependências entre fatias

```
F0 ──► F1 ──► F2 ──► F8
 │            │
 ├──► F3 ──► F4 ────► F10 (bloqueada por ADR-0014)
 ├──► F5
 ├──► F6 ─┐
 └──► F7 ─┴─► F9
```

---

## 8. Invariantes inegociáveis (válidos em todas as fatias)

1. **Isolamento por workspace**: todo read/write cognitivo carrega `workspaceId` (já reforçado por `mind-cross-workspace-isolation.spec.ts`).
2. **Percept nunca quebra o negócio**: emissão best-effort, try/catch na fábrica única (`percept-emit.factory.ts`), padrão preservado.
3. **Nenhum DROP/rename de tabela** fora da F10/ADR-0014; toda renomeação de serviço com alias `@deprecated` por 4 semanas.
4. **UnifiedAgent e ToolDispatcher intocados** — clientes do Mind, não partes dele.
5. **Aprendizado idempotente**: outcomes fecham no máximo 1× (`outcomeKey @unique`; `sweepExpired` só preenche `outcomeAt: null`); backfills idempotentes por `sourceId`.
6. **Fail-open em cognição**: ausência de DI (`@Optional()`) ou flag OFF ⇒ comportamento byte-idêntico ao atual (padrão já estabelecido em Copilot/Autopilot/CIA).

---

## Apêndice A — Inventário de flags da unificação (todas verificadas em `*.flag.ts`)

| Grupo | Flags | Default |
|---|---|---|
| Percepts (F0) | `KLOEL_{AUTOPILOT,CIA,COPILOT,FLOWS,VOICE,MONEY}_PERCEPT_ENABLED` | OFF |
| Consequência (F1) | `KLOEL_DECISION_SWEEP_ENABLED`, `KLOEL_REAL_REWARD_SIGNAL`, `KLOEL_COMMERCE_DECISION_LINK` | OFF |
| Ledger (F2) | `KLOEL_DECISION_LEDGER_DUALWRITE` | OFF |
| Mensagens (F3) | `KLOEL_MINDMESSAGE_{DUALWRITE,BACKFILL,READ_CANONICAL}` | OFF |
| Memória (F4) | `KLOEL_MINDMEMORY_{DUALWRITE,BACKFILL,READ_CANONICAL}`, `KLOEL_MINDCASE_VIA_RECORDCASE` | OFF |
| Ação (F5/F6) | `KLOEL_COPILOT_LOOP_ENABLED`, `KLOEL_CAPABILITY_TURN_LEARN`, `KLOEL_WHATSAPP_INBOUND_LEARN`, `KLOEL_CART_RECOVERY_LEARN` | OFF |
| Bandit de chat | `KLOEL_REPLY_STYLE_BANDIT_ENABLED` (arms `concise/balanced/detailed`, `kloel-reply-engine.bandit.helpers.ts`) | OFF |

## Apêndice B — Contagens (auditadas em 2026-06-10)

- `backend/src/kloel/mind/`: **80** arquivos `.service.ts` (não-spec) em **18** subpastas.
- Modelos Prisma cognitivos: **16** `Mind*` + `MemoryNode`/`MemoryEdge` + 1 deprecated (`KloelGlobalPrior`).
- Tabelas de mensagem coexistindo: **5** legadas + 1 canônica (`RAC_MindMessage`).
- decisionTypes no catálogo: **11** (`mind-decision-catalog.ts`) + decisões de chat fora do catálogo (`chat_reply`, `reply_style`, `chat_strategy`, `commerce_decision_link`).
- Espinhas de evento: **3** (alvo: 1 durável + 1 cache).
- Subsistemas externos com seam de percept pronto: **6** (Autopilot, Copilot, Voice, Flows, Money, CIA) — todos atrás de flag OFF.
