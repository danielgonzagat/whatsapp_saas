# KLOEL Codebase Exploration — Master Index

> **Generated:** 2026-05-19  
> **Method:** 8 parallel AI subagents exploring 1,600+ source files across all layers  
> **Total documentation:** 5,049 lines across 8 domain files

---

## Project at a Glance

| Layer | Tech | Files | Description |
|-------|------|-------|-------------|
| **Backend** | NestJS + Prisma + PostgreSQL | ~800 `.ts` | Multi-tenant SaaS API with 100+ modules |
| **Frontend** | Next.js 15 + React 19 + Tailwind | 1,286 `.ts/.tsx` | Dashboard + checkout + auth + marketing |
| **Frontend Admin** | Next.js 15 + React 19 | ~100 `.ts/.tsx` | Admin panel with audit + operations |
| **Worker** | Node.js + BullMQ + Redis | ~200 `.ts` | 10 queue processors + 30 providers |
| **E2E** | Playwright | 32 `.spec.ts` | End-to-end test suite |
| **Infra** | Docker Compose + Railway + Nginx | 8 services | Multi-container orchestration |
| **CI/CD** | GitHub Actions | 14 workflows | Quality gates + deploy + release |
| **Scripts** | TypeScript + Bash | ~400 files | Dev tooling, PULSE, ops, orchestration |
| **Docs** | Markdown | ~100 files | ADRs, runbooks, plans, compliance |

---

## Domain Documentation

| # | File | Lines | Scope |
|---|------|-------|-------|
| 1 | [01-backend-core.md](./01-backend-core.md) | 399 | Auth, workspaces, common, config, health, prisma, queue, logging, i18n |
| 2 | [02-backend-business.md](./02-backend-business.md) | 729 | Payments, billing, checkout, wallet, marketplace treasury, member area, affiliate |
| 3 | [03-backend-marketing.md](./03-backend-marketing.md) | 759 | WhatsApp, campaigns, email, marketing, inbox, omnichannel, CRM, flows, GDPR |
| 4 | [04-backend-admin-governance.md](./04-backend-admin-governance.md) | 456 | Admin panel (23 sub-modules), compliance, KYC, PULSE, RBAC, destructive ops |
| 5 | [05-backend-ai-kloel.md](./05-backend-ai-kloel.md) | 604 | AI cognitive organism (70+ camadas), MIND, Brain, CIA, Unified Agent, Copilot |
| 6 | [06-backend-integrations.md](./06-backend-integrations.md) | 581 | Meta, Google Ads, TikTok Ads, integrations, Gmail OAuth, partnerships |
| 7 | [07-frontend-main.md](./07-frontend-main.md) | 787 | Frontend routes, 180+ components, 50+ hooks, 60+ API modules, design system |
| 8 | [08-everything-else.md](./08-everything-else.md) | 734 | Admin frontend, E2E tests, Worker, Docker, Scripts, CI/CD, Root config, Docs |

---

## High-Level Architecture

```
                    ┌──────────────────────────────────────┐
                    │           Nginx (80/443)              │
                    │  /api/* → backend    / → frontend     │
                    │  /ws/screencast/* → worker            │
                    └──────────┬───────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────────┐
│   Frontend    │    │   Backend     │    │      Worker       │
│  Next.js 15   │    │   NestJS      │    │  BullMQ + Redis   │
│  Port 3000    │    │   Port 3001   │    │  Ports 3003/3004  │
└───────┬───────┘    └───────┬───────┘    └─────────┬─────────┘
        │                    │                      │
        │              ┌─────┴─────┐          ┌─────┴─────┐
        │              │ PostgreSQL│          │   Redis   │
        │              │ pgvector  │          │  Port 6379│
        │              │ Port 5432 │          └───────────┘
        │              └───────────┘
        │
┌───────┴───────┐     ┌───────────────┐     ┌───────────────┐
│   Prometheus  │     │    Grafana    │     │ Alertmanager  │
│   Port 9090   │     │   Port 3002   │     │  Port 9093    │
└───────────────┘     └───────────────┘     └───────────────┘
```

### External Integrations
- **Stripe** — Payments, Connect marketplace, SaaS billing
- **Meta** — WhatsApp Cloud API, Instagram, Messenger, Ads
- **Google** — Ads, Gmail OAuth, OAuth Sign-In
- **TikTok** — Ads, OAuth
- **OpenAI** — AI agents, embeddings, TTS, Whisper
- **Anthropic** — Claude for specific capabilities
- **WAHA** — Self-hosted WhatsApp HTTP engine

---

## Top 20 Improvement Suggestions (Cross-Cutting)

### 🔴 Critical

| # | Area | Issue | Recommendation |
|---|------|-------|----------------|
| 1 | **Payments** | No end-to-end integration test for full payment flow (order → webhook → ledger → payout) | Add integration spec covering the full lifecycle |
| 2 | **Prisma hooks** | Monkey-patched `updateMany` for checkout post-payment effects | Replace with Prisma middleware or explicit service dispatcher |
| 3 | **Checkout** | No DB-level idempotency on order creation (only HTTP guard) | Add unique constraint on order idempotency key |

### 🟠 High

| # | Area | Issue | Recommendation |
|---|------|-------|----------------|
| 4 | **WhatsApp module** | 144 files in a single module — too large to maintain | Split into sub-modules: providers, agent, catchup, session |
| 5 | **`common/` catch-all** | ~100 files with no clear domain boundaries | Extract `financial/`, `security/`, `storage/` domain modules |
| 6 | **Multiple metrics pipelines** | prom-client + dd-trace DogStatsD + structured logging — 3 separate observability stacks | Unify into a single `TelemetryService` facade |
| 7 | **Auth module** | 74 files mixing stateless functions and class-based services with overlapping concerns | Consolidate into one pattern |
| 8 | **API key validation** | O(n) scan of up to 1000 keys per request | Index by key prefix hash for O(1) lookup |
| 9 | **Dual checkout themes** | `CheckoutBlanc` and `CheckoutNoir` with shared parts — high duplication risk | Consolidate theme variants into a single configurable component |
| 10 | **Dual product routes** | `/products` and `/produtos` with parallel component trees | Complete migration and remove legacy |

### 🟡 Medium

| # | Area | Issue | Recommendation |
|---|------|-------|----------------|
| 11 | **TikTok dual storage** | Credentials in both `IntegrationCredential` table AND `providerSettings` JSON | Migrate to single `IntegrationCredential` pattern |
| 12 | **No circuit breaker** | Stripe API calls have no retry-with-backoff at service level | Add resilience patterns (circuit breaker + retry) |
| 13 | **Autopilot legacy mode** | `ENABLE_LEGACY_BACKEND_AUTOPILOT` flag still active | Audit if migration to Brain Runtime is complete |
| 14 | **Brain vs Unified Agent** | Two parallel LLM orchestration paths | Clarify relationship — replacement or complement? |
| 15 | **I18n hardcoded Portuguese** | Static dictionary only has pt-BR | Move to JSON files for runtime loading |
| 16 | **Socket.IO scaling** | No Redis adapter in WebSocket gateways | Add `@socket.io/redis-adapter` for horizontal scaling |
| 17 | **Token refresh sessions** | Admin creates new session per refresh call | Add max-active-sessions limit or TTL cleanup |
| 18 | **PULSE artifacts** | Filesystem-only artifact storage | Move to S3/Redis for multi-instance Railway deploys |
| 19 | **Admin chat** | Still uses regex-based intent detection (LLM-stubbed) | Prioritize full LLM integration |
| 20 | **`Root.js` bridge** | JavaScript file in TypeScript directory (`ProductNerveCenterRoot.js`) | Complete TypeScript migration |

---

## File Count Summary

| Domain | `.ts`/`.tsx` Files | Spec Files | Documentation |
|--------|---------------------|------------|---------------|
| Backend Core | 264 | ~130 | [01](./01-backend-core.md) |
| Backend Business | 242 | ~100 | [02](./02-backend-business.md) |
| Backend Marketing | 357 | ~158 | [03](./03-backend-marketing.md) |
| Backend Admin + Gov | ~310 | ~120 | [04](./04-backend-admin-governance.md) |
| Backend AI + Kloel | ~775 | ~368 | [05](./05-backend-ai-kloel.md) |
| Backend Integrations | 75 | 46 | [06](./06-backend-integrations.md) |
| Frontend Main | 1,286 | ~100 | [07](./07-frontend-main.md) |
| Frontend Admin | ~100 | ~30 | [08](./08-everything-else.md) |
| E2E Tests | 32 specs | 32 | [08](./08-everything-else.md) |
| Worker | ~200 | 48 | [08](./08-everything-else.md) |
| Scripts | ~400 | — | [08](./08-everything-else.md) |
| **Total** | **~4,041** | **~1,132** | |

---

## Risk Classification by Domain

| Domain | Risk | Rationale |
|--------|------|-----------|
| Payments & Ledger | 🔴 Critical | Money movement, Stripe Connect, split engine |
| Billing & Wallet | 🔴 Critical | Subscription revenue, prepaid usage billing |
| Admin Transactions | 🔴 Critical | Refund/chargeback with ledger adjustments |
| Admin Destructive Ops | 🔴 Critical | Irreversible platform mutations |
| Auth (all levels) | 🟠 High | Session management, OAuth, MFA |
| Compliance & GDPR | 🟠 High | Data deletion cascade, regulatory |
| KYC | 🟠 High | Identity verification, Stripe Connect onboarding |
| WhatsApp Providers | 🟠 High | Message delivery, multi-provider routing |
| Webhooks | 🟠 High | Payment processing, external integrations |
| AI/Kloel Intelligence | 🟡 Normal | Read-only advisory, fail-closed LLM budget |
| Marketing & Campaigns | 🟡 Normal | Bulk messaging with rate limits |
| Frontend | 🟡 Normal | UI rendering, no financial data at rest |
| Monitoring/PULSE | 🟢 Safe | Observability only |
| Reports/Analytics | 🟢 Safe | Read-only queries |

---

## Entry Points for New Developers

1. **`CLAUDE.md`** — Agent governance and boot sequence
2. **`AGENTS.md`** — Repository governance boundary
3. **`backend/src/app.module.ts`** — Backend module wiring (90+ modules)
4. **`backend/src/prisma/prisma.service.ts`** — Core data access layer
5. **`frontend/src/app/layout.tsx`** — Frontend root layout + provider stack
6. **`frontend/src/lib/api/index.ts`** — API client barrel
7. **`worker/bootstrap.ts`** — Worker entry point
8. **`docker-compose.yml`** — All services and dependencies
9. **`.github/workflows/ci-cd.yml`** — CI/CD pipeline
10. **`docs/adr/`** — Architecture Decision Records

---

*Index generated 2026-05-19 by parallel codebase exploration*
