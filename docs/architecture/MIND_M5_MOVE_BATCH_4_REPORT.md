# ADR-0013 Wave M5 — Batch 4 Physical Move Report

**Date:** 2026-05-26
**Phase:** Wave M5 — Physical move of Mind* services into canonical sub-areas
**Batch:** 4 of N (3 services into observability/)

---

## Services Moved

| # | Service | Old Path | New Path | Sub-Area |
|---|---------|----------|----------|----------|
| 1 | MindLiftReportService | `kloel/mind-lift-report.service.ts` | `kloel/mind/observability/mind-lift-report.service.ts` | Mind/Observability |
| 2 | MindObservabilityService | `kloel/mind-observability.service.ts` | `kloel/mind/observability/mind-observability.service.ts` | Mind/Observability |
| 3 | MindReportService | `kloel/mind-report.service.ts` | `kloel/mind/observability/mind-report.service.ts` | Mind/Observability |

Spec files co-located with their source files were moved alongside:
- `mind-lift-report.service.spec.ts` → `mind/observability/mind-lift-report.service.spec.ts`
- `mind-observability.service.spec.ts` → `mind/observability/mind-observability.service.spec.ts`
- `mind-report.service.spec.ts` → `mind/observability/mind-report.service.spec.ts`

---

## Caller Counts (Step 1)

| Service | External Callers | Source Files |
|---------|-----------------|-------------|
| MindLiftReportService | 6 | admin-mind.service.ts, admin-mind.service.spec.ts, kloel.module.ts, 4× inbound-golden-path integration specs |
| MindObservabilityService | 5 | admin-mind.service.ts, admin-mind.service.spec.ts, kloel.module.ts, mind-controller.ts, mind-controller.spec.ts |
| MindReportService | 6 | admin-mind.service.ts, admin-mind.service.spec.ts, kloel.module.ts, mind-observability.service.ts, mind-processor.service.ts, mind-processor.service.spec.ts |

Note: `cia-autonomy-advisor.service.ts` references `MindLiftReportService` by name in comments only (no import).

---

## Import Path Adjustments

Internal imports within the moved files required path adjustments due to the deeper directory nesting (1 level deeper into `kloel/mind/observability/`).

### mind-lift-report.service.ts (→ observability/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'./decision-outcome.service'` → `'../decision-outcome.service'`

### mind-observability.service.ts (→ observability/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./mind-decision-catalog'` → `'../mind-decision-catalog'`
- `'./mind-bandit.service'` → `'../policy/mind-bandit.service'`
- `'./mind-belief.service'` → `'../inference/mind-belief.service'`
- `'./mind-policy.service'` → `'../policy/mind-policy.service'`
- `'./mind-verbalizer.service'` → `'../mind-verbalizer.service'`

The import from `'./mind-report.service'` is unchanged (same directory).

### mind-report.service.ts (→ observability/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./mind-decision-catalog'` → `'../mind-decision-catalog'`
- `'./mind-belief.service'` → `'../inference/mind-belief.service'`
- `'./mind-policy.service'` → `'../policy/mind-policy.service'`
- `'./mind-simulator.service'` → `'../mind-simulator.service'`

### mind-lift-report.service.spec.ts (→ observability/)
- `'./decision-outcome.service'` → `'../decision-outcome.service'`

### mind-observability.service.spec.ts (→ observability/)
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./mind-belief.service'` → `'../inference/mind-belief.service'`
- `'./mind-policy.service'` → `'../policy/mind-policy.service'`
- `'./mind-verbalizer.service'` → `'../mind-verbalizer.service'`
- `'./mind-bandit.service'` → `'../policy/mind-bandit.service'`

The import from `'./mind-report.service'` is unchanged (same directory).

### mind-report.service.spec.ts (→ observability/)
- No path changes needed (only imports `'./mind-report.service'` — same directory).

---

## Caller Update Strategy

**Option A** applied to all 3 services. External callers continue to import from the old paths via the @deprecated re-export stubs. The 4-week alias window will surface IDE deprecation warnings, which is the intended migration signal.

No caller import paths were changed.

---

## Re-Export Stubs

Three @deprecated re-export files were created at the old paths:

- `kloel/mind-lift-report.service.ts` → re-exports `{ MindLiftReportService, type LiftReport, type FailureReasonCount }` from `./mind/observability/mind-lift-report.service`
- `kloel/mind-observability.service.ts` → re-exports `{ MindObservabilityService }` from `./mind/observability/mind-observability.service`
- `kloel/mind-report.service.ts` → re-exports `{ MindReportService }` from `./mind/observability/mind-report.service`

Each stub includes the @cluster tag and a deprecation notice referencing ADR-0013 Wave M5 batch 4.

---

## Module Wiring

`kloel.module.ts` — **no edits required**. The module imports all three services from their old paths, which now resolve through the re-export stubs to the moved implementations. Class names and export signatures are unchanged.

---

## Coexistence with Prior Batches

The target directory `kloel/mind/observability/` already contained `mind-spine-audit.service.ts` (Wave M3 alias). This file was verified unchanged post-move. The barrel `index.ts` was updated to include all 4 services.

## Verification

### TSC Typecheck
```
npx tsc -p tsconfig.build.json --noEmit
```

**Result: Zero NEW errors.** All errors in the output are pre-existing:
- `memory.projector.ts:115` (type incompatibility)
- `kloel-chat-tools.service.ts:107` (expected 3 arguments, got 2)
- `kloel-product-sub-resource-tools.service.ts:175` (type incompatibility)
- `mind-catalog-decision-resolvers.ts:2` (`MindPolicyChooser` not exported — pre-existing)
- `plan.service.ts` (multiple errors, various)
- `sales.service.ts:3` (unused import)

No errors reference any file in `kloel/mind/observability/`.

### Spec Tests

All 3 moved spec files pass:

```
✓ mind/observability/mind-lift-report.service.spec.ts
✓ mind/observability/mind-observability.service.spec.ts
✓ mind/observability/mind-report.service.spec.ts
```

---

## Directory Structure (post-move)

```
backend/src/kloel/mind/observability/
├── index.ts                              ← barrel (updated)
├── mind-spine-audit.service.ts           ← Wave M3 alias (unchanged)
├── mind-lift-report.service.ts           ← batch 4
├── mind-lift-report.service.spec.ts      ← batch 4
├── mind-observability.service.ts         ← batch 4
├── mind-observability.service.spec.ts    ← batch 4
├── mind-report.service.ts                ← batch 4
└── mind-report.service.spec.ts           ← batch 4
```

---

## Known Considerations

- `mind-observability.service.ts` imports `MindReportService` from `'./mind-report.service'`. Since both services now live in the same observability/ directory, this import resolves directly to the real implementation (not the re-export stub). This is the intended behavior.
- The 4-week alias window for the @deprecated stubs ends ~2026-06-23. After that, a follow-up batch should update all caller imports and remove the stubs.
- `cia-autonomy-advisor.service.ts` duplicates the `OUTCOME_WEIGHTS` constant from `MindLiftReportService` in a comment block. No import dependency — just a documentation concern flagged here for awareness.
