# Wave Q / Slice 1 — Strict-Mode DTO Sweep — Checkout

## Mission

Eliminate ALL TypeScript errors under `backend/src/checkout/dto/` caused by the
strict `exactOptionalPropertyTypes: true` compiler flag. Pre-existing branch
HEAD has 1037 total TS errors; this directory has 34 errors (the biggest single
directory). Fixing them does NOT change runtime behavior — it tightens the type
contract so TypeScript catches `undefined` propagation correctly.

## Ownership set

- `backend/src/checkout/dto/**/*.ts` (all DTO files in this dir)
- `backend/src/checkout/dto/__tests__/**/*.spec.ts` (if exist, may need test updates)

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md`.
2. `AGENTS.md`.
3. TypeScript handbook section on `exactOptionalPropertyTypes`:
   https://www.typescriptlang.org/tsconfig#exactOptionalPropertyTypes
4. Every file in `backend/src/checkout/dto/`.

## Baseline measurement

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | grep "src/checkout/dto" | wc -l
# Expected ≈ 34
```

## The exactOptionalPropertyTypes pattern

With this flag on:
- `prop?: string` is exactly `{ prop?: string } | { prop?: undefined }` NOT
  `{ prop: string | undefined }`.
- Passing `{ prop: maybeStr }` where `maybeStr: string | undefined` to
  `{ prop?: string }` FAILS — you'd need to either:
  - Omit `prop` if undefined: `maybeStr === undefined ? {} : { prop: maybeStr }`
  - Explicitly type target with `string | undefined`: `prop?: string | undefined`
  - Use `Prisma`'s `NullableXxxFieldUpdateOperationsInput | null` directly

## Pattern to apply per DTO

### Pattern A — When DTO field maps to Prisma optional field
```ts
// BEFORE
export class CreateCheckoutDto {
  @IsOptional() @IsString() name?: string;  // Prisma: name String?
}
// Service does: await prisma.checkout.create({ data: { ...dto } })
// FAILS: dto.name is `string | undefined`, Prisma expects `string | null`

// AFTER (option 1: omit-when-undefined helper)
const data: Prisma.CheckoutCreateInput = {
  ...(dto.name !== undefined && { name: dto.name }),
};
await prisma.checkout.create({ data });

// AFTER (option 2: DTO is null-friendly)
export class CreateCheckoutDto {
  @IsOptional() @IsString() name: string | null;  // explicit null
}
```

### Pattern B — When DTO field is optional in API but never null in DB
```ts
// BEFORE: export class UpdateCheckoutDto { @IsOptional() planId?: string; }
// Service: prisma.checkout.update({ where: { id }, data: dto })

// AFTER: use partial type or build update object explicitly
const update: Prisma.CheckoutUpdateInput = {};
if (dto.planId !== undefined) update.planId = dto.planId;
await prisma.checkout.update({ where: { id }, data: update });
```

### Pattern C — DTO uses nested object with optional fields
```ts
// BEFORE: nested?: { sub?: string }
// AFTER: nested?: { sub?: string | undefined } OR use Required<...> in service
```

Pick the LEAST disruptive pattern per file. Prefer Pattern A (build object
conditionally) when consumer code is short. Prefer Pattern B (null-friendly
DTO) when consumer code is long or has many call sites.

## Forbidden moves

- Cast to `any` to silence error.
- Add `@ts-ignore` or `@ts-expect-error`.
- Disable strict flag in tsconfig.
- Skip a file because "it's a test fixture."

## Validation gates

```bash
cd backend
# Error count for this dir must be 0
npx tsc --noEmit 2>&1 | grep "error TS" | grep "src/checkout/dto" | wc -l
# Expected: 0

# Whole-repo error count must DROP by ~34 (not increase)
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
# Was 1037; should now be ~1003

# Lint clean
npx eslint src/checkout/dto/**/*.ts

# Existing checkout specs must still pass
npx jest --testPathPattern=checkout
```

## Definition of done

- Zero TS errors in `backend/src/checkout/dto/`.
- Whole-repo TS error count decreases by ≥30 (some errors are downstream of
  the DTO fix and will resolve transitively).
- No new lint errors.
- Checkout module specs still pass.
- No `any`, no bypass tokens, no protected files.
- No commits. CEO commits.

## Hard stop conditions

- If a DTO references a Prisma model that doesn't exist — STOP, report.
- If fixing a DTO requires changing the Prisma schema — STOP, report (schema
  fix separate slice).
- If a fix touches >5 files outside the DTO dir — STOP, report (scope creep).
