# ADR-0013 Wave M5 — Batch 2 Physical Move Report

**Date:** 2026-05-26
**Phase:** Wave M5 — Physical move of Mind* services into canonical sub-areas
**Batch:** 2 of N (3 services into memory/ and policy/)

---

## Services Moved

| # | Service | Old Path | New Path | Sub-Area |
|---|---------|----------|----------|----------|
| 1 | MindCaseMemoryService | `kloel/mind-case-memory.service.ts` | `kloel/mind/memory/mind-case-memory.service.ts` | Mind/Memory |
| 2 | MindConceptService | `kloel/mind-concepts.service.ts` | `kloel/mind/memory/mind-concepts.service.ts` | Mind/Memory |
| 3 | MindPolicyService | `kloel/mind-policy.service.ts` | `kloel/mind/policy/mind-policy.service.ts` | Mind/Policy |

Spec files co-located with their source files were moved alongside:
- `mind-case-memory.service.spec.ts` → `mind/memory/mind-case-memory.service.spec.ts`
- `mind-concepts.service.spec.ts` → `mind/memory/mind-concepts.service.spec.ts`
- `mind-policy.service.spec.ts` → `mind/policy/mind-policy.service.spec.ts`
- `mind-policy.harness.spec.ts` → `mind/policy/mind-policy.harness.spec.ts`

---

## Caller Counts (Step 1)

| Service | External Callers | Source Files |
|---------|-----------------|-------------|
| MindCaseMemoryService | 5 | cart-recovery, kloel.module, mind-case-memory-decision.helper, mind-event-processor, mind.service |
| MindConceptService | 3 | commercial-decision-orchestrator, kloel.module, mind-event-processor |
| MindPolicyService | 11 | admin-mind (admin/mind), autopilot-cycle-executor (autopilot), cart-recovery, cia-send-helpers (cia), kloel.module, mind-controller, mind-event-processor, mind-observability, mind-report, mind-verbalizer, mind.service |

Test files referencing the moved services:
- MindCaseMemoryService: `mind-code-native-services.spec.ts`, `mind-cross-workspace-isolation.spec.ts`
- MindConceptService: `mind-code-native-services.spec.ts`
- MindPolicyService: `mind-code-native-services.spec.ts`, `mind-cross-workspace-isolation.spec.ts`, `mind-controller.spec.ts`, `mind-observability.service.spec.ts`, `admin-mind.service.spec.ts`, `cia-send-helpers.service.spec.ts`

---

## Import Path Adjustments

Internal imports within the moved files required path adjustments due to the deeper directory nesting (2 levels deeper into `kloel/mind/<subarea>/`).

### mind-case-memory.service.ts (→ memory/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`

### mind-concepts.service.ts (→ memory/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./brain-event-spine.service'` → `'../../brain-event-spine.service'`

### mind-policy.service.ts (→ policy/)
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./kloel-global-prior.service'` → `'../../kloel-global-prior.service'`
- `'./wisdom/wisdom-relevance-filter.service'` → `'../../wisdom/wisdom-relevance-filter.service'`
- `'./wisdom/wisdom-pattern-store.service'` → `'../../wisdom/wisdom-pattern-store.service'`
- `'./mind-belief.service'` → `'../../mind-belief.service'`
- `'./mind-belief-by-channel'` → `'../../mind-belief-by-channel'`
- `'./mind.types'` → `'../../mind.types'`
- `'./mind-policy-calculation'` → `'../../mind-policy-calculation'`
- `'./mind-policy.helpers'` → `'../../mind-policy.helpers'`
- `'./mind-policy.wisdom-prior.helpers'` → `'../../mind-policy.wisdom-prior.helpers'`

### mind-case-memory.service.spec.ts (→ memory/)
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`

### mind-concepts.service.spec.ts (→ memory/)
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./brain-event-spine.service'` → `'../../brain-event-spine.service'`

### mind-policy.service.spec.ts (→ policy/)
- `'./wisdom/wisdom-relevance-filter.service'` → `'../../wisdom/wisdom-relevance-filter.service'`
- `'./wisdom/wisdom-pattern-store.service'` → `'../../wisdom/wisdom-pattern-store.service'`
- `'./wisdom/wisdom.types'` → `'../../wisdom/wisdom.types'`

### mind-policy.harness.spec.ts (→ policy/)
- No path changes needed (only imports `'./mind-policy.service'` — same directory).

---

## Caller Update Strategy

**Option A** applied to all 3 services. External callers continue to import from the old path via the @deprecated re-export stubs. The 4-week alias window will surface IDE deprecation warnings, which is the intended migration signal.

No caller import paths were changed.

---

## Re-Export Stubs

Three @deprecated re-export files were created at the old paths:

- `kloel/mind-case-memory.service.ts` → re-exports `{ MindCaseMemoryService }` from `./mind/memory/mind-case-memory.service`
- `kloel/mind-concepts.service.ts` → re-exports `{ MindConceptService }` from `./mind/memory/mind-concepts.service`
- `kloel/mind-policy.service.ts` → re-exports `{ MindPolicyService }` from `./mind/policy/mind-policy.service`

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
- `mind-catalog-decision-resolvers.ts:2` (`MindPolicyChooser` not exported — pre-existing, the type was never defined in `mind-policy.service.ts`)

No errors reference any file in `kloel/mind/memory/` or `kloel/mind/policy/`.

---

## Directory Structure (post-move)

```
backend/src/kloel/mind/
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
├── inference/
│   ├── mind-belief.service.ts            (batch 1)
│   └── mind-belief.service.spec.ts       (batch 1)
├── coordination/
├── knowledge/
├── observability/
├── cia/
└── ... (unchanged)
```

---

## Helper Files NOT Moved (per scope)

| Helper File | Status |
|-------------|--------|
| `mind-case-memory-decision.helper.ts` | **NOT moved** — companion helper, scoped out of this batch |
| `mind-case-memory-decision.helper.spec.ts` | **NOT moved** — companion helper spec |
| `mind-policy.wisdom-prior.helpers.ts` | **NOT moved** — intra-kloel helper, stays in `kloel/` |
| `mind-policy.helpers.ts` | **NOT moved** — intra-kloel helper, stays in `kloel/` |
| `mind-policy-calculation.ts` | **NOT moved** — intra-kloel helper, stays in `kloel/` |

These files continue to be imported by the moved services via the updated relative paths (`../../<name>` from the sub-area directory).

---

## Known Considerations

- `mind-catalog-decision-resolvers.ts` imports `type { MindPolicyChooser }` from `'./mind-policy.service'` — this type was **never exported** from the original `mind-policy.service.ts`. It is a pre-existing TSC error, not introduced by this move. The re-export stub at the old path correctly forwards only `MindPolicyService`.
- The 4-week alias window for the @deprecated stubs ends ~2026-06-23. After that, a follow-up batch should update all caller imports and remove the stubs.