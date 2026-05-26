# Wave 15 — DUP-009 Toggle Canonicalization Report

> Authored by PI atomic subagent `w15-frontend-dup-009-toggle` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date**: 2026-05-26
**Status**: COMPLETE ✅
**tsc**: PASS (0 errors)
**vitest**: 73 files, 544 tests — ALL PASS

---

## 1. Per-Site Decisions

| # | Site | Decision | Reason |
|---|------|----------|--------|
| 1 | `frontend/src/components/kloel/Forms.tsx` | **CANONICAL → EXTRACTED** | Original source. Extracted to `primitives/Toggle.tsx`. Forms.tsx now re-exports `Toggle` from primitives, preserving the existing import path (`@/components/kloel`) for all callers. |
| 2 | `frontend/src/app/(main)/checkout/[planId]/checkout-editor-shared.tsx` | **KEEP-LOCAL** | Entirely different visual system: all inline styles, no Tailwind, flat row layout (`toggleRow` style), 40×22 sizing, disabled gate inside `onClick`. Not body-equivalent. |
| 3 | `frontend/src/components/kloel/sites/SitesViewControls.tsx` | **KEEP-LOCAL** | Different visual system: inline styles, 36×20 sizing, `translateX` transform animation, optional label, no `role="switch"` / `aria-checked`. Not body-equivalent. |
| 4 | `frontend/src/components/plans/PlanAIConfig.toggle.tsx` | **MIGRATED → DELETED** | Body-equivalent modulo `accentColor`/`offTrackColor`. Same Tailwind approach, same `role="switch"` + `aria-checked` + `aria-labelledby`. 3 callers updated with `accentColor={colors.accent.webb}` and `offTrackColor={colors.background.corona}`. |
| 5 | `frontend/src/components/products/ProductAfterPayTab.tsx` | **KEEP-LOCAL** | Has `desc` prop (not `description`), keyboard event handler (`onKeyDown`), click on wrapper `<div>`, inline styles, `colors.semantic.success` accent. Not body-equivalent. |
| 6 | `frontend/src/components/products/ProductIATab.tsx` | **KEEP-LOCAL** | Keyboard event handler (`onKeyDown`), click on wrapper `<div>`, inline styles, `colors.semantic.success` accent. Very similar to ProductAfterPayTab but minus `desc`. Not body-equivalent. |

---

## 2. Files Modified

### Created
- `frontend/src/components/kloel/primitives/Toggle.tsx` — canonical Toggle component with `accentColor?` and `offTrackColor?` props

### Modified
- `frontend/src/components/kloel/Forms.tsx` — Toggle definition replaced with re-export:
  ```ts
  // Re-exported from primitives — canonical source of truth.
  export { Toggle } from './primitives/Toggle';
  ```
- `frontend/src/components/plans/PlanAIConfig.tech-info.tsx` — import updated to `@/components/kloel/primitives/Toggle`; added `accentColor={colors.accent.webb}` and `offTrackColor={colors.background.corona}`
- `frontend/src/components/plans/PlanAIConfig.upsell.tsx` — import updated to `@/components/kloel/primitives/Toggle`; added `accentColor={colors.accent.webb}` and `offTrackColor={colors.background.corona}` on both upsell and downsell Toggles

### Deleted
- `frontend/src/components/plans/PlanAIConfig.toggle.tsx` — replaced by canonical

---

## 3. Canonical Toggle API

```ts
interface ToggleProps {
  checked?: boolean;           // default false
  onChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;          // default false
  size?: 'sm' | 'md';          // default 'md'
  className?: string;
  accentColor?: string;        // default colors.brand.green
  offTrackColor?: string;      // default colors.background.surface2
}
```

---

## 4. Verification

### TypeScript
```
$ cd frontend && npx tsc --noEmit
Exit: 0 — no errors
```

### Vitest (full suite)
```
Test Files  73 passed (73)
Tests      544 passed (544)
Duration    21.05s
```

### Import chain integrity
- `@/components/kloel` barrel (`index.ts`) re-exports `Toggle` from `./Forms` → resolves through re-export to `./primitives/Toggle`
- PlanAIConfig sections (`tech-info.tsx`, `upsell.tsx`) import directly from `@/components/kloel/primitives/Toggle`
- All existing callers of `Toggle` from `@/components/kloel` are unaffected

---

## 5. Remaining Duplicates (Tech Debt)

Three non-trivial duplicate Toggles remain. They could be canonicalized in a future wave if:

1. **checkout-editor-shared** — would need the canonical to accept a `variant?: 'inline-row'` mode or the checkout editor to adopt the canonical layout.
2. **SitesViewControls** — would need a `variant?: 'compact-36'` mode or the sites view to adopt the canonical.
3. **ProductAfterPayTab / ProductIATab** — nearly identical to each other (inline, keyboard handlers, success-green accent). These two are candidates for their own dedup pair.
