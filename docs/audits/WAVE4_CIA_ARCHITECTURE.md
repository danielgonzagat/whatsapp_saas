# Wave 4 — CIA Cognitive Organism Architecture

> Authored by PI atomic subagent `w4-cia-architecture` (DeepSeek V4 Pro,
> ~22k events). Written by the subagent via atomic_author.
> Run date: 2026-05-26.


## What CIA is (today, by code evidence)

### Cognitive state surfaces

**Files under `backend/src/cia/` — operational autonomy layer:**

- `cia.service.ts` — Orchestrator: renders the `/surface` payload (business state, cognition, market signals, human tasks, mind lift, autonomy status). Delegates to CiaRuntimeService + MindService. Exposes `getSurface`, `activateAutopilotTotal`, `approveHumanTask`, `resumeConversation` [cia.service.ts:31-565]
- `cia-runtime.service.ts` — WhatsApp autonomy runtime: bootstrap (connect + presence heartbeat), backlog run dispatching, pause/resume, ensures backlog coverage [cia-runtime.service.ts:1-279]
- `cia-runtime.port.ts` — Interface contract for `CiaRuntimePort` (bootstrap, ensureBacklogCoverage, getOperationalIntelligence, pauseAutonomy, resumeConversationAutonomy, startBacklogRun) [cia-runtime.port.ts:1-27]
- `cia-runtime.abstract.ts` — Abstract class implementing `CiaRuntimePort` (single-method abstract pattern, one concrete method) [cia-runtime.abstract.ts:1-16]
- `cia-bootstrap.service.ts` — Bootstrap sequence: check WhatsApp session status, count pending conversations, trigger catchup, kick-start immediate backlog run [cia-bootstrap.service.ts:1-378]
- `cia-backlog-run.service.ts` — Backlog execution dispatching: picks between BullMQ worker, inline fallback (in-process), or remote fallback (WAHA API) [cia-backlog-run.service.ts:1-246]
- `cia-runtime-state.service.ts` — Persists runtime snapshots into `providerSettings.ciaRuntime` JSON, manages autonomy run records, schedules contact catalog jobs, handles stale run recovery [cia-runtime-state.service.ts:1-314]
- `cia-chat-filter.service.ts` — Pure stateless service: normalizes raw WhatsApp chat summaries, selects pending chats from remote provider data, estimates pending message counts, resolves activity timestamps [cia-chat-filter.service.ts:1-301]
- `cia-inline-fallback.service.ts` — In-process backlog execution when BullMQ is unavailable: reads pending conversations from local DB, builds inbound batches, calls `UnifiedAgentService.processIncomingMessage()`, sends replies respecting daily limits and reply locks [cia-inline-fallback.service.ts:1-381]
- `cia-remote-backlog.service.ts` — Remote (WAHA API) backlog fallback when local DB has zero pending conversations [cia-remote-backlog.service.ts]
- `cia-send-helpers.service.ts` — Shared sending infrastructure: daily message limits (Redis counters), reply locks, fallback reply generation, remote message normalization [cia-send-helpers.service.ts:1-312]
- `cia.controller.ts` — REST controller: `GET /surface/:ws`, `POST /autopilot-total/:ws`, human task approve/reject, account approvals, input sessions, conversation resume [cia.controller.ts:1-140]
- `cia.module.ts` — NestJS module wiring CIA with Prisma, Kloel (MIND/UnifiedAgent), WhatsApp, Queue [cia.module.ts:1-41]# Wave 4 — CIA Cognitive Organism Architecture (continued)

### Cognitive state surfaces (continued)

**Files under `backend/src/kloel/mind/` — cognitive substrate sub-module:**

- `mind/mind.module.ts` — Wires low-level cognitive services: ValenceTagger, ValenceAggregator, Attention, Hebbian, Consolidation, MultiTimescaleCoordinator, BackgroundProcessor + Scheduler [mind/mind.module.ts:1-43]
- `mind/valence-tagger.service.ts` — Auto-tags terminal valence on spine events [mind/valence-tagger.service.ts]
- `mind/valence-aggregator.service.ts` — Aggregates valence scores across event windows [mind/valence-aggregator.service.ts]
- `mind/attention.service.ts` — Computes attention weights over beliefs/predictions [mind/attention.service.ts]
- `mind/hebbian.service.ts` — Hebbian learning: co-occurrence strength updates [mind/hebbian.service.ts]
- `mind/consolidation.service.ts` — Consolidates short-term memory into long-term [mind/consolidation.service.ts]
- `mind/multi-timescale.coordinator.ts` — Coordinates short/medium/long timescale loops [mind/multi-timescale.coordinator.ts]
- `mind/mind-bg.processor.ts` + `mind/mind-bg.scheduler.ts` — Background tick runner: reads spine events, processes through perception→prediction→surprise→policy pipeline [mind/mind-bg.processor.ts, mind/mind-bg.scheduler.ts]
- `mind/mind-prediction.service.ts` — Predicts future events from beliefs [mind/mind-prediction.service.ts]
- `mind/mind.types.ts` — Core type definitions: MindBelief, MindPrediction, MindPerceptEvent, MindTick, MindActionCandidate, MindPolicyDecision [mind/mind.types.ts:1-90]

**Files under `backend/src/kloel/abi/` — Agent-Brain Interface:**

- `abi/abi-schema.ts` — ABI schema types (AbiTruthMode, AbiValence, AbiPayload) [abi/abi-schema.ts]
- `abi/abi-builder.service.ts` — Builds ABI payload from cognitive substrate + perception snapshot, used by UnifiedAgentService to construct the cognitiveState block in LLM prompts [abi/abi-builder.service.ts]
- `abi/abi-validator.ts` — Validates ABI payload structure [abi/abi-validator.ts]
- `abi/abi.module.ts` — NestJS module wiring ABI services [abi/abi.module.ts]
- `abi/pulse-truth-snapshot.service.ts` — Provides truth-mode context for ABI construction [abi/pulse-truth-snapshot.service.ts]

**Files under `backend/src/kloel/wisdom/` — cross-workspace learning extraction:**

- `wisdom/wisdom-pattern-extractor.service.ts` — Extracts patterns from `kloelMemory` and MIND beliefs [wisdom/wisdom-pattern-extractor.service.ts]
- `wisdom/wisdom-projector.service.ts` — Projects wisdom patterns into workspace context [wisdom/wisdom-projector.service.ts]
- `wisdom/wisdom-relevance-filter.ts` — Filters patterns by workspace relevance [wisdom/wisdom-relevance-filter.ts]
- `wisdom/wisdom-anonymizer.ts` + `wisdom/wisdom-privacy-guard.service.ts` — Privacy guards + anonymization for cross-workspace wisdom [wisdom/wisdom-anonymizer.ts, wisdom/wisdom-privacy-guard.service.ts]
- `wisdom/wisdom-taxonomy.ts` — Wisdom type taxonomy [wisdom/wisdom-taxonomy.ts]

### Decision-routing surfaces

- `mind-catalog-decision-resolvers.ts` — Resolves 6 catalog decision types via MindPolicyService.choose() + case memory: aggressiveness, audio_vs_text, tone, message_format, objection_response, coupon_offer. Each resolver: builds options, queries `policy.choose()` with EFE bandit, extracts confidence via `decisionConfidence()` [mind-catalog-decision-resolvers.ts:1-217]
- `mind-commercial-decision-resolvers.ts` — Resolves 6 commercial decision types: human_transfer, channel_choice, product_offer, broadcast_window, best_variant (flow_variant), ad_alert_action. Re-exports `decisionConfidence` from catalog resolvers [mind-commercial-decision-resolvers.ts:1-271]
- `mind-recovery-decision-resolvers.ts` — Recovery-specific decision resolvers [mind-recovery-decision-resolvers.ts]
- `unified-agent.service.ts` — Unified orchestrator: processes incoming messages through context loading → ABI/cognitive state construction → LLM call → tool execution → reply composition. Injects `BrainCapabilityExecutorService` for cognitive substrate building, `AbiBuilderService` for ABI payload. The cognitiveState block in the LLM prompt starts empty/hardcoded — ABI enrichment is attempted but falls back to structured defaults on failure [unified-agent.service.ts:1-563]
- `unified-agent-tools-*.ts` — Tool definitions for control, messaging, product, sales domains [unified-agent-tools-control.ts, unified-agent-tools-messaging.ts, unified-agent-tools-product.ts, unified-agent-tools-sales.ts]
- `unified-agent-tool-executor.ts` — Executes tool calls with routing [unified-agent-tool-executor.ts]
- `unified-agent-actions.service.ts` — Action execution: logs autopilot events, dispatches tool results [unified-agent-actions.service.ts]
- `commercial-decision-orchestrator.service.ts` — Deterministic inbound pipeline: concept detection → channel gating → arsenal filtering → MindService decision resolution → customer message composition → predecided action building. Operates in `shadow` (observe only) or `active` (execute actions) modes [commercial-decision-orchestrator.service.ts:1-311]
- `autopilot-cycle-executor.service.ts` — Legacy autopilot cycle: analyzes conversation context via OpenAI, decides action via MindPolicyService or baseline fallback, executes actions. Uses `autopilot_action` decision type [autopilot-cycle-executor.service.ts:1-460]
- `autopilot.service.ts` — Autopilot orchestration: toggling, config, status, stats/insights delegation [autopilot.service.ts:1-453]
- `mind-policy.service.ts` — Core policy engine: bandit-based action selection with EFE (Expected Free Energy), Bayesian belief mixing with global priors, outcome resolution, expired outcome sweeping [mind-policy.service.ts:1-427]
- `mind-policy-calculation.ts` — Policy math: `shouldUseBaselineFallback()` (lift<0, z<=-1.96, n>=30), `buildPolicyArtifacts()` (EFE computation), `buildPolicyDecision()`, `summarizePolicyHarness()` [mind-policy-calculation.ts:1-194]
- `mind-decision-baselines.ts` — Baseline decision functions for every decision type (tone, audio, message_format, coupon, aggressiveness, human_transfer, channel_choice, product_offer, broadcast_window, ad_alert_action). These are the cold-start / fallback defaults [mind-decision-baselines.ts:1-164]
- `mind-decision-catalog.ts` — Full decision type registry (11 types): followup_timing, message_format, objection_response, coupon_offer, human_transfer, channel_choice, product_offer, broadcast_window, cart_recovery, ad_alert_action, autopilot_action [mind-decision-catalog.ts:1-179]
- `mind-event-processor.service.ts` — Processes perception events (message.sent/received, checkout.*, sale.*, autopilot.*) into predictions, surprise resolution, belief updates, and policy outcome resolution. **This is the cognitive bridge: converts business events into belief formation** — autopilot tool executions create `tool.<category>.used` beliefs [mind-event-processor.service.ts:1-365]
- `mind-perception.service.ts` — Reads from 4 DB tables (autopilotEvent, message, kloelSale, checkoutOrder), normalizes into `MindPerceptEvent[]` sorted by occurredAt [mind-perception.service.ts:1-132]
- `decision-outcome.service.ts` — Tracks decision→outcome pairs: records decisions, closes outcomes, cross-workspace aggregation for lift reports [decision-outcome.service.ts:1-174]
- `economic-hierarchy.ts` — 13-rule economic hierarchy: classifies decisions into compliance→margin→conversion→retention→ux→learning→exploration tiers with priority rules (R1–R13) [economic-hierarchy.ts:1-320]# Wave 4 — CIA Cognitive Organism Architecture (continued)

### Frontend surfaces

- `frontend/src/app/(main)/cia/page.tsx` — Main CIA dashboard page: header, stats, now feed, money events, activity feed + cognitive state + human tasks grid, insights, agent runtime, account approvals, input sessions, work items, proofs, registries [frontend/src/app/(main)/cia/page.tsx:1-114]
- `frontend/src/app/(main)/cia/page.cognitive-section.tsx` — Cognitive state panel: renders cognition items (summary, phone, intent, stage, nextBestAction), human task exceptions with approve/reject/resume actions, market signal card [frontend/src/app/(main)/cia/page.cognitive-section.tsx:1-196]
- `frontend/src/app/(main)/cia/page.panels.tsx` — Panel components: AccountRuntimePanel, AccountApprovalsPanel, InputSessionsPanel, WorkItemsPanel [frontend/src/app/(main)/cia/page.panels.tsx:1-375]
- `frontend/src/app/(main)/cia/page.proof-panels.tsx` — Proof panels: cycle proof, account proof snapshots [frontend/src/app/(main)/cia/page.proof-panels.tsx]
- `frontend/src/app/(main)/cia/page.registries-section.tsx` — Capability registry + conversation action registry [frontend/src/app/(main)/cia/page.registries-section.tsx]
- `frontend/src/app/(main)/cia/components/` — UI components: CiaHeader, CiaStats, CiaNow, CiaMoneyEvents, CiaActivityFeed, CiaCognitiveState, CiaHumanTasks, CiaMarketSignal, CiaInsights, CiaAgentRuntime, CiaAccountApprovals, CiaInputSessions, CiaWorkItems, CiaProofs, CiaRegistries

## Data flow today (read-only narration with file:line citations)

### 1. Signal ingestion

Spine events are the universal ingestion format. `SpineEmitterService.emit()` [spine-emitter.service.ts:55-96] stamps each event with `eventId`, `timestamp`, `occurredAt`, `truthMode`, `provenance`, and auto-tags valence via `ValenceTaggerService`. Events flow into an in-memory ring buffer (capacity 5000). Subscribers can register for push notifications, but the **primary consumer** is `MindBackgroundScheduler` [mind-bg.scheduler.ts], which periodically calls `MindService.tick()` [mind.service.ts:41-105] to drain the ring buffer.

The `MindPerceptionService.since()` method [mind-perception.service.ts:26-42] reads four DB tables — `AutopilotEvent`, `Message`, `KloelSale`, `CheckoutOrder` — normalizes each into `MindPerceptEvent` objects with `kind` (e.g., `message.received`, `checkout.paid`, `autopilot.lead_qualified.RUNNING`), `subject` (e.g., `contact:<id>`, `workspace:<id>`), `payload`, and `occurredAt`.

Surface emitters exist across the codebase (B17 pattern): `PulseSpineBridge.recordVerdict()` [pulse-spine.bridge.ts:26-56] emits `pulse.gate_passed` / `pulse.gate_failed` events. `WhatsAppBrainService` and `WhatsAppEventEmitterService` emit `commerce.whatsapp.*` events. The `event-emit-audit-emitter` module emits `commerce.*` events for CRM, checkout, KYC, and postsale.

**Critical observation**: CIA's own operational layer (CiaRuntimeService, CiaBacklogRunService) does **not** emit spine events. The backlog run flow — `unifiedAgent.processIncomingMessage()` → tool execution → message send — produces `AutopilotEvent` rows in the database, but these are only consumed by `MindPerceptionService` indirectly via the `autopilotEvent` table, not through the spine ring buffer in real time. The `MindEventProcessorService.processAutopilotOutcome()` [mind-event-processor.service.ts:190-215] reads autopilot events and creates `tool.<category>.used` beliefs, but this path is delayed — it runs only on tick, not inline.

### 2. State synthesis

`MindService.tick()` [mind.service.ts:41-105] is the synthesis engine. It acquires a per-workspace lease (PostgreSQL advisory lock via `tryAcquireTickLease`), then:

1. **Perception**: `MindPerceptionService.since()` reads events since last watermark
2. **Processing**: `MindEventProcessorService.process(event)` for each event:
   - Predicts future events (reply probability, conversion probability) [mind-event-processor.service.ts:49-55, 108-122]
   - Resolves past predictions via `MindSurpriseService.resolveBinary()` (computes-log surprise, updates beliefs) [mind-surprise.service.ts:28-52]
   - Resolves open policy outcomes via `MindPolicyService.resolveOpenForSubject()` [mind-event-processor.service.ts:73-80]
   - Updates beliefs with Bayesian observations [mind-surprise.service.ts:42]
3. **Sweep**: Expired surprises and policy outcomes are garbage-collected [mind.service.ts:78-88]

Beliefs are stored in the `MindBelief` table as Beta-distribution (α, β, mean, variance, samples). Predictions are stored in `MindPrediction` with `predictedMean`, `predictedVariance`, `deadline`, `surprise`. Policy decisions are stored in `MindPolicy` with full calculation traces.

Cognitive highlights displayed on the CIA frontend come from `kloelMemory` rows with category `cognitive_state` or `decision_outcome` [cia.service.ts:390-417]. These are populated by `MindEventProcessorService` and the commercial orchestrator, not directly by MIND ticks.

### 3. Decision selection

When `UnifiedAgentService.processMessage()` [unified-agent.service.ts:130-390] receives an inbound message, the decision flow has two branches:

**Branch A — predecided actions (deterministic):** If `predecidedActions` are provided (from `CommercialDecisionOrchestratorService`), they are executed directly via `UnifiedAgentToolExecutorService`. The orchestrator [commercial-decision-orchestrator.service.ts:50-130] runs a deterministic pipeline: concept detection, channel gating, arsenal filtering, MindService decision resolution (tone, aggressiveness, coupon, product_offer, human_transfer), customer message composition. The result is a set of `PredecidedAction[]` that bypass the LLM.

**Branch B — LLM agent (fallback):** When no predecided actions exist, the LLM receives a system prompt with `cognitiveState` (sourced from ABI builder or hardcoded defaults), workspace product context, compressed memory, tactical hint, and response policy [unified-agent.service.ts:229-260]. The LLM is told its cognitive state has ZERO capabilities, ZERO memories, ZERO beliefs, and ZERO active predictions — reflecting actual runtime state unless ABI enrichment succeeds [unified-agent.service.ts:237-239]. The LLM may call tools, which are routed through `UnifiedAgentToolExecutorService.execute()`.

The autopilot cycle executor [autopilot-cycle-executor.service.ts:111-148] has its own decision path: it analyzes conversation context via a separate OpenAI call, then passes the analysis to `MindPolicyService.choose()` with `decisionType: 'autopilot_action'` to select from 12 actions (send_offer, send_price, qualify, etc.), falling back to a baseline decision tree if MIND policy is unavailable.

The `MindPolicyService.choose()` method [mind-policy.service.ts:40-120] is the core Bayesian bandit:
1. Runs `harness()` to check lift vs baseline
2. Falls back to baseline action if MIND underperforms (lift < 0, z <= -1.96, n >= 30 samples)
3. Mixes local beliefs with global priors (KloelGlobalPriorService) unless workspace opted out
4. Computes EFE (Expected Free Energy) = -(pragmatic_value + epistemic_value) for each action
5. Pragmatic = P(success)×utility_success + (1-P(success))×utility_fail
6. Epistemic = ε × variance
7. Selects action with minimum EFE (best expected outcome)

### 4. Execution + feedback

Execution flows through `UnifiedAgentToolExecutorService` → tool-specific services (messaging, product, sales, billing, CRM, commerce). Message sends go through `ChannelTransportRegistry.send()` → provider-specific transport.

Feedback closure is handled by `MindEventProcessorService`:
- **message.received** events resolve `followup_timing`, `audio_vs_text`, `message_format`, `tom`, `channel_choice` outcomes [mind-event-processor.service.ts:60-85]
- **checkout.paid** events resolve `cart_recovery`, `coupon_offer`, `product_offer`, `objection_response` outcomes [mind-event-processor.service.ts:127-143]
- **checkout.expired/CANCELED** resolve the same types with outcome=0 [mind-event-processor.service.ts:132-137]
- **conversation.transferred** resolves `human_transfer` [mind-event-processor.service.ts:149-155]
- **campaign.converted** resolves `broadcast_window` [mind-event-processor.service.ts:156-160]
- **autopilot.*** events (lead_qualified, purchase_intent, etc.) resolve `autopilot_action` and create tool usage beliefs [mind-event-processor.service.ts:168-215]

The `DecisionOutcomeService` [decision-outcome.service.ts:1-174] tracks the decision→outcome lifecycle: `recordDecision()` creates open outcome records, `closeOutcome()` resolves them with economic value and wonVsBaseline flags, feeding global prior observations.# Wave 4 — CIA Cognitive Organism Architecture (continued)

## Where the loop is incomplete

### Gap 1: CIA operational layer emits no spine events
- Evidence: `CiaBacklogRunService.startBacklogRun()` [cia-backlog-run.service.ts:40-196] and `CiaInlineFallbackService.runBacklogInlineFallback()` [cia-inline-fallback.service.ts:115-381] call `UnifiedAgentService.processIncomingMessage()` and send messages, but neither emits spine events. The only trace is `AutopilotEvent` DB rows, consumed by `MindPerceptionService` on the next tick.
- Impact: The cognitive substrate learns with tick-latency delay (minutes), not inline. The spine ring buffer (5000 events, in-memory) is transparent to the CIA operational layer — backlog work is invisible to the cognitive state until the next background tick.
- Recommended fix: Have `CiaSendHelpersService.sendCiaMessageWithDailyLimit()` emit a `cognition.cia_backlog_action` spine event after each message send, with `workspaceId`, `contactId`, `runId`, `action`, `channel` in the payload. Wire `MindEventProcessorService` to resolve `autopilot_action` outcomes inline when it sees these events, not just on the next tick.

### Gap 2: ABI (Agent-Brain Interface) cognitive state is mostly hardcoded zero-state
- Evidence: `UnifiedAgentService.processMessage()` [unified-agent.service.ts:237-239] hardcodes the cognitive state as `capabilities.available=[]`, `memory.workingMemory=[]`, `memory.episodicRefs=[]`, `memory.consolidatedRefs=[]`, `beliefs=[]`, `predictions.active=[]`. The `AbiBuilderService` [abi/abi-builder.service.ts] attempts to enrich this but `cognitiveSubstrate` from `BrainCapabilityExecutorService` is optional and frequently fails. When ABI build or validation fails, the LLM receives the zero-state [unified-agent.service.ts:274-280].
- Impact: The LLM operates blind to actual cognitive state. It cannot leverage beliefs about which responses convert, cannot reference past predictions, cannot access episodic memory of similar conversations. The cognitive organism is disconnected from the agent it powers.
- Recommended fix: Make ABI enrichment non-optional. Cache the last successful ABI snapshot per workspace (Redis, TTL 5 min) as a fast-path fallback. Add `MindBeliefService.list()` results for the current conversation's subject into the cognitiveState block. Wire `MindCaseMemoryService.similar()` results directly into `memory.episodicRefs`.

### Gap 3: No closed-loop autonomy adjustment — CIA cannot change its own mode
- Evidence: `CiaRuntimeStateService.updateWorkspaceAutonomy()` [cia-runtime-state.service.ts:210-258] writes autonomy mode to `providerSettings`, but no code path triggers autonomy mode transitions based on cognitive state. The only transitions are: manual toggle [autopilot.service.ts:145-178], autopilot_total activation [cia-runtime.service.ts:193-230], bootstrap [cia-bootstrap.service.ts:96-221], and live_ready finalization [cia-runtime-state.service.ts:169-196].
- Impact: If MIND lift is negative for a workspace, CIA keeps operating at the same autonomy level. If a workspace has zero conversions for 30 days, CIA doesn't reduce aggressiveness. If a workspace has 90% reply rate with high conversion, CIA doesn't increase autonomy.
- Recommended fix: Add a `CiaAutonomyAdvisorService` that runs on each tick, reads `MindLiftReportService` metrics per decision type, and calls `CiaRuntimeStateService.updateWorkspaceAutonomy()` to adjust `aggressiveness`, `mode`, or `reactiveEnabled` / `proactiveEnabled` based on statistical confidence. Gate adjustments behind a minimum sample threshold (n >= 30 per decision type).

### Gap 4: No outcome traceability from CIA backlog runs to MIND policy outcomes
- Evidence: `CiaInlineFallbackService` calls `unifiedAgent.processIncomingMessage()` [cia-inline-fallback.service.ts:169] with `context.source = 'cia_backlog_inline'` and receives `result.actions`. But neither the outcome of those actions (replied? sold? ignored?) nor the `outcomeKey` are fed back into `MindPolicyService.resolveOutcome()`. The `CiaBacklogRunService` creates `AutopilotEvent` rows, but `MindEventProcessorService.processAutopilotOutcome()` only resolves outcomes for `lead_qualified`, `purchase_intent`, `lead_lifecycle`, `campaign_lifecycle` intents [mind-event-processor.service.ts:190-215]. Most backlog actions produce `status: 'RUNNING'` or `status: 'completed'` autopilot events whose outcomes are never resolved.
- Impact: MIND policy learns almost nothing from CIA backlog operations. The 11 decision types in the catalog get outcome feedback only from explicit checkout/sale/message events, not from the CIA's own action selections. EFE bandit operates on noise.
- Recommended fix: After each backlog inline message send, resolve the corresponding `autopilot_action` outcome with outcome=1 (message sent = success for reactive actions) or outcome=0 (if send failed). Delay final outcome resolution until a `message.received` event from the same contact within the expected window.

### Gap 5: Spine ring buffer is in-memory only — lost on restart, not shared across workers
- Evidence: `SpineEmitterService` [spine-emitter.service.ts:31-33] stores events in a private array: `private readonly ring: SpineEventEnvelope[] = []`. No Redis backing, no DB persistence, no inter-process sharing. The `subscribe()` method [spine-emitter.service.ts:133-141] is in-process only.
- Impact: When the backend restarts, the last 5000 cognitive events are lost. When BullMQ workers process backlog jobs in separate processes, they cannot emit into the same spine ring buffer. The cognitive substrate has amnesia across deploys and cannot learn from worker-process events in real time.
- Recommended fix: Back the spine with a Redis Stream or PostgreSQL append-only table. Have `SpineEmitterService.emit()` write to both the in-memory ring buffer and the persistent store. Have `MindPerceptionService.since()` read from persistent storage, not just the DB tables it currently queries. This also solves the multi-worker problem.

### Gap 6: Global prior learning is decoupled from decision-to-outcome closure
- Evidence: `KloelGlobalPriorService.recordObservation()` [kloel-global-prior.service.ts:67-104] is only called from `DecisionOutcomeService.closeOutcome()` [decision-outcome.service.ts:50-72], which requires explicit `closeOutcome()` calls. But `MindPolicyService.choose()` creates `MindPolicy` rows directly, not `DecisionOutcome` rows. The `MindEventProcessorService` resolves `MindPolicy` outcomes directly via `mindPolicy.updateMany()`, bypassing `DecisionOutcomeService` entirely. Global priors are never updated from the main policy resolution path.
- Impact: `KloelGlobalPriorService` accumulates observations only from the `DecisionOutcomeService` path (which is sparsely used). The main MIND policy resolution path doesn't feed global priors, so cross-workspace learning is starved. The `mixWithGlobalPrior()` call in `MindPolicyService.choose()` [mind-policy.service.ts:94-101] typically finds no prior data.
- Recommended fix: Have `MindPolicyService.resolveOutcome()` and `resolveOpenForSubject()` also call `KloelGlobalPriorService.recordObservation()` when the workspace hasn't opted out. Extract channel from the decision context using the existing `extractChannel()` helper [mind-belief-by-channel.ts].

### Gap 7: No cognitive tension escalation to human operator
- Evidence: `COGNITIVE_DETECTORS` [cognitive.detectors.ts:1-179] define 5 tension detectors (COG-001 through COG-005) that detect: decisions without persistence, conversations without valence, repeated agent failures, capabilities without runtime evidence, and runtime critical without observability. These detectors produce `Tension` objects with severity scores (0.55–0.95), but there is no integration path that creates `human_task` records or `systemInsight` entries when tensions are detected. The `GoalFieldService` [goal-field.service.ts] may consume these, but no code path bridges them to the CIA frontend's human task panel or the agent events feed.
- Impact: When the cognitive organism is malfunctioning (decisions not auditable, learning not happening, repeated handoffs), the human operator sees nothing. The CIA dashboard shows a green "running" state while the cognitive substrate silently degrades.
- Recommended fix: Add a `CiaCognitiveHealthService` that runs on each tick, reads tensions from `GoalFieldService`, and creates `human_task` kloelMemory records for tensions with severity >= 0.7. Display these as "Cognitive Health" alerts on the CIA frontend, distinct from conversation-level human tasks. Allow the operator to acknowledge/dismiss.

### Gap 8: Commercial decision orchestrator operates in shadow mode by default
- Evidence: `CommercialDecisionOrchestratorService.orchestrateInbound()` [commercial-decision-orchestrator.service.ts:50-130] calls `checkPipelineGate()` which returns a `pipelineMode` of either `'shadow'` or `'active'`. In shadow mode, actions are built but not returned (`return { actions: pipelineMode === 'shadow' ? [] : actions }`). The gating logic in `commercial-decision-orchestrator/gating.ts` determines the mode.
- Impact: The deterministic pipeline that could produce predecided actions (bypassing LLM latency and hallucination risk) is gated behind an activation condition. Until a workspace graduates from shadow to active, all inbound messages still go through the LLM agent path (Branch B), which has hardcoded zero-state cognitive context.
- Recommended fix: Make the graduation from shadow to active automatic based on MIND lift metrics. After N=30 outcomes with positive lift on the workspace's primary decision types, auto-activate the pipeline. Expose the pipeline mode on the CIA frontend so operators can see whether their workspace is in deterministic or LLM mode.

### Gap 9: Wisdom (cross-workspace learning) is not wired into the decision loop
- Evidence: `WisdomPatternExtractorService` [wisdom/wisdom-pattern-extractor.service.ts] extracts patterns from kloelMemory and MIND beliefs, but there is no call path from `MindPolicyService.choose()` or any decision resolver that queries wisdom patterns. The `WisdomProjectorService` projects patterns into workspace context, but no consumer reads those projections during decision-making. The `KloelGlobalPriorService` provides cross-workspace statistical priors (Beta distributions), but wisdom (qualitative patterns like "objection X handled best with strategy Y") is unused.
- Impact: Each workspace learns in isolation. A pattern discovered across 50 workspaces (e.g., "price objections on WhatsApp respond best to social_proof strategy in Brazil") is never surfaced to the policy engine.
- Recommended fix: Wire `WisdomRelevanceFilter` into `MindPolicyService.choose()` as an additional prior source. When a wisdom pattern matches the current decision context (same channel, concept, segment), use its confidence as a Beta prior to shift the belief mean. This makes cross-workspace learning actionable within the bandit framework without requiring per-workspace samples.

### Gap 10: No MIND tick scheduling guarantee for CIA-onboarded workspaces
- Evidence: `MindBackgroundScheduler` [mind-bg.scheduler.ts] runs ticks, but there is no explicit integration between `CiaBootstrapService` and `MindBackgroundScheduler`. A workspace that goes through `activateAutopilotTotal()` gets WhatsApp connectivity, backlog processing, and live autonomy — but no guarantee that MIND ticks are scheduled for that workspace. The tick lease mechanism (`tryAcquireTickLease`) prevents concurrent ticks, but doesn't ensure every active workspace gets ticked.
- Impact: Workspaces with active CIA autonomy may not get MIND background processing, meaning beliefs aren't updated, predictions aren't generated, and policy harness data goes stale. The cognitive substrate effectively freezes for workspaces that aren't in the scheduler's rotation.
- Recommended fix: Have `CiaBootstrapService.run()` register the workspace with `MindBackgroundScheduler` after successful bootstrap. Have `CiaRuntimeService.pauseAutonomy()` deregister it. Ensure the scheduler's tick interval is configurable per workspace based on activity level (active workspaces: every 2 min; idle: every 30 min).# Wave 4 — CIA Cognitive Organism Architecture (continued)

## Top 3 highest-ROI next steps (autopilot-driven)

1. **Spine persistence + CIA emission** — Effort M, blast radius low. Back the spine ring buffer with Redis Streams (or append-only PG table). Add `SpineEmitterService.emit()` calls in `CiaSendHelpersService.sendCiaMessageWithDailyLimit()` and `CiaInlineFallbackService`. This single change closes gaps 1 and 5, and enables gaps 2, 3, 4, and 6 downstream. The cognitive substrate gains real-time visibility into CIA operations.

2. **ABI enrichment with cached cognitive state** — Effort M, blast radius low. Cache the last successful ABI snapshot per workspace (Redis, TTL 5 min). On ABI build failure, serve the cached snapshot. Add `MindBeliefService.list(subject=contact:<id>)` and `MindCaseMemoryService.similar()` results into the `cognitiveState` block served to the LLM. This closes gap 2 and makes the LLM agent contextually aware of what MIND knows about the current conversation.

3. **Closed-loop autonomy adjustment from MIND lift** — Effort L, blast radius med. Build `CiaAutonomyAdvisorService` consuming `MindLiftReportService` aggregates. Implement gradual autonomy transitions: increase aggressiveness on positive lift (n>=30, z>=1.96), decrease on negative lift, pause on sustained negative. Wire into `CiaRuntimeStateService.updateWorkspaceAutonomy()`. Add frontend display of autonomy reasoning. This closes gap 3 and makes CIA self-tuning.

## Risk flags

- **Spine amnesia on restart**: The in-memory ring buffer (5000 events) is lost on every deploy. Cognitive state reconstruction after restart depends entirely on DB table scans by `MindPerceptionService`, which is a cold-start with no continuity of surprise/valence state [spine-emitter.service.ts:31-33]
- **Single-process spine**: BullMQ workers processing backlog jobs in separate Node processes cannot emit or subscribe to the spine. Multi-worker deployments have fractured cognitive state [spine-emitter.service.ts:33]
- **Hardcoded zero cognitive state for LLM**: The UnifiedAgent tells the LLM it has no memory, no beliefs, no capabilities — this is the default path [unified-agent.service.ts:237-239]. The LLM generates responses blind to everything MIND has learned
- **Outcome feedback starvation**: `MindEventProcessorService` only resolves outcomes for explicit conversion/payment/message events, not for CIA backlog actions. The bandit operates on incomplete feedback [mind-event-processor.service.ts:190-215]
- **Global prior decoupling**: Cross-workspace learning (`KloelGlobalPriorService`) is updated only via `DecisionOutcomeService`, which is rarely called. The primary MIND policy resolution path never feeds it [kloel-global-prior.service.ts:67-104]
- **No cognitive health visibility**: COG-001 through COG-005 tension detectors exist but produce no operator-visible alerts [cognitive.detectors.ts:1-179]
- **Shadow-mode by default**: The deterministic commercial pipeline builds actions but discards them in shadow mode. Workspaces operate on the LLM path until manually graduated [commercial-decision-orchestrator.service.ts:50-130]
- **Autonomy mode is static after activation**: No code path adjusts CIA autonomy level based on cognitive lift or workspace performance. Workspaces can operate indefinitely with negative-sum autonomy [cia-runtime-state.service.ts:210-258]
- **Wisdom unused in decisions**: Cross-workspace pattern extraction exists but no decision resolver consumes wisdom patterns [wisdom/wisdom-pattern-extractor.service.ts]
- **No MIND tick scheduling guarantee for active workspaces**: Workspaces activated via CIA bootstrap may not receive MIND background ticks, causing cognitive freeze [mind-bg.scheduler.ts]
