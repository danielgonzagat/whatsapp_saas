# Wave H — Coverage missing services (rest)

## Mission

Create `.spec.ts` files for backend services still without coverage. Discovery:

```bash
cd /Users/danielpenin/whatsapp_saas/backend
find src -name "*.service.ts" -not -path "*/__tests__/*" | while read f; do
  spec="${f%.ts}.spec.ts"
  [ ! -f "$spec" ] && echo "$f"
done
```

Cover all services found. Each spec: ≥3 tests (happy path, tenant-isolation, error path).

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — relevant module sections
3. `AGENTS.md`

## Spec template

Use TestingModule + mocked Prisma + mocked external deps. Pattern from previously delivered specs (e.g., `backend/src/admin/compliance/admin-compliance.service.spec.ts`).

## Ownership set

ONLY `backend/src/**/*.spec.ts` (CREATE new). DO NOT modify source `.service.ts` files.

## Constraints

- NO bypass tokens
- NO commits
- Mock external services (OpenAI, BullMQ, Stripe, Meta API)

## Definition of Done

- Each discovered service without spec now has one
- `npx jest --testPathPatterns="<area>/.*spec"` passes
- Coverage ≥70% lines per spec file

## Hard stops

- Service has real bug → STOP, report
- Service needs real Redis/DB → STOP, integration gap
