# Wave Q — Backend strict-mode FULL (434 → 0)

## Mission

Eliminate ALL remaining backend TypeScript strict-mode errors. Current baseline: 434 errors.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — relevant module sections
3. `AGENTS.md`

## Method

```bash
cd /Users/danielpenin/whatsapp_saas/backend
npx tsc --noEmit 2>&1 | grep "error TS" | head -50  # see breakdown
```

For each error code, apply the fix recipe:

### TS2375 / TS2379 / TS2412 (exactOptionalPropertyTypes)

Conditional spread at call site:
```ts
// Before: { name: maybeUndef, email: x }
// After:  { ...(maybeUndef !== undefined ? { name: maybeUndef } : {}), email: x }
```

For Prisma `data: { ... }`:
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

Definite assignment `!` or default value or optional `?`:
- DTOs validated by class-validator: `name!: string;` (validation guarantees presence)
- Service properties: initialize in constructor
- Optional fields: `name?: string`

### TS2532 / TS18048 (object possibly undefined)

Narrow with `if`:
```ts
if (!x) return;
use(x.foo); // safe
```

### TS2345 / TS2322

Refine types. NO `as any`/`as unknown as T` as bypass.

### TS7006 (implicit any)

Add explicit type from context.

## Ownership set

ALL `backend/src/**/*.ts` (excluding `.spec.ts` — don't touch tests unless a real behavior change is needed).

Module-specific rules:
- **auth**: never log tokens; preserve JWT verification
- **whatsapp**: preserve idempotency, workspace-scoped sessions
- **checkout**: bigint cents always
- **autopilot**: preserve audit trail, handoff signal
- **payments**: append-only ledger, idempotency on webhooks
- **integrations**: never log accessToken/refreshToken (only first-4 + last-4 masked)

## Constraints

- NO bypass tokens (`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`, `biome-ignore`, `nosemgrep`, `as any`, `as unknown as T`)
- NO modifying tsconfig flags
- NO modifying protected files
- NO commits — orchestrator commits

## Definition of Done

- `cd backend && npx tsc --noEmit 2>&1 | grep -c "error TS"` returns 0
- `npx eslint src` on touched files — no NEW errors
- `npx jest` (full suite) no regression
- Report: per-module count before/after

## Hard stop conditions

- A type fix exposes a real bug — STOP, report P0 with file:line
- A spec breaks because source semantics change — STOP, report
