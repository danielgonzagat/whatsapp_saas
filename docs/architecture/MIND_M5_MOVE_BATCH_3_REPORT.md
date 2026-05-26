# ADR-0013 Wave M5 — Batch 3 Physical Move Report

**Date:** 2026-05-26
**Phase:** Wave M5 — Physical move of Mind* services into canonical sub-areas
**Batch:** 3 of N (3 services into inference/ and synthetic/)

---

## Services Moved

| # | Service | Old Path | New Path | Sub-Area |
|---|---------|----------|----------|----------|
| 1 | MindPredictorService | `kloel/mind-predictor.service.ts` | `kloel/mind/inference/mind-predictor.service.ts` | Mind/Inference |
| 2 | MindSurpriseService | `kloel/mind-surprise.service.ts` | `kloel/mind/inference/mind-surprise.service.ts` | Mind/Inference |
| 3 | MindVerbalizerService | `kloel/mind-verbalizer.service.ts` | `kloel/mind/synthetic/mind-verbalizer.service.ts` | Mind/Synthetic |

Spec files co-located with their source files were moved alongside:
- `mind-predictor.service.spec.ts` → `mind/inference/mind-predictor.service.spec.ts`
- `mind-surprise.service.spec.ts` → `mind/inference/mind-surprise.service.spec.ts`
- `mind-verbalizer.service.spec.ts` → `mind/synthetic/mind-verbalizer.service.spec.ts`

---

## Caller Counts (Step 1)

| Service | External Callers | Source Files |
|---------|-----------------|-------------|
| MindPredictorService | 4 | kloel.module, mind-event-processor, mind-surprise.service, mind-predictor.service.spec |
| MindSurpriseService | 4 | kloel.module, mind-event-processor, mind.service, mind-surprise.service.spec |
| MindVerbalizerService | 6 | kloel.module (import + 2 providers entries), mind-controller, mind-controller.spec, mind-observability.service, mind-observability.service.spec, mind-verbalizer.service.spec |

Note: `mind-surprise.service.ts` imports `MindPredictorService` — this is an intra-batch dependency (both moved to `inference/`). The import path stays as `'./mind-predictor.service'` since both now live in the same directory.

---

## Import Path Adjustments

Internal imports within the moved files required path adjustments due to the deeper directory nesting.

### mind-predictor.service.ts (→ inference/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./mind.types'` → `'../../mind.types'`
- `'./mind-belief.service'` — **unchanged** (both in `inference/`)

### mind-surprise.service.ts (→ inference/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./mind.types'` → `'../../mind.types'`
- `'./mind-belief.service'` — **unchanged** (both in `inference/`)
- `'./mind-predictor.service'` — **unchanged** (both in `inference/`)

### mind-verbalizer.service.ts (→ synthetic/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../lib/llm-provider'` → `'../../../lib/llm-provider'`
- `'../lib/openai-models'` → `'../../../lib/openai-models'`
- `'./llm-budget.service'` → `'../../llm-budget.service'`
- `'./openai-wrapper'` → `'../../openai-wrapper'`
- `'./mind-belief.service'` → `'../inference/mind-belief.service'`
- `'./mind-policy.service'` → `'../policy/mind-policy.service'`
- `'./mind-decision-catalog'` → `'../../mind-decision-catalog'`
- `'./mind.types'` → `'../../mind.types'`
- `'../common/string'` → `'../../../common/string'`

### Spec files
- **mind-predictor.service.spec.ts** (→ inference/): `'./mind-predictor.service'` — **unchanged** (same directory)
- **mind-surprise.service.spec.ts** (→ inference/): `'./mind-surprise.service'` — **unchanged** (same directory)
- **mind-verbalizer.service.spec.ts** (→ synthetic/): `'./mind-verbalizer.service'` — **unchanged** (same directory)

---

## Caller Update Strategy

**Option A** applied to all 3 services. External callers continue to import from the old path via the @deprecated re-export stubs. The 4-week alias window will surface IDE deprecation warnings, which is the intended migration signal.

No caller import paths were changed.

---

## Re-Export Stubs

Three @deprecated re-export files were created at the old paths:

- `kloel/mind-predictor.service.ts` → re-exports `{ MindPredictorService }` from `./mind/inference/mind-predictor.service`
- `kloel/mind-surprise.service.ts` → re-exports `{ MindSurpriseService }` from `./mind/inference/mind-surprise.service`
- `kloel/mind-verbalizer.service.ts` → re-exports `{ MindVerbalizerService }` from `./mind/synthetic/mind-verbalizer.service`

Each stub includes the @cluster tag and a deprecation notice referencing ADR-0013 Wave M5.

---

## Module Wiring

`kloel.module.ts` — **no edits required**. The module imports all three services from their old paths, which now resolve through the re-export stubs to the moved implementations. Class names and export signatures are unchanged.

---

## Verification

### TSC Typecheck
```
npx tsc -p tsconfig.build.json --noEmit
```

**Result: Zero NEW errors.** All errors in the output are pre-existing:
- `plan.service.ts` (13 errors, various — `actorId`, `acceptCoupons`, `PaymentMethodsConfig`)
- `kloel-chat-tools.service.ts:107` (expected 3 arguments, got 2)
- `mind-catalog-decision-resolvers.ts:2` (`MindPolicyChooser` not exported — pre-existing)
- `kloel-product-sub-resource-tools.service.ts:175` (type assignment)
- `commem/memory.projector.ts:115` (type assignment)
- `sales/sales.service.ts:3` (unused import)

No errors reference any file in `kloel/mind/inference/`, `kloel/mind/synthetic/`, or the re-export stubs.

---

## Directory Structure (post-move)

```
backend/src/kloel/mind/
├── inference/
│   ├── mind-belief.service.ts            (batch 1)
│   ├── mind-belief.service.spec.ts       (batch 1)
│   ├── mind-predictor.service.ts         (batch 3)
│   ├── mind-predictor.service.spec.ts    (batch 3)
│   ├── mind-surprise.service.ts          (batch 3)
│   └── mind-surprise.service.spec.ts     (batch 3)
├── synthetic/
│   ├── mind-verbalizer.service.ts        (batch 3)
│   └── mind-verbalizer.service.spec.ts   (batch 3)
├── memory/
│   ├── mind-global-prior.service.ts      (batch 1)
│   ├── mind-global-prior.service.spec.ts (batch 1)
│   ├── mind-case-memory.service.ts       (batch 2)
│   ├── mind-case-memory.service.spec.ts  (batch 2)
│   ├── mind-concepts.service.ts          (batch 2)
│   └── mind-concepts.service.spec.ts     (batch 2)
├── policy/
│   ├── mind-bandit.service.ts            (batch 1)
│   ├── mind-bandit.service.spec.ts       (batch 1)
│   ├── mind-policy.service.ts            (batch 2)
│   ├── mind-policy.service.spec.ts       (batch 2)
│   └── mind-policy.harness.spec.ts       (batch 2)
├── coordination/
├── knowledge/
├── observability/
├── cia/
└── ... (unchanged)
```

---

## Known Considerations

- `mind-verbalizer.service.ts` has the most import adjustments (10 paths) due to its broad dependency surface (LLM, logging, budget, policy, beliefs, types, common helpers).
- The intra-batch dependency (MindSurpriseService → MindPredictorService) is now a same-directory import in `inference/`, which is the cleanest possible resolution.
- The 4-week alias window for the @deprecated stubs ends ~2026-06-23. After that, a follow-up batch should update all caller imports and remove the stubs.
