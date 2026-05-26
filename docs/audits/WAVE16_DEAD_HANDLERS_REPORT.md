# Wave 16 — Dead Handlers Cleanup Report

> Authored by PI atomic subagent `w16-dead-handlers-cleanup` (DeepSeek V4 Pro). Materialized 2026-05-26.


> Date: 2026-05-26
> Audit source: `docs/audits/WAVE3_DEAD_HANDLERS.md`
> Scope: 2 remaining dead-handler locations (Dominios fixed in Wave 9)

## Summary

Both remaining dead handlers classified as **DECORATION** — elements styled as
interactive but lacking real functionality. The least-invasive fix was applied in
each case: remove the misleading interactive affordance rather than wiring
navigation that would duplicate existing functionality.

## Site 1: Template Tag Pills

**File**: `frontend/src/components/canvas/canvas-editor-sidebar-panels.tsx:78-80`

**Finding**: Six pill-shaped `<button>` elements (`Marketing`, `Lancamento`,
`Desconto`, `Depoimento`, `Antes/Depois`, `Produto`) styled with
`cursor: 'pointer'` but no `onClick` handler. They appear in the Canvas
Editor's "Modelos" (Templates) sidebar tab above the template grid.

**Decision**: **DECORATION**. These are static category labels serving as a
visual legend for available template categories. Adding a filter mechanism would
require new state management, filtering logic, and active/inactive pill styling
— a feature addition, not a fix. The templates below are shown unfiltered, and
no filter UX is wired.

**Fix applied**:
- Changed `<button type="button">` → `<span>` (non-interactive element)
- Overrode `cursor: 'pointer'` → `cursor: 'default'` inline (preserved
  `pillStyle` export unchanged for potential future interactive pill use)

**Visual shell**: Preserved. Pills retain identical padding, border-radius,
background, font, and color. Only the mouse cursor changes from pointer to
default.

## Site 2: VisaoGeral Site Overview Cards

**File**: `frontend/src/components/kloel/sites/VisaoGeral.tsx:17`

**Finding**: The `OverviewSiteCard` component renders a `<Card>` with
`cursor: 'pointer'` but no `onClick`. On the Visão Geral (Overview) tab,
site cards appear clickable but produce no navigation or action.

**Decision**: **DECORATION**. The Visão Geral tab is a dashboard/overview, not a
site navigator. The "Editar Site" tab (`SitesView.tabs.ts`) already provides a
full interactive site list (`EditarSiteList`) with working select/edit/delete
buttons. Adding navigation from Visão Geral would duplicate that functionality
and create UX ambiguity (overview cards vs. edit-list cards).

**Fix applied**:
- Removed `cursor: 'pointer'` from the `<Card>` style prop in
  `OverviewSiteCard`

**Visual shell**: Preserved. Card layout, status dot, site name, slug, badge,
and date all render identically. Only the hover cursor changes from pointer to
default.

## Files Modified

| File | Change | Lines |
|------|--------|-------|
| `frontend/src/components/canvas/canvas-editor-sidebar-panels.tsx` | `<button>` → `<span>`, `cursor: default` override | 78-80 |
| `frontend/src/components/kloel/sites/VisaoGeral.tsx` | Removed `cursor: 'pointer'` from Card style | 17 |

## Verification

### Frontend tsc

```
npm --prefix frontend run typecheck
tsc --noEmit
```

**Result**: ✅ Pass (exit code 0, no errors).

### Visual Shell

No layout changes. No color, spacing, typography, or structural changes.
Only the cursor CSS property was adjusted (pointer → default) on non-interactive
elements.

## Conclusion

All 3 dead-handler locations from `WAVE3_DEAD_HANDLERS.md` are now resolved:

| Location | Wave | Resolution |
|----------|------|------------|
| Dominios.tsx edit/trash (mobile + desktop) | Wave 9 | DECORATION — removed dead buttons |
| Canvas template tag pills | Wave 16 | DECORATION — `<button>` → `<span>` |
| VisaoGeral site overview cards | Wave 16 | DECORATION — removed `cursor: pointer` |
