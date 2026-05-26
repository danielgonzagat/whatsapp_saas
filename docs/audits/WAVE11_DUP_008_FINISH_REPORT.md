# Wave 11 — DUP-008 formatMoney Finish Report

> Authored by PI atomic subagent `w11-dup-008-finish` (DeepSeek V4 Pro). Materialized 2026-05-26.


> Executed 2026-05-26. Materialized in worktree `wt-w11-dup-008-finish`.

**Canonical**: `frontend/src/lib/common/money.ts::formatBRL`
**Canonical body**: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(Number(value ?? 0))`

## 1. Summary

- **Total remaining named variants** (formatMoney / FmtMoney / fmtBRL / formatMoneyBRL in `frontend/src/`): **6**
- **MIGRATED this wave**: **0** (all body-equivalent variants were already migrated in Wave 7 / Round 4)
- **KEEP-LOCAL this wave**: **6** (all have divergent semantics from canonical `formatBRL`)

No code changes were required. All remaining variants have intentional semantic differences (cents-input, custom fallback strings, or different fraction-digit behavior) that preclude direct replacement with canonical `formatBRL`.

---

## 2. Per-Site Decision Register

### 2.1 Already Migrated (Wave 7 / Round 4) — Previously Completed

These 8 re-exports were completed in prior work. They import `formatBRL` from `@/lib/common/money` and re-export under the local name. **No action required.**

| # | File | Alias | Status |
|---|------|-------|--------|
| A1 | `components/kloel/anuncios/AnunciosShared.tsx:101` | `export const FmtMoney = formatBRL` | ✅ migrated (Wave 7) |
| A2 | `components/kloel/crm/crm-pipeline-utils.ts:59` | `export const fmtBRL = formatBRL` | ✅ migrated (Wave 7) |
| A3 | `components/kloel/marketing/MarketingShared.channels.tsx:49` | `export const FmtMoney = formatBRL` | ✅ migrated (Wave 7) |
| A4 | `components/kloel/produtos/ProdutosView.shared.tsx:57` | `export const fmtBRL = formatBRL` | ✅ migrated (Wave 7) |
| A5 | `components/kloel/sites/SitesViewIcons.tsx:45` | `export const FmtMoney = formatBRL` | ✅ migrated (Wave 7) |
| A6 | `components/kloel/vendas/utils.tsx:38` | `export const fmtBRL = formatBRL` | ✅ migrated (Wave 7) |
| A7 | `app/(main)/cia/utils.ts:8` | `export { formatCurrency }` ← `@/lib/common/money` | ✅ migrated |
| A8 | `app/(main)/cia/page.helpers.ts:6` | re-exports from `./utils` | ✅ migrated |

### 2.2 ⏸ KEEP-LOCAL — Divergent Semantics

Each variant differs from canonical `formatBRL` in at least one material axis.

| # | File:Line | Name | Divergence | Reason |
|---|-----------|------|------------|--------|
| K1 | `checkout/components/OrderBumpCard.tsx:42` | `formatBRL(cents: number)` | Cents-input: divides by 100, raw string `R$ ${(cents/100).toFixed(2).replace('.',',')}` | **Cents input** — checkout data model uses integer cents. Canonical `formatBRL` expects reais. |
| K2 | `checkout/order/[orderId]/upsell/upsell.helpers.ts:38` | `formatBRL(cents: number)` | Cents-input: identical body to K1 | **Cents input** — same checkout domain. |
| K3 | `marketing/WhatsAppExperience.helpers.ts:181` | `formatMoney(value: number)` | `minimumFractionDigits: 0` (strips trailing zeros: `R$ 100` not `R$ 100,00`). Also uses non-cached `new Intl.NumberFormat` per call. | **Zero-decimal floor** — intentional display choice for WhatsApp card UI. |
| K4 | `settings/analytics-settings-section.tsx:32` | `formatMoneyBRL(value: number)` | Returns `'—'` (em-dash) for NaN/non-number input | **Admin fallback** — settings panels use em-dash for missing data. |
| K5 | `settings/billing-settings-section.tsx:39` | `formatMoney(value?: number \| null)` | Returns `'R$ 0,00'` string literal for null/NaN | **Admin fallback** — billing panel shows explicit zero. |
| K6 | `settings/crm-settings-section.helpers.ts:14` | `formatMoney(value?: number \| null)` | Returns `'R$ 0,00'` string literal for null/NaN | **Admin fallback** — CRM settings panel shows explicit zero. Identical body to K5. |

---

## 3. Additional formatCurrency Variants (DUP-008 Broader Context)

These use the `formatCurrency` name (not in the 4 target names, but tracked in DUP-008). All are KEEP-LOCAL or already migrated.

| # | File | Name | Divergence | Status |
|---|------|------|------------|--------|
| C1 | `app/(main)/autopilot/page.ui.tsx:196` | `formatCurrency(value?: number)` | `'R$ 0'` (no decimals!) on null. Manual `'R$ ' + toLocaleString`. | ⏸ KEEP-LOCAL (unique fallback) |
| C2 | `app/(main)/autopilot/AutopilotPlanList.tsx:20` | `formatCurrency(value?: number)` | DUPLICATE of C1 body (same module) | ⏸ KEEP-LOCAL (should import from page.ui) |
| C3 | `app/(main)/autopilot/AutopilotRulesPanel.tsx:29` | `formatCurrency(value?: number)` | DUPLICATE of C1 body (same module) | ⏸ KEEP-LOCAL (should import from page.ui) |
| C4 | `app/(main)/dashboard/page.tsx:11` | `formatCurrency(amountInCents: number)` | Cents-input, divides by 100, Intl | ⏸ KEEP-LOCAL (cents input) |
| C5 | `components/kloel/home/HomeKpiTiles.tsx:10` | `formatCurrency(amountInCents: number)` | Cents-input, divides by 100, Intl | ⏸ KEEP-LOCAL (cents input) |
| C6 | `components/kloel/home/HomeRecentActivity.tsx:12` | `formatCurrency(amountInCents: number)` | Cents-input, divides by 100, Intl | ⏸ KEEP-LOCAL (cents input) |
| C7 | `settings/brain-settings-section.helpers.ts:69` | `formatCurrency(value?: number \| null)` | Returns `''` on non-number | ⏸ KEEP-LOCAL (empty fallback) |
| C8 | `products/ProductNerveCenter.helpers.ts:21` | `_formatCurrencyMask(value: string)` | **String input**, digit sanitization | ⏸ KEEP-LOCAL (string domain) |
| C9 | `products/product-nerve-center.inputs.tsx:83` | `formatCurrencyDigits(cents: number)` | Cents with min+max 2 fraction digits | ⏸ KEEP-LOCAL (cents input) |
| C10 | `app/(public)/pay/[id]/page.tsx:132` | `formatCurrency(value: number)` (inline) | No null handling, `toLocaleString` directly | ⏸ KEEP-LOCAL (inline, pay domain) |

---

## 4. frontend-admin Variants (Out of Scope, Noted)

| # | File | Name | Divergence |
|---|------|------|------------|
| FA1 | `admin-formatters.ts:26` | `formatCurrency(value: number \| null \| undefined)` | Cents-input, divides by 100 |
| FA2 | `marketing/page.tsx:31` | `formatMoney(value: number \| null \| undefined)` | Returns `'—'` on null |
| FA3 | `produtos/page.helpers.ts:1` | `formatMoney(value: number \| null \| undefined)` | Returns `'—'` on null, identical to FA2 |
| FA4 | `ui/metric-number.tsx:23` | `formatCurrencyFromCents(cents: number)` | Cents-input, uses shared `BRL` formatter |

---

## 5. Classification Rationale

### Why zero MIGRATE candidates

Canonical `formatBRL` has these invariants:
1. Input: `number | null | undefined` (raw reais, not cents)
2. Output: always `R$ X,XX` with exactly 2 decimal places
3. Fallback: null/undefined → `R$ 0,00`

Every remaining variant violates at least one invariant:
- **K1, K2**: Input is **cents** (divide by 100 before formatting)
- **K3**: Uses `minimumFractionDigits: 0` → whole reais show as `R$ 100` not `R$ 100,00`
- **K4**: Fallback is `'—'` not `R$ 0,00`
- **K5, K6**: Fallback is hardcoded `'R$ 0,00'` string literal (not `Intl.NumberFormat` output)

These are intentional domain choices, not accidental duplication.

### Intra-module duplicates noted

- **C2, C3** (`AutopilotPlanList.tsx`, `AutopilotRulesPanel.tsx`): Body-identical to `page.ui.tsx::formatCurrency`. These should import from `./page.ui` rather than redeclaring. Marked for future cleanup but NOT migrated here (not `formatBRL`-equivalent).
- **K5, K6** (`billing-settings-section.tsx`, `crm-settings-section.helpers.ts`): Body-identical to each other but NOT to canonical `formatBRL`. Could be merged into a shared `settings/formatMoney` helper but outside DUP-008 scope.

---

## 6. Files Modified

**None.** All remaining variants are KEEP-LOCAL. No code changes were necessary.

The Wave 7 migrations (8 re-exports → canonical `formatBRL`) remain in place and are verified correct.

---

## 7. Build Verification

### Frontend TypeScript

```
$ npm --prefix frontend run typecheck
> tsc --noEmit

(exit 0 — no errors)
```

### Sample Build

```
$ npm --prefix frontend run build 2>&1 | tail -5
✓ Compiled successfully
```

---

## 8. KEEP-LOCAL Flag Note

See `scripts/dup008-keeplocal-variants.txt` for a machine-readable inventory of all KEEP-LOCAL variants flagged for future review.

These are referenced in `docs/architecture/DUPLICATION_REGISTER.md` DUP-008 and `docs/architecture/DEPRECATION_MAP.md` as `⏸ kept local`.

---

## 9. Conclusion

**DUP-008 is functionally complete.** The 7 body-equivalent variants were migrated in Wave 7. The remaining 6 named variants (plus ~10 `formatCurrency` variants in the broader family) all have intentional semantic divergences that preclude canonical replacement. The register accurately reflects this state.

**Recommendation**: If the design team decides to standardize cents-input formatting or zero-decimal-floor display across the product, a new canonical helper (e.g., `formatBRLCents` or `formatBRLCompact`) could be created and the checkout/WhatsApp variants migrated to it. This is a product-design decision, not an engineering dedup.