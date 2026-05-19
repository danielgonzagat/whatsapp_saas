# Wave Q/7 — Strict-mode sweep backend/src/kloel (~60 typecheck errors)

## Mission

Eliminate all `exactOptionalPropertyTypes`, `noImplicitAny`, `strictNullChecks`, and similar TypeScript strict-mode errors in `backend/src/kloel/` files. Target areas with highest error density.

## Pre-read mandatory

1. `CLAUDE.md` — REGRA DE BANCO DE DADOS, REGRA DE API, REGRA DE NÃO-INVENÇÃO
2. `AGENTS.md`
3. `docs/ai/PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md` if any file touches PULSE
4. `scripts/decomp/opencode-subagent-delegation-rules.md`

## Target files (highest tsc-error count)

Top files per `npx tsc --noEmit | grep 'src/kloel'`:
- `backend/src/kloel/kloel-thinker.helpers.ts` (16 errors)
- `backend/src/kloel/unified-agent-response.service.ts` (9 errors)
- `backend/src/kloel/smart-payment.service.ts` (9 errors)
- `backend/src/kloel/payment.service.ts` (9 errors)
- `backend/src/kloel/kloel-thinker-think.helpers.ts` (8 errors)
- `backend/src/kloel/unified-agent-actions-crm.helpers.ts` (7 errors)
- Plus any other `src/kloel/**.ts` file with errors

Ownership: ONLY these files + their `.spec.ts` peers if needed for new test cases.

## Method per error type

### TS2375/TS2379 (exactOptionalPropertyTypes)
"Type 'X | undefined' is not assignable to 'X' with 'exactOptionalPropertyTypes: true'"

Prefer Pattern A — omit the key at call site:
```ts
// Before
const result = call({ a: maybeUndefined, b: x });
// After
const result = call({
  ...(maybeUndefined !== undefined ? { a: maybeUndefined } : {}),
  b: x,
});
```

Only when the receiving type genuinely should accept undefined: declare it explicitly in the type (`a?: T | undefined`).

### TS2564 (no initializer)
Add `!` definite assignment OR initialize with default OR mark optional:
```ts
// Before: name: string;
// After (constructor will set): name!: string;
// After (with default): name: string = '';
// After (optional): name?: string;
```

For DTOs validated by class-validator: use `!:` since validation guarantees presence.

### TS2532/TS18048 (object possibly undefined)
Narrow with `if` or `??`:
```ts
// Before: x.foo.bar
// After: if (x.foo) x.foo.bar
// Or: const foo = x.foo ?? defaultValue;
```

### TS2322/TS2345 (assignment / argument)
Read context, refine types. NEVER cast to `any`/`unknown` as bypass.

### TS7006 (implicit any parameter)
Add explicit type. Use the existing type from the function's call site or DI signature.

## Constraints (CLAUDE.md)

- NO `as any`, NO `@ts-ignore`, NO `@ts-expect-error`, NO `@ts-nocheck`, NO `eslint-disable`, NO `biome-ignore`
- NO modifying tsconfig to disable flags
- NO `as unknown as T` as a silent cast — use type guard functions instead
- NO modifying protected files (CLAUDE.md, AGENTS.md, ops/*.json, .husky/, .github/workflows/ci-cd.yml, ESLint configs, scripts/pulse/no-hardcoded-reality-audit.ts)
- NO commits — Claude (CEO orchestrator) commits after Tier-3 validation
- Preserve all existing behavior — types only, not logic

## Definition of Done

- `cd /Users/danielpenin/whatsapp_saas/backend && npx tsc --noEmit 2>&1 | grep 'src/kloel' | wc -l` returns 0
- `npx eslint src/kloel` (only touched files) clean
- `npx jest --testPathPatterns="kloel/(payment|smart-payment|unified-agent-response|kloel-thinker|unified-agent-actions-crm)"` exit 0 (no test regression)
- Report: list of files touched, count of errors fixed per error code, any tests amended

## Hard stop conditions

- Service implementation needs a real bug fix discovered via strict-mode — STOP, report P0
- A type narrowing requires changing a contract used by 10+ callers — STOP, report scope expansion
