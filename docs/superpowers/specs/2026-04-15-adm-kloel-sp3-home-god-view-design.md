# adm.kloel.com — SP-3 — Home God View Dashboard

**Spec ID:** SP-3
**Date:** 2026-04-15
**Branch (planned):** `feat/adm-sp3-home-god-view`
**Status:** Draft — written during SP-0..2 CI wait. Will be executed after SP-0..2 merges.

## 1. Purpose

Replace the current honest-placeholder Home page in `adm.kloel.com` (SP-2 landed a greeting + SP status cards) with the **God View Dashboard**: the screen that a Kloel operator opens every morning to understand the platform's commercial health.

## 2. Scope

### In scope

- New backend endpoint: `GET /admin/dashboard/home?from=...&to=...&compareTo=...`
- New backend service: `AdminDashboardService` that aggregates **global** (not per-workspace) data across all existing Prisma models.
- Rewrite of `frontend-admin/src/app/(admin)/page.tsx` to render KPI cards + charts, keeping the SP-2 greeting.
- Small visual primitives added to `frontend-admin/src/components/ui/`: `stat-card`, `chart-container`, `metric-number` (monospace digits per CLAUDE.md).
- Period filter (Hoje / 7d / 30d / 90d / 12m / Custom) + compare-to-previous period toggle.
- Visual parity with the sales/reports pattern in `frontend/` (same typography, same card borders, same chart palette).
- Unit tests on aggregation helpers + permission matrix probe for `HOME.VIEW`.
- Honest empty states: any KPI backed by a model that has no data for the period shows `—` with a tooltip `"Sem dados para o período"`. Never fake numbers. Never `Math.random`.

### Out of scope (deferred)

- Revenue Kloel in R$ — requires platform fee configuration (SP-9/SP-11). The KPI card renders `—` with a tooltip linking to SP-9.
- Cohort table — needs producer onboarding timestamps that are partially available. Deferred to SP-3b or SP-10.
- Chargebacks amount breakdown by merchant category — depends on chargeback workflow (SP-7).
- WebSocket live updates — we poll every 60s via SWR `refreshInterval`.
- Saved filter presets — the period filter is ephemeral (stored in URL query string, not persisted).

## 3. KPI catalog

Each KPI has: a label, source query, honest-empty policy, variation vs previous period.

### 3.1 Real-data KPIs (ship in SP-3)

| KPI                                 | Source                   | Query (high level)                                                                               | Empty policy                    |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------- |
| **GMV Total**                       | `CheckoutOrder`          | `sum(totalInCents) where status IN ('PAID','SHIPPED','DELIVERED') AND paidAt BETWEEN [from, to]` | `R$ 0,00` (real zero, not dash) |
| **Transações aprovadas (qty)**      | `CheckoutOrder`          | `count where status IN ('PAID','SHIPPED','DELIVERED') AND paidAt BETWEEN ...`                    | `0`                             |
| **Transações recusadas**            | `CheckoutPayment`        | `count where status='DECLINED' AND updatedAt BETWEEN ...`                                        | `0`                             |
| **Transações pendentes**            | `CheckoutOrder`          | `count where status IN ('PENDING','PROCESSING')`                                                 | `0`                             |
| **Taxa de aprovação**               | derived                  | `approved / (approved + declined)` as %                                                          | `—` when denominator is 0       |
| **Reembolsos (qty e R$)**           | `CheckoutOrder`          | `count + sum(totalInCents) where status='REFUNDED' AND refundedAt BETWEEN ...`                   | `0`                             |
| **Chargebacks (qty e R$)**          | `CheckoutOrder`          | `count + sum(totalInCents) where status='CHARGEBACK'`                                            | `0`                             |
| **Ticket médio**                    | derived                  | `gmv / approved_count`                                                                           | `—` when denominator is 0       |
| **Produtores ativos (30d rolling)** | `CheckoutOrder` distinct | `distinct workspaceId in last 30d` (rolling, independent of filter)                              | `0`                             |
| **Novos produtores (no período)**   | `Workspace`              | `count where createdAt BETWEEN ...`                                                              | `0`                             |
| **Total de produtores**             | `Workspace`              | `count()`                                                                                        | `0`                             |
| **Volume por gateway**              | `CheckoutPayment`        | `sum(totalInCents) group by gateway` where joined order is `PAID`                                | `0` per gateway                 |
| **Volume por método**               | `CheckoutOrder`          | `sum(totalInCents) group by paymentMethod` where `PAID`                                          | `0` per method                  |

### 3.2 Honest-empty KPIs (render with explanatory tooltip)

| KPI                            | Reason it is empty                                                                                                           | Lands in                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Revenue Kloel (R$)**         | No platform-fee table; can't compute without SP-9 config                                                                     | SP-3 card shows `—` and tooltip "Configurar taxas em SP-11" |
| **MRR projetado**              | Requires `Subscription` rollup with a clear recurring-vs-one-shot distinction; needs SP-9/SP-11                              | `—`                                                         |
| **Churn de produtores**        | Needs definition of "active" vs "dormant" vs "churned" — deferred to SP-3b when we discuss the cohort definition with Daniel | `—`                                                         |
| **Custo de infra por serviço** | Lives in Railway/Vercel billing, no local model                                                                              | `—`                                                         |

## 4. API contract

```
GET /admin/dashboard/home?period=TODAY|7D|30D|90D|12M|CUSTOM&from=ISO&to=ISO&compareTo=PREVIOUS|YOY

200 OK application/json
{
  "range": { "from": "2026-04-01T00:00:00Z", "to": "2026-04-15T23:59:59Z", "label": "Últimos 15 dias" },
  "compare": { "from": "...", "to": "..." } | null,
  "kpis": {
    "gmv": { "value": 123456700, "currency": "BRL", "previous": 98765400, "deltaPct": 24.9 },
    "approvedCount": { "value": 127, "previous": 100, "deltaPct": 27 },
    "declinedCount": { "value": 8, "previous": 5, "deltaPct": 60 },
    "pendingCount": { "value": 3, "previous": 7, "deltaPct": -57.1 },
    "approvalRate": { "value": 0.9407, "previous": 0.9524, "deltaPct": -1.2 },
    "refundCount": { "value": 2, "refundAmount": 19800, "previous": 1, "deltaPct": 100 },
    "chargebackCount": { "value": 0, "chargebackAmount": 0, "previous": 1, "deltaPct": -100 },
    "averageTicket": { "value": 97215, "previous": 98765, "deltaPct": -1.6 },
    "activeProducers": { "value": 42, "windowDays": 30 },
    "newProducers": { "value": 5, "previous": 3, "deltaPct": 66.7 },
    "totalProducers": { "value": 188 },
    "revenueKloel": { "value": null, "unavailableReason": "platform_fee_not_configured" },
    "mrrProjected": { "value": null, "unavailableReason": "subscription_aggregation_not_ready" },
    "churnRate": { "value": null, "unavailableReason": "cohort_definition_pending" }
  },
  "breakdowns": {
    "byGateway": [ { "gateway": "legacy-payment", "gmvInCents": 98765400 }, ... ],
    "byMethod": [ { "method": "PIX", "gmvInCents": 73400000, "count": 84 }, ... ]
  },
  "series": {
    "gmvDaily": [ { "date": "2026-04-01", "gmvInCents": 5000000 }, ... ]
  }
}
```

All monetary values are integers in cents (Brazilian centavos). The frontend is responsible for formatting to `R$`.

Guarded by `AdminAuthGuard + AdminPermissionGuard` with `@RequireAdminPermission(AdminModule.HOME, AdminAction.VIEW)`.

## 5. Backend structure

```
backend/src/admin/dashboard/
  admin-dashboard.module.ts
  admin-dashboard.controller.ts        // GET /admin/dashboard/home
  admin-dashboard.service.ts           // facade delegating to per-KPI helpers
  queries/
    gmv.query.ts                       // pure function: (from,to) => sum
    approval-rate.query.ts
    producers.query.ts
    breakdowns.query.ts
    series.query.ts
  range.util.ts                        // period resolver (TODAY/7D/30D/...) + previous/YoY
  dto/
    list-home.dto.ts                   // query DTO with @IsEnum(HomePeriod)
  admin-dashboard.service.spec.ts      // unit tests with seeded Prisma test client
```

Tests:

- `range.util.spec.ts` — period resolver handles edge cases (DST, month boundaries, leap years).
- `gmv.query.spec.ts` — seeded data, assert sums per status, assert zero on no-data.
- `approval-rate.spec.ts` — denominator zero handling.
- `admin-dashboard.service.spec.ts` — full endpoint shape snapshot.

## 6. Frontend structure

```
frontend-admin/src/app/(admin)/page.tsx   // rewritten
frontend-admin/src/components/ui/stat-card.tsx
frontend-admin/src/components/ui/chart-container.tsx
frontend-admin/src/components/ui/metric-number.tsx
frontend-admin/src/components/admin/god-view/period-filter.tsx
frontend-admin/src/components/admin/god-view/gmv-chart.tsx
frontend-admin/src/components/admin/god-view/gateway-donut.tsx
frontend-admin/src/lib/api/admin-dashboard-api.ts
```

New deps: `recharts@^3.8.1` (same version as frontend/). Also `date-fns` for Portuguese locale.

Visual rules (inherited from CLAUDE.md `KLOEL_VISUAL_DESIGN_CONTRACT`):

- Monospace digits everywhere (`font-mono` + Ember accent for the primary KPI)
- No gradients, no drop shadows beyond `border-border`
- Empty-state KPIs render `—` in muted color + info icon opening a tooltip
- Variation arrow: up = ember, down = muted (not red/green — not the Kloel palette)
- Animated counter on mount (framer-motion, 600ms ease-out)

## 7. Definition of done

1. Backend build/lint/typecheck/test green. Boot smoke resolves DI.
2. Frontend-admin build/lint/typecheck/test green.
3. Endpoint responds correctly to all period values including CUSTOM.
4. Empty-state policy validated: on a fresh test DB, the response is 200 OK with zeros and `null`s, never an error.
5. Permission matrix probe: STAFF can GET home, STAFF cannot POST anything (there are no POSTs, but the gate still ratifies).
6. Visual contract check still green (design tokens identity preserved).
7. No new `any` / `ts-ignore` / new-file-too-big violations in the architecture gate.
8. PR opened with screenshot of the God View rendered against an empty local DB (all zeros + honest empty states).

## 8. Open questions flagged for Daniel (to answer during execution)

- **Q1: Active producer definition.** Rolling 30d distinct workspaceId from CheckoutOrder, OR any workspace with a Conversation/Message/Flow execution in the window? The sales-heavy definition is simpler and more commercially meaningful. Default: sales-heavy unless Daniel objects.
- **Q2: Revenue Kloel placeholder.** Show `—` (proposed) or show `"indisponível"` text card? Recommend `—` for visual consistency with other number KPIs.
- **Q3: Period default.** Open on 7D (quick operational view) or 30D (monthly pulse)? Recommend **30D** — matches Hotmart/Stripe default and gives more signal.

Defaults above apply unless Daniel answers differently during SP-3 execution.
