# Wave K — Decompose top 5 views (>330 lines)

## Mission

Decompose these 5 specific view files into cohesive modules ≤300 lines each:

1. `frontend/src/components/kloel/conta/ContaView.tsx` (535 lines)
2. `frontend/src/components/kloel/marketing/MarketingView.tsx` (421 lines)
3. `frontend/src/components/kloel/home/HomeView.tsx` (417 lines)
4. `frontend/src/components/kloel/vendas/VendasView.tsx` (339 lines)
5. `frontend/src/components/kloel/dashboard/KloelDashboardView.tsx` (330 lines)

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE FRONTEND + REGRA DE NÃO-INVENÇÃO
3. `AGENTS.md`
4. `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md`
5. Each target view file in full

## Method per file

1. Read full file
2. Identify natural cohesive splits (header, hero, tabs, panels, modals, hooks, helpers)
3. Extract each into separate file in same dir: `<ViewName>.<role>.tsx`
4. Keep original `<ViewName>.tsx` as thin orchestrator (≤300 lines, ideally ≤200)
5. Preserve ALL public exports + visual rendering
6. NO change to behavior

## Constraints

- NO bypass tokens, NO commits
- Visual shell preserved
- New files ≤300 lines each
- NO `__parts__/` or `__companions__/` — use semantic names

## Definition of Done

- All 5 views ≤300 lines (ideally ≤200)
- `cd frontend && npx tsc --noEmit` returns 0
- `npx eslint src` no NEW errors
- `npm run build` exits 0
- Report per-view: before lines → after lines + new files

## Hard stop conditions

- Decomp would change visible UI — STOP, report
- Circular imports — STOP, report
- Type cascade >5 callers — STOP, report
