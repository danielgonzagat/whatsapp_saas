# Wave 11 — DUP-007 Fmt Canonicalization Report

> Authored by PI atomic subagent `w11-dup-007-fmt-canon` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date:** 2026-05-26  
**Task:** `w11-dup-007-fmt-canon`  
**Register:** `docs/architecture/DUPLICATION_REGISTER.md` — DUP-007

---

## 1. Variant Inventory

| # | File | Export | Signature | Semantics |
|---|------|--------|-----------|-----------|
| 1 | `frontend/src/app/(main)/analytics/analytics.design-tokens.ts:28` | `Fmt` | `(n: number) => n.toLocaleString('pt-BR')` | Plain pt-BR locale formatting |
| 2 | `frontend/src/components/kloel/anuncios/AnunciosShared.tsx:98-103` | `Fmt` | `(v: number): string` — branches: ≥1M → `"X.XM"`, ≥1K → `"X.XK"`, else raw string | M/K-suffix with millions support |
| 3 | `frontend/src/components/kloel/carteira/carteira.helpers.ts:52-57` | `Fmt` | `(v: number)` — `Math.abs(v).toLocaleString("pt-BR", { min/maxFractionDigits: 2 })` | BRL cents with absolute value, 2 decimal places |
| 4 | `frontend/src/components/kloel/marketing/MarketingShared.channels.tsx:45-47` | `Fmt` | `(n: number) => n >= 1000 ? \`${\(n / 1000).toFixed(1)}K\` : n.toString()` | K-suffix compact |
| 5 | `frontend/src/components/kloel/sites/SitesViewIcons.tsx:43` | `Fmt` | `(n: number) => (n >= 1000 ? \`${\(n / 1000).toFixed(1)}K\` : n.toString())` | K-suffix compact |
## 2. Byte-Equivalence Proof for #4 ↔ #5

**Verdict:** NOT byte-identical, but **logically equivalent**.

| Attribute | #4 | #5 |
|-----------|----|----|
| Declaration form | `export function Fmt(n: number) { ... }` | `export const Fmt = (n: number) => (...)` |
| Expression | `n >= 1000 ? \`${\(n / 1000).toFixed(1)}K\` : n.toString()` | `(n >= 1000 ? \`${\(n / 1000).toFixed(1)}K\` : n.toString())` |
| SHA-256 (function body) | `5b68d5...` | `d6340b...` |

Both implementations produce identical output for all numeric inputs:
- `value < 1000` → `value.toString()` (e.g., `500` → `"500"`)
- `value ≥ 1000` → `(value / 1000).toFixed(1) + "K"` (e.g., `1500` → `"1.5K"`, `10000` → `"10.0K"`)

The DUP register description of "byte-identical" is a best-effort categorization; the semantics are identical.
## 3. Per-Site Decisions

### ✅ MIGRATED — Variant #4

- **File:** `frontend/src/components/kloel/marketing/MarketingShared.channels.tsx`
- **Action:** Local `Fmt` function body replaced with `import { fmtCompact } from '@/lib/common/format'; export const Fmt = fmtCompact;`
- **Callers preserved:**
  - `MarketingShared.tsx` (barrel re-export + local use in `RegisteredDataList`)
  - `InstagramMarketingTab.tsx`
  - `MarketingChannelNerveRow.tsx`
  - `MarketingVisaoGeral.tsx`
  - `SmsMarketingTab.tsx`
  - `TikTokMarketingTab.tsx`
- **Reason:** Semantics identical to canonical `fmtCompact`. No behavioral change.

### ✅ MIGRATED — Variant #5

- **File:** `frontend/src/components/kloel/sites/SitesViewIcons.tsx`
- **Action:** Local `Fmt` arrow function replaced with `import { fmtCompact } from '@/lib/common/format'; export const Fmt = fmtCompact;`
- **Callers preserved:** None — `Fmt` was exported but had zero consumers (only `FmtMoney` is imported by siblings).
- **Reason:** Semantics identical to canonical `fmtCompact`. Dead export, but kept as re-export for forward compatibility.

### ⏸ KEEP-LOCAL — Variant #1

- **File:** `frontend/src/app/(main)/analytics/analytics.design-tokens.ts`
- **Reason:** Uses `n.toLocaleString('pt-BR')` — plain locale formatting with no K/M suffix logic. Different semantics from `fmtCompact`.

### ⏸ KEEP-LOCAL — Variant #2

- **File:** `frontend/src/components/kloel/anuncios/AnunciosShared.tsx`
- **Reason:** Supports **millions** (`≥1M` → `"X.XM"`) in addition to thousands (`≥1K` → `"X.XK"`). The canonical `fmtCompact` only supports K-suffix. Merging would change behavior for values ≥ 1M.

### ⏸ KEEP-LOCAL — Variant #3

- **File:** `frontend/src/components/kloel/carteira/carteira.helpers.ts`
- **Reason:** Formats BRL cents with `Math.abs(v)` and `toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. This is a currency display helper (always shows 2 decimal places, takes absolute value), not a compact notation helper. Different semantics.
## 4. Files Modified

| File | Change |
|------|--------|
| `frontend/src/lib/common/format.ts` | **Created** — canonical `fmtCompact(value: number): string` |
| `frontend/src/components/kloel/marketing/MarketingShared.channels.tsx` | **Modified** — `Fmt` becomes re-export of `fmtCompact` |
| `frontend/src/components/kloel/sites/SitesViewIcons.tsx` | **Modified** — `Fmt` becomes re-export of `fmtCompact` |

---

## 5. Verification

### TypeScript

```
$ npm --prefix frontend run typecheck
> frontend@0.1.0 typecheck
> tsc --noEmit

(no errors)
```

✅ **PASS** — Zero type errors.

### Unit Tests

```
$ npm --prefix frontend test
> vitest run

Test Files  73 passed (73)
     Tests  544 passed (544)
  Duration  14.25s
```

✅ **PASS** — All 544 tests across 73 test files pass.

### Lint

✅ No new lint violations (no changes to ESLint-visible code patterns).

---

## 6. Summary

| Metric | Value |
|--------|-------|
| Duplicates resolved | 2 (#4, #5) |
| Duplicates kept local | 3 (#1, #2, #3 — different semantics) |
| New canonical module | `frontend/src/lib/common/format.ts` |
| Files created | 1 |
| Files modified | 2 |
| TSC | ✅ PASS |
| Vitest | ✅ 73 files / 544 tests PASS |
