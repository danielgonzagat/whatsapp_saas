# Wave Q/7 — Backend strict-mode kloel (~60 errors)

## Mission

Eliminate all TypeScript strict-mode errors in `backend/src/kloel/` files. After this, `npx tsc --noEmit | grep "src/kloel"` must return 0.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE BANCO DE DADOS, REGRA DE API, REGRA DE QUALIDADE DE IA, REGRA DE NÃO-INVENÇÃO
3. `AGENTS.md`
4. Each target file in full before editing

## Target files (highest tsc-error count, NOT specs)

```bash
cd /Users/danielpenin/whatsapp_saas/backend
npx tsc --noEmit 2>&1 | grep "src/kloel/" | grep -v "spec.ts" | awk -F'(' '{print $1}' | sort | uniq -c | sort -rn | head -15
```

Expected top: kloel-thinker.helpers.ts, unified-agent-response.service.ts, smart-payment.service.ts, payment.service.ts, kloel-thinker-think.helpers.ts, unified-agent-actions-crm.helpers.ts, kloel-thinker-build-system.helpers.ts.

Ownership: ALL `backend/src/kloel/**.ts` (excluding `.spec.ts` unless a spec amendment is needed for a real behavior change).

## Method per error type

### TS2375/TS2379 (exactOptional)

Conditional spread:
```ts
// Before: { name: maybeUndef, email: x }
// After:  { ...(maybeUndef !== undefined ? { name: maybeUndef } : {}), email: x }
```

For Prisma `data: { ... }`: do NOT pass `field: undefined`. Use:
```ts
await prisma.contact.update({
  where: { id },
  data: {
    ...(name !== undefined ? { name } : {}),
    ...(email !== undefined ? { email } : {}),
  },
});
```

### TS2564 (no initializer)

DTO fields: `name!: string;` with `!` definite-assignment + ensure class-validator decorator covers it.
Service properties: initialize in constructor.

### TS2532 / TS18048 (object possibly undefined)

Narrow with `if`:
```ts
if (!x) return;
use(x.foo); // safe now
```

### TS2345 / TS2322 (assignment/argument)

Refine types at boundary. Do NOT widen function signatures to `any` — read the actual call/declaration sites.

### TS7006 (implicit any param)

Add explicit type from context.

## Constraints

- NO bypass tokens (`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `as any`, `eslint-disable`, `biome-ignore`)
- NO commits — orchestrator commits after Tier-3 validation
- NO modifying protected files
- Preserve service behavior — types only

## Special — kloel module domain

- IA-quality: do NOT remove guardrails (intent validation, budget gates, handoff signals)
- Workspace isolation: every Prisma query must filter by workspaceId (preserve, don't remove)
- LLM response parsing: maintain schema validation
- AI speech rules from `CLAUDE.md`: no inventing of product/price/deadline

## Definition of Done

- `cd backend && npx tsc --noEmit 2>&1 | grep "src/kloel/" | wc -l` returns 0
- `npx jest --testPathPatterns="kloel/"` no regression on existing specs
- ESLint clean on touched files
- Report: per-file errors fixed, list of any tests amended

## Hard stop conditions

- Service implementation needs a real bug fix discovered via strict mode — STOP, report P0 with file:line
- A type narrowing requires changing a contract used by 10+ callers across modules — STOP, report
- Encountered missing import that suggests a delete-restore needed — STOP, report
