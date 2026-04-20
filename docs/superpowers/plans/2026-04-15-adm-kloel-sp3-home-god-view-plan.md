# adm.kloel.com — SP-3 — Home God View — Implementation Plan

**Plan ID:** SP-3 plan **Spec:**
[2026-04-15-adm-kloel-sp3-home-god-view-design.md](../specs/2026-04-15-adm-kloel-sp3-home-god-view-design.md)
**Branch (planned):** `feat/adm-sp3-home-god-view` **Date:** 2026-04-15

## Step 1 — Range helper + period DTO

**What.** Create `backend/src/admin/dashboard/range.util.ts` with
`resolveAdminHomeRange(period,
from?, to?, compareTo?)` that returns a canonical `{ from, to, previousFrom,
previousTo }` object.
Create `list-home.dto.ts` with enum-validated query params.

**Verify.** Unit tests for 6 period codes (TODAY/7D/30D/90D/12M/CUSTOM) plus the
two compareTo modes
(PREVIOUS/YOY). Edge cases: month boundary, year boundary, DST.

## Step 2 — Per-KPI queries

**What.** Create `queries/gmv.query.ts` , `approval-rate.query.ts` ,
`producers.query.ts` ,
`breakdowns.query.ts` , `series.query.ts` . Each is a pure function taking
`(prisma, from, to)` and
returning the shaped KPI. No side effects, no audit writes, no NestJS deps.

**Verify.** Each query has a `.spec.ts` with seeded data (use `prisma-mock` or a
test DB via
Docker). Assert empty-state (zero rows) returns zeros, not nulls or throws.

## Step 3 — AdminDashboardService + controller

**What.** `admin-dashboard.service.ts` composes the per-KPI queries into the
full response shape.
`admin-dashboard.controller.ts` exposes `GET /admin/dashboard/home` with
`@RequireAdminPermission(AdminModule.HOME, AdminAction.VIEW)`.

**Verify.** Integration test via Nest testing module: fake auth guard, fake
prisma, assert the
endpoint returns the contract shape. Permission probe: STAFF can view, non-admin
rejected.

## Step 4 — Wire module into AdminModule

**What.** `admin-dashboard.module.ts` imports PrismaModule + AdminAuthModule +
AdminPermissionsModule. Register it in `admin.module.ts` alongside
AdminAuthModule,
AdminUsersModule, etc.

**Verify.** `backend && npm run build` green. Nest boot smoke shows `Mapped
{/admin/dashboard/home,
GET}`.

## Step 5 — Backend unit + integration tests green

**Verify.** `cd backend && npm run lint && npm run typecheck && npm test` all
green. Permission
matrix unchanged. Boot smoke passes.

## Step 6 — Frontend-admin: install recharts

**What.** Add `recharts@^3.8.1` + `date-fns@^4.1.0` (already in frontend/ at
those versions). Run
`npm install` in frontend-admin.

**Verify.** `npm run build` still green after dep add.

## Step 7 — Frontend-admin API client for dashboard

**What.** `lib/api/admin-dashboard-api.ts` with
`adminDashboardApi.home(filters)` calling `GET
/admin/dashboard/home`.

**Verify.** Unit test with a fake fetch.

## Step 8 — UI primitives: stat-card, metric-number, chart-container

**What.** Three new primitive components in `components/ui/`:

- `MetricNumber` — uses JetBrains Mono via `font-mono` class, accepts a number
  or `null` (renders
  `—`), optional currency BRL format.
- `StatCard` — wraps Card with label/value/delta pill.
- `ChartContainer` — border + title + responsive wrapper for recharts.

**Verify.** Each has a minimal unit test (snapshot or React Testing Library
render).

## Step 9 — Period filter component

**What.** `components/admin/god-view/period-filter.tsx` — toggle pill group
(Hoje / 7d / 30d / 90d /
12m / Custom). URL query string persistence (`?period=30d`).

**Verify.** Manual click-through exercises all periods.

## Step 10 — GMV chart (line) + gateway donut

**What.** `gmv-chart.tsx` using recharts LineChart. `gateway-donut.tsx` using
recharts PieChart.
Both consume the breakdown data from the API response.

**Verify.** Empty state: passing `series: []` renders a centered `—`
placeholder, not a blank chart
area.

## Step 11 — Rewrite `(admin)/page.tsx`

**What.** Replace the current SP status-card grid with:

- Top strip: greeting (kept from SP-2) + period filter
- KPI grid: 9–12 StatCard components fed from the dashboard API
- Charts row: GMV line + gateway donut + methods donut
- Empty placeholder below ("Novos KPIs e cohorts chegam em SP-3b/SP-10")

Uses SWR with 60s refreshInterval for near-realtime.

**Verify.** Mount against a local backend (empty DB) → see zeros + `—` for
unavailable KPIs, no
crash, no fake data.

## Step 12 — Frontend-admin tests + build

**Verify.** `npm run build && npm run typecheck && npm run lint && npm test` all
green.

## Step 13 — Token parity + visual contract

**Verify.** `node scripts/ops/check-admin-token-parity.mjs` green.

## Step 14 — PULSE + commit + PR

**What.** Commit in logical chunks (backend dashboard, frontend god view), push
branch
`feat/adm-sp3-home-god-view`, open PR with a screenshot of the empty-DB state.

**Verify.** CI green (architecture, quality, validate). If the same
shallow-clone preflight issue
recurs, it's already fixed in main via SP-0..2.

## Step 15 — Manual deploy kloel-admin

**What.** After merge to main, Vercel auto-deploy production. Daniel verifies
via `adm.kloel.com`
(once CNAME propagates).

**Verify.** Production smoke: log in, land on God View, confirm all zeros
rendered with honest-empty
KPIs. Record in VALIDATION_LOG.md.

## Step 16 — Mark SP-3 complete, proceed to SP-4

**What.** TaskUpdate #5 (new task) to completed. Start SP-4 (Contas + KYC queue)
spec in the same
session or the next.

## Review checkpoints

- **Checkpoint A** (after Step 5): backend green. Admin API contract stable.
- **Checkpoint B** (after Step 12): frontend green locally.
- **Checkpoint C** (after Step 14): PR open, CI green.
- **Checkpoint D** (after Step 15): production smoke green.
