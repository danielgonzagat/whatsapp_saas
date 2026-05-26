# Wave 12 — Handoff Phase-3 Blocking Implementation Report

> Authored by PI atomic subagent `w12-handoff-phase-3-blocking` (DeepSeek V4 Pro). Materialized 2026-05-26.


> **Date:** 2026-05-26
> **Status:** Complete — flag-gated, default OFF
> **Design:** `docs/audits/WAVE4_HANDOFF_DESIGN.md` Phase 3

---

## 1. Files Modified

| File | Change |
|------|--------|
| `backend/src/kloel/handoff-confidence.helper.ts` | Exported `HANDOFF_THRESHOLD` constant (was private `const`, now `export const`) |
| `backend/src/kloel/kloel-thinker.service.ts` | Added Phase-3 blocking gate after Phase-2 observe-only block; added `HANDOFF_THRESHOLD` to import |
| `backend/src/kloel/handoff-confidence.helper.spec.ts` | Added 3 Phase-3 blocking gate integration tests |## 2. Test Results

```
PASS src/kloel/handoff-confidence.helper.spec.ts (8.648 s)
  computeHandoffConfidence
    ✓ returns zero composite when no inputs
    ✓ returns high composite when beliefs are confident + pulse healthy
    ✓ flags escalation when composite < 0.4
    ✓ clamps overclaimRisk to [0,1]
    ✓ handles non-finite belief confidence as zero
    ✓ reports beliefCount
  Phase-2 flag-gated integration
    ✓ produces a loggable snapshot when HANDOFF_CONFIDENCE_GATE_ENABLED is true
    ✓ skips the gate when HANDOFF_CONFIDENCE_GATE_ENABLED is not true
    Phase-3 blocking gate integration
      ✓ behaves as original when both flags are off
      ✓ observe-only logging when only HANDOFF_CONFIDENCE_GATE_ENABLED is on
      ✓ deterministic escalation reply when both flags on and confidence < 0.4

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
```### Test Descriptions

1. **Both flags off — original behavior preserved.**
   - `HANDOFF_CONFIDENCE_GATE_ENABLED` unset, `HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED` unset.
   - No snapshot computed, no escalation. `wouldEscalateAtThreshold04` ignored.

2. **Only `HANDOFF_CONFIDENCE_GATE_ENABLED` on — observe-only logging, LLM reply returned.**
   - `HANDOFF_CONFIDENCE_GATE_ENABLED=true`, `HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED` unset.
   - Snapshot computed and logged. `wouldEscalateAtThreshold04` may be true, but blocking is OFF — LLM reply is delivered.

3. **Both flags on AND confidence < 0.4 — deterministic escalation reply, not LLM reply.**
   - Both flags `true`, `wouldEscalateAtThreshold04` is `true` (beliefs at 0.15, health at 0.2, overclaim at 0.85 → composite ≈ 0.13).
   - Escalation fires: deterministic reply returned, escalation event context verified.## 3. Backend tsc Result

**No errors in changed files.** The only tsc error in the backend is pre-existing:

```
src/kloel/intent-router/intent-router.service.ts(45,5): error TS1136: Property assignment expected.
```

This error is unrelated to the handoff gate changes.## 4. Escalation Reply Shape

### Deterministic Escalation Message (verbatim)

```
Estou analisando sua mensagem com mais cuidado. Um atendente humano vai revisar e responder em breve.
```

### SSE Error Event Shape

```typescript
{
  type: 'error',
  error: 'confidence_gate_escalation',
  content: 'Estou analisando sua mensagem com mais cuidado. Um atendente humano vai revisar e responder em breve.',
  done: true
}
```

### Structured Log Event Shape

```json
{
  "context": "kloel.handoff.confidence.blocking",
  "workspaceId": "<workspace-id>",
  "composite": 0.13,
  "meanBeliefConfidence": 0.15,
  "capabilityHealth": 0.2,
  "overclaimRisk": 0.85,
  "beliefCount": 1,
  "threshold": 0.4
}
```

### Gate Logic (pseudocode)

```
flags_active = HANDOFF_CONFIDENCE_GATE_ENABLED === 'true'
            || HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED === 'true'

if flags_active:
    snapshot = computeHandoffConfidence(beliefs, pulseTruth)
    log(snapshot)  // Phase-2 observe-only logging

    if HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED === 'true'
       AND snapshot.wouldEscalateAtThreshold04:
        log_escalation(workspaceId, snapshot)
        emit_error_event(escalation_message)
        return  // Block LLM call
// Else: continue to LLM reply
```## 5. Activation Runbook

### Current State

Both flags default **OFF** — no behavior change in production:

- `HANDOFF_CONFIDENCE_GATE_ENABLED` — defaults to unset (`undefined` → `false`)
- `HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED` — defaults to unset (`undefined` → `false`)

### Staging Activation Sequence

#### Step 1: Enable Observe-Only (Phase 2)

```bash
# Staging only
HANDOFF_CONFIDENCE_GATE_ENABLED=true
```

**Effect:** Snapshot logged for every SSE think call that builds ABI. No escalation.

**Monitor (≥7 days):**
```bash
# Count snapshot logs
railway logs --service backend | grep 'kloel.handoff.confidence' | wc -l

# Check wouldEscalateAtThreshold04 distribution
railway logs --service backend | grep 'kloel.handoff.confidence' | jq '.wouldEscalateAtThreshold04' | sort | uniq -c
```

#### Step 2: Enable Blocking Gate (Phase 3)

```bash
# Staging only — AFTER confirming low false-positive rate
HANDOFF_CONFIDENCE_GATE_ENABLED=true
HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED=true
```

**Effect:** Low-confidence (<0.4) replies are blocked. Escalation message returned to user.

**Monitor:**
```bash
# Count escalation events
railway logs --service backend | grep 'kloel.handoff.confidence.blocking' | wc -l

# Inspect escalation details
railway logs --service backend | grep 'kloel.handoff.confidence.blocking' | jq '{workspaceId, composite, threshold}'

# Compare escalation rate to total ABI calls
# Target: <5% of ABI-enabled calls should escalate
```### Rollback Procedure

```bash
# Immediate rollback: remove blocking flag only (keep observe-only)
HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED=false
# OR unset both:
# unset HANDOFF_CONFIDENCE_GATE_ENABLED
# unset HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED
```

The Phase-2 observe-only logging is completely safe to leave enabled — it only writes logs.

### Production Activation

After staging validation with accepted false-positive rate:

1. Set `HANDOFF_CONFIDENCE_GATE_ENABLED=true` in production `.env` (observe-only, ≥7 days).
2. Collect composite histograms. Tune threshold if needed.
3. Set `HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED=true` for a single test workspace.
4. Expand to all workspaces after confirmed-correct escalations.
5. Remove flags and make gating unconditional (future Phase).

### Key Metrics

| Metric | Query | Target |
|--------|-------|--------|
| Total ABI calls | `grep 'KLOEL_ABI_PATH' \| wc -l` | Baseline |
| Handoff snapshots | `grep 'kloel.handoff.confidence' \| wc -l` | Benchmark |
| Escalations | `grep 'kloel.handoff.confidence.blocking' \| wc -l` | <5% of snapshots |
| False-positive rate | Operator feedback loop | → 0% target |## Appendix: Implementation Details

### Confidence Formula

```
composite = 0.5 × meanBeliefConfidence
          + 0.35 × capabilityHealth
          + 0.15 × (1 − overclaimRisk)

threshold = 0.4
wouldEscalateAtThreshold04 = composite < 0.4
```

### Flag Matrix

| `GATE_ENABLED` | `BLOCKING_ENABLED` | composite < 0.4 | Behavior |
|:---:|:---:|:---:|---|
| off | off | any | Original — no snapshot, LLM reply |
| on | off | true | Observe-only — snapshot logged, LLM reply |
| on | off | false | Observe-only — snapshot logged, LLM reply |
| on | on | true | **Blocking — escalation reply, no LLM call** |
| on | on | false | Observe-only — snapshot logged, LLM reply |

### Docstring

The Phase-3 gate is documented inline in `kloel-thinker.service.ts`:

```typescript
// Wave 12 Phase 3: blocking handoff gate (flag-gated,
// default OFF). When both HANDOFF_CONFIDENCE_GATE_ENABLED
// and HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED are true,
// AND confidence < 0.4, the gate escalates to human
// instead of delivering the LLM-generated reply.
```

### Confidence Formula Reference

From `handoff-confidence.helper.ts`:

```typescript
export const HANDOFF_THRESHOLD = 0.4;

export function computeHandoffConfidence(
  beliefs: readonly AbiBelief[] | undefined,
  pulseTruth: AbiPulseTruth | undefined,
): HandoffConfidenceSnapshot {
  // meanBeliefConfidence: average of beliefs[].confidence (0 if empty)
  // capabilityHealth: pulseTruth.capabilityHealthScore (0 if undefined)
  // overclaimRisk: clamped to [0, 1]
  // composite = 0.5 * mean + 0.35 * health + 0.15 * (1 - risk)
  // wouldEscalateAtThreshold04: composite < 0.4
}
```