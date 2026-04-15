# adm.kloel.com — SP-4 — Contas + KYC Queue

**Spec ID:** SP-4
**Date:** 2026-04-15
**Branch (planned):** `feat/adm-sp4-contas-kyc`
**Status:** Draft — authored after SP-3 code complete, waiting on SP-0..2 CI.

## 1. Purpose

Replace the honest placeholder at `/(admin)/contas` with a real module
that lets an operator (a) browse every KLOEL workspace in the platform
with their KYC status and commercial health, (b) drill into a single
account and see everything the platform knows about them, and (c) work
the **KYC approval queue** — the most time-sensitive recurring operator
task.

## 2. Scope

### In scope

- Backend: `AdminAccountsModule` with two read endpoints + three KYC
  workflow endpoints. No destructive ops (suspend/block/deactivate land
  in SP-8 with idempotency + dual control). The "approve" and "reject"
  KYC actions ARE destructive-ish but are natural to this module and
  they do not touch money balances.
- Backend: join across `Workspace` + `KycSubmission` (or equivalent —
  confirm the model name during execution) + `CheckoutOrder` aggregates.
- Frontend: `/(admin)/contas` lists accounts (paginated, searchable),
  plus `/(admin)/contas/kyc` for the queue, plus drill-down
  `/(admin)/contas/[workspaceId]` for the full detail page.
- Visual parity with the SP-3 God View (same StatCard, same Card
  primitives, same period picker where applicable).
- Permission matrix: `CONTAS.VIEW` for everyone with CONTAS access,
  `CONTAS.EDIT` for the KYC approve/reject endpoints.
- Audit: every KYC approve/reject writes one `admin_audit_logs` row via
  the existing global `AdminAuditInterceptor`.

### Out of scope (deferred)

- Suspend/block/unblock account (SP-8 — destructive ops).
- Freeze/release balance (SP-8 — touches money).
- Impersonate ("view as producer") (SP-4b or later).
- Mass operations (bulk-notify, bulk-block) — SP-8.
- Affiliates and buyers inside the same UI — only workspace (producer)
  accounts in SP-4. Buyers are covered by SP-6 (Vendas drill-down).

## 3. Data model — existing

No new Prisma models. We rely on:

- `Workspace` — one per producer account.
- The existing KYC model (to be confirmed during execution — probably
  `KycSubmission` or `KycRecord`).
- `CheckoutOrder` for commercial metrics (GMV, chargeback rate).
- `AdminAuditLog` for action trail.

If the KYC model does NOT exist or is too thin (check `backend/src/kyc/`
during execution), SP-4 stops at list+detail and KYC queue lands in
SP-4b. CLAUDE.md says KYC is "TIER 1 — 85%", so model should exist.

## 4. API contract

```
GET  /admin/accounts?cursor=&limit=&search=&status=&kycStatus=&sort=
     → { items: AdminAccountRow[], nextCursor: string | null, total: number }

GET  /admin/accounts/:workspaceId
     → AdminAccountDetail

GET  /admin/accounts/kyc/queue?status=PENDING&limit=
     → { items: KycQueueRow[], total: number }

POST /admin/accounts/:workspaceId/kyc/approve
     { documentIds?: string[], note?: string }
     → AdminAccountDetail (with refreshed kycStatus)

POST /admin/accounts/:workspaceId/kyc/reject
     { reason: string, rejectedDocumentIds?: string[] }
     → AdminAccountDetail

POST /admin/accounts/:workspaceId/kyc/reverify
     { reason: string }
     → AdminAccountDetail (kycStatus → PENDING; producer forced to re-upload)
```

All routes guarded by `AdminAuthGuard + AdminPermissionGuard`.
Approve/reject/reverify require `CONTAS.EDIT`.

### `AdminAccountRow`

```ts
{
  workspaceId: string,
  name: string,
  ownerEmail: string | null,
  createdAt: string,
  kycStatus: 'UNKNOWN' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED',
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'UNKNOWN',
  gmvLast30dInCents: number,
  chargebackRate: number | null,    // last 90d
  lastSaleAt: string | null,
  productCount: number,
}
```

### `AdminAccountDetail`

`AdminAccountRow` + contact, kyc document list, recent commercial
timeline (last 10 orders), linked products, pending payouts count,
and recent audit log entries that target this workspace.

## 5. Backend structure

```
backend/src/admin/accounts/
  admin-accounts.module.ts
  admin-accounts.controller.ts
  admin-accounts.service.ts
  queries/
    list-accounts.query.ts        // paginated list with filters + sort
    detail-account.query.ts       // single workspace detail
    kyc-queue.query.ts            // pending KYC submissions
  kyc/
    admin-kyc.service.ts          // approve/reject/reverify workflow
  dto/
    list-accounts.dto.ts
    list-kyc-queue.dto.ts
    approve-kyc.dto.ts
    reject-kyc.dto.ts
    reverify-kyc.dto.ts
```

Tests:

- `list-accounts.query.spec.ts` — pagination, search, filter correctness.
- `admin-kyc.service.spec.ts` — state machine (PENDING → APPROVED /
  REJECTED / re-opened). Audit row asserted.
- Permission matrix test: STAFF can VIEW but not EDIT.

## 6. Frontend structure

```
frontend-admin/src/app/(admin)/contas/
  page.tsx                        // replaces honest placeholder
  kyc/page.tsx                    // KYC queue tab
  [workspaceId]/page.tsx          // detail drill-down

frontend-admin/src/components/admin/contas/
  accounts-table.tsx              // SWR-powered, cursor paginated
  account-detail.tsx              // drill-down UI
  kyc-queue-row.tsx
  kyc-decision-dialog.tsx         // approve/reject prompt

frontend-admin/src/lib/api/admin-accounts-api.ts
```

## 7. Honest empty states

- "Sem contas ainda" when platform is empty.
- "Nenhuma submissão KYC pendente" when the queue is empty.
- "Sem vendas nos últimos 30 dias" on the detail page instead of `R$ 0,00`
  for the commercial timeline (so the card doesn't lie about activity).

## 8. Invariants

- I-SP4-1: KYC approve/reject writes to `admin_audit_logs`. Test that
  bypasses the interceptor is rejected at PR review.
- I-SP4-2: Approving KYC does NOT auto-grant balance release — that's
  SP-8/SP-9 territory.
- I-SP4-3: Listing accounts must be paginated. No endpoint returns
  more than 100 rows per call.
- I-SP4-4: Detail endpoint is workspace-scoped — it never reveals
  cross-workspace data even when accessed by OWNER.

## 9. Definition of done

1. Backend build + lint + typecheck + tests green.
2. Frontend build + lint + typecheck + tests green.
3. Knip + madge unchanged (no regression).
4. Spec + plan committed.
5. New Prisma models introduced only if the existing KYC schema is
   genuinely insufficient. If so, migration included with trigger for
   the `admin_audit_logs` of approve/reject events.
6. Permission matrix probe updated.
7. PR with screenshot of empty-DB account list + KYC queue rendered.

## 10. Open questions

- Q1: Is the existing KYC model addressable per workspace, or per user?
  If per-user, the admin UI needs to choose the workspace owner's
  submission — flag during discovery.
- Q2: Do we show the commercial KPIs (GMV/chargeback rate) on the LIST
  page or only on the detail? Trade-off: list is heavier to compute,
  but operators want to spot problem accounts at a glance. Default:
  show GMV_30d + chargeback rate in the list (eager-loaded with the
  account batch).
- Q3: How do we name the KYC "reverify" action for the operator?
  Candidates: "Forçar reverificação", "Pedir nova verificação",
  "Reabrir KYC". Default: "Pedir nova verificação".
