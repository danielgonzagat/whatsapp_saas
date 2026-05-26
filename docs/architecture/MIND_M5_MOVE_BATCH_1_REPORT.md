# ADR-0013 Wave M5 — Batch 1 Physical Move Report

**Date:** 2026-05-26  
**Phase:** Wave M5 — Physical move of Mind* services into canonical sub-areas  
**Batch:** 1 of N (3 self-contained, low-risk services)  

---

## Services Moved

| # | Service | Old Path | New Path | Sub-Area |
|---|---------|----------|----------|----------|
| 1 | MindBanditService | `kloel/mind-bandit.service.ts` | `kloel/mind/policy/mind-bandit.service.ts` | Mind/Policy |
| 2 | MindBeliefService | `kloel/mind-belief.service.ts` | `kloel/mind/inference/mind-belief.service.ts` | Mind/Inference |
| 3 | MindGlobalPriorService | `kloel/mind-global-prior.service.ts` | `kloel/mind/memory/mind-global-prior.service.ts` | Mind/Memory |

Spec files co-located with their source files were moved alongside.

---

## Caller Counts (Step 1)

| Service | External Callers | Source Files | Test Files |
|---------|-----------------|-------------|------------|
| MindBanditService | 5 | ad-rules-engine, cart-recovery, mind-observability | mind-code-native-services.spec, mind-observability.service.spec |
| MindBeliefService | 16 | admin-mind, hypproof/belief-update, mind-belief-by-channel, mind-controller, mind-observability, mind-policy, mind-predictor, mind-report, mind-surprise, mind-verbalizer, mind.service | admin-mind.service.spec, mind-belief-by-channel.spec, mind-controller.spec, mind-cross-workspace-isolation.spec, mind-observability.service.spec |
| MindGlobalPriorService | 4 | mind-belief (internal — moved in same batch), mind-controller | mind-code-native-services.spec, mind-controller.spec |

---

## Import Path Adjustments

Internal imports within the moved files required path adjustments due to the deeper directory nesting:

### mind-bandit.service.ts (→ policy/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`

### mind-belief.service.ts (→ inference/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./mind-global-prior.service'` → `'../memory/mind-global-prior.service'`
- `'./mind.types'` → `'../../mind.types'`

### mind-global-prior.service.ts (→ memory/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./mind.types'` → `'../../mind.types'`

### mind-bandit.service.spec.ts (→ policy/)
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`

---

## Caller Update Strategy

**Option A** applied to all 3 services. External callers continue to import from the old path via the @deprecated re-export stubs. The 4-week alias window will surface IDE deprecation warnings, which is the intended migration signal.

No caller import paths were changed.

---

## Re-Export Stubs

Three @deprecated re-export files were created at the old paths:

- `kloel/mind-bandit.service.ts` → re-exports from `./mind/policy/mind-bandit.service`
- `kloel/mind-belief.service.ts` → re-exports from `./mind/inference/mind-belief.service`
- `kloel/mind-global-prior.service.ts` → re-exports from `./mind/memory/mind-global-prior.service`

Each stub includes the @cluster tag and a deprecation notice referencing ADR-0013 Wave M5.

---

## Module Wiring

`kloel.module.ts` — **no edits required**. The module imports `MindBanditService`, `MindBeliefService`, and `MindGlobalPriorService` from their old paths, which now resolve through the re-export stubs to the moved implementations. Class names and export signatures are unchanged.

---

## Verification

### TSC Typecheck
```
npx tsc -p tsconfig.json --noEmit | grep -E "mind-bandit|mind-belief|mind-global-prior"
# → zero errors
```

### Unit Tests
All 3 moved spec files pass:

| Spec | Result |
|------|--------|
| `mind/policy/mind-bandit.service.spec.ts` | ✓ PASS |
| `mind/inference/mind-belief.service.spec.ts` | ✓ PASS |
| `mind/memory/mind-global-prior.service.spec.ts` | ✓ PASS |

---

## Directory Structure (post-move)

```
backend/src/kloel/mind/
├── policy/
│   ├── mind-bandit.service.ts          (moved)
│   └── mind-bandit.service.spec.ts     (moved)
├── inference/
│   ├── mind-belief.service.ts          (moved)
│   └── mind-belief.service.spec.ts     (moved)
├── memory/
│   ├── mind-global-prior.service.ts    (moved)
│   └── mind-global-prior.service.spec.ts (moved)
├── coordination/
├── knowledge/
├── observability/
├── cia/
└── ... (unchanged)
```

---

## Known Considerations

- `mind-belief.service.ts` (in inference/) imports `MindGlobalPriorService` from `../memory/mind-global-prior.service`. This is a direct import to the moved file rather than through the re-export stub, which is correct since both files were moved in the same batch.
- The 4-week alias window for the @deprecated stubs ends ~2026-06-23. After that, a follow-up batch should update all caller imports and remove the stubs.
