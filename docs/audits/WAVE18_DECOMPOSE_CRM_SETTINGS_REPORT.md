# Wave 18 — Decompose crm-settings-section.tsx

> Authored by PI atomic subagent `w18-decompose-crm-settings` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted the **Pipeline & Deals** kanban section (the largest JSX block in the
component) into a sibling `PipelineCard` component.

## Before

| File | LOC |
|------|-----|
| `crm-settings-section.tsx` | 605 |

## After

| File | LOC |
|------|-----|
| `crm-settings-section.tsx` | 430 |
| `crm-settings-section.pipeline.tsx` (new) | 227 |
| **Total** | **657** |

## Lines extracted

- **175 lines** removed from `crm-settings-section.tsx` (from 605 → 430).
- The extracted JSX was the canonical `<SettingsCard>` block containing pipeline
  creation controls, the deal creation form, and the stage kanban rendering.
- Net increase of 52 LOC is the component wrapper (imports, `PipelineCardProps`
  interface, function signature, props destructuring).

## Files created

- `frontend/src/components/kloel/settings/crm-settings-section.pipeline.tsx`

## What the new component encapsulates

- Pipeline name input + select + create button
- Deal form: contact select, stage select, title input, value input + create button
- Kanban stage rendering with deal cards and left/right navigation buttons
- Empty-state notices for missing pipeline or empty stages

## Shell preservation

- Every `className`, spacing token, `aria-label`, `aria-hidden`, `style`, `var()`
  custom property, and `kloelT()` i18n key is byte-identical to the original.
- No visual delta. All design tokens and layout classes are preserved exactly.

## Import cleanup in parent

Removed from `crm-settings-section.tsx`:
- `colors` from `@/lib/design-tokens` (only used in kanban stage dot)
- `ArrowLeft`, `ArrowRight`, `KanbanSquare`, `Plus` from `lucide-react`
- `SettingsCard`, `SettingsHeader`, `SettingsInset` from `./contract`
- `formatMoney` from `./crm-settings-section.helpers`
- `fieldClass` from `./crm-settings-section.parts`

Added to parent:
- `PipelineCard` from `./crm-settings-section.pipeline` (`import` only)

## Verification

- `frontend` tsc — **passes** (`tsc --noEmit`, exit 0)
- `frontend` Vitest — **544 tests, 73 files, all pass** (exit 0, no new failures)
