# Wave H / Coverage-AUTH-A — 4 service specs

## Mission

Create specs for 4 Auth services lacking coverage.

## Services

1. `auth-oauth-resolver.service.ts`
2. `auth-oauth.service.ts`
3. `auth-partner.service.ts`
4. `auth-verification.service.ts`

(All under `backend/src/auth/`.)

## Ownership set

Per service: spec file `backend/src/auth/<name>.service.spec.ts` (CREATE).
Do NOT modify the service implementation.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE API + REGRA DE SEGREDOS.
2. `AGENTS.md`.
3. Each target service in full.
4. `backend/src/common/testing/prisma-mock.ts` if exists.
5. An existing passing auth spec (e.g., `auth.service.spec.ts`).

## Special rules for Auth specs

- NEVER include real secrets, tokens, or password values in test fixtures.
  Use deterministic stub strings (`'test-token-xxx'`, `'fake-secret'`).
- Test OAuth callback handling: success, state-mismatch, expired-code,
  user-denial.
- Test tenant isolation if the service touches Prisma.
- Test that rate-limit decorators are present and active (mock ThrottlerGuard
  if needed).

## Spec template

See `.opencode-prompts/wave-h-coverage/01-kloel-A.md` for the canonical
template — adapt for Auth concerns:

- Mock OAuth providers (Google, Facebook, magic-link) at the HTTP boundary
  via `nock` or `fetch-mock`.
- Mock JWT signing with a deterministic test secret.
- Mock email sender (if auth-verification sends emails).

## Forbidden moves

- Real network calls (use mocks).
- Real OAuth provider tokens (use stubs).
- Bypass tokens, new `any`.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/auth/{auth-oauth-resolver,auth-oauth,auth-partner,auth-verification}.service.spec.ts
npx jest --testPathPattern="auth/(auth-oauth|auth-partner|auth-verification)" --coverage --collectCoverageFrom="backend/src/auth/{auth-oauth-resolver,auth-oauth,auth-partner,auth-verification}.service.ts"
```

Coverage ≥70% lines, ≥65% branches per file.

## Definition of done

- 4 new `.spec.ts` files.
- Each ≥3 describe blocks, ≥6 it tests.
- Each covers tenant-isolation if Prisma is touched + OAuth provider mocks.
- `npx tsc` no regress.
- `npx eslint` clean on new files.
- No real secrets in tests.
- No bypass, no protected files, no commits.

## Hard stop conditions

- Service requires real OAuth provider (can't be mocked) — STOP, report
  (integration test scope).
- Service requires real JWT secret rotation — STOP, report.
