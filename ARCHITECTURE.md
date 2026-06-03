# KLOEL Architecture

KLOEL is a multi-tenant AI-native marketing and sales SaaS. A workspace connects WhatsApp, products, checkout and payment providers; KLOEL's backend, frontend and worker coordinate selling flows, customer conversations, payments, ledger entries and operational reporting.

## Golden Path

```txt
frontend UI
  -> frontend/src/lib/api/* via apiFetch
  -> optional Next.js proxy route in frontend/src/app/api/*
  -> NestJS controller in backend/src/<domain>
  -> service/business rule
  -> Prisma model in backend/prisma/schema.prisma
  -> Postgres table
  -> worker queue when async effects are required
```

Every workspace-scoped query must filter by `workspaceId`. External provider failures must produce honest error/setup-required states, never fabricated success.

## Product Layout

| Path | Purpose |
| --- | --- |
| `backend/` | NestJS API, Prisma, domain services, integrations, auth, checkout, wallet, WhatsApp, CRM, analytics and KLOEL cognitive runtime. |
| `frontend/` | Next.js product UI, public checkout, dashboard, CRM, products, settings, inbox and KLOEL experiences. |
| `frontend-admin/` | Admin UI. |
| `worker/` | BullMQ/Redis worker for async jobs, sends, scraping, media, flows and operational queues. |
| `e2e/` | Playwright coverage and route mocks. |
| `scripts/ops/` | CI, readiness, security, formatting, architecture and operational gates. |
| `scripts/cognitive/` | Generators for API/event/security/supply-chain artifacts when needed. |
| `scripts/mcp/atomic-edit/` | Local Atomic MCP editing layer preserved for Daniel. |
| `docs/` | Current operational, architecture, compliance, security and deployment documentation. |

## Main Product Territories

| # | Territory | Entry Doc | Delivers |
| --- | --- | --- | --- |
| 1 | Auth and KYC | `backend/src/auth/ARCHITECTURE.md` | identity, sessions, OAuth, magic link and payout gating. |
| 2 | Workspaces and Settings | `backend/src/workspaces/ARCHITECTURE.md` | tenant container, settings and team lifecycle. |
| 3 | Products and Plans | `backend/src/products/ARCHITECTURE.md` | catalog, plans, coupons, commissions and AI/product config. |
| 4 | Checkout and Post-sale | `backend/src/checkout/ARCHITECTURE.md` | product-to-payment flow and post-sale effects. |
| 5 | Money Engines | `backend/src/payments/ARCHITECTURE.md` | Stripe, Mercado Pago, split, ledger, fraud and treasury. |
| 6 | Sales and Refunds | `backend/src/sales/ARCHITECTURE.md` | in-chat orders and refunds. |
| 7 | Wallet and Billing | `backend/src/billing/ARCHITECTURE.md` | seller wallet and platform billing. |
| 8 | WhatsApp and Inbox | `backend/src/marketing/channels/whatsapp/ARCHITECTURE.md` | Meta Cloud connect, inbound idempotency and outbound messages. |
| 9 | Autopilot and Flows | `backend/src/autopilot/ARCHITECTURE.md` | automatic replies, nudges and workflow queues. |
| 10 | KLOEL Mind Runtime | `backend/src/kloel/ARCHITECTURE.md` | decide, act, learn loop and product tool dispatch. |
| 11 | CRM and Dashboard | `backend/src/crm/ARCHITECTURE.md` | contacts, pipeline, dashboard and reporting surfaces. |
| 12 | Analytics | `backend/src/analytics/ARCHITECTURE.md` | read-only aggregations and insights. |
| 13 | Growth | `backend/src/affiliate/ARCHITECTURE.md` | affiliates, partnerships, member area and campaigns. |
| 14 | Marketing | `backend/src/marketing/ARCHITECTURE.md` | ad accounts, sites, WhatsApp channels and campaign surfaces. |
| 15 | Ops Platform | `backend/src/api-keys/ARCHITECTURE.md` | API keys, webhooks, audit, notifications, media and calendar. |
| 16 | Worker Jobs | `worker/ARCHITECTURE.md` | queue processors and async side effects. |

## Canonical Contracts

- `docs/architecture/ARCHITECTURE_INDEX.md`
- `docs/architecture/CANONICAL_DOMAINS.md`
- `docs/architecture/CANONICAL_VOCABULARY.md`
- `docs/architecture/CAPABILITY_MAP.md`
- `docs/architecture/EVENT_TAXONOMY.md`
- `docs/architecture/SERVICE_CATALOG.md`
- `docs/architecture/ROUTES_CATALOG.md`
- `docs/architecture/QUEUES_CATALOG.md`
- `docs/architecture/PRISMA_USAGE.md`
- `docs/contracts/`

## Non-Negotiables

- Money values are bigint cents, never floats.
- Ledger corrections are compensating entries, never silent mutation.
- Webhooks must be idempotent.
- Provider failures must stay honest.
- Runtime code must not depend on archived agent tooling, historical reports, generated caches, or local-only experimental tools.
