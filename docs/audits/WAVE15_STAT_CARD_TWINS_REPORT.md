# Wave 15 — DUP-011 StatCard settings twins canonicalization report

> Authored by PI atomic subagent `w15-stat-card-settings-twins` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Inventory of all 10 StatCard sites

| # | File | Line | Exported | Identity check |
|---|------|------|----------|----------------|
| 1 | `frontend/src/components/kloel/Cards.tsx` | 31 | Yes | **CANONICAL.** `label`, `value`, `icon?`, `change?`, `size?`, `className?`. Design-tokens styling with icon badge, change indicator. |
| 2 | `frontend/src/app/(main)/autopilot/AutopilotOverview.tsx` | 30 | No | Local. `icon`, `label`, `value`, `color?`, `className?`. Tailwind-based, simpler. |
| 3 | `frontend/src/app/(main)/autopilot/AutopilotRulesPanel.tsx` | 38 | No | Byte-equivalent to #2. |
| 4 | `frontend/src/app/(main)/autopilot/page.ui.tsx` | 30 | Yes | Byte-equivalent to #2; used by `page.operations-section.tsx`, `page.pipeline-section.tsx`, `page.report-section.tsx`. |
| 5 | `frontend/src/components/kloel/AgentConsole.items.tsx` | 91 | Yes | `label`, `value`, `icon`, `trend?`. Different shape, color-token styling. |
| 6 | `frontend/src/components/kloel/autopilot/AutopilotPlanInspector.tsx` | 91 | No | Byte-equivalent to #2. |
| 7 | `frontend/src/components/kloel/parcerias/AffiliateStatsSummary.tsx` | 9 | No | `label`, `value`, `icon`, `iconColor?`. Inline styles. |
| 8 | `frontend/src/components/kloel/settings/analytics-settings-section.tsx` | 47 | No | **SETTINGS TWIN 1.** `title`, `value`, `hint?`. Wraps `SettingsMetricTile`. Title: no uppercase. |
| 9 | `frontend/src/components/kloel/settings/crm-settings-section.parts.tsx` | 23 | Yes | **SETTINGS TWIN 2.** `title`, `value`, `hint?`. Wraps `SettingsMetricTile`. Title: `uppercase tracking-[0.18em]`. |
| 10 | `frontend-admin/src/components/ui/stat-card.tsx` | 60 | Yes | Admin UI. `label`, `value`, `kind?`, `className?`, `children?`. shadcn/ui `Card`-based. |

## 2. Settings twins byte-identity analysis

- **vs canonical (#1):** NOT byte-equivalent. Canonical uses `label`/`icon`/`change`/`size` props with design-tokens; settings twins use `title`/`value`/`hint` with `SettingsMetricTile` wrapper. Completely different component contracts.
- **vs each other (#8 vs #9):** NOT byte-equivalent. Analogy title: `text-xs font-medium text-[var(--app-text-secondary)]`. CRM title: `text-xs font-medium uppercase tracking-[0.18em] text-[var(--app-text-secondary)]`. Also: line-formatting differs (single-line vs multi-line), and `function` vs `export function`.

Register note: The DUPLICATION_REGISTER.md labels them as "byte-identical" — this is stale. The visual difference (`uppercase tracking-[0.18em]`) is intentional per the CRM design.

## 3. Per-site decision

| # | Site | Decision | Rationale |
|---|------|----------|-----------|
| 1 | `Cards.tsx` | **Keep.** Canonical. | |
| 2-4, 6 | Autopilot (4 sites) | **Keep local.** Intentional per register. | |
| 5 | `AgentConsole.items.tsx` | **Keep local.** Intentional per register. | |
| 7 | `AffiliateStatsSummary.tsx` | **Keep local.** Intentional per register. | |
| 8 | `analytics-settings-section.tsx` | **Migrated.** Now imports from `SettingsStatCard.tsx`. | |
| 9 | `crm-settings-section.parts.tsx` | **Migrated.** Now re-exports from `SettingsStatCard.tsx`. | |
| 10 | `frontend-admin/stat-card.tsx` | **Keep local.** Intentional per register (separate admin design system). | |

## 4. Files modified

### Created

- `frontend/src/components/kloel/settings/SettingsStatCard.tsx` — Shared `SettingsStatCard` component. Props: `{ title, value, hint?, uppercase? }`. Wraps `SettingsMetricTile`. When `uppercase` is `true`, title gets `uppercase tracking-[0.18em]` class (CRM style); otherwise plain (analytics style).

### Modified

- `frontend/src/components/kloel/settings/analytics-settings-section.tsx`:
  - Removed local `function StatCard` (lines 47-57, 12 lines).
  - Added import: `import { SettingsStatCard as StatCard } from './SettingsStatCard';`.
  - All 12 call sites unchanged — import alias preserves name.

- `frontend/src/components/kloel/settings/crm-settings-section.parts.tsx`:
  - Removed `export function StatCard` (lines 23-35, 13 lines).
  - Removed unused `SettingsMetricTile` from import block.
  - Added re-export: `export { SettingsStatCard as StatCard } from './SettingsStatCard';`.

- `frontend/src/components/kloel/settings/crm-settings-section.tsx`:
  - 4 call sites updated to pass `uppercase` prop (preserves CRM title styling).

### Net delta

- **−22 lines** deleted (2 duplicate definitions).
- **+18 lines** added (1 shared definition).
- **−4 lines net.**
- **−1 duplicate** components (DUP-011 settings twins merged).

## 5. Frontend tsc result

```
> frontend@0.1.0 typecheck
> tsc --noEmit

(clean exit 0)
```

**PASS.**
