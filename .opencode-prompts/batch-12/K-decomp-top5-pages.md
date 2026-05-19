# Wave K — Decompose TOP 5 pages (>400 lines)

## Mission

Decompose these 5 specific page files into cohesive modules ≤300 lines each:

1. `frontend/src/app/(main)/leads/page.tsx` (584 lines)
2. `frontend/src/app/(main)/followups/page.tsx` (576 lines)
3. `frontend/src/app/(main)/onboarding/page.tsx` (512 lines)
4. `frontend/src/app/(main)/produtos/area-membros/preview/[areaId]/page.tsx` (458 lines)
5. `frontend/src/app/(main)/autopilot/page.tsx` (450 lines)

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE FRONTEND + REGRA DE NÃO-INVENÇÃO
3. `AGENTS.md`
4. `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md`
5. Each target page file in full

## Method per file

1. Read full file
2. Identify natural cohesive splits (header, filters, table, action bar, modals, hooks, helpers, types)
3. Extract each into separate file in same dir: `<PageName>.<role>.tsx` (e.g., `LeadsHeader.tsx`, `LeadsTable.tsx`, `LeadsActions.tsx`)
4. Keep original `page.tsx` as thin orchestrator (≤200-300 lines)
5. Preserve ALL public exports + visual rendering
6. NO change to behavior

## Constraints

- NO bypass tokens (`@ts-ignore`, `@ts-expect-error`, etc)
- NO commits — orchestrator commits
- Visual shell preserved — purely structural changes
- New files ≤300 lines each
- NO `__parts__/` or `__companions__/` directory names — use semantic names matching the organism
- Pre-existing `react-hooks/set-state-in-effect` warnings out of scope

## Definition of Done

- All 5 target pages now ≤300 lines (ideally ≤200 for orchestrator)
- `cd frontend && npx tsc --noEmit` returns 0 (no regression)
- `npx eslint src` on touched files no NEW errors
- `npm run build` exits 0
- Report per-file: before lines → after lines + list of new files

## Hard stop conditions

- A decomposition would change visible UI — STOP, report
- File has circular import that can't be cleanly broken — STOP, report
- Type cascade would require >5 caller updates — STOP, report
