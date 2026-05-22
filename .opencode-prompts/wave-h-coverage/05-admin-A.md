# Wave H / Coverage-ADMIN-A — 5 service specs

## Mission

Create specs for 5 Admin services lacking coverage.

## Services

1. `admin-accounts.service.ts`
2. `admin-kyc.service.ts`
3. `admin-audit.service.ts`
4. `admin-auth.service.ts`
5. `admin-login-attempts.service.ts`

(All under `backend/src/admin/`.)

## Ownership set

For each service: `backend/src/admin/<name>.service.spec.ts` (CREATE).
Do NOT modify the service implementation.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE SEGREDOS + REGRA DE BANCO DE DADOS.
2. `AGENTS.md`.
3. Each target service in full.
4. `backend/src/common/decorators/admin-global-operation.decorator.ts` (created
   by Wave B/1 — reference for admin-global pattern).

## Admin-specific spec rules

- Admin services often operate cross-workspace. Test that callers without
  ADMIN role get ForbiddenException.
- Audit service writes immutable trail — verify entries are NEVER updated
  (only appended).
- KYC service handles sensitive docs — verify NO doc content in logs.
- Login attempts service rate-limits — verify lockout after N failures.

## Spec template

See `.opencode-prompts/wave-h-coverage/01-kloel-A.md`.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/admin/{admin-accounts,admin-kyc,admin-audit,admin-auth,admin-login-attempts}.service.spec.ts
npx jest --testPathPattern="admin/(admin-accounts|admin-kyc|admin-audit|admin-auth|admin-login-attempts)" --coverage
```

Coverage ≥70% lines, ≥65% branches per file.

## Definition of done

- 5 new specs.
- Each covers admin role + tenant-isolation + service-specific invariants.
- No bypass, no `any`, no commits.

## Hard stop conditions

- Audit/login-attempts has bug visible during spec writing (e.g., mutation
  to immutable log) — STOP, report P0.
- Service requires real Redis for rate-limit logic — STOP, report integration.
