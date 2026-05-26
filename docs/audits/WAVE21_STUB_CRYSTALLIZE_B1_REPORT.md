# Wave 21 — Stub-route Crystallization Batch 1 Report

> Authored by PI atomic subagent `w21-stub-routes-crystallize-batch1` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date:** 2026-05-26
**Scope:** Top 5 redirect-only stubs from the 59-stub inventory
**Strategy:** REDIRECT-KEEP (intentional alias) vs HONEST-STATE (missing feature replaced with WAVE9_SITES pattern)

---

## Decisions

### 1. `/account` → `/settings` — REDIRECT-KEEP

**File:** `frontend/src/app/(main)/account/page.tsx`

**Reason:** `/settings` renders `<ContaView />`, a real account management component. `/account` is a legacy URL alias — both paths serve the same feature. Added clarifying JSDoc.

### 2. `/billing` → `/settings?section=billing` — REDIRECT-KEEP

**File:** `frontend/src/app/(main)/billing/page.tsx`

**Reason:** Billing is managed as a section within the `/settings` (ContaView) page. The redirect with query param `?section=billing` is intentional sub-section routing. Added clarifying JSDoc.

### 3. `/campaigns` → `/marketing/email` — HONEST-STATE

**File:** `frontend/src/app/(main)/campaigns/page.tsx`

**Reason:** Campaign management is a distinct feature from email marketing. The redirect masked an unimplemented module. Replaced with an honest-state page following the WAVE9_SITES_HONEST_STATE pattern:

- `'use client'` directive
- Imports from `@/lib/i18n/t`, `@/components/kloel/sites/SitesViewIcons`, `@/components/kloel/sites/SitesViewAtoms`
- Consistent visual shell: SORA font family, EMBER accent color, TEXT/TEXT_DIM/TEXT_MUTED hierarchy
- Layout: header with icon + title, Card with dimmed icon, feature name, explanation, and timeline note
- Uses `IC.zap` (lightning bolt) as the campaigns icon
- Explains current state and points users to available marketing tools

### 4. `/canvas` → `/canvas/inicio` — REDIRECT-KEEP

**File:** `frontend/src/app/(main)/canvas/page.tsx`

**Reason:** Standard sub-route routing — bare `/canvas` redirects to `/canvas/inicio`, a real 375-line canvas dashboard page with skeleton grids, design cards, and CRUD. Equivalent to how `/sites` routes to `/sites/overview`. Added clarifying JSDoc.

### 5. `/metrics` → `/analytics` — REDIRECT-KEEP

**File:** `frontend/src/app/(main)/metrics/page.tsx`

**Reason:** `/analytics` is a substantial 20-tab analytics dashboard (Vendas, Churn, Abandonos, etc.). `/metrics` is a legacy URL alias — both paths serve the analytics feature. Added clarifying JSDoc.

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/app/(main)/account/page.tsx` | Added JSDoc explaining redirect intent |
| `frontend/src/app/(main)/billing/page.tsx` | Added JSDoc explaining redirect intent |
| `frontend/src/app/(main)/campaigns/page.tsx` | Replaced `redirect()` with honest-state client component |
| `frontend/src/app/(main)/canvas/page.tsx` | Added JSDoc explaining redirect intent |
| `frontend/src/app/(main)/metrics/page.tsx` | Added JSDoc explaining redirect intent |

---

## Frontend tsc

```
cd frontend && npx tsc --noEmit
Exit: 0
```

✅ TypeScript compilation passes with zero errors.

---

## Summary

| # | Route | Decision |
|---|-------|----------|
| 1 | `/account` | REDIRECT-KEEP |
| 2 | `/billing` | REDIRECT-KEEP |
| 3 | `/campaigns` | **HONEST-STATE** |
| 4 | `/canvas` | REDIRECT-KEEP |
| 5 | `/metrics` | REDIRECT-KEEP |

4 redirects preserved as intentional aliases; 1 redirect converted to honest-state UI. All routing outside these 5 paths is untouched.
