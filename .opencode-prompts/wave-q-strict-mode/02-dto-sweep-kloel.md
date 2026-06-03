# Wave Q / Slice 2 — Strict-Mode DTO Sweep — Kloel

## Mission

Eliminate ALL TypeScript errors under `backend/src/kloel/dto/` caused by
`exactOptionalPropertyTypes: true`. ~17 errors expected.

## Ownership set

- `backend/src/kloel/dto/**/*.ts`
- `backend/src/kloel/dto/__tests__/**/*.spec.ts` (if present)

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md`.
2. `AGENTS.md`.
3. `.opencode-prompts/wave-q-strict-mode/01-dto-sweep-checkout.md` (sibling
   slice — same pattern, this slice follows identical strategy).
4. Every file in `backend/src/kloel/dto/`.

## Baseline measurement

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | grep "src/kloel/dto" | wc -l
```

## Pattern

Identical to sibling slice 01-dto-sweep-checkout.md (Patterns A, B, C —
omit-when-undefined / null-friendly DTO / explicit undefined in nested).

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | grep "src/kloel/dto" | wc -l
# Expected: 0

npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
# Should decrease vs before

npx eslint src/kloel/dto/**/*.ts
npx jest --testPathPattern=kloel
```

## Definition of done

- Zero TS errors in `backend/src/kloel/dto/`.
- Whole-repo TS count decreases by ≥15.
- Kloel module specs still pass.
- No `any`, no bypass tokens.
- No commits.

## Forbidden + Hard stop

Same as sibling slice 01.
