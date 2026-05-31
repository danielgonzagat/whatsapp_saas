# ADR-0013 Wave M5 — Batch 8 Physical Move Report

**Date:** 2026-05-27
**Phase:** Wave M5 — Physical move of Mind* services into canonical sub-areas
**Batch:** 8 of N (1 service — perception sub-area)

---

## Services Moved

| # | Service | Old Path | New Path | Sub-Area |
|---|---------|----------|----------|----------|
| 1 | MindPerceptionService | `kloel/mind-perception.service.ts` | `kloel/mind/perception/mind-perception.service.ts` | Mind/Perception |

Spec file co-located with its source file was moved alongside:

- `mind-perception.service.spec.ts` → `mind/perception/`

All moves performed with `git mv` so rename history is preserved. The
`backend/src/kloel/mind/perception/` directory was newly created in this
batch — Batch 8 is the first move into it.

---

## Caller Counts (Step 1)

| Service | External Callers | Source Files | Test Files |
|---------|-----------------|--------------|------------|
| MindPerceptionService | 4 | `brain-capability-executor.substrate.ts`, `brain-capability-executor.service.ts`, `kloel.module.ts`, `mind.service.ts` | `mind-perception.service.spec.ts` (co-located, not external) |

Total external import-sites updated outside the moved files: **4**.

No worker-side or controller-side caller of `MindPerceptionService` exists —
all consumers are inside `backend/src/kloel/`.

---

## Import Path Adjustments

### Internal imports in moved files

The service moved from `kloel/` to `kloel/mind/perception/`, adding two
directory levels relative to `kloel/`. Imports referencing `src/`-level
modules (`logging/`, `prisma/`) gained an extra `../../`, and the
`mind.types` sibling (still at `kloel/`) gained `../../`:

**mind-perception.service.ts (→ perception/)**

- `'../logging/structured-logger'` → `'../../../logging/structured-logger'`
- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./mind.types'` → `'../../mind.types'`

### Spec file imports

**mind-perception.service.spec.ts (→ perception/)**

- `'../prisma/prisma.service'` → `'../../../prisma/prisma.service'`
- `'./mind-perception.service'` → unchanged (sibling)

---

## Caller Updates

Clean cutover applied — all external import sites updated to point directly
to the new path:

| Caller File | Import Change |
|---|---|
| `brain-capability-executor.substrate.ts` | `./mind-perception.service` → `./mind/perception/mind-perception.service` (type-only) |
| `brain-capability-executor.service.ts` | `./mind-perception.service` → `./mind/perception/mind-perception.service` (value) |
| `kloel.module.ts` | `./mind-perception.service` → `./mind/perception/mind-perception.service` |
| `mind.service.ts` | `./mind-perception.service` → `./mind/perception/mind-perception.service` |

---

## Re-Export Stubs

One `@deprecated` re-export file was created at the old path as a safety net:

| Old Path | Re-exports from |
|---|---|
| `kloel/mind-perception.service.ts` | `./mind/perception/mind-perception.service` |

The stub uses `export *` so any type/value re-export flows through
transparently. The stub includes a deprecation notice referencing
ADR-0013 Wave M5 and this report.

---

## Cross-Batch Import Note

- `mind.types` is still at `kloel/mind.types.ts` (not yet moved); the updated
  import points to that existing canonical location via `'../../mind.types'`.
- `logging/structured-logger` and `prisma/prisma.service` remain at their
  existing src-level paths.
- No caller in batch 8 reaches `mind-perception` through any other relocated
  service; this is a purely standalone perception-sub-area landing.
- No new providers were introduced; class signature is unchanged.

---

## Module Wiring

`kloel.module.ts` — `MindPerceptionService` import updated to point to new
path: `./mind/perception/mind-perception.service`.

No new providers, no class signature changes, no DI graph reshuffling.

---

## Verification

### TSC Typecheck

`cd backend && npx tsc -p tsconfig.build.json --noEmit` — **exit 0, zero errors**.

No errors mentioning `mind-perception` in the full output. Full build
typecheck passes cleanly.

### Unit Tests — All Passing

| Spec | Result |
|------|--------|
| `mind/perception/mind-perception.service.spec.ts` | ✓ PASS (7/7 tests) |

Test detail:

- enforces workspace isolation on all 5 source tables
- merges and sorts events ascending by occurredAt
- maps sale status="paid" → kind="sale.completed", others stay as sale.<status>
- classifies checkout price bands correctly
- normalizes blank channel to "unknown"
- uses createdAt:{gt: watermark} as filter for incremental reads
- reads Products via updatedAt and classifies created vs updated

Total: **1 spec file, 7 tests, all green**.

---

## Directory Structure (post-move)

```
backend/src/kloel/mind/perception/
├── mind-perception.service.ts              (batch 8 — new)
└── mind-perception.service.spec.ts         (batch 8 — new)

backend/src/kloel/
├── mind-perception.service.ts              (batch 8 — @deprecated re-export stub)
```

---

## Known Considerations

- The 4-week alias window for the `@deprecated` stub ends ~2026-06-24.
- All 4 callers already point to the new path directly — the re-export stub
  is a safety net only.
- A follow-up cleanup batch should remove the re-export stub after the alias
  window closes, alongside the prior batch stubs which share a similar window.
- Batch 8 completes the planned Wave M5 sub-area landings:
  policy / inference / memory / observability / runtime / synthetic / perception.
