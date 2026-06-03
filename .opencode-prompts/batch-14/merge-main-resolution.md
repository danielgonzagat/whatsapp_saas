# Wave Merge — Merge origin/main into PR #276 (chore/purga-total-debt) + fix all regressions

## Mission

Merge `origin/main` into the current branch and resolve ALL conflicts + fix ALL post-merge tsc/lint regressions until baselines return to:
- Backend tsc: 0
- Frontend tsc: 0
- Frontend-admin tsc: 0
- Worker tsc: 0

Current state (pre-merge): all 4 tsc=0. Goal post-merge: all 4 tsc=0 again, merge committed.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — relevant module sections (REGRA DE BANCO DE DADOS, REGRA DE PAGAMENTOS, etc)
3. `AGENTS.md`

## Method

### Step 1: Merge with strategy "ours" as starting point

```bash
cd /Users/danielpenin/whatsapp_saas
git fetch origin main
git merge origin/main -X ours --no-commit
```

This resolves ~169 conflicts automatically (prefer our changes). The remaining ~18 conflicts need manual resolution.

### Step 2: Resolve remaining conflicts

For each conflicted file (`git diff --name-only --diff-filter=U`):

- `__companions__/` and `__parts__/` files: prefer **OURS** (`git checkout --ours -- <file>`) — our branch has the canonical, post-decomposition version
- `meta-oauth-url.helpers.ts`: read both versions, merge changes (likely both added new helpers — combine them)
- `unified-agent-predecided-actions.part.ts`: same — read both, merge
- `OfficialMarketingChannelPage.tsx`: read both, prefer ours (likely we have Wave K decomposition)
- `package-lock.json`: regenerate via `npm install` after merge if needed
- `schema.prisma`: read both — Prisma schema needs MANUAL merge (combine new models from main + our changes); after merge run `npx prisma generate`

### Step 3: Stage all + commit merge

```bash
git add .
git commit -m "Merge origin/main into chore/purga-total-debt (PR #276)"
```

### Step 4: Fix all post-merge tsc regressions

```bash
cd backend && npx tsc --noEmit 2>&1 | grep "error TS" | head -30
cd frontend && npx tsc --noEmit 2>&1 | grep "error TS" | head -30
cd frontend-admin && npx tsc --noEmit 2>&1 | grep "error TS" | head -30
cd worker && npx tsc --noEmit 2>&1 | grep "error TS" | head -30
```

For each error, apply the appropriate fix:

- **TS2375/TS2379/TS2412 (exactOptional)**: conditional spread at call site `{...(x !== undefined ? { key: x } : {})}`
- **TS2564 (no initializer)**: definite assignment `!` for DTOs or default value
- **TS2532/TS18048 (object possibly undefined)**: narrow with `if` or `??`
- **TS2345/TS2322 (assignment/argument)**: refine types
- **TS2304 (cannot find name)**: missing import — find correct path and add
- **TS6133 (unused)**: remove the unused import/var
- **TS2307 (cannot find module)**: fix import path

NEVER use bypass tokens (`@ts-ignore`, `@ts-expect-error`, `as any`, etc).

### Step 5: Iterate until zero

Loop step 4 until all 4 projects report `0` errors.

### Step 6: Verify build

```bash
cd backend && npm run build && echo "backend OK"
cd ../frontend && npm run build && echo "frontend OK"
cd ../frontend-admin && npm run build && echo "frontend-admin OK"
cd ../worker && npm run build && echo "worker OK"
```

All 4 must exit 0.

## Ownership set

Everything modified by the merge. The merge commit itself + follow-up fix commits.

## Constraints

- NO bypass tokens
- NO commits with non-zero tsc errors
- NO modifying tsconfig flags to relax strict mode
- Preserve all behavior — only type-level fixes
- Working tree must be clean before merge starts (no uncommitted changes)

## Definition of Done

- Merge commit landed
- `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit && cd ../frontend-admin && npx tsc --noEmit && cd ../worker && npx tsc --noEmit` returns 0 errors total
- All 4 `npm run build` exit 0
- Report: count of conflicts resolved per type, count of post-merge errors fixed per category

## Hard stop conditions

- Schema.prisma merge requires Prisma data migration — STOP, report (separate task)
- A type fix exposes a real bug — STOP, report P0
- An imported module from main doesn't exist in current tree — STOP, document
- The merge would require >2 hours of work — STOP, report scope (split into smaller branches)
