# Wave H/Coverage-ADMIN — Admin services without spec (~17 new specs)

## Mission

Create `.spec.ts` files for `backend/src/admin/` services that lack coverage. This is the rest of the admin coverage gap (5 specs already exist from Wave H/Coverage-ADMIN-A).

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE SEGREDOS + REGRA DE BANCO DE DADOS + admin-global pattern
3. `AGENTS.md`
4. `backend/src/common/decorators/admin-global-operation.decorator.ts` (reference for the admin-global pattern)

## Discovery

```bash
cd /Users/danielpenin/whatsapp_saas/backend/src/admin
find . -name "*.service.ts" | while read f; do
  spec="${f%.ts}.spec.ts"
  [ ! -f "$spec" ] && echo "$f"
done
```

## Target services (per inventory — 17-19 without spec)

- `admin-chat-session.service.ts`
- `admin-chat.service.ts` (verify — may exist)
- `admin-clients.service.ts`
- `admin-compliance.service.ts`
- `admin-config.service.ts`
- `admin-dashboard.service.ts`
- `destructive-intent.service.ts`
- `admin-marketing.service.ts`
- `admin-notifications.service.ts`
- `admin-products.service.ts`
- `admin-reports.service.ts`
- `admin-sales.service.ts`
- `admin-seed.service.ts`
- `admin-sessions.service.ts`
- `admin-support.service.ts`
- `admin-users.service.ts`
- ... any others discovered

DO NOT re-create specs for `admin-accounts`, `admin-kyc`, `admin-audit`, `admin-auth`, `admin-login-attempts` — already exist (Wave H/Coverage-ADMIN-A).

## Special admin invariants to test

- **Admin role enforcement**: callers without `ADMIN` role get `ForbiddenException`. Test with mocked admin guard.
- **Cross-workspace operations**: admin services often operate cross-workspace; this is INTENTIONAL when decorated with `@AdminGlobalOperation()`. Test that the decorator metadata is present.
- **Audit trail**: admin operations write to `AdminAuditLog` — never UPDATE, always INSERT. Test that `prisma.adminAuditLog.create` was called and `update` was NOT.
- **Destructive intent**: confirm destructive operations require explicit `destructiveIntent: true` flag in input DTO.
- **No PII in logs**: KYC + clients + compliance services handle PII; test that `Logger.log` calls do not contain doc content, ssn, full email, full phone, full card number.

## Spec template

See batch-8/wave-h-coverage-checkout-whatsapp.md for the canonical template.

## Constraints (CLAUDE.md)

- NO bypass tokens
- NO commits — orchestrator commits after Tier-3 validation
- NO modifying protected files
- NO mocking real DB; use mocked Prisma client

## Definition of Done

- All discovered admin services without spec now have one
- ≥3 tests per spec (happy path, role/tenant guard, error path)
- `npx jest --testPathPatterns="admin/" --coverage` exits 0 with ≥70% lines per touched file
- Report per-service coverage %

## Hard stop conditions

- Service implementation has a real bug — STOP, report P0
- Service needs real Redis/Postgres for rate-limit or session logic — STOP, report integration gap
- Discovered destructive-intent missing in a destructive operation — STOP, report security P0
