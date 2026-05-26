# Wave 4 — Human-Handoff Confidence Gating Design

> Authored by PI atomic subagent `w4-handoff-research` (DeepSeek V4 Pro,
> ~16k events). Written by the subagent via atomic_author.
> Run date: 2026-05-26.


> **Status:** Research complete (read-only). Ready for Daniel review.
> **Gap reference:** Wave 3 LLM audit critical gap #10 — `kloel-reply-engine.helpers.ts:316` best-scored core chat path lacks confidence gating for human handoff.

---

## What handoff machinery exists today

### Frontend surfaces

1. **Inbox — "Abrir com IA" button**
   - `frontend/src/components/kloel/inbox/parts/InboxConversationHeader.tsx:113-121` — opens dashboard with `purpose: 'handoff'` and `draft` pre-filled from contact
   - This is a *manual* operator action — no automated handoff from this surface

2. **Flow editor — End node `handoff`**
   - `frontend/src/components/flow/NodeProperties.terminal.parts.tsx:101` — dropdown option `endAction === 'handoff'` with `handoffMessage` textarea
   - `frontend/src/components/flow/nodes/EndNode.tsx:24` — renders "Transferir para atendente"
   - Executed in `worker/flow-node-executor.ts:381-384` — sends the handoff message then terminates the flow

3. **Marketing channel setup — `handoffCriteria`**
   - `frontend/src/components/kloel/marketing/OfficialMarketingChannelPage/StepConfig.tsx:246` — free-text textarea for handoff criteria
   - Currently UI-only — no backend consumption located# Backend surfaces (1/3): Core chat reply path

- **`backend/src/kloel/kloel-reply-engine.helpers.ts:200-410`** (`buildAssistantReplyImpl`)
  - Builds dynamic context, builds system prompt, calls `chatCompletionWithFallback`
  - Handles tool calls in a second pass
  - Returns `assistantMessage` string — *no confidence threshold, no handoff trigger*
- **`backend/src/kloel/kloel-reply-engine.service.ts:365-420`** (`buildAssistantReply`)
  - Public wrapper over `buildAssistantReplyImpl` — injects deps
- **`backend/src/kloel/kloel-thinker.service.ts:47-499`** (KloelThinkerService.think)
  - SSE streaming variant — builds ABI cognitive state (line 206-267) including real cognitive substrate via `BrainCapabilityExecutorService.buildCognitiveSubstrate`
  - Logs `KLOEL_ABI_PATH` runtime truth (line 270)
  - Calls `thinkSyncImpl` or streams — passes prebuilt cognitive state to reply engine
- **`backend/src/kloel/kloel-thinker.helpers.ts:30-526`** (`thinkSyncImpl`)
  - Sync variant — builds simplified cognitive state from `RAC_AutopilotEvent` (lines 92-199)
  - Calls `buildAssistantReply` with `prebuiltCognitiveState` — *no confidence check on result*# Backend surfaces (2/3): ABI, Mind, Trust, Team, Agency

#### ABI cognitive state
- **`backend/src/kloel/abi/abi-schema.ts`** — Schema with multiple confidence fields:
  - `AbiBelief.confidence: number` (line 95) — Beta(1,1) posterior mean, ≥3 occurrences needed to crystallize
  - `AbiActivePrediction.confidence: number` (line 108)
  - `AbiWisdomPattern.confidence: number` (line 273) — cross-workspace evidence
  - `AbiRoleDetection.confidence: number` (line 288)
  - `AbiInputParsed.objection?.confidence: number` (line 309)
- **`backend/src/kloel/brain-capability-executor.substrate.ts:158-159`** — Beliefs are built with `confidence = (s.pos + 1) / (s.n + 2)` — epistemically honest Beta posterior mean
- **`backend/src/kloel/abi/abi-builder.service.ts`** — `AbiBuilderService.build()` composes the full ABI payload; `buildCognitiveSubstrate()` hydrates it with real spine data

#### Mind policy — decision confidence
- **`backend/src/kloel/mind.types.ts:49-60`** — `MindActionCandidate` has `beliefMean: number`
- **`backend/src/kloel/mind-catalog-decision-resolvers.ts:20-26`** — `decisionConfidence(result)` extracts chosen candidate's `beliefMean`
- **`backend/src/kloel/mind-commercial-decision-resolvers.ts:16-53`** — `resolveHumanTransferDecision()` returns `{ action, confidence, fallback }` with actions: `continue_ai`, `transfer_now`, `transfer_after_next_reply`, `pause_wait`

#### Trust module — human handoff trigger
- **`backend/src/kloel/trust/human-handoff.trigger.ts:27-86`** — `shouldHandoff(state, config?)` → `HandoffDecision` based on trustScore (≤0.15), fatigue (≥0.85), desperation (≥0.8), silent count (≥8)
- **`backend/src/kloel/trust/trust-state-tracker.service.ts:28-133`** — `trackConversation()` and `getFullAssessment()`
- **`backend/src/kloel/trust/trust-recovery.tactics.ts:46-51`** — `escalate_to_human` recovery action

#### Team & Agency modules
- **`backend/src/kloel/team/smart-handoff.service.ts:18-63`** — `buildPackage()` composes full `HandoffPackage`
- **`backend/src/kloel/team/team-respect.protocol.ts`** — `formatSuggestionForDisplay`, `buildSuggestionMessage`, operator feedback loop
- **`backend/src/kloel/agency/handoff.service.ts:50-72`** — `createHandoff(input)` → team member-to-member handoff
- **`backend/src/kloel/agency/types.ts:111-127`** — `HandoffPackage` (urgency, contextBundle, priority, margin, churnRisk)# Backend surfaces (3/3): Orchestration, Autopilot, Spine events

#### Commercial orchestration
- **`backend/src/kloel/commercial-decision-orchestrator/compose.ts:136-155`** — `buildActions()` emits `transfer_to_human` action when `humanTransferDecision.action !== 'continue_ai'`
- **`backend/src/kloel/brain-autonomy.service.ts:38`** — `requiresHumanApproval` = `!isFix && confidence < 0.85`

#### Autopilot
- **`backend/src/autopilot/autopilot-cycle-executor.service.ts:361-364`** — `handover_human` action returns `null` (no-op, just logs warning)
- **`backend/src/autopilot/autopilot-cycle-executor.service.ts:194`** — `complaint` intent maps to `handover_human`

#### Spine events
- **`commerce.whatsapp.handoff_to_human`** — used across ~47 files as the canonical handoff event
  - Channel policy: `backend/src/kloel/channel-policy/channel-policy.registry.ts:25` — valence=negative, truthMode=observed
  - Trust tracker: `backend/src/kloel/trust/trust-state-tracker.service.ts:133` — deducts 0.04 from trustScore
  - Goal-field detectors (operational, cognitive) — detect overdue handoffs, repeated failures
  - Healthy money (brand-wear, refund-risk, revenue-quality, support-cost projectors)
  - Drift attribution: `backend/src/kloel/drift/drift-attribution.service.ts:22` — score 1
  - Hypproof: `backend/src/kloel/hypproof/hypothesis-formulator.ts:98` — formulates hypotheses

#### Audit trail on handoff events
- Currently: **spine event `commerce.whatsapp.handoff_to_human`** is the sole audit artifact
- No dedicated audit log table for handoff events
- The `RAC_AutopilotEvent` table captures `intent/action/status/meta` but is not handoff-specific
- `RAC_MindPolicy` records decisions with `chosen`, `outcome`, `fallbackReason` — not queried for handoff audit

---## Confidence signal inventory

For each LLM call path in the chat reply system:

| Path | File:line | Available confidence signal | Shape |
|------|-----------|----------------------------|-------|
| SSE think (main chat) | `kloel-thinker.service.ts:206-267` | ABI `CognitiveStateAbi` → `beliefs[].confidence` | `number` (0–1, Beta posterior mean) |
| SSE think | `kloel-thinker.service.ts:206-267` | ABI `predictions.active[].confidence` | `number` (0–1) |
| SSE think | `kloel-thinker.service.ts:206-267` | ABI `pulseTruth.overclaimRisk` | `number` (0–1) |
| SSE think | `kloel-thinker.service.ts:206-267` | ABI `pulseTruth.capabilityHealthScore` | `number` (0–1) |
| Sync think | `kloel-thinker.helpers.ts:92-199` | Simplified cognitive state → `beliefs[].confidence` | `number` (0–1, `(pos+1)/(n+2)`) |
| Reply engine impl | `kloel-reply-engine.helpers.ts:200-410` | **None** — only `response.choices[0]?.message?.content` | string |
| Mind policy (human_transfer) | `mind-commercial-decision-resolvers.ts:16-53` | `decisionConfidence(result)` → winning candidate's `beliefMean` | `number` (0–1) |
| Mind policy (objection) | `mind-catalog-decision-resolvers.ts:189-243` | `decisionConfidence(result)` | `number` (0–1) |
| Brain autonomy | `brain-autonomy.service.ts:38` | `recommendation.confidence` (from graph) | `number` (0–1) |
| Trust handoff trigger | `trust/human-handoff.trigger.ts:27-86` | `shouldHandoff` boolean | boolean + urgency |

**Key finding:** The `buildAssistantReplyImpl` function (best-scored path) calls the LLM and returns the raw `assistantMessage` string. The ABI cognitive state IS assembled (with belief confidences) but:
1. The reply engine does NOT receive or check the ABI confidence
2. The reply engine does NOT set a confidence threshold
3. No handoff/escalation decision is made based on reply confidence

The ABI state is injected into the *system prompt* (`state_payload=${abiStr}`) so the LLM sees it, but the code never evaluates it as a confidence gate.# Proposed design

### Decision rule

```
After ABI cognitive state is built AND before the LLM reply is sent to the user:

1. Compute composite confidence from the ABI payload:
   - meanBeliefConfidence: average of beliefs[].confidence (if beliefs.length > 0)
   - capabilityHealth: pulseTruth.capabilityHealthScore
   - overclaimRisk: pulseTruth.overclaimRisk (1 = max risk)

   composite = 0.5 * meanBeliefConfidence + 0.35 * capabilityHealth + 0.15 * (1 - overclaimRisk)

2. Gate check:
   if composite < 0.4:
       → escalate to human (hold reply, do not deliver LLM output)

3. Additional secondary signals (any one triggers escalation):
   - pulseTruth.certificationVerdict.verdict === 'NAO' AND score < 0.4
   - objection.confidence > 0.7 AND composite < 0.5  (LLM is confident there IS an objection)
   - trustState.trustScore <= 0.15 (existing trust trigger)
```

**Rationale:**
- `0.4` threshold: below this, the organism has less-than-even confidence in its understanding. Beta(1,1) posterior means hover at 0.5 on thin data — the threshold fires ONLY when evidence is actively negative despite observation.
- Weighting: beliefs are the primary cognitive truth (50%); capability health reflects operational reality (35%); overclaim risk penalizes fabrication (15%).
- The composite avoids a single-dimension trigger — a weak belief combined with healthy ops and low overclaim risk still passes.### Where it plugs in

**Primary insertion point:** `backend/src/kloel/kloel-thinker.service.ts` after line 267 (after ABI build succeeds, before the message is passed to the reply engine), and `backend/src/kloel/kloel-thinker.helpers.ts` after line 199 (after prebuiltCognitiveState is built).

**Specifically:**

1. **`kloel-thinker.service.ts:268`** (SSE path) — after `finalSystemPrompt` and `finalUserMessage` are set, before `if (thread?.id) { ... }`:
   ```typescript
   // GATE: confidence-based handoff (Wave 4)
   const handoffGate = this.checkConfidenceGate(abiResult.abi, workspaceId);
   if (handoffGate.shouldEscalate) {
     await this.executeHandoffEscalation({ ... });
     streamWriter.close();
     return;
   }
   ```

2. **`kloel-thinker.helpers.ts:200`** (sync path) — after `prebuiltCognitiveState` is built, before `buildAssistantReply`:
   ```typescript
   if (prebuiltCognitiveState) {
     const handoffGate = checkConfidenceGateSync(prebuiltCognitiveState);
     if (handoffGate.shouldEscalate) {
       return { response: handoffGate.escalationMessage, escalation: true };
     }
   }
   ```

3. **New file:** `backend/src/kloel/confidence-gate.ts` — pure-function confidence gate that:
   - Accepts `CognitiveStateAbi` (or simplified cognitive state) and optional `TrustState`
   - Returns `{ shouldEscalate: boolean; compositeConfidence: number; reason: string }`
   - Is testable in isolation

### Decision on deliverable message

When the gate triggers:
- **SSE path:** A placeholder/system message is streamed: "Estou analisando sua mensagem com mais cuidado. Um atendente humano vai revisar e responder em breve."
- **Sync path:** The `ThinkSyncResult` gains an `escalation?: boolean` field; the response string is the placeholder.
- The LLM output is **never shown** to the user — we hold it for human review.### Audit trail

When confidence gate triggers escalation:

1. **Spine event:** Emit `commerce.whatsapp.handoff_to_human` with payload:
   ```json
   {
     "trigger": "confidence_gate",
     "compositeConfidence": 0.32,
     "beliefMeanConfidence": 0.28,
     "capabilityHealth": 0.45,
     "overclaimRisk": 0.8,
     "workspaceId": "...",
     "conversationId": "...",
     "threshold": 0.4
   }
   ```

2. **Structured log:** `StructuredLogger.warn` call with `operation: 'kloel.confidence_gate.escalation'`.

3. **New DB column or metadata:** On `RAC_AutopilotEvent` for the turn, record `meta.confidenceGate: { triggered: true, composite, reason }` — this gives operators a queryable audit trail without a new table.

4. **Trust state update:** `TrustStateTrackerService.trackConversation` is called with the handoff event, which deducts 0.04 from trustScore (existing behavior).

### Frontend surfacing

1. **Inbox conversation:** When a message is held for review, the inbox shows a **"Aguardando revisão humana"** badge/tag on the conversation row in `InboxMessageList`.

2. **Dashboard chat ("Abrir com IA"):** When the operator opens a held conversation, the draft field is pre-filled with the original user message and a note: "⚠️ Confiança do motor abaixo do limite ({(composite*100).toFixed(0)}%). Revisão humana recomendada."

3. **Flow editor — channel setup:** The `handoffCriteria` textarea (already in UI) gets populated with the confidence-gate trigger reason as a preset when configured.# Migration plan

### Phase 1: Add confidence collection (no behavior change)

- Create `backend/src/kloel/confidence-gate.ts` with `computeConfidenceGate()` pure function
- Add unit tests (`confidence-gate.spec.ts`) verifying:
  - Returns `shouldEscalate: false` for healthy ABI (beliefs at 0.8, health at 0.9, low overclaim)
  - Returns `shouldEscalate: true` for weak ABI (beliefs at 0.3, health at 0.2, high overclaim)
  - Correctly computes composite from zero-length beliefs array (should return 0.35)
  - Respects threshold parameterization
- Wire the function into `kloel-thinker.service.ts` **behind a guard clause** that always returns `shouldEscalate: false` — no behavior change, but the code path exists and is exercised
- Add `KLOEL_ABI_PATH` log line with `confidenceGate: { composite, threshold, escalated: false }` for observability

### Phase 2: Add the gate behind a feature flag

- Feature flag: `KLOEL_CONFIDENCE_GATE_ENABLED=debug` (three modes: `off`, `debug`, `on`)
  - `off` — existing behavior (default)
  - `debug` — compute confidence, log result, but NEVER escalate (safe observation period)
  - `on` — full gating active
- Enable `debug` in staging for ≥7 days — collect composite confidence histograms
- Tune threshold based on real data (target: <5% false positive rate)
- Open `on` for a single test workspace
- Measure: handoff event count, operator feedback, false-positive rate

### Phase 3: Default-on after N successful handoff events

- After threshold confirmed via `debug` data:
  - Set `KLOEL_CONFIDENCE_GATE_ENABLED=on` as default in `.env.example`
  - Document rollback path (set back to `off`)
- Count successful handoffs (operator confirmed human was needed) via operator feedback loop (`team/operator-feedback.loop.ts`)
- After ≥50 confirmed-correct escalations across workspaces, remove the flag:
  - Make confidence gating unconditional
  - Delete the flag check, keep the function# Risk flags

### Backwards compatibility
- **Autopilot:** The `handover_human` action currently returns `null` (no message sent). The confidence gate would emit a placeholder message instead. This is a *behavior change* — the placeholder MUST match the autopilot's existing tone/phrasing.
- **Flows:** Flows that end with `endAction: 'handoff'` already send a handoff message via `worker/flow-node-executor.ts:381-384`. The confidence gate runs at a different layer (chat reply) and should NOT interfere with flow-level handoff.
- **Existing trust handoff trigger:** `shouldHandoff()` in the trust module runs independently. The confidence gate is *additive* — both can trigger escalation. They MUST NOT conflict (i.e., if trust already escalated, confidence gate should be a no-op).

### Latency
- The confidence gate computation is **O(n) on beliefs array** (capped at 8 by `capArrays` in the thinker) — pure arithmetic, sub-millisecond.
- The ABI is already built as part of the think loop — the gate adds NO additional I/O or blocking operations.
- The gate MUST run before the LLM call to avoid wasting tokens on replies that will be held.

### False positives
- **Weak-evidence workspaces:** New workspaces with <3 events produce `beliefs: []` and `capabilityHealthScore: 0`. The composite would be `0.35 * 1 * 0.35 = 0.1225` — below the 0.4 threshold → **would falsely escalate**.
- **Mitigation:** Add a minimum-evidence gate: `if (totalEvents < 20) → skip confidence gate` (same pattern as `certificationVerdict` in `brain-capability-executor.substrate.ts:221`). New workspaces get a free pass until they generate enough spine evidence.
- **Mitigation:** The `KLOEL_CONFIDENCE_GATE_ENABLED=debug` phase is critical for measuring false-positive rate before enabling.

---

## Open questions for Daniel

- Should the confidence gate also check the **mind-policy** `human_transfer` decision confidence (from `resolveHumanTransferDecision`) as a secondary signal? Currently the design uses only ABI-derived confidence. The mind policy has its own `transfer_now`/`continue_ai` decision but runs in a different codepath.
- Should the **held reply** (the unsent LLM output) be persisted for human review, or discarded? If persisted, where — in the thread message history with a `held_for_review` flag, or a separate table?
- The placeholder message ("Estou analisando sua mensagem…") — should it be customizable per workspace? The `handoffCriteria` field in the marketing channel setup is already in the UI but unused.
- Should the confidence threshold (0.4) be configurable per workspace? Some workspaces may tolerate lower confidence (e.g., FAQ-style queries) while others need higher (financial/payment queries).
- Is `KLOEL_CONFIDENCE_GATE_ENABLED` the right flag name, or should it follow the existing `KLOEL_THINKER_USE_ABI` pattern with `_ENABLED` suffix? (Existing flags: `KLOEL_THINKER_USE_ABI`, `KLOEL_ONBOARDING_USE_ABI`, `KLOEL_MIND_BG_ENABLED`, `KLOEL_GUEST_CHAT_USE_ABI`.)
- Should the confidence gate apply to **both** SSE and sync think paths from day 1, or start with SSE (which already has the full ABI payload) and add sync later?
