# Frontend Component Deduplication Audit

> Audit B3 (subagent OpenCode/deepseek-v4, 2026-05-21) of duplicate component
> implementations across `frontend/src/components/` and `frontend-admin/src/components/`.
>
> **Finding**: most frontend "duplicates" are Shape 3 (domain-specialized) — each
> variant serves a specific subdomain (sites, vendas, marketing, autopilot,
> settings, admin) with intentional visual + props divergence. Force-merging
> would violate CLAUDE.md "REGRA MESTRA — PRESERVAR A CASCA".
>
> Only a few targets are safe consolidations.

## Components audited

| Family | Implementations | Verdict |
|---|---:|---|
| Badge | 5 (kloel, vendas, sites, admin, marketing) | 4 distinct props/styling — Shape 3 mostly; 1 LOW-risk merge possible |
| Toggle | 3 (Forms.Toggle, PlanAIConfig, SitesViewControls) | All functionally equivalent — Shape 1/2 LOW risk |
| StatCard | 5 (Cards, admin, settings-CRM, settings-Analytics, AgentConsole, AffiliateStats, AutopilotPlanInspector) | settings twins (byte-identical) safe; rest Shape 3 |
| Card | 3 (kloel, sites, admin) | Different semantics — Shape 3, keep |
| EmptyState | 5 (Cards.simple, EmptyStates.contextual, sites, +2 private) | Different tiers — keep both Cards.EmptyState and EmptyStates.ContextualEmptyState |
| Spinner / Loader | many | Different visual purposes — not duplicates |
| Button | many | Separate design systems (kloel/admin) — not duplicates |

## P1 consolidation: Toggle (LOW risk)

### Current state
| File | Lines | Props | Status |
|---|---:|---|---|
| `frontend/src/components/kloel/Forms.tsx:380` | 70 | `checked, onChange, label, description?, disabled?, size?, className?` | full-featured (canonical) |
| `frontend/src/components/plans/PlanAIConfig.toggle.tsx:5` | 35 | `checked, onChange, label` | uses `colors.accent.webb` (cyan) instead of `colors.brand.green` |
| `frontend/src/components/kloel/sites/SitesViewControls.tsx:53` | 10 | `checked, onChange, label?` | uses `EMBER` color when checked |

### Recipe
1. Extract `Forms.Toggle` body to new `frontend/src/components/kloel/Toggle.tsx`
2. Add optional `accentColor?: string` prop (default = `colors.brand.green`)
3. Re-export from `Forms.tsx` for backward compat
4. Migrate PlanAIConfig caller: `<Toggle ... accentColor={colors.accent.webb} />`
5. Migrate SitesViewControls caller: `<Toggle ... accentColor={EMBER} size="sm" />`
6. Delete the two local variants

### Risk
LOW — Toggle is purely interactive (no visual baseline beyond color), and the canonical superset preserves all existing props. Browser smoke needed for the 2 caller sites to confirm color rendering.

## P2 consolidation: Settings StatCard twins (LOW risk)

`crm-settings-section.parts.tsx:23` and `analytics-settings-section.tsx:47` are **byte-identical**:

```tsx
function StatCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return <SettingsMetricTile ...>...</SettingsMetricTile>;
}
```

### Recipe
1. Extract to `frontend/src/components/kloel/settings/shared-statcard.tsx`
2. Both files import: `import { StatCard } from './shared-statcard';`
3. Delete the 2 local copies

### Risk
LOW — byte-identical extraction, no visual change.

## P3 consolidation: Badge (MEDIUM risk)

5 implementations with 4 distinct props/visual styles. The right approach is NOT a single unified `Badge` — instead **document each as canonical for its context**:

| Variant | Canonical home | Use case |
|---|---|---|
| `kloel/Primitives.Badge` | rounded-pill semantic chip | Inbox status, conversation labels |
| `kloel/vendas/Badge` | uppercase mono pill | Sales pipeline stages |
| `kloel/sites/SitesViewAtoms.Badge` | colored border label | Site lifecycle states |
| `frontend-admin/ui/badge` | cva Tailwind variant | Admin-only context (cannot consume kloel components) |

### Recipe
1. Rename each to distinguish purpose: `SemanticPillBadge`, `SalesStageBadge`, `SiteLifecycleBadge`, `AdminBadge`
2. Add JSDoc to each explaining when to use it
3. Add ESLint rule: warn on `<Badge>` without explicit specifier (prefer the namespaced version)

### Risk
MEDIUM — renames affect many caller sites; requires per-caller verification that the right Badge is used in each context.

## Components NOT to consolidate (Shape 3 documented)

- **Card** — 3 versions serve different patterns (interactive vs presentational vs admin)
- **EmptyState** — 2 tiers (simple inline vs contextual rich) intentionally separate
- **StatCard** (non-settings) — each domain (autopilot, parcerias, agent-console) has its own visual identity per design contract
- **Spinner / PulseLoader / SkeletonCard** — different motion semantics
- **Button** — kloel-button is the design system; admin-button is intentionally separate

## Migration governance

Per CLAUDE.md "REGRA DE FRONTEND" item 1: **preserve shell visual**. ANY frontend consolidation MUST:
1. Have a Playwright smoke test for the affected pages BEFORE migration
2. Have the same Playwright run AFTER migration
3. Visual diff must match (or be explicitly approved if intentional)
4. NEVER batch-migrate multiple visual components in one PR

## Recommended next steps (for owner / future session)

1. Implement P1 (Toggle consolidation) — requires browser verification
2. Implement P2 (settings StatCard) — byte-identical extract
3. Document P3 Badge namespacing in `frontend/src/components/kloel/Badge.tsx` JSDoc

These 3 changes consolidate 6-8 component variants safely.

## Related

- [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md) — frontend domain boundaries
- [PATTERN_MIGRATION_PLAYBOOK.md](PATTERN_MIGRATION_PLAYBOOK.md) — Shape 1-4 decision tree
- CLAUDE.md "REGRA MESTRA — PRESERVAR A CASCA", "REGRA DE FRONTEND"
- `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md` (protected) — visual rules
