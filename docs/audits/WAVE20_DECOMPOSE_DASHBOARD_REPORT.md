# Wave 20 — Decompose Dashboard Service Report

> Authored by PI atomic subagent `w20-decompose-dashboard-service` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted the **product ranking computation** from `DashboardService.getHomeSnapshot()` (the `productStats` Map → `topProducts` array pipeline) into a standalone pure-function helper module.

## 1. Lines

| Metric | Value |
|---|---|
| Original `dashboard.service.ts` | 567 LOC |
| New `dashboard.service.ts` | 526 LOC |
| Lines extracted from service | **41 LOC** |
| New `dashboard.product-rank.helpers.ts` | **64 LOC** |
| Net delta | +23 LOC (types + module boilerplate) |

## 2. Files Created

- `backend/src/dashboard/dashboard.product-rank.helpers.ts` — exports:
  - `ProductRankInput` — input type (subset of Prisma `checkoutOrder` select shape)
  - `RankedProduct` — output type with `isTop` flag
  - `computeProductRanking(orders)` — pure function: Map → aggregate → sort → slice(0,4) → annotate `isTop`

## 3. Backend TSC

```
PASS — tsc -p tsconfig.build.json --noEmit
```

## 4. Specs

| Spec | Result |
|---|---|
| `dashboard.service.spec.ts` | PASS (all 8 tests) |
| `dashboard.controller.spec.ts` | PASS |

All existing specs unchanged — zero test modifications needed. Public API of `DashboardService` preserved exactly.
TSC and spec results