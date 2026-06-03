# Wave Q — Backend strict-mode FINAL (145 → 0)

## Mission

Eliminate ALL remaining 145 backend TypeScript strict-mode errors. Make `cd backend && npx tsc --noEmit` return 0.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE QUALIDADE DE IA + REGRA DE BANCO DE DADOS + REGRA DE PAGAMENTOS
3. `AGENTS.md`

## Baseline

```bash
cd /Users/danielpenin/whatsapp_saas/backend
npx tsc --noEmit 2>&1 | grep "error TS" | head -50
npx tsc --noEmit 2>&1 | grep "error TS" | awk -F'(' '{print $1}' | sort | uniq -c | sort -rn | head -20
```

Distribution: mix of TS2375/TS2379 (exactOptional), TS2532 (object possibly undefined), TS2345 (assignment), TS7006 (implicit any), TS2769 (overload).

## Method per error code

### TS2375 / TS2379 / TS2412 (exactOptionalPropertyTypes)

Conditional spread at call site:
```ts
// Before: { name: maybeUndef, email: x }
// After: { ...(maybeUndef !== undefined ? { name: maybeUndef } : {}), email: x }
```

### TS2564 (no initializer)

DTOs validated by class-validator: `name!: string;`
Service properties: initialize in constructor

### TS2532 / TS18048 (object possibly undefined)

Narrow with `if (!x) return;` or `??` default

### TS2345 / TS2322 (assignment/argument)

Refine types. NO `as any`/`as unknown as T` as bypass.

### TS7006 (implicit any param)

Add explicit type from context

## Ownership set

ALL `backend/src/**/*.ts` files with errors (no specs unless real behavior change).

Module-specific rules:
- **auth**: never log tokens
- **whatsapp**: preserve idempotency, workspace-scoped sessions
- **checkout**: bigint cents always
- **autopilot**: preserve audit trail, handoff signal
- **payments**: append-only ledger
- **integrations**: never log accessToken/refreshToken

## Constraints

- NO bypass tokens (`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `as any`, `as unknown as T`, `eslint-disable`, `biome-ignore`)
- NO modifying tsconfig flags
- NO modifying protected files (CLAUDE.md, AGENTS.md, ops/*.json, .husky/, .github/workflows/ci-cd.yml)
- NO commits

## Definition of Done

- `cd backend && npx tsc --noEmit 2>&1 | grep -c "error TS"` returns 0
- `npm run build` exits 0
- `npx jest` no regression
- Report per-module count before/after

## Hard stop conditions

- A type fix exposes a real bug — STOP, report P0
- A spec breaks because source semantics change — STOP, report
