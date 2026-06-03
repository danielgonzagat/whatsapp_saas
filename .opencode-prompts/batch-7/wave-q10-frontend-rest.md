# Wave Q/10d — Frontend strict-mode sweep (95 → 0 errors)

## Mission

Eliminate all remaining 95 TypeScript strict-mode errors in `frontend/` (the customer-facing Next.js app). Most are `exactOptionalPropertyTypes: true` violations (TS2375, TS2379, TS2412). After this, `npx tsc --noEmit` in frontend must return 0.

## Pre-read mandatory (do this first, no exceptions)

1. `scripts/decomp/opencode-subagent-delegation-rules.md` — full file
2. `CLAUDE.md` — sections REGRA DE FRONTEND + REGRA DE NÃO-INVENÇÃO + REGRA DE EVIDÊNCIA OBRIGATÓRIA
3. `AGENTS.md`
4. `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md` — do not violate

## Current baseline (measure first to confirm)

```bash
cd /Users/danielpenin/whatsapp_saas/frontend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

Should report 95. Error distribution (per category):
- 33 TS2375 (exactOptionalPropertyTypes assignment)
- 28 TS2379 (exactOptionalPropertyTypes argument)
- 15 TS6133 (unused declarations — local consts, destructured params, not imports)
- 6 TS2353 (excess property)
- 5 TS2412 (exactOptional readonly)
- 2 TS2769 (overload mismatch)
- 2 TS2322 (assignment)
- ~4 others

## Method

### TS2375 / TS2379 / TS2412 (exactOptional)

Apply Pattern A — conditional spread at call site:
```ts
// Before
fn({ a: someVar, b: maybeUndefined });
// After
fn({
  a: someVar,
  ...(maybeUndefined !== undefined ? { b: maybeUndefined } : {}),
});
```

For React component props with optional fields:
```tsx
<MyComp value={v} {...(optionalProp !== undefined ? { optionalProp } : {})} />
```

DO NOT add `| undefined` to the target type just to silence the error — that would relax the contract for every caller.

### TS6133 (unused local)

- If `const _M = ...` with underscore prefix and truly unused: delete the const
- If destructured param `({ goStep, ... })` unused: prefix with `_` (`_goStep`) or remove from destructuring
- If unused type alias: delete it

### TS2353 (excess property in object literal)

The object literal has a key the target type doesn't accept. Two valid fixes:
- Remove the extra key from the literal
- Widen the target type if the key represents a real semantic field

Read the type definition; do not blindly delete behavior.

### TS2322 / TS2769

Read the target type signature and narrow/refine. Use type guards. NEVER cast to `any`/`unknown` as bypass.

## Constraints (CLAUDE.md)

- NO `as any`, NO `@ts-ignore`, NO `@ts-expect-error`, NO `@ts-nocheck`, NO `eslint-disable`, NO `biome-ignore`, NO `nosemgrep`, NO `as unknown as T`
- NO modifying `tsconfig.json` to disable flags
- NO modifying protected files (CLAUDE.md, AGENTS.md, ops/*.json, .husky/, .github/workflows/ci-cd.yml, ESLint configs, scripts/pulse/no-hardcoded-reality-audit.ts)
- NO commits — orchestrator commits after Tier-3 validation
- Preserve all existing visual shell and behavior — types only, not logic
- NO `localStorage` for business data
- NO `Math.random()` for product metrics

## Definition of Done

- `cd /Users/danielpenin/whatsapp_saas/frontend && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l` returns 0
- `npx eslint src` on touched files no NEW errors (pre-existing `react-hooks/set-state-in-effect` warnings unchanged)
- Report:
  - count of files touched
  - count of errors fixed per error code
  - any tests amended (and why)
  - per-module measurement (e.g., `src/app/(checkout)/components/* — N → 0`)
  - hard-stop conditions encountered (if any)

## Hard stop conditions

- A fix would change visible UI behavior (visual regression) — STOP, report
- A type narrowing exposes a real bug in product logic — STOP, report with file:line
- Required type is from a third-party module and can't be refined — STOP, report
- `next.config.ts` errors (2 of them) involve `@vercel/edge-functions` types that may need separate config update — fix if straightforward, otherwise STOP and report

## Measurement & evidence

Before any commit, run:
```bash
cd /Users/danielpenin/whatsapp_saas/frontend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

Report the exact number. The orchestrator validates this independently before committing.
