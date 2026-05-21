# Wave H/Coverage-ADMIN-A FINISH — fix 28 failing tests in 5 admin specs

## Mission

Finalize the partial delivery from batch-4 fleet. Files exist and compile, but 28/106 tests fail. Make all tests pass WITHOUT modifying source code (services), only fix the spec test setups, mocks, and expectations.

## Target files (DO NOT modify the .service.ts, only the .spec.ts)

- `backend/src/admin/accounts/admin-accounts.service.spec.ts`
- `backend/src/admin/accounts/kyc/admin-kyc.service.spec.ts`
- `backend/src/admin/audit/admin-audit.service.spec.ts`
- `backend/src/admin/auth/admin-auth.service.spec.ts`
- `backend/src/admin/auth/admin-login-attempts.service.spec.ts`

## Method

For each spec file:

1. `cd /Users/danielpenin/whatsapp_saas/backend && npx jest src/admin/<path>.spec.ts 2>&1 | tail -50` — see what fails
2. Read the spec file in full
3. Read the corresponding service file in full to understand the actual signatures/return shapes/transaction usage
4. Fix the spec test:
   - Align mock data shapes with what the service actually expects/uses
   - Align expectations with what the service actually returns (NOT what the test author thought)
   - Fix DI tokens (use the actual class as provider token, not string)
   - Fix `$transaction` calls — the prisma `$transaction([...])` returns results of each query, so mock has to chain via `mockResolvedValueOnce` per query in order
   - For audit-trail tests: the service writes UPDATE-only-via-append (no overwrite); test must verify only `create` was called, never `update`
   - For role enforcement: the role enum is `MANAGER` and `STAFF`, NOT `ADMIN`
   - For MFA: when MFA required, login returns `{ mfa_required: true, mfaToken: ... }` not full session
5. Re-run jest; iterate
6. Final: `npx eslint <files>` clean, `npx tsc --noEmit` no NEW errors in these files

## Constraints (CLAUDE.md)

- NO `--no-verify`, NO `@ts-ignore`, NO `@ts-expect-error`, NO `biome-ignore`, NO `nosemgrep`, NO `eslint-disable`
- NO `any` cast as bypass — if you need to type a mock, use `as never as PrismaService` (already in use)
- NO modifying the actual service implementations
- NO modifying protected files (CLAUDE.md, AGENTS.md, ops/*.json, scripts/ops/check-*.mjs, .husky/, .github/workflows/ci-cd.yml, ESLint configs, scripts/pulse/no-hardcoded-reality-audit.ts)
- NO commits — Claude (CEO orchestrator) will commit after Tier-3 validation
- Workspace isolation: admin services are cross-workspace; test guards that non-admin roles get ForbiddenException
- Sensitive: KYC service handles docs; verify NO doc content in any log call

## Definition of Done

- All 106 admin spec tests pass (`npx jest src/admin/admin-accounts.service.spec.ts src/admin/admin-kyc.service.spec.ts src/admin/admin-audit.service.spec.ts src/admin/admin-auth.service.spec.ts src/admin/admin-login-attempts.service.spec.ts` exit 0)
- ESLint clean on the 5 files
- No new tsc errors
- Report which testname:expectation pairs were changed and why (one-line justification each)

## Hard stop conditions

- Service implementation has a real bug (e.g., audit log uses UPDATE not INSERT-only) — STOP, report P0 with file:line citation, do NOT amend spec to mask the bug
- A test needs real Redis or real DB — STOP, report integration gap
