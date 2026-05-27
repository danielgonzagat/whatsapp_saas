# MIND M5 Move Batch 5 — Runtime/Processor Services

**Date:** 2026-05-26
**Branch:** detached worktree (PI atomic)
**Strategy:** Option A — re-export at old paths, no caller updates

---

## Files Moved

| # | Old Path | New Path | Class Name |
|---|----------|----------|------------|
| 1 | backend/src/kloel/mind-event-processor.service.ts | backend/src/kloel/mind/runtime/mind-event-processor.service.ts | MindEventProcessorService |
| 2 | backend/src/kloel/mind-processor.service.ts | backend/src/kloel/mind/runtime/mind-processor.service.ts | MindProcessorService |
| 3 | backend/src/kloel/mind-replay.service.ts | backend/src/kloel/mind/runtime/mind-replay.service.ts | MindReplayService |

Spec files moved alongside:

| Spec Old Path | Spec New Path |
|---------------|---------------|
| backend/src/kloel/mind-event-processor.service.spec.ts | backend/src/kloel/mind/runtime/mind-event-processor.service.spec.ts |
| backend/src/kloel/mind-processor.service.spec.ts | backend/src/kloel/mind/runtime/mind-processor.service.spec.ts |
| backend/src/kloel/mind-replay.service.spec.ts | backend/src/kloel/mind/runtime/mind-replay.service.spec.ts |

---

## Import Adjustments

### mind-event-processor.service.ts

| Original Import | Adjusted Import |
|-----------------|-----------------|
| ../logging/structured-logger | ../../../logging/structured-logger |
| ./mind-case-memory.service | ../memory/mind-case-memory.service |
| ./mind-concepts.service | ../memory/mind-concepts.service |
| ./mind-decision-baselines | ../../mind-decision-baselines |
| ./mind-policy.service | ../policy/mind-policy.service |
| ./mind-predictor.service | ../inference/mind-predictor.service |
| ./mind-surprise.service | ../inference/mind-surprise.service |
| ../prisma/prisma.service | ../../../prisma/prisma.service |
| ./mind.types | ../../mind.types |

### mind-processor.service.ts

| Original Import | Adjusted Import |
|-----------------|-----------------|
| ../logging/structured-logger | ../../../logging/structured-logger |
| ../common/redis/redis.util | ../../../common/redis/redis.util |
| ../prisma/prisma.service | ../../../prisma/prisma.service |
| ./mind-report.service | ../observability/mind-report.service |
| ./mind.service | ../../mind.service |

### mind-replay.service.ts

| Original Import | Adjusted Import |
|-----------------|-----------------|
| ../logging/structured-logger | ../../../logging/structured-logger |

### mind-processor.service.spec.ts

| Original Import | Adjusted Import |
|-----------------|-----------------|
| ../prisma/prisma.service | ../../../prisma/prisma.service |
| ./mind.service | ../../mind.service |
| ./mind-report.service | ../observability/mind-report.service |
| jest.mock(../common/redis/redis.util) | jest.mock(../../../common/redis/redis.util) |

---

## Cross-Batch Import Notes

Per the cross-batch instruction, mind-event-processor.service.ts now imports:

- MindCaseMemoryService from ../memory/mind-case-memory.service (moved in batch 2)
- MindConceptService from ../memory/mind-concepts.service (moved in batch 2)
- MindPolicyService from ../policy/mind-policy.service (moved in batch 2)
- MindPredictorService from ../inference/mind-predictor.service (moved in batch 2)
- MindSurpriseService from ../inference/mind-surprise.service (moved in batch 2)

All resolved through direct file paths, not re-exports.

---

## Re-Export Files (Option A)

Three @deprecated re-export files created at old paths:

**backend/src/kloel/mind-event-processor.service.ts:**
export { MindEventProcessorService } from ./mind/runtime/mind-event-processor.service;

**backend/src/kloel/mind-processor.service.ts:**
export { MindProcessorService } from ./mind/runtime/mind-processor.service;

**backend/src/kloel/mind-replay.service.ts:**
export { MindReplayService, type ReplayCandidate, type ReplayInput, type ReplayStep, type ReplayResult, type ReplayScenarioInput, type ReplayScenarioOutcome, type ReplayReport } from ./mind/runtime/mind-replay.service;

All existing callers (kloel.module.ts, mind.service.ts, channel-inbound-hook.service.ts, mind-simulator.service.ts, and their tests) continue to work unchanged through re-exports.

---

## Verification

- [PASS] npx tsc -p tsconfig.json --noEmit — zero NEW errors; all pre-existing errors remain unchanged
- [PASS] Jest tests (mind-event-processor, mind-processor, mind-replay) — all pass from new locations
- [PASS] mind-perception.service.ts — untouched, no conflicts with parallel agent

---

## Callers (unchanged, served by re-exports)

| Caller File | Imports |
|-------------|---------|
| kloel.module.ts | MindEventProcessorService, MindProcessorService, MindReplayService |
| mind.service.ts | MindEventProcessorService |
| channel-inbound-hook.service.ts | MindEventProcessorService (forwardRef) |
| mind-simulator.service.ts | MindReplayService, ReplayScenarioInput, ReplayInput, ReplayReport |
| mind-simulator.service.spec.ts | MindReplayService |
| mind-simulator.synthetic.spec.ts | MindReplayService |
