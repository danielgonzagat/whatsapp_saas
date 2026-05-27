# ADR-0013 Wave M5 — Batch 7 Physical Move Report

**Date:** 2026-05-27
**Phase:** Wave M5 — Physical move of Mind* services into canonical sub-areas
**Batch:** 7 of N (3 services — simulator/synthetic generator + workspace state)

---

## Services Moved

| # | Service | Old Path | New Path | Sub-Area |
|---|---------|----------|----------|----------|
| 1 | MindSimulatorService | `kloel/mind-simulator.service.ts` | `kloel/mind/synthetic/mind-simulator.service.ts` | Mind/Synthetic |
| 2 | MindSyntheticGeneratorService | `kloel/mind-synthetic-generator.service.ts` | `kloel/mind/synthetic/mind-synthetic-generator.service.ts` | Mind/Synthetic |
| 3 | MindWorkspaceStateService | `kloel/mind-workspace-state.service.ts` | `kloel/mind/memory/mind-workspace-state.service.ts` | Mind/Memory |

Spec files co-located with their source files were moved alongside:

- `mind-simulator.service.spec.ts` → `mind/synthetic/`
- `mind-simulator.synthetic.spec.ts` → `mind/synthetic/`
- `mind-synthetic-generator.service.spec.ts` → `mind/synthetic/`
- `mind-workspace-state.service.spec.ts` → `mind/memory/`

All moves performed with `git mv` so rename history is preserved.

---

## Caller Counts (Step 1)

| Service | External Callers | Source Files | Test Files |
|---------|-----------------|--------------|------------|
| MindSimulatorService | 4 | mind-controller, kloel.module, mind/observability/mind-report.service | mind-controller.spec, mind-simulator.service.spec, mind-simulator.synthetic.spec |
| MindSyntheticGeneratorService | 4 | mind-controller, kloel.module, mind-simulator (same-area sibling, not external) | mind-controller.spec, mind-simulator.service.spec, mind-simulator.synthetic.spec, mind-synthetic-generator.service.spec |
| MindWorkspaceStateService | 3 | mind.service, kloel.module | mind-cross-workspace-isolation.spec, mind-code-native-services.spec, mind-workspace-state.service.spec |

Total external import-sites updated outside the moved files: **7** (kloel.module ×3, mind-controller ×3, mind.service ×1, mind-cross-workspace-isolation.spec ×1, mind-code-native-services.spec ×1, mind-controller.spec ×2, mind/observability/mind-report.service ×1).

---

## Import Path Adjustments

### Internal imports in moved files

The three services moved from `kloel/` to `kloel/mind/{synthetic,memory}/`, adding two directory levels relative to `kloel/`. Imports referencing `src/`-level modules (`logging/`, `prisma/`, `common/`) gained an extra `../../`, and sibling imports gained `../../`:

**mind-simulator.service.ts (→ synthetic/)**

- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'./mind/policy/mind-quality.service'` → `'../policy/mind-quality.service'` (impl + type)
- `'./mind-replay.service'` → `'../../mind-replay.service'` (impl + types)
- `'./mind-code-native.types'` → `'../../mind-code-native.types'`
- `'./mind-synthetic-generator.service'` → unchanged (sibling in `synthetic/`)

**mind-synthetic-generator.service.ts (→ synthetic/)**

- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'./mind-code-native.types'` → `'../../mind-code-native.types'`
- `'./mind-replay.service'` → `'../../mind-replay.service'`
- `'../common/math'` → `'../../../common/math'`

**mind-workspace-state.service.ts (→ memory/)**

- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./mind.types'` → `'../../mind.types'`

### Spec file imports

**mind-simulator.service.spec.ts (→ synthetic/)**

- `'./mind/policy/mind-quality.service'` → `'../policy/mind-quality.service'`
- `'./mind-replay.service'` → `'../../mind-replay.service'`
- `'./mind-simulator.service'` → unchanged (sibling)
- `'./mind-synthetic-generator.service'` → unchanged (sibling)

**mind-simulator.synthetic.spec.ts (→ synthetic/)**

- Same adjustments as `mind-simulator.service.spec.ts`.

**mind-synthetic-generator.service.spec.ts (→ synthetic/)**

- `'./mind-synthetic-generator.service'` → unchanged (sibling)
- `'./mind-decision-catalog'` → `'../../mind-decision-catalog'`

**mind-workspace-state.service.spec.ts (→ memory/)**

- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./mind-workspace-state.service'` → unchanged (sibling)
- `'./mind.types'` → `'../../mind.types'`

---

## Caller Updates

Clean cutover applied — all external import sites updated to point directly to the new paths:

| Caller File | Import Change |
|---|---|
| `mind-controller.ts` | `./mind-simulator.service` → `./mind/synthetic/mind-simulator.service` (impl + `SimulateActionEntry` type) |
| `mind-controller.ts` | `./mind-synthetic-generator.service` → `./mind/synthetic/mind-synthetic-generator.service` |
| `mind-controller.spec.ts` | `./mind-simulator.service` → `./mind/synthetic/mind-simulator.service` |
| `mind-controller.spec.ts` | `./mind-synthetic-generator.service` → `./mind/synthetic/mind-synthetic-generator.service` |
| `mind.service.ts` | `./mind-workspace-state.service` → `./mind/memory/mind-workspace-state.service` |
| `mind-cross-workspace-isolation.spec.ts` | `./mind-workspace-state.service` → `./mind/memory/mind-workspace-state.service` |
| `mind-code-native-services.spec.ts` | `./mind-workspace-state.service` → `./mind/memory/mind-workspace-state.service` |
| `kloel.module.ts` | All three services → `./mind/{synthetic,memory}/...` |
| `mind/observability/mind-report.service.ts` | `../../mind-simulator.service` → `../synthetic/mind-simulator.service` |

---

## Re-Export Stubs

Three `@deprecated` re-export files were created at the old paths as safety nets:

| Old Path | Re-exports from |
|---|---|
| `kloel/mind-simulator.service.ts` | `./mind/synthetic/mind-simulator.service` |
| `kloel/mind-synthetic-generator.service.ts` | `./mind/synthetic/mind-synthetic-generator.service` |
| `kloel/mind-workspace-state.service.ts` | `./mind/memory/mind-workspace-state.service` |

Each stub uses `export *` so any type/value re-export (including `SimulateActionEntry`, `SimulateInput`, `SimulateReport`, etc.) flows through transparently. Each stub includes a deprecation notice referencing ADR-0013 Wave M5 and this report.

---

## Cross-Batch Import Note

- `mind-quality.service` (batch 6, now in `mind/policy/`) is still referenced by `mind-simulator.service.ts`; the import path was rewritten directly to `'../policy/mind-quality.service'` (relative to the new synthetic/ dir), avoiding routing through the deprecated stub.
- `mind-replay.service`, `mind-decision-catalog`, `mind-code-native.types`, `mind.types`, and `common/math` remain at their existing paths (not yet moved); all updated imports point to those existing canonical locations.
- The deprecated stub at `kloel/mind-quality.service.ts` (created in batch 6) is untouched; no caller in batch 7 reaches `mind-quality` through the old path anymore.
- No new providers were introduced; class signatures are unchanged.

---

## Module Wiring

`kloel.module.ts` — imports updated to point to new paths:

- `MindSimulatorService` from `./mind/synthetic/mind-simulator.service`
- `MindSyntheticGeneratorService` from `./mind/synthetic/mind-synthetic-generator.service`
- `MindWorkspaceStateService` from `./mind/memory/mind-workspace-state.service`

No new providers, no class signature changes, no DI graph reshuffling.

---

## Verification

### TSC Typecheck

`cd backend && npx tsc -p tsconfig.build.json --noEmit` — **exit 0, zero errors**.

No errors mentioning `mind-simulator`, `mind-synthetic-generator`, or `mind-workspace-state` in the full output. Full build typecheck passes cleanly.

### Unit Tests — All Passing

| Spec | Result |
|------|--------|
| `mind/synthetic/mind-simulator.service.spec.ts` | ✓ PASS |
| `mind/synthetic/mind-simulator.synthetic.spec.ts` | ✓ PASS |
| `mind/synthetic/mind-synthetic-generator.service.spec.ts` | ✓ PASS |
| `mind/memory/mind-workspace-state.service.spec.ts` | ✓ PASS |
| `mind-controller.spec.ts` | ✓ PASS |
| `mind-cross-workspace-isolation.spec.ts` | ✓ PASS |
| `mind-code-native-services.spec.ts` | ✓ PASS |

Total: **7 spec files, 69 tests, all green** (38 in the moved specs, 31 in the caller specs).

---

## Directory Structure (post-move)

```
backend/src/kloel/mind/synthetic/
├── mind-simulator.service.ts              (batch 7)
├── mind-simulator.service.spec.ts         (batch 7)
├── mind-simulator.synthetic.spec.ts       (batch 7)
├── mind-synthetic-generator.service.ts    (batch 7)
├── mind-synthetic-generator.service.spec.ts (batch 7)
├── mind-verbalizer.service.ts             (pre-existing)
└── mind-verbalizer.service.spec.ts        (pre-existing)

backend/src/kloel/mind/memory/
├── mind-case-memory.service.ts            (earlier batch)
├── mind-case-memory.service.spec.ts       (earlier batch)
├── mind-concepts.service.ts               (earlier batch)
├── mind-concepts.service.spec.ts          (earlier batch)
├── mind-global-prior.service.ts           (earlier batch)
├── mind-global-prior.service.spec.ts      (earlier batch)
├── mind-workspace-state.service.ts        (batch 7)
└── mind-workspace-state.service.spec.ts   (batch 7)
```

---

## Known Considerations

- The 4-week alias window for the `@deprecated` stubs ends ~2026-06-24.
- All callers already point to the new paths directly — the re-export stubs are safety nets only.
- A follow-up cleanup batch should remove the re-export stubs after the alias window closes, alongside the batch-6 stubs (`mind-guards`, `mind-guard-context-builder`, `mind-quality`) which share a similar window.
