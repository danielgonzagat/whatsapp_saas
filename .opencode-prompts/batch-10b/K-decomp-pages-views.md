# Wave K — Decompose pages/views >300 lines

## Mission

Decompose large frontend files into cohesive modules ≤300 lines each, preserving public exports and visual contract.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE FRONTEND + REGRA DE NÃO-INVENÇÃO
3. `AGENTS.md`
4. `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md`

## Discovery

```bash
cd /Users/danielpenin/whatsapp_saas/frontend
find src -name "*.tsx" -o -name "*.ts" | grep -v test | grep -v spec | grep -v node_modules | xargs wc -l 2>/dev/null | sort -rn | head -30
```

## Top targets (per prompt section 1.4 + A.2)

Pages (above 300 lines):
- leads/page.tsx (584)
- followups/page.tsx (576)
- onboarding/page.tsx (512)
- onboarding-chat/page.tsx (485)
- reset-password/page.tsx (472)
- produtos/area-membros/preview/[areaId]/page.tsx (458)
- autopilot/page.tsx (450)
- vendas/gestao-vendas/page.tsx (436)
- funnels (413)
- pay/[id] (405)
- canvas/inicio (399)
- pricing (386)
- whatsapp (385)
- webinarios (379)
- products/new (368)
- canvas/modelos (354)
- checkout/[planId] (331)
- ferramentas/ver-todas (325)
- privacy (321)

Views (above 300 lines):
- conta/ContaView.tsx (535)
- marketing/MarketingView.tsx (421)
- home/HomeView.tsx (417)
- ProdutosView.shared (343)
- AgentDesktopViewer (342)
- vendas/VendasView (339)
- ParceriasIcons (335)
- ConversationsView (332)
- KloelDashboardView (330)

## Method

For each file:

1. Read full file
2. Identify natural cohesive splits (form section, table section, header, footer, hook, helpers, types)
3. Extract each into separate file in same dir: `<Original>.<role>.tsx` (e.g., `LeadsPage.tsx` → `LeadsHeader.tsx`, `LeadsTable.tsx`, `LeadsFilters.tsx`, `LeadsActionBar.tsx`)
4. Keep `<Original>.tsx` as thin orchestrator (≤300 lines, ideally ≤200)
5. Preserve all public exports
6. NO change to visual rendering

Example:
```
LeadsPage.tsx (584)
  → LeadsPage.tsx (200, thin orchestrator)
  → LeadsHeader.tsx (50)
  → LeadsFilters.tsx (80)
  → LeadsTable.tsx (150)
  → LeadsActions.tsx (60)
  → LeadsExportModal.tsx (90)
```

## Ownership set

ALL `frontend/src/app/**/*.tsx` and `frontend/src/components/kloel/**/*.tsx` above 300 lines. NO `__tests__/` modifications.

## Constraints

- NO bypass tokens
- NO commits
- Visual shell preserved (no UI behavior changes — purely structural)
- NO `__parts__/` or `__companions__/` dir names — use semantic names matching the organism
- Pre-existing `react-hooks/set-state-in-effect` warnings allowed (out of scope unless trivially fixable)
- New files must have ≤300 lines

## Definition of Done

- All target files now ≤300 lines (ideally ≤200 for the orchestrator)
- `cd frontend && npx tsc --noEmit` no NEW errors (still 0 if was 0)
- `npx eslint src` on touched files no NEW errors
- `npm run build` exits 0
- Report: per-file before/after line counts + new files created

## Hard stop conditions

- A decomposition would change visible UI — STOP, report
- File depends on circular import that can't be cleanly broken — STOP, report
- Type cascade would require >5 caller updates — STOP, report scope expansion
