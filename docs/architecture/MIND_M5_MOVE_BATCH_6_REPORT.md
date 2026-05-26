# ADR-0013 Wave M5 — Batch 6 Physical Move Report

**Date:** 2026-05-26  
**Phase:** Wave M5 — Physical move of Mind* services into canonical sub-areas  
**Batch:** 6 of N (3 policy/quality Mind services)  

---

## Services Moved

| # | Service | Old Path | New Path | Sub-Area |
|---|---------|----------|----------|----------|
| 1 | MindGuardsService | `kloel/mind-guards.service.ts` | `kloel/mind/policy/mind-guards.service.ts` | Mind/Policy |
| 2 | MindGuardContextBuilderService | `kloel/mind-guard-context-builder.service.ts` | `kloel/mind/policy/mind-guard-context-builder.service.ts` | Mind/Policy |
| 3 | MindQualityService | `kloel/mind-quality.service.ts` | `kloel/mind/policy/mind-quality.service.ts` | Mind/Policy |

Spec files co-located with their source files were moved alongside.

---

## Caller Counts (Step 1)

| Service | External Callers | Source Files | Test Files |
|---------|-----------------|-------------|------------|
| MindGuardsService | 11 | cart-recovery, channel-transport.registry, kloel.module, mind-controller, unified-agent-actions-commerce, unified-agent-actions-crm, unified-agent-actions-sales, unified-agent-actions-workspace | mind-code-native-services.spec, mind-controller.spec, mind-guards-composer.service.spec |
| MindGuardContextBuilderService | 6 | channel-transport.registry, kloel.module, unified-agent-actions-commerce, unified-agent-actions-crm, unified-agent-actions-sales, unified-agent-actions-workspace | — |
| MindQualityService | 5 | kloel.module, mind-simulator, rules/kloel-rules-invariant.spec | mind-simulator.service.spec, mind-simulator.synthetic.spec |

---

## Import Path Adjustments

### Internal imports in moved files

All three services moved from `kloel/` to `kloel/mind/policy/`, adding one directory level relative to `kloel/`. Imports referencing `src/`-level modules (`logging/`, `prisma/`) required an extra `../`:

**mind-guards.service.ts (→ policy/)**
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./rules/kloel-rule-engine.service'` → `'../../rules/kloel-rule-engine.service'`
- `'./rules/kloel-rules.types'` → `'../../rules/kloel-rules.types'`
- `'./mind-code-native.types'` → `'../../mind-code-native.types'`

**mind-guard-context-builder.service.ts (→ policy/)**
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./channel-transport.types'` → `'../../channel-transport.types'`
- `'./mind-code-native.types'` → `'../../mind-code-native.types'`

**mind-quality.service.ts (→ policy/)**
- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'./mind-code-native.types'` → `'../../mind-code-native.types'`

### Spec file imports

**mind-guards.service.spec.ts (→ policy/)**
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./rules/kloel-rule-engine.service'` → `'../../rules/kloel-rule-engine.service'`
- `'./mind-code-native.types'` → `'../../mind-code-native.types'`

**mind-guard-context-builder.service.spec.ts (→ policy/)**
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./channel-transport.types'` → `'../../channel-transport.types'`
- `'./mind-code-native.types'` → `'../../mind-code-native.types'`

---

## Caller Updates

Clean cutover applied — all 22 caller import sites updated to point directly to the new paths:

| Caller File | Import Change |
|---|---|
| `cart-recovery.service.ts` | `./mind-guards.service` → `./mind/policy/mind-guards.service` |
| `channel-transport.registry.ts` | Both guards imports → `./mind/policy/...` |
| `kloel.module.ts` | All three services → `./mind/policy/...` |
| `mind-code-native-services.spec.ts` | `./mind-guards.service` → `./mind/policy/mind-guards.service` |
| `mind-controller.spec.ts` | `./mind-guards.service` → `./mind/policy/mind-guards.service` |
| `mind-controller.ts` | `./mind-guards.service` → `./mind/policy/mind-guards.service` |
| `mind-guards-composer.service.spec.ts` | `./mind-guards.service` → `./mind/policy/mind-guards.service` |
| `unified-agent-actions-commerce.service.ts` | Both guards imports → `./mind/policy/...` |
| `unified-agent-actions-crm.service.ts` | Both guards imports → `./mind/policy/...` |
| `unified-agent-actions-sales.service.ts` | Both guards imports → `./mind/policy/...` |
| `unified-agent-actions-workspace.service.ts` | Both guards imports → `./mind/policy/...` |
| `mind-simulator.service.ts` | `./mind-quality.service` → `./mind/policy/mind-quality.service` (impl + type) |
| `mind-simulator.service.spec.ts` | `./mind-quality.service` → `./mind/policy/mind-quality.service` |
| `mind-simulator.synthetic.spec.ts` | `./mind-quality.service` → `./mind/policy/mind-quality.service` |
| `rules/kloel-rules-invariant.spec.ts` | `../mind-quality.service` → `../mind/policy/mind-quality.service` |

---

## Re-Export Stubs

Three `@deprecated` re-export files were created at the old paths as safety nets:

| Old Path | Re-exports from |
|---|---|
| `kloel/mind-guards.service.ts` | `./mind/policy/mind-guards.service` |
| `kloel/mind-guard-context-builder.service.ts` | `./mind/policy/mind-guard-context-builder.service` |
| `kloel/mind-quality.service.ts` | `./mind/policy/mind-quality.service` |

`mind-quality.service.ts` also re-exports types: `QualityInvariant`, `QualityViolation`, `QualityCheck`, `QualityReport`.

Each stub includes a deprecation notice referencing ADR-0013 Wave M5.

---

## Cross-Batch Import Note

- `mind-policy.service.ts` and `mind-belief.service.ts` were moved in batches 1/2. No cross-batch import conflicts arose for batch 6 services.
- `mind-quality.service.ts` shares common types with `mind-code-native.types` (unchanged location).
- `mind-guards.service.ts` imports `MindPolicyService` via its re-export stub at the old path — unchanged.

---

## Module Wiring

`kloel.module.ts` — imports updated to point to new paths:
- `MindGuardsService` from `./mind/policy/mind-guards.service`
- `MindGuardContextBuilderService` from `./mind/policy/mind-guard-context-builder.service`
- `MindQualityService` from `./mind/policy/mind-quality.service`

No new providers, no class signature changes.

---

## Verification

### TSC Typecheck

`npx tsc -p tsconfig.build.json --noEmit`

No new errors introduced. All remaining errors are pre-existing (memory.projector.ts, plan.service.ts, sales.service.ts, kloel-chat-tools.service.ts, kloel-product-sub-resource-tools.service.ts, mind-catalog-decision-resolvers.ts).

### Unit Tests — All Passing

| Spec | Result |
|------|--------|
| `mind/policy/mind-guards.service.spec.ts` | ✓ PASS |
| `mind/policy/mind-guard-context-builder.service.spec.ts` | ✓ PASS |
| `mind/policy/mind-quality.service.spec.ts` | ✓ PASS |
| `mind-code-native-services.spec.ts` | ✓ PASS |
| `mind-guards-composer.service.spec.ts` | ✓ PASS |
| `mind-controller.spec.ts` | ✓ PASS |
| `mind-simulator.service.spec.ts` | ✓ PASS |
| `rules/kloel-rules-invariant.spec.ts` | ✓ PASS |

---

## Directory Structure (post-move)

```
backend/src/kloel/mind/policy/
├── mind-bandit.service.ts              (batch 1)
├── mind-bandit.service.spec.ts         (batch 1)
├── mind-policy.service.ts              (batch 1/2)
├── mind-policy.service.spec.ts         (batch 1/2)
├── mind-policy.harness.spec.ts         (batch 1/2)
├── mind-guards.service.ts              (batch 6)
├── mind-guards.service.spec.ts         (batch 6)
├── mind-guard-context-builder.service.ts   (batch 6)
├── mind-guard-context-builder.service.spec.ts (batch 6)
├── mind-quality.service.ts             (batch 6)
└── mind-quality.service.spec.ts        (batch 6)
```

---

## Known Considerations

- The 4-week alias window for the `@deprecated` stubs ends ~2026-06-23.
- All callers already point to the new paths directly — the re-export stubs are safety nets only.
- A follow-up cleanup batch should remove the re-export stubs after the alias window closes.
