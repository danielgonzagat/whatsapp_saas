# Wave H — Coverage of services without specs (rest)

## Mission

Create specs for backend services still without coverage. Many are in inbox, crm, flows, gdpr, health, metrics, pulse, reports, webhooks, compliance, dashboard, anuncios, scrapers, member-area, product-categories, workspaces, media, common.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — relevant section per service
3. `AGENTS.md`

## Discovery

```bash
cd /Users/danielpenin/whatsapp_saas/backend
find src -name "*.service.ts" -not -path "*/__tests__/*" | while read f; do
  spec="${f%.ts}.spec.ts"
  [ ! -f "$spec" ] && echo "$f"
done
```

## Target areas (priority order)

### Coverage-Inbox (3 services)
- `inbox-events`, `omnichannel`, `smart-routing` (omnichannel already covered)

### Coverage-Crm (2 services)
- 1-2 services in crm/

### Coverage-Flows (3 services)
- flows.flow-optimizer, flows.flow-template

### Coverage-Gdpr (2 services)
- gdpr-facebook-callback

### Coverage-Health (2 services)

### Coverage-Metrics (3 services)
- queue-stats, queue-health

### Coverage-Pulse (2 services)
- pulse-artifact

### Coverage-Reports (3 services)
- reports.reports-affiliate, reports.reports

### Coverage-Webhooks (3 services)
- webhook-dispatcher, stripe-webhook-ledger

### Coverage-Compliance (1 service)

### Coverage-Dashboard (1 service)

### Coverage-Anuncios (1 service)

### Coverage-Scrapers (2 services)
- omni-scraper, scrapers

### Coverage-MemberArea (1 service)
- member-area-stats

### Coverage-ProductCategories (1 service)

### Coverage-Workspaces (1 service)

### Coverage-Media (2 services)
- media, video

### Coverage-Common (3 services)
- cache, financial-alert, storage-drivers

## Spec template

Use the established pattern: TestingModule + mocked Prisma + mocked external deps. Each spec ≥3 tests (happy path, tenant-isolation/role guard, error path).

## Ownership set

ONLY `backend/src/**/*.spec.ts` (CREATE new). DO NOT modify the source `.service.ts` files.

## Constraints

- NO bypass tokens
- NO commits
- Mock external services (OpenAI, BullMQ, Stripe, Meta API)

## Definition of Done

- All discovered services without spec now have one
- `npx jest --testPathPatterns="(inbox|crm|flows|gdpr|health|metrics|pulse|reports|webhooks|compliance|dashboard|anuncios|scrapers|member-area|product-categories|workspaces|media|common)/.*spec"` passes
- Report per-area count of new specs + coverage %

## Hard stop conditions

- A service has a real bug discovered while writing spec — STOP, report P0
- A service requires real Redis/DB to test — STOP, report integration gap
