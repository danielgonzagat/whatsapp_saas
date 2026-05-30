# Analytics & Reports — workspace KPIs, sales reports, and engagement insight

The product capability: turn a workspace's raw operational data (messages, contacts,
flows, sales, subscriptions, ad spend) into **aggregated read-only dashboards and
sales/financial reports** the user sees on the `/analytics` page. No data is written
here except two append-only side effects (ad-spend entries and NPS survey responses).

> WAHA is intentionally excluded from this territory (deprecated channel layer —
> see `docs/adr/0001-whatsapp-source-of-truth.md`). Not a gap.

---

## What the user does

1. Opens **`/analytics`** (legacy alias **`/metrics`** redirects here —
   `frontend/src/app/(main)/metrics/page.tsx`).
2. Sees a pill row of report tabs (**Operacoes / Abandonos / Assinaturas / Estornos**)
   and a date-range filter + export button in the header.
3. Each tab shows real aggregated tables and charts: sales volume, abandoned carts,
   recurring subscriptions, refunds — all scoped to their workspace and date range.
4. Can export the active tab to CSV, e-mail a sales summary, and submit/read NPS.

There are **two surfaces**:
- **`/analytics/*`** routes → dashboard-style KPI aggregations (stats, daily activity,
  advanced cohort/funnel, smart-time heatmap, full report, AI report).
- **`/reports/*`** routes → granular paginated sales/financial reports (the tab data).

---

## End-to-end flow (real paths)

### A. Report tab (e.g. "Operacoes" / vendas) — the main user path
```
UI tab  frontend/src/app/(main)/analytics/tabs/VendasTab.tsx
  → hook  frontend/src/app/(main)/analytics/use-report.ts            (useReport<T>)
  → url   frontend/src/app/(main)/analytics/analytics.helpers.ts     (buildUrl → /reports/vendas?…)
  → fetch frontend/src/lib/fetcher.ts (swrFetcher → apiFetch, frontend/src/lib/api/core.ts)
          NO Next proxy route — apiFetch hits the Nest backend directly with the JWT.
  → ctrl  backend/src/reports/reports.controller.ts  @Get('vendas') getVendas()
  → svc   backend/src/reports/reports.service.ts     getVendas()  (facade)
  → svc   backend/src/reports/reports-orders.service.ts  ReportsOrdersService.getVendas()
  → prisma prisma.checkoutOrder.findMany / .count   (model CheckoutOrder)
  → DB    table "RAC_CheckoutOrder"
  → resp  { data: CheckoutOrder[], total, page }
  → UI    states: loading (NeuroPulse) / empty ("Nenhuma operacao no periodo") / table rows
```

### B. Dashboard / KPI aggregation (used by EngajamentoTab + dashboard widgets)
```
UI       frontend/src/app/(main)/analytics/tabs/EngajamentoTab.tsx
  → hook  frontend/src/hooks/useReports.ts  (useReports / useAnalyticsStats / useSmartTime)
  → fetch swrFetcher → apiFetch → backend directly
  → ctrl  backend/src/analytics/analytics.controller.ts
            @Get('stats')      getStats()      → AnalyticsService.getDashboardStats()
            @Get('reports')    getFullReport() → AnalyticsService.getFullReport()
            @Get('smart-time') getSmartTime()  → SmartTimeService.getBestTime()
            @Get('advanced')   getAdvanced()   → AdvancedAnalyticsService.getAdvancedDashboard()
  → svc   backend/src/analytics/analytics.service.ts (+ analytics.helpers.ts, analytics.service.helpers.ts)
  → prisma message / contact / flowExecution / kloelSale / kloelLead / kloelWallet / conversation
  → DB    "RAC_Message", "RAC_Contact", "RAC_FlowExecution", "RAC_KloelSale", "RAC_KloelLead", …
  → resp  KPI object (cache-wrapped 120s for stats; see CacheService)
  → UI    MetricCards, sentiment/lead-score bars, smart-time heatmap, EmptyState fallbacks
```

### C. Side-effect endpoints (the only writes in this territory)
- `POST /reports/ad-spend` → `ReportsService.registerAdSpend()` → `prisma.adSpend.create`
  (dedup-guarded by platform+date+campaign+amount) → `RAC_AdSpend`.
- `POST /reports/send-email` → `ReportsController.sendReportEmail()` → builds a sales
  summary then `EmailService.sendEmail()` with the `report-summary` template.
- `POST /reports/nps` → writes an `auditLog` row `action:'nps_response'` (`RAC_AuditLog`);
  `GET /reports/nps` reads them back and computes NPS in the controller.

---

## Canonical vocabulary

| Concept | Canonical name | Where | Notes / aliases |
|---|---|---|---|
| Workspace KPI dashboard | **AnalyticsService** | `analytics/analytics.service.ts` | capability alias `AnalyticsService.get(workspaceId)` → `getDashboardStats` (for `KloelDomainServiceResolver`) |
| Cohort/funnel/agent/queue dashboard | **AdvancedAnalyticsService** | `analytics/advanced-analytics.service.ts` | composes AgentPerformance + QueueStats |
| Per-agent response-time KPIs | **AgentPerformanceService** | `analytics/agent-performance.service.ts` | real INBOUND→OUTBOUND pairing, <24h cap |
| Inbox queue backlog projection | **QueueStatsService** | `analytics/queue-stats.service.ts` | counts OPEN + unassigned conversations per queue |
| Best-send-time inference | **SmartTimeService** | `analytics/smart-time/smart-time.service.ts` | 30-day INBOUND histogram → heatmap |
| Report facade | **ReportsService** | `reports/reports.service.ts` | delegates to orders + affiliate; owns churn / assinaturas / ad-spend / metricas |
| Order & payment reports | **ReportsOrdersService** | `reports/reports-orders.service.ts` | vendas, afterpay, abandonos, recusa, origem, estornos, chargeback |
| Affiliate/product reports | **ReportsAffiliateService** | `reports/reports-affiliate.service.ts` | afiliados, indicadores, indicadores-produto |
| Admin sales overview/export | **AdminReportsService** | `admin/reports/admin-reports.service.ts` | separate admin surface (`/admin/reports/*`, admin-permission gated) |

Domain term mapping (PT-BR UI → English model): operacoes/vendas = sales orders,
abandonos = pending/abandoned checkouts, estornos = refunds, recusa = declined
payments, assinaturas = subscriptions, afiliados = affiliate partners.

Lingering duplication to be aware of: there are **two report stacks** — the live HTTP
stack above, and a separate capability-registry `ReportService` referenced by
`docs/architecture/CAPABILITY_MAP.md` (`backend/src/kloel/report.service.ts`, tier-10)
marked `UNGATED (method missing)`. The two are not unified; the HTTP `/reports/*` stack
is the one the frontend actually calls.

---

## Key services & single responsibility

- **AnalyticsService** — dashboard stats, daily activity, single-flow stats, the
  `/analytics/reports` full report, and the `/analytics/reports/ai` AI report.
- **AdvancedAnalyticsService** — the `/analytics/advanced` combined sales+inbox+funnel+
  agents+queues dashboard for a date range.
- **AgentPerformanceService** — message count + real average response time per agent.
- **QueueStatsService** — waiting (OPEN, unassigned) conversation count per inbox queue.
- **SmartTimeService** — best hours/days + normalized engagement heatmap from inbound msgs.
- **ReportsService** — thin facade; directly owns churn, assinaturas, ad-spend, metricas.
- **ReportsOrdersService** — all CheckoutOrder/CheckoutPayment-based reports.
- **ReportsAffiliateService** — affiliate-partner and per-product reports.
- **AdminReportsService** — admin-only sales overview snapshot + CSV export (audited).

Pure helpers (no DB): `analytics.helpers.ts` (window/KPI math),
`analytics.service.helpers.ts` (in-JS aggregation), `reports/reports-orders.helpers.ts`
(date range, pagination, status/method coercion).

---

## Data & events

**Prisma models read (this territory owns none — all are read-only aggregations):**
`Message` (RAC_Message), `Contact` (RAC_Contact), `FlowExecution` (RAC_FlowExecution),
`Flow` (RAC_Flow), `Conversation` (RAC_Conversation), `Queue` (RAC_Queue),
`KloelSale` (RAC_KloelSale — `amount: Float`, `status` lowercase `paid|pending|refunded|…`),
`KloelLead` (RAC_KloelLead), `KloelWallet` (RAC_KloelWallet),
`CheckoutOrder` (RAC_CheckoutOrder — money in `totalInCents: Int`),
`CheckoutPayment` (RAC_CheckoutPayment), `CustomerSubscription` (RAC_CustomerSubscription),
`AffiliatePartner` (RAC_AffiliatePartner), `Product`/`CheckoutProductPlan`.

**Prisma models written (append-only side effects):**
`AdSpend` (RAC_AdSpend, `amount: Int` centavos), `AuditLog` (RAC_AuditLog — NPS responses),
plus `AdminAuditLog` (admin_audit_logs) for admin CSV exports.

**Events:** none. AsyncAPI returns 0 events for this domain — analytics is read-only
projection, it neither emits nor consumes domain events.

---

## Workspace isolation

Every query is workspace-scoped:
- `/analytics/*` controller uses `@UseGuards(JwtAuthGuard, WorkspaceGuard)` and resolves
  the id via `resolveWorkspaceId(req, workspaceId)` / `req.user.workspaceId`.
- `/reports/*` controller uses `@UseGuards(JwtAuthGuard)` and `this.ws(req)` =
  `req.user?.workspaceId`; every Prisma `where` includes `workspaceId` (many even repeat
  `{ ...where, workspaceId }` defensively). Payment-side reports scope via the relation
  `order: { workspaceId }`.
- Raw SQL queries (`$queryRaw`) bind `workspaceId` as a parameter (no interpolation).
- `/admin/reports/*` is a separate admin plane gated by `AdminAuthGuard` +
  `AdminPermissionGuard` (`RELATORIOS` module permission); it intentionally spans
  workspaces for platform operators.

---

## Honest status

**Works end-to-end (real DB aggregation, tested):**
- `/reports/vendas`, `vendas/summary`, `vendas/daily`, `afterpay`, `abandonos`, `recusa`,
  `origem`, `estornos`, `chargeback` — real CheckoutOrder/CheckoutPayment queries with
  pagination + workspace scoping. The 4 visible tabs (vendas/abandonos/assinaturas/estornos)
  are fully wired UI→API→DB→UI with loading/empty states.
- `/analytics/stats`, `/dashboard`, `/activity`, `/flow/:id`, `/advanced`, `/smart-time`,
  `/reports`, `/reports/ai` — real Prisma aggregations; AgentPerformance computes genuine
  response times by pairing inbound/outbound messages.
- Side effects: ad-spend (dedup-guarded), NPS (auditLog), e-mail summary, admin CSV export
  (audit-logged). Spec files exist for every service (`*.service.spec.ts`); the analytics
  jest suite exits 0.

**Facade / unreachable / unproven (gaps):**
1. **~12 report tabs are UNREACHABLE from the UI.** `page.tsx` `TABS` only lists 4 pills,
   and `use-analytics-filters.ts:VISIBLE_REPORT_TABS` + `page.tsx`'s `router.replace` force
   any other `?tab=` back to `vendas`. The other 12 tab components (churn, afterpay, recusa,
   origem, metricas, chargeback, afiliados, indicadores, ind_prod, satisfacao, envio,
   engajamento) are rendered conditionally but can never become `active`. Their backends are
   real and tested — only the navigation gate hides them. This is the headline "unreachable
   analytics tabs" finding.
2. **Churn monthly raw query is broken.** `reports.service.ts` `getChurn` queries
   `FROM "CustomerSubscription"` but the real table is `RAC_CustomerSubscription` (verified
   against live DB). The `$queryRaw` throws, is swallowed by try/catch, and `monthly` silently
   returns `[]`. `total`/`data` still work (they use the typed client).
3. **`engajamento` export → 404.** `analytics.helpers.ts:EXPORT_ENDPOINT_MAP` maps
   `engajamento → 'engajamento'` but no `/reports/engajamento` backend route exists. Harmless
   today only because the tab is unreachable (gap #1).
4. **`adSpend` hard-coded to 0 in the full report.** `analytics.service.ts:getFullReport`
   sets `const adSpend = 0`, so the report's ROAS is always `null` even though real ad-spend
   rows exist in `RAC_AdSpend`. Honest-zero, but disconnected from real data.
5. **AI report half-null.** `getAIReport` returns real `messagesProcessed`,
   `activeConversations`, `productsLoaded`, `avgResponseTime`, but `resolutionRate`,
   `autonomousSales`, `followupsSent`, `objectionsHandled`, `csat` are hard `null`
   (honest placeholders, not yet computed).
6. **Stale doc:** `CAPABILITY_MAP.md` lists `AnalyticsService.get` as "UNGATED (method
   missing)" — the method now exists (`analytics.service.ts:50`).

PULSE: `pulse_health_by_module` had no pre-scanned artifact for analytics this run; the
`/analytics` route is NOT in the stub inventory (real logic), while `/metrics` is an
intentional redirect alias.

---

## Start here (newcomer reading order)

1. `backend/src/reports/reports-orders.service.ts` — the real, representative report
   queries (vendas/abandonos/estornos): see how filters → Prisma `where` → paginated result.
2. `frontend/src/app/(main)/analytics/page.tsx` + `use-analytics-filters.ts` — how tabs are
   rendered and why only 4 are reachable (gap #1).
3. `backend/src/analytics/analytics.service.ts` + `analytics.helpers.ts` — the dashboard/full
   report aggregation and KPI math.
