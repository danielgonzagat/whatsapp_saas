# KLOEL — Architecture (start here)

KLOEL is an **AI-native marketing & sales SaaS**. A workspace connects its WhatsApp
(Meta Cloud) number and its products; KLOEL's AI ("Mind") sells to customers in chat,
takes payments (Stripe / Mercado Pago), splits revenue to sellers and affiliates, and
reports results. It is **multi-tenant** — every piece of data and every query is scoped
by `workspaceId`.

This file is the single entry point. Read it, follow one flow, and you understand the
machine. Each territory below has its own `ARCHITECTURE.md` that explains that capability
end-to-end with real file paths.

## Read this codebase in 10 minutes

1. **The golden path of a request** — the pattern *every* feature follows:

   ```
   UI component (frontend/src/...)
     -> typed API client (frontend/src/lib/api/*  via apiFetch)
     -> [Next proxy route frontend/src/app/api/*  for some domains]
     -> NestJS controller (backend/src/<module>/*.controller.ts)   <- the HTTP route
     -> service (*.service.ts)                                      <- the business rule
     -> Prisma model (backend/prisma/schema.prisma)
     -> Postgres table (RAC_*)
     -> response -> UI renders loading / empty / error / success
   ```

2. **Pick a territory** in the map below and open its `ARCHITECTURE.md`. It traces that
   capability through the golden path with the actual file/symbol names, lists the
   canonical vocabulary, states honestly what truly works vs what is a façade or
   runtime-unproven, and points to the 1-3 files to read first.

3. **The canonical contracts** — the single source of truth for names, events, and domain
   boundaries — live in `docs/architecture/` (index at the bottom).

## Monorepo layout

| Path | What | Scale |
|---|---|---|
| `backend/` | NestJS + Prisma API. **No global route prefix** — routes are as declared in controllers. | ~70 modules · 111 controllers · 150 services · 131 Prisma models |
| `frontend/` | Next.js app + the `lib/api/*` typed client layer (every call goes through `apiFetch`). | 114 pages |
| `worker/` | Standalone BullMQ/Redis worker for async effects (WhatsApp sends, flows, scraping, media, the cognitive loop). | 12 queues |
| `docs/architecture/` | Canonical contracts (vocabulary, events, domains, deprecations). | see index |
| `scripts/pulse/` | PULSE — the in-repo production-readiness scanner. | — |

## Territory map (each links to a full ARCHITECTURE.md)

| # | Territory | Doc | Delivers | Honest status |
|---|---|---|---|---|
| 1 | Auth & KYC | [auth](backend/src/auth/ARCHITECTURE.md) | identity, rotating-JWT sessions, KYC→payout gate | real + unit-tested; runtime-unproven |
| 2 | Workspaces / Settings / Team | [workspaces](backend/src/workspaces/ARCHITECTURE.md) | tenant container, settings, team lifecycle | backend real; team-list FE shape bug + invite-accept 404 |
| 3 | Products & Plans | [products](backend/src/products/ARCHITECTURE.md) | catalog, plans, coupons, commissions, AI config | core real; some sub-resources façade-risk |
| 4 | Checkout & Post-sale | [checkout](backend/src/checkout/ARCHITECTURE.md) | product→plan→payment→confirmation + effects | largely real, well-tested |
| 5 | Money Engines | [payments](backend/src/payments/ARCHITECTURE.md) | split / ledger / fraud / Connect / treasury (bigint cents, append-only) | unit-proven, not prod-certified |
| 6 | Sales & Refunds | [sales](backend/src/sales/ARCHITECTURE.md) | in-chat orders + gateway-real refunds | real + wired; PIX/boleto refund still missing |
| 7 | Wallet & Billing | [billing](backend/src/billing/ARCHITECTURE.md) | seller carteira + platform billing | production-shape, near-zero real usage yet |
| 8 | WhatsApp & Inbox | [whatsapp](backend/src/marketing/channels/whatsapp/ARCHITECTURE.md) | Meta Cloud connect, idempotent inbound, send | architecturally real, well-tested |
| 9 | Autopilot / Flows / FollowUp | [autopilot](backend/src/autopilot/ARCHITECTURE.md) | auto AI sales replies + human handoff + nudges | works via the worker; flows wait-for-reply lacks a scheduler |
| 10 | Mind / CIA / Agent | [kloel](backend/src/kloel/ARCHITECTURE.md) | cognitive loop (decide → act → learn) | wiring complete; loop tables empty (never ran on a real convo) |
| 11 | CRM & Dashboard | [crm](backend/src/crm/ARCHITECTURE.md) | contacts, pipeline, NeuroCRM, dashboard | real + tested; contact-drawer orphan; dual deal APIs |
| 12 | Analytics & Reports | [analytics](backend/src/analytics/ARCHITECTURE.md) | read-only aggregations | mostly real; ~12 report tabs unreachable in UI |
| 13 | Growth | [affiliate](backend/src/affiliate/ARCHITECTURE.md) | affiliate, partnerships, member-area, campaigns | 3/4 real; campaigns view unmounted |
| 14 | Advanced (ads / sites / marketing) | [marketing](backend/src/marketing/ARCHITECTURE.md) | ad-account connect + ROAS, sites, funnels, webinars | mixed; sites real; some ad OAuth loops unwired |
| 15 | Ops Platform | [api-keys](backend/src/api-keys/ARCHITECTURE.md) | api-keys, webhooks, audit, notifications, marketplace, media, calendar | mostly solid; calendar fabricates id; api-key O(N) lookup |
| 16 | Worker Jobs | [worker](worker/ARCHITECTURE.md) | 12 BullMQ queues | infra solid; media generate-video is a placebo |

## Conventions a newcomer must know

- **Money is `bigint` cents — never float.** The ledger is **append-only**; corrections are
  compensating entries, never updates.
- **Every workspace-scoped query filters by `workspaceId`.** Webhooks are **idempotent**
  (claim-once on a unique external id).
- **External-provider failure → an honest error / setup-required state, never a fake
  success** (no fabricated payment links, PIX payloads, or AI replies).
- **WAHA is intentionally deprecated** — the WhatsApp transport is the **Meta Cloud API**
  (see `docs/adr/0001-whatsapp-source-of-truth.md` and `DEPRECATION_MAP.md`). WAHA naming
  that lingers is debt, not a missing feature.

## Canonical contracts (the dictionary — `docs/architecture/`)

- [`ARCHITECTURE_INDEX.md`](docs/architecture/ARCHITECTURE_INDEX.md) — the deeper canonical index.
- [`CANONICAL_DOMAINS.md`](docs/architecture/CANONICAL_DOMAINS.md) — domain boundaries.
- [`CANONICAL_VOCABULARY.md`](docs/architecture/CANONICAL_VOCABULARY.md) (+ `CANONICAL_VOCABULARY_FAMILY_GLOSSARY.md`) — the ONE name per concept.
- [`CAPABILITY_MAP.md`](docs/architecture/CAPABILITY_MAP.md) — every capability + its maturity.
- `EVENT_TAXONOMY_*.md` — the event/"spine" channels.
- [`DUPLICATION_REGISTER.md`](docs/architecture/DUPLICATION_REGISTER.md) / [`DEPRECATION_MAP.md`](docs/architecture/DEPRECATION_MAP.md) — known duplicates + deprecated paths.

## Honest overall status (no overclaim)

Structurally **~60-70% built** (PULSE `rawScore` 99) but **runtime-unproven**: 0 of 506
capabilities have observed production-pass evidence — the live backend answers `/health`
200, but PULSE has not yet probed it. Per-territory truth lives in each doc's **Honest
status** section. Reaching *certified-delivered* requires the owner-gated runtime-proof
pass: a deploy + runtime/E2E probes + live Stripe Connect capabilities.
