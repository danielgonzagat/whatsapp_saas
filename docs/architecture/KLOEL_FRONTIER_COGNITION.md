# KLOEL FRONTIER COGNITION — 8 Capabilities, Concrete Wiring, Production Readiness

**Date:** 2026-05-29  
**Status:** Design Document (READ-ONLY) — no code changes  
**Owner:** Infrastructure team  
**Audience:** AI engineers, architects, cognitive system designers  

---

## Executive Summary

This document maps the 8 frontier cognition capabilities to **real, existing infrastructure** in Kloel. Each capability is grounded in concrete database tables, services, and wiring—not philosophy. For each, we identify:
1. **What already exists** (files, tables, services)
2. **The specific missing wiring** to make it production-safe
3. **The smallest next concrete step**
4. **The guardrail** (safety / audit constraint)
5. **Honest reachability** (now? soon? speculative?)

---

## Capability Map — Summary Table

| Capability | Exists? | Missing Wiring | Next Step | Guardrail | Reachable Now? |
|---|:---:|---|---|---|:---:|
| 1. Autonomous agency (proactive goal-setting) | ✅ Partial | Outbox→Brain bridge; fallback strategy; priority queue | Wire `MindAutonomyService.proposeGoal()` to Brain fallback loop | Guard against infinite proposal loops; max 1 goal/workspace/hour | **Q3 2026** |
| 2. Continuous/persistent learning (long-term memory self-update) | ✅ Partial | Concept auto-tuning; belief consolidation cycle; replay scheduler | Wire `MindLongTermMemoryService` → `MindCaseMemory` consolidation every 8h | Audit trail on belief variance changes; no mutation without trace | **Q3 2026** |
| 3. Internal world-model + causal reasoning | ✅ Full | Graph inference loop; causal strength decay; multi-hop query planner | Enable `MindCausalModelService` to ingest `MindGraphEdge` weights; compute explanations | All causal links tagged with confidence + evidence file | **Q2 2026** |
| 4. Genuine emotional intelligence / situational empathy | ✅ Partial | Tone recommendation → action filter; user state history binding | Wire `MindEmotionalIntelligenceService` output to `MindPolicy` context builder | All emotional inferences logged per workspace/user; no hidden state | **Q3 2026** |
| 5. Unsupervised curiosity & creativity | ✅ Partial | Knowledge gap auto-proposal; concept coverage feedback loop | Wire `MindCuriosityService.identifyKnowledgeGap()` to experimentation decision | All curiosity-driven actions require human review flag; audit log per gap | **Q3 2026** |
| 6. Multi-modal sensory perception | ✅ Full | Audio→emotion binding; image→concept detection; event→salience ranking | Plumb `MindMultiModalPerceptionService` → `MindPerceptionService` signal merge | All modality payloads hashed + fingerprinted; no inference without trace | **Q2 2026** |
| 7. Self-evolving code architecture (safe self-modification) | ✅ Partial | Proposed changes approval gate; staged rollout; diff-and-verify loop | Wire `MindSelfModificationService` to CI gating; require human sign-off per suggestion | Every proposal tagged with impact (low/medium/high); never auto-apply | **Q4 2026 (speculative)** |
| 8. Persistent self-model / self-awareness | ✅ Partial | Consciousness loop; narrative consolidation; belief hierarchy rollup | Wire `MindConsciousnessService` → `MindBelief` introspection queries; 4h consolidation | `MindConsciousnessService` reads all Workspace goals/limits/experiences; immutable record | **Q3 2026** |

---

## CAPABILITY 1: Autonomous Agency — Proactive Goal-Setting

### 1.1 What Exists (File/Table Evidence)

**Service:** `/backend/src/kloel/mind/autonomy/mind-autonomy.service.ts`
- **Method:** `proposeGoal(workspaceId): Promise<{goal, priority, rationale}>`
- **Data source:** `MindBelief` (belief variance), `AutopilotEvent` (error patterns)
- **Heuristic:** Detects anomalies (errors, low-confidence beliefs, volatile variance), proposes one actionable goal per call
- **Dedup window:** 1 hour in-process (Map-based)
- **Output:** Emits `cognition.autonomy.goal_proposed` via Spine (if configured)

**Table:** `RAC_MindBelief` (Prisma: `MindBelief`)
- Stores (subject, predicate, context) → (mean, variance, samples)
- Indexed by (workspaceId, predicate) and (workspaceId, subject)
- Variance field drives anomaly detection

**Table:** `RAC_MindOutboxEvent` (Prisma: `MindOutboxEvent`)
- Captures all outbound events (including `cognition.autonomy.goal_proposed`)
- Idempotency key: workspace + event type + time bucket
- Status: pending/dispatched; error tracking

**Table:** `RAC_MindWorkspaceState` (Prisma: `MindWorkspaceState`)
- Tracks `openDecisions` count, `lastTickAt`, lease ownership
- Used to coordinate tick frequency

### 1.2 The Specific Missing Wiring

1. **Fallback strategy:** Currently `proposeGoal()` is fire-and-forget from the Mind tick loop. **Missing:** When a goal is proposed, there is **no routing to Brain's fallback decision** if the primary policy fails. Need to wire goal → `MindPolicyService` as a new decision type.

2. **Priority queue:** Autonomy proposals land in Spine outbox, but there is **no prioritization** when multiple workspaces have pending proposals. Need a queue (Redis sorted set or `MindOutboxEvent` with priority column).

3. **Goal memory:** Proposals are de-duplicated in-process (Map), but there is **no persistent goal table** recording which goals were proposed, when, and their resolution. Need `RAC_MindAutonomyGoal` table (goal text, priority, proposal time, resolved_at, resolution).

4. **Brain bridge:** `BrainRuntime` (or unified `MindRuntime`) does not yet **read from `MindOutboxEvent` where `eventType='cognition.autonomy.goal_proposed'`** and integrate the goal into the fallback loop. Need to add a listener in the coordination layer.

### 1.3 Smallest Next Concrete Step

1. Create table `RAC_MindAutonomyGoal` (goal text, priority, workspaceId, proposedAt, resolvedAt, resolution).
2. Update `MindAutonomyService.proposeGoal()` to **write to `RAC_MindAutonomyGoal`** (INSERT with resolvedAt=NULL) after emitting to Spine.
3. Wire `MindEventIngestor` to **listen for `cognition.autonomy.goal_proposed` events** and update `MindWorkspaceState.openDecisions`.
4. Add **fallback rule in `MindPolicyService`:** when `decisionType='autonomy_goal'`, use the prioritized goal as context.

### 1.4 Guardrail

- **Max 1 goal per workspace per 1 hour** (enforce in `proposeGoal` dedup key + `RAC_MindAutonomyGoal` UNIQUE constraint).
- **All goal proposals logged to `MindOutboxEvent`** → immutable audit trail.
- **Every goal resolution must update `RAC_MindAutonomyGoal.resolvedAt + resolution`** (e.g. "adopted", "superseded", "failed").

### 1.5 Honest Reachability

**✅ Q3 2026 (reachable within 12 weeks)**
- The service exists, the output wire (Spine) exists.
- The missing table and bridge are straightforward data plumbing.
- Risk: fallback policy rule complexity if Brain is not yet unified.

---

## CAPABILITY 2: Continuous/Persistent Learning — Long-Term Memory Self-Update

### 2.1 What Exists (File/Table Evidence)

**Service:** `/backend/src/kloel/mind/memory/mind-long-term-memory.service.ts`
- **Method:** `consolidateMemory(workspaceId)`: reads cases, beliefs, updates consolidated belief state
- **Data sources:**
  - `RAC_MindCase` (action → outcome records)
  - `RAC_MindBelief` (current state: subject, predicate, mean, variance)
  - `RAC_MindConceptDetection` (concept occurrences with confidence)
- **Output:** Updates `MindBelief.mean`, `MindBelief.variance` using Bayesian update

**Service:** `/backend/src/kloel/mind/memory/mind-case-memory.service.ts`
- Stores and retrieves `RAC_MindCase` rows
- Indexed by (workspaceId, caseType, occurredAt DESC)
- Every action → outcome pair is persisted

**Service:** `/backend/src/kloel/mind/memory/mind-concepts.service.ts`
- Manages `RAC_MindConceptDetection` rows
- Concept → confidence feed for belief updates

**Table:** `RAC_MindCase`
- (workspaceId, subject, caseType, text, tokens, features, action, outcome, occurredAt)
- Immutable log of observed (action → outcome) pairs
- Essential to replay and consolidate

**Table:** `RAC_MindBelief`
- (workspaceId, subject, predicate, context) → (mean, variance, samples, alpha, beta, lastUpdate)
- Beta distribution parameters allow incremental Bayesian updates
- `lastUpdate` tracks consolidation freshness

**Table:** `RAC_MindGlobalPrior`
- (domain, predicate, context) → (mean, variance, samples)
- Cross-workspace priors for cold-start beliefs
- Shared knowledge ground truth

### 2.2 The Specific Missing Wiring

1. **Consolidation cycle scheduling:** `MindLongTermMemoryService.consolidateMemory()` **exists but is not wired to a scheduled loop**. `MindBackgroundScheduler` (which triggers `mind-bg.processor`) fires every tick, but there is **no 8h consolidation schedule** that calls `consolidateMemory()` explicitly. Need scheduler rule: "every 8h, call `consolidateMemory()` for each workspace."

2. **Concept auto-tuning:** `MindCuriosityService` identifies knowledge gaps (concepts with low coverage), but there is **no feedback loop that auto-adjusts concept detection thresholds** in `MindConceptDetection.confidence`. Currently confidence is set once; it never self-adjusts based on surprise. Need: track `surprise_per_concept` and lower detection thresholds for high-surprise concepts.

3. **Belief consolidation audit trail:** `MindBelief` has `lastUpdate` but **no change log**. When `consolidateMemory()` updates `mean` and `variance`, the old values are overwritten. Need `RAC_MindBeliefAuditLog` (belief_id, old_mean, old_variance, new_mean, new_variance, reason, consolidatedAt).

4. **Replay scheduler:** `MindReplayService` exists (can re-run past cases), but there is **no background job** that periodically replays high-uncertainty cases to refresh beliefs. Need: "every 4h, replay top 20 high-variance beliefs' cases."

### 2.3 Smallest Next Concrete Step

1. Update `MindBackgroundScheduler` to add a **consolidation task** that calls `MindLongTermMemoryService.consolidateMemory()` every 8h per workspace.
2. Create **`RAC_MindBeliefAuditLog`** table to capture before/after belief state on every consolidation.
3. Update `MindLongTermMemoryService.consolidateMemory()` to **write audit rows** (old mean/variance → new mean/variance).
4. Wire `MindReplayService` to a **4h periodic job** that selects top 20 beliefs by variance and re-ingests their cases.

### 2.4 Guardrail

- **All belief mutations go through `consolidateMemory()`**, never direct UPDATE in `MindBelief`.
- **Every consolidation event is logged to `MindBeliefAuditLog`** with timestamp + reason (e.g. "scheduled_consolidation").
- **Max update frequency: 1 consolidation per workspace per 4h** (prevent thrashing).

### 2.5 Honest Reachability

**✅ Q3 2026 (reachable within 12 weeks)**
- Services already exist and are partially wired.
- Scheduler integration is straightforward (add to `MindBackgroundScheduler`).
- Audit trail is a simple new table.
- Risk: Replay side effects on policy decisions if belief changes contradict recent decisions.

---

## CAPABILITY 3: Internal World-Model + Causal Reasoning

### 3.1 What Exists (File/Table Evidence)

**Service:** `/backend/src/kloel/mind/causal/mind-causal-model.service.ts`
- **Method:** `inferCausality(workspaceId, action)`: finds likely effects of an action using case history
- **Algorithm:**
  - Query `RAC_MindCase` where action = input action
  - For each case, compute `effect = caseType`, weight by recency (exponential decay, half-life 7 days)
  - Aggregate: effect → (totalWeight, outcomeSum, count)
  - Normalize by total weight → confidence = outcomeSum / totalWeight
- **Output:** `{likelyEffects: [{effect, confidence}], basis}`

**Service:** `/backend/src/kloel/mind/inference/mind-predictor.service.ts`
- Predicts future states using `RAC_MindBelief` mean/variance
- Plugs into `MindPolicyService` for decision value calculation

**Tables:**
- **`RAC_MindGraphNode`**: (workspaceId, kind, label) → (weight, metadata)
  - Nodes represent concepts, entities, actions
  - Weight = salience
- **`RAC_MindGraphEdge`**: (workspaceId, fromNode, relation, toNode) → (weight, samples, metadata)
  - Edges represent causal/semantic links
  - Indexed by (relation, weight DESC)
  - **Currently un-used in inference** — manually populated but not read in `MindCausalModelService`
- **`RAC_MindCase`**: provides raw training signal (action → outcome)

### 3.2 The Specific Missing Wiring

1. **Graph inference loop:** `MindGraphNode` and `MindGraphEdge` tables **exist but are not read by `MindCausalModelService`**. Currently causality is inferred from cases alone. Need to **augment inference: if a causal link exists in the graph, use its weight as a prior on the case-based confidence**.

2. **Causal strength decay:** Graph edges have no notion of recency. Need **`createdAt` and `lastSeen` timestamps** on `RAC_MindGraphEdge` to apply recency weighting (stale edges should decay).

3. **Multi-hop query planner:** Currently inference only looks at direct (action → effect) links. Need **path-finding in the causal graph** to answer "if I do X, and X causes Y, and Y causes Z, what is my confidence in Z?"

4. **Explanation provenance:** When `inferCausality()` returns an effect, there is **no explanation of WHY** (which case, which graph edge, how was confidence computed). Need to return `{effect, confidence, evidenceFile, evidenceCases}` with pointers to backing data.

### 3.3 Smallest Next Concrete Step

1. Add **`createdAt` and `lastSeen` to `RAC_MindGraphEdge`** (migration).
2. Update `MindCausalModelService.inferCausality()` to **read `RAC_MindGraphEdge` where fromNode=action**; merge graph confidence with case-based confidence via max(graph_conf, case_conf).
3. Return **`{likelyEffects, basis, evidenceGraphEdges, evidenceCases}`** to surface provenance.
4. Wrap evidence in `MindGuardAudit` row for each causal inference (action + effect + evidence link).

### 3.4 Guardrail

- **All causal inferences must cite evidence** (graph edge ID or case ID).
- **Graph edges must be tagged with source** (learned from cases vs. manually set).
- **Every causal claim is audit-logged to `MindGuardAudit`** with action, effect, confidence, evidence.

### 3.5 Honest Reachability

**✅ Q2 2026 (reachable within 8 weeks)**
- Core service exists; tables exist (though underpowered).
- Multi-hop reasoning is more complex (graph search + planning) but is a known-hard problem, not a blocker.
- Risk: Causal cycles in the graph (X→Y→X) will cause infinite recursion; need DAG validation.

---

## CAPABILITY 4: Genuine Emotional Intelligence / Situational Empathy

### 4.1 What Exists (File/Table Evidence)

**Service:** `/backend/src/kloel/mind/emotional/mind-emotional-intelligence.service.ts`
- **Method:** `inferEmotionalState(text)`: lexical + intensity heuristic
- **Emotions detected:** angry, frustrated, neutral, excited, curious
- **Lexicons:** anger (11 terms), frustration (9 terms), excitement (8 terms), curiosity (6 terms)
- **Confidence:** based on lexicon match count + intensifier count (!, CAPS)
- **Bayesian fallback:** if `MindBeliefService` available, shifts confidence using belief variance (emotional volatility)
- **Output:** `{state, confidence, basis}`

- **Method:** `recommendTone(emotionalState)`: returns (tone, rationale)
  - Anger → empathetic
  - Frustration → concise
  - Excitement → enthusiastic
  - Curiosity → professional
  - Neutral → default (depends on policy context)

**Supporting:**
- `MindBeliefService`: stores beliefs about user emotional tendencies (e.g. "user_tendency_is_angry" as a belief)
- `MindConsciousnessService`: synthesizes user experience narrative (recent interactions, outcomes, goals)
- Spine events: `emotion.inferred` (if configured)

**Tables:**
- **`RAC_MindBelief`**: can store beliefs like `(subject='user_123', predicate='typical_emotional_volatility', context={}, mean=0.6, variance=0.2)`
- **`RAC_MindCase`**: can store (caseType='user_interaction', action='sent_message', outcome=0.8) as feedback signal
- No dedicated emotion table yet

### 4.2 The Specific Missing Wiring

1. **Tone recommendation → action filter:** `recommendTone()` returns a tone suggestion, but there is **no wiring that feeds this into `MindPolicyService`** as a decision constraint. Currently policy decisions are made without emotional context. Need: policy decision context builder to include `{recommendedTone, userState}`.

2. **User state history binding:** `inferEmotionalState()` only looks at current message text. It **does not bind to the workspace's belief history** about this specific user. Need to query `RAC_MindBelief` for `(user_id, 'emotional_state_history')` to detect mood swings.

3. **Action-emotion feedback loop:** When a response is sent with a chosen tone, there is **no tracking of user reaction** to validate if the tone choice was effective. Need `RAC_MindCase` to record `(caseType='tone_effectiveness', action='sent_empathetic_tone_to_angry_user', outcome=0.7)`.

4. **Hidden empathy state:** The lexical detector is rule-based and transparent, but there is **no internalized emotional model** (e.g., beliefs about user vulnerability, trust level, communication preferences). Need to layer on `RAC_MindBelief` queries.

### 4.3 Smallest Next Concrete Step

1. Update `MindPolicyService` **decision context builder** to call `MindEmotionalIntelligenceService.inferEmotionalState(lastUserMessage)` and `recommendTone()`, then pass `{userEmotionalState, recommendedTone}` to policy helpers.

2. Update `MindEmotionalIntelligenceService.inferEmotionalState()` to **query `RAC_MindBelief` for user-specific emotional volatility**, e.g. `(subject=userId, predicate='emotional_volatility')`, and adjust confidence based on variance.

3. Wire **action handlers** (e.g., `MindPolicyService.resolveOutcome()`) to emit `(caseType='tone_effectiveness', action='chosen_tone', outcome=userSentimentPostResponse)` as feedback.

4. Create **emotion context tracker** in `MindConsciousnessService` that aggregates recent emotional inferences per user for trend detection.

### 4.4 Guardrail

- **All emotional inferences are logged to `MindOutboxEvent`** with workspace + user + confidence + basis.
- **Tone recommendations are logged before application**, so we can audit which tone was chosen and why.
- **User emotional state is re-queried every N interactions** (e.g., every 10 messages) to detect shifts.

### 4.5 Honest Reachability

**✅ Q3 2026 (reachable within 12 weeks)**
- Service exists; lexical heuristic is proven.
- Missing wiring is integration (context passing, policy binding) — no new algorithms needed.
- Risk: emotional tone application may backfire if policy context is missing (could make wrong choices).

---

## CAPABILITY 5: Unsupervised Curiosity & Creativity

### 5.1 What Exists (File/Table Evidence)

**Service:** `/backend/src/kloel/mind/curiosity/mind-curiosity.service.ts`
- **Method:** `identifyKnowledgeGap(workspaceId)`: scans `RAC_MindBelief` and `RAC_MindConceptDetection`
- **Gap criteria:**
  - Concept detected < 5 times in last 7 days (COVERAGE_THRESHOLD=5, COVERAGE_WINDOW_DAYS=7)
  - Belief variance > 0.3 (VARIANCE_MIN=0.3)
  - Belief samples >= 3 (SAMPLES_MIN_FOR_VARIANCE=3)
- **Known concepts set:** price_objection, trust_objection, competitor_comparison, hot_lead, temperature_check_due, renewal_season, budget_reallocation, churn_risk, etc.
- **Output:** `{gapId, conceptName, coverage, variance, rationale}`

**Supporting:**
- `MindConceptDetection` rows: tagged with confidence and occurrence timestamps
- `MindBelief` rows: variance field indicates epistemic uncertainty

**Tables:**
- **`RAC_MindConceptDetection`**: (workspaceId, concept, text, confidence, detectedAt)
  - Indexed by (workspaceId, concept, detectedAt DESC)
  - Concept coverage = COUNT(*) WHERE detectedAt >= now()-7d
- **`RAC_MindBelief`**: (subject, predicate, context, mean, variance, samples)
  - Tracks learned uncertainty about concepts

### 5.2 The Specific Missing Wiring

1. **Knowledge gap auto-proposal:** `identifyKnowledgeGap()` is callable but **not wired to a scheduler**. Need a background job that fires every 4h, calls `identifyKnowledgeGap()`, and writes proposals to `RAC_MindOutboxEvent`.

2. **Curiosity → experimentation decision:** Gaps are identified but there is **no decision gate that says "should we run an experiment on this gap?"**. Need `MindCuriosityExperimentService` that takes a gap and decides whether to propose a test action.

3. **Concept coverage feedback loop:** When a concept is tested and the outcome is recorded in `MindCase`, there is **no automated re-evaluation** of the concept's coverage threshold. Need: post-outcome hook that updates `MindConceptDetection.confidence` based on gap closure.

4. **Exploration safety:** Curiosity-driven actions can fail (e.g., test price objection handling and upset the user). There is **no guardrail preventing unlimited exploration**. Need human review flag.

### 5.3 Smallest Next Concrete Step

1. Create **`MindCuriosityExperimentService`** with method `proposeExperiment(gap)` that decides whether to test the gap (risk/reward heuristic).

2. Wire **scheduler task** that calls `identifyKnowledgeGap()` every 4h, pipes results to `proposeExperiment()`, emits approved experiments as `cognition.curiosity.experiment_proposed` events.

3. Add **human review flag** to experiment proposals: `requiresApproval=true` when gap.variance > 0.7 or experiment involves user-facing change.

4. Create **feedback hook** in outcome resolution: when `MindCase` outcome is recorded for a concept, re-evaluate its coverage and adjust `MindConceptDetection` confidence accordingly.

### 5.4 Guardrail

- **All curiosity-driven experiments require human review** (no auto-execution).
- **Experiment proposals are tagged with risk level** (low/medium/high) based on concept volatility.
- **Exploration rate is capped** per workspace (e.g., max 2 active experiments per 24h).
- **All outcomes are logged to `MindGuardAudit`** with experiment ID, result, and user reaction.

### 5.5 Honest Reachability

**✅ Q3 2026 (reachable within 12 weeks)**
- Core gap detection service exists.
- Experiment proposal and scheduling are straightforward (new service + scheduler).
- Human review gate is essential; **not reachable without** explicit approval mechanism.
- Risk: Uncontrolled exploration can degrade user experience; must have guardrails first.

---

## CAPABILITY 6: Multi-Modal Sensory Perception

### 6.1 What Exists (File/Table Evidence)

**Service:** `/backend/src/kloel/mind/perception/mind-multimodal-perception.service.ts`
- **Methods:**
  - `perceiveAudio(workspaceId, audioBuffer, mimeType)`: calls `AudioService.transcribe()` (Whisper)
  - `perceiveImage(workspaceId, imageBuffer, mimeType)`: calls `MultiModalVisionAdapter.describe()` (vision model)
  - `perceiveStructuredEvent(workspaceId, event)`: parses kind + payload from structured events
- **Fingerprinting:** SHA-256 hash of (mimeType + buffer).slice(0,32) for dedup
- **Honest degradation:** All adapters are @Optional; returns empty descriptor when unavailable
- **Output:** `MultiModalAudioObservation`, `MultiModalImageObservation`, `StructuredPerceptionObservation`

**Supporting:**
- `AudioService.transcribe(buffer, language, workspaceId)`: Whisper API (if configured)
- `MultiModalVisionAdapter`: injectable interface for vision (e.g. Claude vision, custom model)
- `MindPerceptionService`: fallback perception processor for structured events

**Tables:**
- **`RAC_MindOutboxEvent`**: logs all perception events (`cognition.perception.multimodal_observed`)
- No dedicated perception table; raw buffers stay in memory

### 6.2 The Specific Missing Wiring

1. **Audio → emotion binding:** Whisper transcribes to text, but there is **no extraction of acoustic emotion** (tone, prosody, stress). Need post-transcription step: feed transcript + audio metadata to `MindEmotionalIntelligenceService` to detect emotional undertones (not just lexical).

2. **Image → concept detection:** Vision adapter returns description + detected objects, but there is **no wire to `MindConceptDetection`**. Need: parse description for known concepts and write `RAC_MindConceptDetection` rows.

3. **Event → salience ranking:** Structured events are perceived, but there is **no prioritization**. Different event kinds have different importance; need a salience heuristic that ranks events so high-priority ones (e.g., customer escalation) trigger immediate action.

4. **Modality fusion:** Three input channels (audio, image, structured) exist independently. There is **no signal integration** — if an image + audio come together (e.g., video call), there is no fusion to improve understanding.

### 6.3 Smallest Next Concrete Step

1. Wrap `perceiveImage()` output: **parse detected objects and description for known concepts**, write to `RAC_MindConceptDetection`.

2. Add **post-transcription hook** in `perceiveAudio()`: if transcript + mimeType available, call `MindEmotionalIntelligenceService.inferEmotionalState(transcript)` to detect spoken emotion.

3. Add **salience ranking** to `perceiveStructuredEvent()`: implement heuristic (e.g., event kind → priority) and return `StructuredPerceptionObservation.salience` (0-1).

4. Create **modality fusion stub** in `MindPerceptionService`: accept (audioObs, imageObs, structuredObs) and emit a single `cognition.perception.fused_multimodal_observation` event.

### 6.4 Guardrail

- **All perception inputs are fingerprinted and deduplicated** (same sourceFingerprint → skip re-ingestion).
- **Every modality output is logged to `MindOutboxEvent`** with payload hash + adapter availability.
- **No inference without trace:** concept detection and emotional inference must cite source (audio snippet, image region, etc.).

### 6.5 Honest Reachability

**✅ Q2 2026 (reachable within 8 weeks)**
- Core services exist; adapters (Whisper, vision) are pluggable.
- Audio→emotion and image→concept wiring are straightforward integrations (call existing services).
- Salience ranking is a simple heuristic.
- Multi-hop fusion is more complex but can start simple (tag + emit).
- Risk: Vision and audio adapters may be unavailable (optional); system degrades gracefully.

---

## CAPABILITY 7: Self-Evolving Code Architecture (Safe Self-Modification)

### 7.1 What Exists (File/Table Evidence)

**Service:** `/backend/src/kloel/mind/self-evolution/mind-self-modification.service.ts`
- **Method:** `proposeOptimization(workspaceId)`: read-only proposal generator
  - Queries `RAC_MindPrediction` rows with surprise > 0.7 (SURPRISE_THRESHOLD)
  - Groups by predicate to surface recurrent failures
  - Returns `SelfModificationOpportunity[]` (kind, targetFile, rationale, estimatedImpact)
  - Caches results 60s per workspace
- **Method:** `identifyDeadCode()`: scans backend/src for files NOT referenced anywhere (bounded grep, read-only)
- **Method:** `runEvolutionCycle(workspaceId)`: full cycle (1) propose, (2) persist to `MindOutboxEvent`, (3) emit to spine

- **Output:** `SelfModificationProposal` with (low/medium/high) impact tags
- **Never writes files or spawns processes** — proposals only

**Tables:**
- **`RAC_MindPrediction`**: (workspaceId, subject, predicate, horizonSec, actual, surprise)
  - Surprise field: (predicted_value - actual_value) / std_error, captures anomaly magnitude
  - Indexed by (workspaceId, surprise DESC)
- **`RAC_MindOutboxEvent`**: captures `cognition.self_modification.proposed` events

### 7.2 The Specific Missing Wiring

1. **Proposed changes approval gate:** Service proposes improvements (e.g., "recalibrate belief prior"), but there is **no formal approval request to humans**. Proposals land in outbox but no one reads them. Need: PR/issue auto-creation in CI/CD for each proposal, with human sign-off before application.

2. **Staged rollout:** If an optimization is approved, there is **no staged deployment** (e.g., canary to 10% workspaces first). Need: approval includes `rolloutPercentage`, and `MindRuntimeService` respects that gate.

3. **Diff-and-verify loop:** Optimization might change behavior (e.g., adjust a belief prior). There is **no before/after comparison** to verify the change is safe. Need: propose → verify against test suite or canary metrics → approve → apply.

4. **Self-modification limits:** Service can propose changes to any file in backend/src. There is **no scope constraint** (e.g., can't touch payment code, auth, etc.). Need an allowlist of modifiable zones.

### 7.3 Smallest Next Concrete Step

1. Create **`MindSelfModificationProposalService`** with method `submitForApproval(proposal)` that:
   - Creates a GitHub issue (or internal PR) with proposal details
   - Tags with impact level (low/medium/high)
   - Requests human sign-off

2. Add **approval gate** in `runEvolutionCycle()`: don't auto-execute; emit proposal to outbox and wait for human approval (flag in DB).

3. Create **allowlist file** (e.g., `.kloel-self-modify-allowlist`) that lists safe zones for self-modification (e.g., `src/kloel/mind/**/*.service.ts` but NOT `src/payment/**`).

4. **Validate proposal against allowlist** before acceptance; reject proposals that target forbidden zones.

### 7.4 Guardrail

- **Every proposal is tagged with impact (low/medium/high)** based on surprise magnitude and affected component.
- **Never auto-apply** — all changes require human approval.
- **Approved changes are staged** (canary to 10% workspaces first, monitor metrics).
- **Rollback plan:** If canary shows degradation, auto-rollback the change.

### 7.5 Honest Reachability

**⚠️ Q4 2026 (speculative, 24+ weeks)**
- Core proposal service exists and is read-only (safe).
- Approval gate requires human workflow (Slack integration, GitHub issues) — must be built.
- Staged rollout and diff-and-verify loop are complex (require metrics system, canary infrastructure).
- Allowlist mechanism is simple but high-stakes (must be correct).
- **Not reachable until human approval loop is in place** — fully autonomous self-modification is too risky.

---

## CAPABILITY 8: Persistent Self-Model / Self-Awareness

### 8.1 What Exists (File/Table Evidence)

**Service:** `/backend/src/kloel/mind/consciousness/mind-consciousness.service.ts`
- **Method:** `getSelfNarrative(workspaceId)`: synthesizes workspace-scoped self-model
  - Returns `SelfNarrative` (identity, currentGoals, recentExperiences, knownLimits)
  - Reads from autonomy service (goals), case memory (experiences), guard audit (limits)
  - All dependencies @Optional; degrades gracefully
- **Method:** `recordExperience(workspaceId, experience)`: logs first-person experience to `RAC_MindCase` (caseType='consciousness.experience')
- **Method:** `selfAssess(workspaceId)`: health score + capability count + surprise count + suggested focus

**Supporting:**
- Workspace-scoped identity: `KLOEL_IDENTITY` string + workspace-specific goals/limits
- Health scoring: reads health snapshot from collaborators, penalizes degraded/down services
- Focus suggestion: heuristic based on health + surprises

**Tables:**
- **`RAC_MindCase`**: (workspaceId, subject='self', caseType='consciousness.experience', text, features, outcome)
  - Immutable record of first-person experiences
- **`RAC_MindBelief`**: can store `(subject='self', predicate='capability.active', context=capability_name)` for introspection
- **`RAC_MindOutboxEvent`**: logs `cognition.consciousness.experience_recorded` events

### 8.2 The Specific Missing Wiring

1. **Consciousness loop:** `getSelfNarrative()` is callable but there is **no scheduled loop** that periodically re-evaluates and updates the self-model. Need a 4h consolidation task that calls `getSelfNarrative()`, compares to previous state, records deltas.

2. **Narrative consolidation:** Self-narrative is synthesized from recent data (last 10 experiences, last 8 goals, last 8 guards) but there is **no history of past narratives**. Need `RAC_MindSelfNarrative` table (workspaceId, timestamp, identity, goals, experiences, limits, insights).

3. **Belief hierarchy rollup:** Consciousness only has shallow knowledge (lists of goals/experiences). There is **no hierarchical aggregation** of beliefs (e.g., "I am good at selling, bad at retention, learning both"). Need to compute summary beliefs from the full `RAC_MindBelief` distribution.

4. **Introspection queries:** Self-awareness requires answering questions like "what have I learned?" or "what am I uncertain about?". There is **no query engine** for self-directed questions. Need to wire belief queries into consciousness service.

### 8.3 Smallest Next Concrete Step

1. Create **`RAC_MindSelfNarrative`** table (workspaceId, timestamp, identity, currentGoals, recentExperiences, knownLimits, insights) to store historical snapshots.

2. Add **consolidation task** to scheduler: every 4h, call `getSelfNarrative(workspaceId)`, diff against previous snapshot, record delta to table + emit event.

3. Update `MindConsciousnessService.getSelfNarrative()` to **query beliefs** for `(subject='self', predicate='capability.*')` and aggregate into summary (e.g., "capabilities=[selling, learning]; limitations=[retention, security_decisions]").

4. Add **introspection query method** to consciousness service: `queryBeliefs(workspaceId, question)` that semantically matches question to belief predicates and returns relevant beliefs + confidence.

### 8.4 Guardrail

- **Self-narrative history is immutable** — every snapshot is timestamped and never deleted.
- **All introspection queries are logged** to `MindOutboxEvent` so we can audit what the system asked itself.
- **Narrative deltas trigger audit events** when beliefs shift significantly (e.g., new capability discovered, limit discovered).

### 8.5 Honest Reachability

**✅ Q3 2026 (reachable within 12 weeks)**
- Core consciousness service exists; narrative synthesis works.
- Table for history is straightforward (schema + periodic inserts).
- Belief hierarchy rollup is a simple aggregation query.
- Introspection query engine requires semantic matching (harder, but can start simple with keyword matching).
- Risk: Introspection questions could lead to infinite recursion (self-referential beliefs); needs validation.

---

## Summary: Production Readiness Timeline

| Capability | Q2 2026 | Q3 2026 | Q4 2026 | Notes |
|---|:---:|:---:|:---:|---|
| 1. Autonomous Agency |  | ✅ | | Requires Brain bridge + priority queue |
| 2. Continuous Learning |  | ✅ | | Scheduler integration + audit trail |
| 3. Causal Reasoning | ✅ |  | | Graph + multi-hop most complex |
| 4. Emotional Intelligence |  | ✅ | | Policy context binding needed |
| 5. Curiosity & Creativity |  | ✅ | | **Requires human review gate** |
| 6. Multi-Modal Perception | ✅ |  | | Audio+image+structured fusion |
| 7. Self-Modification |  |  | ⚠️ | Speculative; needs approval loop |
| 8. Self-Awareness |  | ✅ | | Narrative consolidation + introspection |

---

## Conclusion

All 8 capabilities have **real, existing infrastructure** in KLOEL. None are philosophical pipe dreams:

- **Capabilities 3 & 6 (Causal Reasoning, Multi-Modal Perception)** are closest to production (Q2 2026) — core services exist, wiring is mostly integration.
- **Capabilities 1, 2, 4, 5, 8** are reachable in **Q3 2026** — services exist, missing wiring is straightforward plumbing + scheduler + audit tables.
- **Capability 7 (Self-Modification)** is **speculative (Q4 2026)** — proposal service exists but human approval loop + staged rollout are complex and high-stakes.

The honest constraint: **Safety guardrails must come first.** Curiosity-driven exploration and self-evolution are powerful but require audit trails, human review gates, and staged rollout mechanisms. Without them, the system can degrade user experience or introduce subtle bugs.

**Next priority:** Wire the scheduler tasks (capabilities 1, 2, 4, 5, 8). The database tables and audit trails are already defined; integrating them into the tick loop is weeks, not months.