# Wave Q/10 — Strict-mode sweep frontend (152 typecheck errors)

## Mission

Eliminate all `exactOptionalPropertyTypes` and other strict-mode tsc errors in `frontend/` (the Next.js customer-facing app).

This includes the Vercel kloel-admin failure on `frontend/src/app/(admin)/audit/page.tsx:126` (passing `field: undefined` to `AdminAuditListFilters` which has `field: string` with strict optional).

## Pre-read

1. `CLAUDE.md` — REGRA DE FRONTEND
2. `AGENTS.md`
3. `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md` (do not violate visual contract)

## Target

All `.ts` and `.tsx` files in `frontend/src/` with tsc errors.

Top areas (per `cd frontend && npx tsc --noEmit | grep error`):
- `src/app/(admin)/audit/page.tsx:126` (the Vercel-blocking one)
- Any other file the loop finds

## Method

Same as Wave Q/7 for tsc fixes. For React-specific concerns:
- `useState<T | null>(null)` and narrowed in render
- Conditional spread at JSX prop call sites (`{...(value !== undefined ? { prop: value } : {})}`)
- Type guards in event handlers

For SWR/API hook signatures:
- If `useSWR` returns `data | undefined`, narrow at call site (`if (!data) return <Skeleton />;`)
- Never pass `data` to a child component prop typed as `T` without first narrowing

## Constraints (CLAUDE.md)

- Visual shell PRESERVED — no visual changes
- NO `localStorage` for business data
- NO `Math.random()` for product metrics
- NO bypass tokens, NO commits, NO protected files
- Honest states for missing data (`empty` / `setup-required`)

## Definition of Done

- `cd frontend && npx tsc --noEmit 2>&1 | grep 'error TS' | wc -l` returns 0
- `npx eslint src` touched files clean
- `cd frontend && npm run build` exits 0
- Vercel kloel-admin deploy succeeds on next push (separate verification step)
- Report: file count, error count per category

## Hard stop conditions

- A fix would change visible UI behavior — STOP, ask for visual approval
- A type narrowing exposes a real bug — STOP, report
