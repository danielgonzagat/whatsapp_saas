# Wave Q — Frontend strict-mode FULL (33 → 0)

## Mission

Eliminate ALL remaining frontend TypeScript strict-mode errors. Current baseline: 33 errors.

Distribution: 33 TS2375, 28 TS2379, 15 TS6133, 6 TS2353, 5 TS2412, 2 TS2769, 2 TS2322, 4 others.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE FRONTEND
3. `AGENTS.md`
4. `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md`

## Method

```bash
cd /Users/danielpenin/whatsapp_saas/frontend
npx tsc --noEmit 2>&1 | grep "error TS" | head -50
```

Apply fix recipes per error code (see Q-backend-strict-mode-FULL.md). React-specific:
- `useState<T | null>(null)` narrowed in render
- Conditional spread on JSX props: `<Comp {...(value !== undefined ? { prop: value } : {})} />`
- Type guards in event handlers
- SWR hook results narrowed at call site (`if (!data) return <Skeleton />;`)

## Ownership set

All `frontend/src/**/*.ts(x)` files.

## Constraints

- Visual shell PRESERVED — no UI behavior changes
- NO bypass tokens
- NO `localStorage` for business data
- NO `Math.random()` for product metrics
- NO modifying protected files
- NO commits

## Definition of Done

- `cd frontend && npx tsc --noEmit 2>&1 | grep -c "error TS"` returns 0
- `npx eslint src` touched files no NEW errors
- `npm run build` exits 0
- Vercel kloel-frontend deploy succeeds on next push
- Report: per-file errors fixed

## Hard stop conditions

- A fix changes visible UI behavior — STOP, ask for visual approval
- A type narrowing exposes a real bug — STOP, report
