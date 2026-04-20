# adm.kloel.com — SP-4 — Contas + KYC Queue — Implementation Plan

**Spec:**
[2026-04-15-adm-kloel-sp4-contas-kyc-design.md](../specs/2026-04-15-adm-kloel-sp4-contas-kyc-design.md)
**Branch (planned):** `feat/adm-sp4-contas-kyc` **Date:** 2026-04-15

## Step 1 — Discover KYC schema

**What.** Read `backend/src/kyc/` and grep the Prisma schema for KYC models.
Document (in a comment inside the plan file) the actual model name, workspace
relation, status enum, and document list structure. Without this, the
list/detail queries can't be written.

**Verify.** The downstream steps reference the real field names.

## Step 2 — AccountsService list+detail queries

**What.** `list-accounts.query.ts` performs a Prisma `findMany` on Workspace
joined with KYC + GMV aggregate from CheckoutOrder (last 30 days). Pagination
uses cursor (`id` asc) with `take: 50`. Search matches workspace.name ILIKE +
ownerEmail ILIKE.

`detail-account.query.ts` hydrates one workspace with all relationships: KYC
submissions, product count, last 10 orders, pending payouts, audit log entries
targeting the workspace.

**Verify.** `.spec.ts` seeds three workspaces (one empty, one with sales, one
pending KYC) and asserts the list + detail response shape.

## Step 3 — KYC queue query + service

**What.** `kyc-queue.query.ts` returns pending submissions ordered by
`createdAt ASC` (oldest first — priority). `admin-kyc.service.ts` implements
`approve`, `reject`, `reverify` with audit writes. Each operation is a Prisma
`$transaction` — state change + audit write happen atomically.

**Verify.** Unit tests for state machine; invariant I-SP4-1 asserted (audit row
exists after every mutation).

## Step 4 — Controller + module + wiring

**What.** `admin-accounts.controller.ts` exposes the 5 endpoints, guarded by
`AdminAuthGuard + AdminPermissionGuard` with `CONTAS.VIEW` for reads and
`CONTAS.EDIT` for mutations. `admin-accounts.module.ts` imports PrismaModule +
AdminPermissionsModule + AdminAuditModule. Wired into AdminModule alongside
Dashboard.

**Verify.** Nest boot smoke. Routes mapped. Permission probe.

## Step 5 — Frontend API client + primitives

**What.** `admin-accounts-api.ts`. Optional: new `DataTable` primitive in
components/ui (reusable by SP-5 Produtos, SP-6 Vendas, SP-10 Relatórios). For
SP-4 alone, a simple `AccountsTable` is enough — decide during execution based
on how much table code we'd share.

## Step 6 — `/(admin)/contas` list page

**What.** SWR-powered list with search input, status filter, kyc status filter,
columns from AdminAccountRow, "Ver detalhe" action. Honest empty state.
URL-persisted filters via query string.

**Verify.** Manual click-through on empty local DB.

## Step 7 — `/(admin)/contas/kyc` queue page

**What.** Dedicated tab/page listing pending KYC submissions. Each row has
Approve / Reject / Pedir nova verificação buttons. Reject + Reverify open a
dialog asking for a reason (free text). Approve fires immediately with a
confirmation prompt.

**Verify.** Against seeded PENDING submission, all 3 actions work.

## Step 8 — `/(admin)/contas/[workspaceId]` detail page

**What.** Full drill-down: header (name, email, status, kyc status), commercial
card strip (GMV30d, chargeback rate, last sale, ticket medio, produto ativo
count), KYC document list with per-document approve/reject, recent orders table,
audit trail for this workspace.

## Step 9 — Tests + build + lint + typecheck

**Verify.** All green in both backend and frontend-admin.

## Step 10 — PULSE scan + ratchet check + PR

**Verify.** Ratchet baseline unchanged. knip delta zero. madge unchanged or
better. PR opened with screenshots (empty DB + seeded).

## What this plan does NOT do

- Destructive account actions (suspend / block / freeze balance) → SP-8.
- Impersonate "view as producer" → SP-4b or later.
- Mass ops → SP-8.
