# Wave Q / Slice 3 — Strict-Mode DTO Sweep — Auth

## Mission

Eliminate ALL TypeScript errors under `backend/src/auth/dto/` caused by
`exactOptionalPropertyTypes: true`. ~17 errors expected.

## Ownership set

- `backend/src/auth/dto/**/*.ts`
- `backend/src/auth/dto/__tests__/**/*.spec.ts` (if present)

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE SEGREDOS section (NO secrets in DTOs).
2. `AGENTS.md`.
3. `.opencode-prompts/wave-q-strict-mode/01-dto-sweep-checkout.md` for pattern.
4. Every file in `backend/src/auth/dto/`.

## Auth-specific rules

- DTOs that carry tokens/passwords/secrets MUST NOT log values in errors.
- LoginDto + SignupDto + ResetPasswordDto deserve extra eslint scrutiny —
  use `@Exclude()` from class-transformer on sensitive fields.

## Pattern

Identical to sibling slice 01-dto-sweep-checkout.md.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | grep "src/auth/dto" | wc -l
# Expected: 0
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
# Should decrease

npx eslint src/auth/dto/**/*.ts
npx jest --testPathPattern=auth
```

## Definition of done

- Zero TS errors in `backend/src/auth/dto/`.
- Whole-repo TS count decreases by ≥15.
- Auth module specs still pass.
- No bypass tokens, no `any`, no logged secrets.
- No commits.

## Forbidden + Hard stop

Same as sibling slice 01.
