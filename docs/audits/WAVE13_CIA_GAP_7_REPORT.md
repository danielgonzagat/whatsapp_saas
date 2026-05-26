# Wave 13 — CIA Gap 7: Cognitive Tension Escalation

> Authored by PI atomic subagent `w13-cia-gap-7-tension-escalation` (DeepSeek V4 Pro). Materialized 2026-05-26.


> **Date:** 2026-05-26
> **Task:** Create `CiaCognitiveHealthService` — narrow service-creation slice only.
> **Architecture ref:** `docs/audits/WAVE4_CIA_ARCHITECTURE.md` Gap 7

## 1. Files Modified

| File | Change |
|------|--------|
| `backend/src/cia/cia-cognitive-health.service.ts` | **Created** — new `CiaCognitiveHealthService` |
| `backend/src/cia/cia-cognitive-health.service.spec.ts` | **Created** — 5 unit tests |
| `backend/src/cia/cia.module.ts` | **Modified** — imported `GoalFieldModule`, registered and exported `CiaCognitiveHealthService` |

No existing files (detectors, `GoalFieldService`, `CiaService`) were touched.

## 2. Test Result

```
PASS src/cia/cia-cognitive-health.service.spec.ts
  CiaCognitiveHealthService
    ✓ escalates cognitive tensions with severity >= 0.7
    ✓ filters events to the target workspace
    ✓ returns escalated=0 when no tensions meet threshold
    ✓ skips non-cognitive tensions even with high severity
    ✓ survives create failure and continues escalating remaining tensions

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

**Covered behaviors:**
- 3 tensions in (severity 0.4, 0.7, 0.95) → 2 escalated (primary acceptance criterion)
- Workspace-scoped event filtering (`SpineEmitterService.recentEventsAsRef`)
- No-op when no tensions meet the 0.7 threshold
- Non-cognitive-dimension tensions (commercial, financial) are ignored even at high severity
- DB create failure on one tension does not block escalation of remaining tensions

## 3. Backend TSC Result

```
> npm --prefix backend run typecheck
> tsc -p tsconfig.build.json --noEmit

(exit 0 — no errors)
```

## 4. kloelMemory Payload Shape

Each escalated tension creates one row in `RAC_KloelMemory`:

| Column | Value |
|--------|-------|
| `workspaceId` | The workspace under scan |
| `key` | `cog_health:{tensionId}` (unique per tension instance) |
| `category` | `cognitive_health_alert` |
| `type` | `alert` |
| `content` | `tension.description` (human-readable) |
| `value` | See **Alert Value** below |
| `metadata` | See **Alert Metadata** below |

### Alert Value (JSON)

```json
{
  "tensionId": "t_1717000000000_abc123",
  "detectorName": "cognitive.capability_without_runtime_evidence",
  "severity": 0.7,
  "description": "capability cap_origin_check promovida sem evidência runtime",
  "detectedAt": "2026-05-26T12:00:00.000Z"
}
```

### Alert Metadata (JSON)

```json
{
  "severity": 0.7,
  "detectorName": "cognitive.capability_without_runtime_evidence",
  "dimension": "cognitive",
  "evidenceEventIds": ["evt_abc..."]
}
```

### CIA Frontend Consumption

These rows use a new category (`cognitive_health_alert`) distinct from the existing `CiaService.getCognitiveHighlights()` filter (`cognitive_state`, `decision_outcome`). Frontend surfacing is deferred — a future wave should either:
- Add `'cognitive_health_alert'` to the `getCognitiveHighlights` `category.in` filter, or
- Add a dedicated `getCognitiveHealthAlerts` query method.

## 5. Design Decisions

- **Category: `cognitive_health_alert`** — distinct from `human_task` (conversation-level) per the task specification. These are cognitive-substrate alerts, not human operator tasks.
- **Escalation threshold: 0.7** — matches COG-004's severity. COG-001 (0.6) and COG-002 (0.55) are below threshold and remain informational.
- **Error resilience**: Each `kloelMemory.create` is wrapped in try/catch — a single DB failure does not block remaining escalations.
- **Module wiring**: Attached to existing `CiaModule` (per task: "Wire it into a new CiaCognitiveHealthModule (or attach to existing CiaModule)"). New module was unnecessary since `CiaModule` already imports `SpineModule` and the only additional import is `GoalFieldModule`.
- **Not wired to tick scheduler** — explicitly deferred per task specification. The service is instantiable and callable, but no cron/scheduler invokes it yet.
