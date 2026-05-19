# Everything Else — Full Stack & Infrastructure Map

> Generated: 2026-05-19 | Combined scopes A–H

---

## A. Frontend Admin (`frontend-admin/src/`)

### Architecture
- **Framework**: Next.js 15+ (App Router), React 19, TypeScript, SWR for data fetching
- **Auth**: Admin-only; local-storage-based token session (`admin-session-context.tsx`)
- **Styling**: Tailwind CSS + custom design tokens (`design-tokens.ts`), Sora + JetBrains Mono fonts

### Route Map — `src/app/(admin)/`

| Route | Page | Description |
|-------|------|-------------|
| `/` | `page.tsx` | Admin Home: KPI cards, revenue charts, period filter, greeting, products section, health section |
| `/clientes` | `clientes/page.tsx` | Customer management (list/search) |
| `/carteira` | `carteira/page.tsx` | Wallet/Treasury: balance, ledger, payouts, P&L, tax, split engine (SWR-driven tabs) |
| `/chat` | `chat/page.tsx` | Admin chat view (delegates to `AdminChatView` component) |
| `/compliance` | `compliance/page.tsx` | Compliance overview: metrics, hero split layout |
| `/configuracoes` | `configuracoes/page.tsx` | Settings page |
| `/contas` | `contas/page.tsx` | Accounts: KYC filter, search, bulk actions, SWR-driven |
| `/audit` | `audit/page.tsx` | Audit log: paginated table, date filters, search |
| `/marketing` | `marketing/page.tsx` | Marketing page |
| `/vendas` | `vendas/page.tsx` | Sales page |
| `/relatorios` | `relatorios/page.tsx` | Reports: GMV chart, breakdown donut, CSV export, period filter |
| `/perfil` | `perfil/page.tsx` | User profile: sessions, user info, admin-only view |
| `/produtos` | `produtos/page.tsx` | Products: tabbed (all/moderation/producer/marketplace), search, filter, product cards |
| `/login` | `login/` | Admin login route |
| `/change-password` | `change-password/` | Password change route |
| `/mfa` | `mfa/` | MFA route |
| `/api` | `api/` | API proxy route |

### Components — `src/components/admin/`
| Component | Purpose |
|-----------|---------|
| `admin-app-shell.tsx` | Main admin layout (sidebar + topbar + content) |
| `admin-sidebar.tsx` | Navigation sidebar with config and recents |
| `admin-topbar.tsx` | Top bar with search, theme, notifications, user menu |
| `admin-monitor-ui.tsx` | Composite UI primitives: `AdminPage`, `AdminPageIntro`, `AdminMetricGrid`, `AdminSurface`, `AdminSectionHeader`, `AdminEmptyState`, `AdminTimelineFeed`, `AdminTicker`, `AdminProgressList`, `AdminSubinterfaceTabs`, `AdminHeroSplit` |
| `admin-chat-view.tsx` | Chat view component |
| `admin-greeting.ts` | Greeting logic (`resolveGreeting`, `firstName`) |
| `admin-search-modal.tsx` | Search modal |
| `admin-notifications-panel.tsx` | Notifications panel |
| `admin-theme-toggle.tsx` | Theme toggle |
| `destructive-confirm-dialog.tsx` | Reusable destructive action confirm dialog |
| `auth-screen-chrome.tsx` | Auth screen layout wrapper |
| `god-view/` | Sub-components: period filter, breakdown donut, GMV chart, etc. |

### Lib — `src/lib/`
- **auth/**: `admin-session-context.tsx`, `admin-session-storage.ts`, `admin-session-types.ts`
- **api/**: 22 API modules — one per domain:
  `admin-accounts-api.ts`, `admin-audit-api.ts`, `admin-auth-api.ts`, `admin-carteira-api.ts`, `admin-chat-api.ts`, `admin-clients-api.ts`, `admin-compliance-api.ts`, `admin-config-api.ts`, `admin-dashboard-api.ts`, `admin-destructive-api.ts`, `admin-iam-api.ts`, `admin-marketing-api.ts`, `admin-notifications-api.ts`, `admin-ops-api.ts`, `admin-products-api.ts`, `admin-reports-api.ts`, `admin-sales-api.ts`, `admin-sessions-api.ts`, `admin-support-api.ts`, `admin-transactions-api.ts`, `admin-users-api.ts`
  Plus: `admin-client.ts` (shared HTTP client), `admin-errors.ts` (error classes)
- **utils.ts**: General utilities (+ `utils.spec.ts`)

### Entry Points
1. **Layout**: `/src/app/(admin)/layout.tsx` — Auth guard via `useAdminSession`; redirects to `/login` if not authenticated
2. **Proxy**: `/src/proxy.ts`

---

## B. E2E Tests (`e2e/specs/`)

### Architecture
- **Framework**: Playwright, with custom helpers (`e2e-helpers.ts`)
- **Auth**: `e2e-auth-session.ts` — JWT token caching with 5-min expiry check, file-based cache
- **Base URLs**: resolved via `getE2EBaseUrls()` — supports `frontendUrl`, `marketingUrl`, `authUrl`, `appUrl`, `payUrl`, `apiUrl`, `workerUrl`

### Test Inventory (32 spec files)

| # | File | Domain | Description |
|---|------|--------|-------------|
| 1 | `health.spec.ts` | Infra | Backend liveness/readiness (`/health/liveness`, `/health`, `/health/ready`) |
| 2 | `worker-health.spec.ts` | Infra | Worker health + autopilot queue info |
| 3 | `auth-flows.spec.ts` | Auth | Check-email, register (duplicate 409), legacy OAuth blocked (400), login flow |
| 4 | `customer-auth-shell.spec.ts` | Auth | Customer auth shell behavior |
| 5 | `flows-auth.spec.ts` | Auth | Flow builder auth checks |
| 6 | `critical-flow.spec.ts` | Critical Path | Login → Create Flow → Execute; authenticated shell validation |
| 7 | `whatsapp-message-flow.spec.ts` | WhatsApp | Session status → send text → send media → conversation → disconnect |
| 8 | `whatsapp-qr.spec.ts` | WhatsApp | QR code display, localStorage seeding, WhatsApp page |
| 9 | `marketing-whatsapp-flow.spec.ts` | Marketing | Marketing WhatsApp flow (JWT-seeded auth, browser) |
| 10 | `meta-marketing-flow.spec.ts` | Marketing | Meta marketing flow |
| 11 | `marketing-official-channel-wizard.spec.ts` | Marketing | Official channel wizard |
| 12 | `autopilot-run.spec.ts` | Autopilot | Enqueue autopilot job, verify billing suspension gate |
| 13 | `billing-plan-lifecycle.spec.ts` | Billing | Trial activation, status, subscription, cancel & verify |
| 14 | `billing-suspension.spec.ts` | Billing | Suspension banner, blocked actions when `billingSuspended=true` |
| 15 | `billing-reactivation.spec.ts` | Billing | Reactivation after suspension |
| 16 | `customer-product-and-checkout.spec.ts` | E-commerce | Product CRUD, plan creation, checkout order |
| 17 | `product-creation.spec.ts` | E-commerce | Product creation via API, retrieval |
| 18 | `product-catalog-flow.spec.ts` | E-commerce | Product catalog flow |
| 19 | `customer-whatsapp-and-inbox.spec.ts` | Customer | WhatsApp + inbox integration |
| 20 | `customer-purchase-journey.spec.ts` | Customer | Purchase journey |
| 21 | `public-checkout-smoke.spec.ts` | Checkout | Public checkout order endpoint |
| 22 | `system-payment-reconciliation.spec.ts` | Payments | Balance, wallet, Stripe webhook idempotency, webhook event dedup |
| 23 | `kloel-chat-composer-real.spec.ts` | Chat | Real chat composer component |
| 24 | `kloel-stream-smoke.spec.ts` | Streaming | Stream smoke test |
| 25 | `products-card-layout-audit.spec.ts` | Visual | Products card layout audit |
| 26 | `settings-kyc.spec.ts` | Settings | KYC settings page (large: 575 lines) |
| 27 | `theme-toggle-persistence.spec.ts` | UX | Theme toggle localStorage persistence |
| 28 | `mobile-surface-audit.spec.ts` | Mobile | Mobile surface audit with artifact capture |
| 29 | `flow-wait.spec.ts` | Flow Builder | Flow wait behavior |
| 30 | `e2e-helpers.ts` | Helpers | Shared test utilities (not a spec, but part of suite) |
| 31 | `e2e-auth-session.ts` | Helpers | Auth session management (not a spec) |

### Helpers Key Functions (`e2e-helpers.ts`)
- `ensureE2EAdmin()` — Auto-register/login e2e admin, returns token + workspaceId
- `bootstrapAuthenticatedPage()` — Inject auth into browser page
- `seedE2EAuthSession()` — Seed JWT + localStorage for browser tests
- `dismissCookieBanner()` — Dismiss cookie consent banner
- JWT caching with file-based persistence (token reuse across tests)

---

## C. Worker (`worker/`)

### Architecture Summary
- **Runtime**: Node.js, BullMQ (Redis-backed job queues), CommonJS
- **Entry Point**: `bootstrap.ts` → resolves Redis URL → monkey-patches ioredis → dynamically imports `processor.ts`
- **Processors**: 10 dedicated BullMQ workers, each on its own queue
- **Providers**: ~30 provider modules for external integrations
- **Monitoring**: Prometheus metrics on `:3003/metrics`, health on `:3003/health`
- **Observability**: dd-trace, Sentry

### Processor Inventory

| Processor | File | Queue | Role |
|-----------|------|-------|------|
| Flow Worker | `processor.ts` | `flow` | Main orchestrator; dispatches flow engine jobs |
| Autopilot | `processors/autopilot-processor.ts` | `autopilot` | Autopilot cycle execution |
| Campaign | `campaign-processor.ts` | `campaign` | Campaign scheduling/sending |
| Scraper | `scraper-processor.ts` | `scraper` | Web scraping |
| Media | `media-processor.ts` | `media` | Media processing |
| Voice | `voice-processor.ts` | `voice` | Voice message processing |
| Memory | `processors/memory-processor.ts` | `memory` | Memory consolidation |
| Webhook | `processors/webhook-processor.ts` | `webhook` | Webhook delivery |
| CRM | `processors/crm-processor.ts` | `crm` | CRM enrichment |
| Silent 24h Resolver | `processors/silent-24h-resolver.processor.ts` | `silent24hResolver` | Dead contact resolution |

### Queue System (`queue.ts`)
- Lazy initialization via Proxy — zero Redis connections on import
- 9 queues + 9 DLQ queues + 9 QueueEvents
- `shutdownQueueSystem()` for graceful SIGTERM/SIGINT
- DLQ routing with backoff (3→3m, 7→10m, 15→1h)

### Autopilot Module (`processors/autopilot/`)
Major sub-system with 53 files:
- **Core**: `autopilot-config.ts`, `autopilot-reply.ts`, `autopilot-types.ts`, `autopilot-utils.ts`
- **Backlog**: `backlog.ts`, `backlog-escalation.ts`, `backlog-fetcher.ts`, `backlog-finalize.ts`, `backlog-seeder.ts`
- **Catalog**: `catalog.ts`, `catalog-contacts.ts`, `catalog-fetch.ts`
- **CIA (Cognitive Intelligence Agent)**: `cia-cycle.ts`, `cia-cycle-orchestrate.ts`, `cia-cycle-workspace.ts`, `cia-cycle-proof-event.ts`, `cia-action.ts`, `cia-action-dispatch.ts`, `cia-learn.ts`
- **Cognition**: `cognition.ts`, `cognition-context.ts`, `cognition-decision.ts`, `cognition-log.ts`, `cognition-reply.ts`
- **Cycle**: `cycle.ts`, `cycle-audio.ts`, `cycle-workspace.ts`
- **Execution**: `execution.ts`, `execution-audit.ts`, `execution-dispatcher.ts`, `execution-guards.ts`, `execution-planner.ts`
- **Followup**: `followup.ts` (+ related contacts/scheduler specs in test/)
- **Identity**: `identity.ts`, `identity-names.ts`, `identity-resolve.ts`
- **Opportunity**: `opportunity.ts`, `opportunity-ai-scorer.ts`, `opportunity-classify.ts`, `opportunity-heuristic.ts`, `opportunity-lock.ts`
- **Profile**: `profile.ts`
- **Safeguard**: `safeguard.ts`
- **Scan**: `scan.ts`, `scan-criteria.ts`, `scan-decisions.ts`, `scan-ingestion.ts`, `scan-scoring.ts`
- **Score**: `score.ts`, `score-contact.ts`, `score-opportunity.ts`, `score-proof.ts`
- **Sweep**: `sweep.ts`

### CIA Sub-system (`processors/cia/`)
- `brain.ts`, `brain.governor.ts`, `brain.options.ts`, `brain.types.ts`
- `cia-candidate-builder.ts`, `cia-decision-log.ts`, `cia-types.ts`
- `cognitive-state.ts`, `cognitive-state-patterns.ts`
- `contracts.ts`, `conversation-policy.ts`, `conversation-tactics.ts`
- `global-learning.ts`, `harness.ts`, `self-improvement.ts`, `build-state.ts`

### Providers Inventory (`providers/`)

| Provider | Purpose |
|----------|---------|
| `whatsapp-api-provider.ts` | Meta Cloud API WhatsApp integration |
| `unified-whatsapp-provider.ts` | Abstraction over multiple WhatsApp providers |
| `whatsapp-provider-resolver.ts` | Routes to correct provider based on `WHATSAPP_PROVIDER_DEFAULT` env |
| `whatsapp-engine.ts` | WhatsApp engine orchestration |
| `email-provider.ts` | Email sending (Nodemailer) |
| `ai-provider.ts` | OpenAI integration |
| `openai-models.ts` | OpenAI model configuration |
| `auto-provider.ts` | Auto provider selection |
| `channel-dispatcher.ts` | Multi-channel message dispatch |
| `outbound-dispatcher.ts` | Outbound message dispatch |
| `agent-events.ts` | Agent event handling |
| `anti-ban.ts` | Anti-ban protections |
| `campaigns.ts` | Campaign management |
| `commercial-intelligence.ts` | CI core (+ .core, .persistence, .signals, .tasks, .types) |
| `crm.ts` | CRM integration |
| `health-monitor.ts` | Health monitoring |
| `lead-scorer.ts` | Lead scoring |
| `mind-client.ts` | MIND client |
| `plan-limits.ts` | Plan limits enforcement |
| `rag-provider.ts` | RAG (Retrieval Augmented Generation) |
| `rate-limiter.ts` | Rate limiting |
| `registry.ts` | Provider registry |
| `semantic-memory.ts` | Semantic memory |
| `stripe-runtime.ts` | Stripe SDK runtime |
| `timezone.ts` | Timezone utilities |
| `tools-registry.ts` | Tool registration |
| `unified-agent-integrator.ts` | Unified agent integration |
| `watchdog.ts` | Watchdog monitoring |

### Scrapers (`scrapers/`)
- `auto-trigger.ts` — Automated scraping triggers
- `google-maps.ts` — Google Maps scraper
- `instagram.ts` — Instagram scraper

### Flow Engine
- `flow-engine-global.ts` — Global flow engine singleton
- `flow-engine-lifecycle.ts` — Flow lifecycle management
- `flow-engine-external-id.ts` — External ID resolution
- `flow-engine-parse.ts` — Flow parsing
- `flow-engine-voice-producer.ts` — Voice production
- `flow-engine.helpers.ts`, `flow-engine.types.ts` — Helpers and types
- `flow-node-executor.ts` — Node executor (+ .actions, .ai, .api, .interactions, .types)
- `flow-message-sender.helpers.ts` — Message sender helpers

### Key Infrastructure Files
- `bootstrap.ts` — Entry: Sentry init, dd-trace init, Redis URL resolution, ioredis guard, Pulse runtime
- `redis-client.ts` — Shared Redis clients (redis, redisPub, redisSub)
- `resolve-redis-url.ts` — Canonical Redis URL resolver (byte-identical with backend)
- `metrics.ts` — Prometheus metrics (job counters, duration histograms)
- `metrics-server.ts` — HTTP server for `/metrics` and `/health`
- `logger.ts` — Structured logging
- `db.ts` — Database connection
- `dlq-monitor.ts` — DLQ monitoring + ops alerts
- `reprocess-dlq.ts` — DLQ reprocessing
- `retry-jobs.ts` — Job retry logic
- `send-message-handler.ts` — Message send handler (+ .persist-failure, .persist-success)
- `scheduled-followup-handler.ts` — Followup handler
- `autopilot-scanner.engine.ts` + `.helpers.ts` — Autopilot scanner
- `pulse-runtime.ts` — PULSE runtime reporter
- `conversation-agent-state.ts` — Conversation agent state
- `context-store.ts` — Context storage
- `safe-path.ts` — Path sanitization

### Contracts
- `contracts/autopilot-jobs.ts` — Autopilot job type definitions

### Constants & Templates
- `constants/sales-templates.ts` — Sales message templates
- `templates/fallback-email.html` — Fallback email template

### Utils
- `utils/async-sequence.ts`, `utils/error-message.ts`, `utils/prisma-json.util.ts`, `utils/prompt-sanitizer.ts`, `utils/safe-eval.ts`, `utils/signed-storage-url.ts`, `utils/ssrf-protection.ts`

### Test Suite (48 spec files in `test/`)
Major areas tested: autopilot, CIA (brain, cognitive, contracts, cycle, global-learning, harness, self-improvement, tactics), commercial intelligence, channel dispatcher, checkout enrichment, context store, conversation state, cycle workspace, DLQ routing, email provider, error message, flow engine, followup (contact + scheduler), health monitor, identity (names + resolve), openai models, opportunity heuristic, orphan worker runtime, prepaid wallet, provider routing, registry, queue (lazy init, DLQ notifier), Redis URL resolver, scan contact, signed storage URL, silent 24h resolver, unified agent integrator, WhatsApp API provider, WhatsApp engine, worker health.

### Prisma Schema
- `prisma/schema.prisma` — Single schema shared across backend/worker via `@prisma/client`

### Worker Build
- `Dockerfile` — 2-stage (builder → runtime), Node 20-bookworm, Chromium + xvfb, Puppeteer
- `railway.toml` — Railway-specific deployment config
- `railway.json` — Railway service definition

---

## D. Docker, Docker Compose & Nginx

### Docker Compose Files

#### `docker-compose.yml` (Local Dev)
8 services:
1. **postgres** — pgvector/pgvector:pg15, port 5432, healthcheck via `pg_isready`
2. **redis** — redis:7-alpine, port 6379, healthcheck via `redis-cli ping`
3. **backend** — NestJS, port 3001, depends on postgres + redis, full env (DD, Google, JWT, WAHA, screencast, Stripe)
4. **worker** — BullMQ, ports 3003/3004, depends on postgres + redis, browser sessions volume, screencast env
5. **frontend** — Next.js, port 3000, depends on backend, Datadog RUM env vars
6. **prometheus** — prom/prometheus, port 9090, read-only, `/prometheus` tmpfs
7. **grafana** — grafana/grafana, port 3002, dashboard provisioning, admin password env
8. **alertmanager** — prom/alertmanager, port 9093, webhook receiver

#### `docker-compose.test.yml` (E2E Testing)
5 services:
1. **postgres** — pgvector:pg16, port 55432
2. **redis** — redis:7-alpine, port 56379
3. **test-waha** — Simulated WhatsApp API, port 3300, controlled via env vars
4. **backend** — with `AUTH_OPTIONAL=true`, WAHA pointed at test-waha
5. **worker** — with autopilot test-mode flags for testing

#### `docker-compose.prod.yml` (Production)
8 services with hardened security:
1. **postgres** — pgvector:pg16, memory limit 1G
2. **redis** — redis:7-alpine, AOF persistence, password auth, memory 512M
3. **backend** — 2 CPUs, 2G memory, no direct port exposure
4. **worker** — 2 CPUs, 4G memory, Chromium, healthcheck
5. **frontend** — 1 CPU, 1G memory, healthcheck
6. **nginx** — nginx:alpine, ports 80/443, reverse proxy, SSL certs volume
7. **certbot** — certbot/certbot, autorenew every 12h, read-only

### Docker Infrastructure (`docker/`)
- **nginx/** — `app.conf` (main config), `app.conf.ssl.template` (SSL template)
- **prometheus/** — `prometheus.yml` (file SD for backend/worker/frontend + docker SD), `alerting-rules.promrules`, `rules/`, `targets/`
- **grafana/** — `provisioning/dashboards/`, `provisioning/datasources/`
- **alertmanager/** — `alertmanager.yml` (webhook receiver to OPS_WEBHOOK_URL)

### Nginx Configuration (`nginx/nginx.conf`)
- `events { worker_connections 1024; }`
- Upstreams: `frontend:3000`, `backend:3001`, `worker_screencast:3004`
- Routes:
  - `/` → frontend
  - `^~ /api/auth/` → frontend (NextAuth, NOT backend — critical for Google OAuth)
  - `/api/` → backend (rewrite strips `/api/` prefix)
  - `/socket.io/` → backend (WebSocket upgrade)
  - `/ws/screencast/` → worker screencast (WebSocket, 86400s timeout)

### Railway Config (`railway.toml`)
```toml
[build]
builder = "RAILPACK"
buildCommand = "npm run railway:backend:build"

[deploy]
preDeployCommand = "node backend/prisma/ensure-migrations.js"
startCommand = "npm run railway:backend:start"
healthcheckPath = "/health/live"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

---

## E. Scripts (`scripts/`)

### Architecture
- **Language**: Mix of TypeScript, JavaScript (.mjs), Bash
- **PULSE**: Massive self-audit framework (200+ files)
- **Ops**: ~60 operational scripts (quality gates, checks, codacy, db)
- **Orchestration**: CI/CD orchestration, fleet builders, emitters
- **Findings Engines**: ~20 finding engines (architecture, depcheck, eslint, hadolint, etc.)

### PULSE (`scripts/pulse/`) — ~200+ files
Core self-audit system. Key areas:

| Sub-system | Files | Purpose |
|-----------|-------|---------|
| **Actors** | `actors/` | Behavioral actors |
| **Adapters** | `adapters/` | Integration adapters |
| **API Fuzzer** | `api-fuzzer/` | API fuzzing |
| **Artifacts** | `artifacts.*.ts`, `artifacts/` | Artifact management, directive, reports, queue, IO |
| **AST Graph** | `ast-graph/` | AST analysis |
| **Audit Chain** | `audit-chain/` | Audit chain processing |
| **Authority Engine** | `authority-engine/` | Authority evaluation |
| **Autonomy** | `autonomy-*.ts`, `autonomy-loop.*.ts` | Autonomous execution, decision ranking, memory, state |
| **Behavior Graph** | `behavior-graph/` | Behavior modeling |
| **Browser Stress** | `browser-stress-tester/` | Browser stress testing |
| **Capability Model** | `capability-model*.ts`, `capability-seed-groups.ts` | DOB-based capability model |
| **Certification** | `cert-*.ts`, `certification/` | PULSE certification gates |
| **Chaos Engine** | `chaos-engine/` | Chaos testing |
| **Codebase Truth** | `codebase-truth/*.ts` | Ground-truth extraction |
| **Command Graph** | `command-graph/` | Command dependency graph |
| **Convergence Plan** | `convergence-plan/` | Plan convergence |
| **Contract Tester** | `contract-tester/` | Contract testing |
| **Daemon** | `daemon.ts` | Continuous PULSE daemon |
| **Dataflow Engine** | `dataflow-engine/` | Data flow analysis |
| **DOD Engine** | `dod-engine/`, `definition-of-done.ts` | Definition of Done checking |
| **Evidence** | `evidence-graph.ts`, `execution-observation.ts` | Evidence collection |
| **Execution** | `execution-*.ts`, `executor.ts` | Execution harness |
| **External Signals** | `external-signals/` | External signal parsing (Dependabot, runtime) |
| **False Positive** | `false-positive-adjudicator.ts` | FP adjudication |
| **Flow Projection** | `flow-projection/` | Flow projection |
| **Functional Map** | `functional-map*.ts` | Functional coverage mapping |
| **GitNexus** | `gitnexus/`, `gitnexus-freshness.ts` | Git integration |
| **No Hardcoded Reality** | `no-hardcoded-reality-audit.ts`, `no-hardcoded-reality-state.ts` | Hardcoded reality detection (LOCKED) |
| **Otel Runtime** | `otel-runtime/` | OTEL integration |
| **Parsers** | `parsers/`, `parser-registry/` | Signal parsers |
| **Path Coverage** | `path-coverage-engine/`, `path-proof-*/` | Path coverage |
| **Product Vision** | `product-vision/` | Product vision alignment |
| **Production Proof** | `production-proof/` | Production proof checks |
| **Regression Guard** | `regression-guard/` | Regression detection |
| **Runtime Fusion** | `runtime-fusion/` | Runtime fusion |
| **Safety Sandbox** | `safety-sandbox/` | Safety sandbox |
| **Scenario Engine** | `scenario-engine/` | Scenario testing |
| **Scope Engine** | `scope-engine/`, `scope-state/` | Scope analysis |
| **Self Trust** | `self-trust/` | Self-trust evaluation |
| **Test Honesty** | `test-honesty/` | Test honesty checks |
| **UI Crawler** | `ui-crawler/` | UI crawling |

Entry points: `index-cli.ts`, `index.ts`, `run.js`, `daemon.ts`

### Ops Scripts (`scripts/ops/`) — ~70 files

**Quality Gates:**
- `check-all-gates.mjs` — Master gate runner
- `check-ai-constitution.mjs` — AI constitution compliance
- `check-architecture.mjs` / `check-architecture-guardrails.mjs` — Architecture checks
- `check-layer-boundaries.mjs` — Layer boundary validation
- `check-governance-boundary.mjs` — Governance boundary enforcement
- `check-code-quality.mjs` / `check-formatting.mjs` — Code quality
- `check-unsafe-casts.mjs` / `check-unsafe-queries.mjs` — Safety checks
- `check-test-integrity.mjs` / `check-test-file-deletions.mjs` — Test integrity
- `check-data-integrity.mjs` / `check-model-strings.mjs` — Data integrity
- `check-prisma-schema-single-source.mjs` — Schema consistency
- `check-tenants-keys.mjs` / `check-tenant-filter.mjs` — Multi-tenancy checks
- `check-meta-oauth-prod.sh` — Meta OAuth production check
- `check-redis-resolver-sync.mjs` — Redis resolver sync
- `check-visual-contract.mjs` — Visual contract check
- `check-codacy-skip-tags.mjs` — Codacy skip tag guard
- `check-constants-sync.mjs` — Constants synchronization
- `check-security.mjs` — Security check
- `check-admin-token-parity.mjs` — Admin token parity
- `check-railway-runtime.mjs` + `.helpers.mjs` — Railway runtime validation
- `check-madge-cycles.mjs` — Circular dependency detection

**Ratchet System:**
- `collect-ratchet-metrics.mjs` / `collect-ratchet-metrics.artifacts.mjs`
- `check-ratchet.mjs` — Ratchet gate

**Codacy:**
- `codacy-enforce-max-rigor.mjs` / `codacy-enforce-max-rigor.api.mjs` — Max rigor enforcement
- `codacy-apply-noise-disables.mjs` / `codacy-discover-noise-patterns.mjs` — Noise management
- `sync-codacy-issues.mjs` — Issue sync

**PULSE CI:**
- `run-pulse-ci.mjs` / `run-pulse-deep-ci.mjs` / `run-pulse-deep-ci.assertions.mjs`

**Other Ops:**
- `aggregate-findings.mjs` / `emit-findings-sidecars.mjs` — Findings aggregation
- `backend-boot-smoke.mjs` — Backend boot smoke test
- `guard-prisma-db-push.mjs` — Prisma push guard
- `validate-production-readiness.mjs` — Production readiness
- `run-clean-frontend-build.mjs` — Clean frontend build
- `run-eslint-seatbelt.mjs` — ESLint seatbelt
- `ci-preflight-fetch-main.sh` — CI preflight
- `verify-backup.mjs` — Backup verification
- `collect-knip-issues.mjs` — Dead code collection
- `normalize-lcov-paths.mjs` — Lcov path normalization
- `backup-db.sh` / `auto-sync-main.sh` / `install-auto-sync-launchagent.sh` — Operational scripts
- `codemods/` — 10 codemod scripts for automated fixes
- `production-readiness/` — Production readiness tools

### Orchestration (`scripts/orchestration/`) — ~45 files
- **Fleet builders**: `build-debt-fleet-10.mjs`, `build-arch-decomp-fleet-25.mjs`, etc. (15+ files)
- **Emitters**: `ci-state-emitter.mjs`, `coverage-sidecar-emitter.mjs`, `findings-watch.mjs`, `hubs-generator.mjs`, `tasks-emitter.mjs`, `phase-tags-emitter.mjs`, `severity-tags-emitter.mjs`, `tier-tags-emitter.mjs`, `provider-state-emitter.mjs`, `pulse-bridge-emitter.mjs`
- **HUD**: `hud-orchestrator.mjs`, `hud-audit.mjs`, `graph-color-watchdog.mjs`
- **PULSE**: `pulse-convergence-loop.sh`, `pulse-restoration-fleet.mjs`, `pulse-liquefy-combined-worker.mjs`, `pulse-kernel-enrichment-fleet.mjs`
- **Other**: `blocker-rank.mjs`, `extend-graph-lens.mjs`, `kill-opencode-zombies.mjs`, `opencode-fleet.mjs`

### Findings Engines (`scripts/findings-engines/`) — 18 engines
- `_schema.mjs` — Shared schema
- `actionlint.mjs`, `architecture.mjs`, `depcheck.mjs`, `eslint.mjs`, `gitleaks.mjs`, `hadolint.mjs`, `knip.mjs`, `madge.mjs`, `markdownlint.mjs`, `npmaudit.mjs`, `ratchet.mjs`, `semgrep.mjs`, `shellcheck.mjs`, `tsc.mjs`, `yamllint.mjs`

### Other Scripts Directories
- `agent-orchestrator.ts` — Multi-agent orchestration (Claude + Hermes + OpenHands)
- `add-logger-field.mjs` — Logger field injection
- `codemods/` — 2 scripts: `fix-strict-ast.mjs`, `fix-ts2564-class.mjs`
- `dev/` — `check-pulse-status.mjs`, `run-pulse-recert.sh`
- `auth/` — `apple-client-secret-probe.mjs`
- `shared/` — `severity-tokens.mjs`
- `mcp/`, `mind/`, `pci/`, `ralph/`, `legacy/`, `backup/`, `decomp/` — Specialized tooling
- Shell scripts: `smoke_all.sh`, `smoke_autopilot.sh`, `smoke_core.sh`, `test_waha_smoke.sh`, `queue_report.sh`, `railway-env.sh`, `e2e_local.sh`
- `obsidian-mirror-daemon.mjs` + `.constants.mjs` + `obsidian-graph-lens.mjs` — Obsidian mirror tools
- `mirror-tests.mjs` — Mirror acceptance tests
- `smoke-test-prod.ts` — Production smoke test

---

## F. GitHub Workflows (`.github/workflows/`)

### Active Workflows (10)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **`ci-cd.yml`** | Push to main, PR to main/purga-total-debt | CI pipeline: architecture → quality (lint, typecheck, test, build) + backend/frontend/worker tests, coverage upload, PULSE CI gate |
| **`deploy-production.yml`** | Push/PR to main, manual | Production deploy: readiness gate, PULSE certification, Railway runtime check, 3-stage Railway deploy (staging → canary → production) |
| **`deploy-staging.yml`** | Push/PR to main, CI completed | Staging deploy: Railway runtime check, push to staging env |
| **`visual-regression.yml`** | PR with frontend/e2e changes | Visual regression: Playwright screenshots vs committed baselines, 15 critical screens, `VISUAL_CHANGE_APPROVED` label gate for baseline updates |
| **`release-please.yml`** | Push to main, manual | Release Please: automated changelog + version bump (v0.5.0 current) |
| **`nightly-ops-audit.yml`** | Push to main, cron (9am daily), manual | Nightly ops: full typecheck, builds, tests, PULSE report, Codacy sync, ratchet update, artifact commit |
| **`codacy-analysis.yml`** | Push/PR to main/purga-total-debt | Codacy analysis: skip-tag guard, Codacy CLI static analysis |
| **`codeql.yml`** | Push to main/develop, PR, cron (Mon 6:20am) | CodeQL security analysis (javascript-typescript) |
| **`dependabot-auto-merge.yml`** | Push/PR to main, PR labeled | Dependabot: validate (typecheck, build, test), auto-approve + auto-merge for minor/patch updates |
| **`mind-simulator.yml`** | PR with MIND rule changes | MIND simulator: typecheck, run rule simulator, upload report |

### Disabled/Inactive Workflows (4)
| Workflow | Status | Note |
|----------|--------|------|
| `claude-code-review.yml` | `if: false` | Claude Code Review on PR (disabled) |
| `claude.yml` | `if: false` | Claude Code on issue/PR comment (disabled) |
| `deploy.yml` | No-op | Legacy deploy — redirects to modern workflows |
| `main.yml` | No-op | Legacy CI — redirects to `ci-cd.yml` |

### Key CI-CD Pipeline Flow
```
PR opened → architecture guardrails
         → quality (lint + typecheck + test + build for all 3 workspaces)
         → Codacy analysis
         → visual regression (on frontend changes)
         → deploy-staging gate (Railway runtime check)
         → CodeQL (scheduled + PR)
         → mind-simulator (on MIND changes)
         → dependabot validate (on dep PRs)

Merge to main → deploy-production (readiness + PULSE + Railway deploy)
              → release-please (version bump)
              → nightly-ops-audit (full test + ratchet update)
```

---

## G. Root Config Files

### `package.json` (Root)
- **Name**: `whatsapp-saas`
- **Package Manager**: npm@10.9.7
- **Engine**: Node >=22 <23
- **Monorepo**: backend, frontend, worker, e2e, frontend-admin workspaces
- **Key Scripts**: ~80 npm scripts covering:
  - Railway deploy (`railway:backend:*`)
  - Quality gates (`check:*`, `guard:*`, `quality:*`)
  - Codacy management (8 scripts)
  - PULSE (8 scripts: run, report, certify, CI, deep, probes)
  - Agent orchestration (8 scripts: hermes, openhands, claude, multi, full-crew)
  - GitNexus (10 scripts)
  - Testing, typecheck, coverage
  - Ratchet system
  - Obsidian tools
- **Lint-staged**: Prettier for JSON/MD/YAML, ESLint per workspace
- **Core deps**: `@nestjs/event-emitter`, `@opencode-ai/sdk`, `lucide-react`, `react`, `zustand`
- **Dev deps**: `@biomejs/biome`, `husky`, `knip`, `lint-staged`, `madge`, `playwright`, `prettier`, `ts-morph`, `zod`

### `biome.json`
- **VCS**: Git enabled, default branch `main`
- **Files**: Includes `backend/src/**`, `frontend/src/**`, `worker/**`, `scripts/ops/**`; ignores tests, dist, .next, coverage, e2e, PULSE artifacts, migrations
- **Formatter**: Spaces (2), line width 100, single quotes, semicolons always
- **Linter**: Recommended rules, `noUndeclaredVariables: error`, `noExplicitAny: warn`

### `knip.json` (Dead Code Detection)
- Configured for all 5 workspaces (root, backend, frontend, worker, e2e)
- `frontend-admin` explicitly ignored
- Each workspace has entry points, project files, and ignore patterns
- Worker entries: bootstrap.ts, processor.ts, all processors, providers, utils

### `.codacy.yml` (MAX-RIGOR LOCK)
- **Engines**: eslint-8, biome, opengrep, semgrep, trivy, lizard
- **Excludes ONLY**: node_modules, dist, .next, .turbo, coverage, test-results, playwright-report, Prisma auto-generated migration SQL
- Governance rule: Must analyze the widest possible surface; test/docs/scripts/PULSE all scanned

### ESLint Configs
- **Backend** (`backend/eslint.config.mjs`): TypeScript strict with recommended-type-checked, `no-explicit-any: error`, `no-unsafe-*: error`, Prettier
- **Frontend**: `frontend/eslint.config.mjs` (exists, not read in detail)
- **Worker**: `worker/eslint.config.mjs` (exists, not read in detail)

### `commitlint.config.cjs`
- Extends `@commitlint/config-conventional`

### `codecov.yml`
- Require CI to pass, range 60-90%
- Project gate: target auto, threshold 0.5%
- Per-flag targets for backend, frontend, worker
- Patch coverage informational (due to codemods)
- Three components: backend_api, frontend_app, worker_bullmq
- Ignores tests, specs, migrations, types files, configs, generated code

### `release-please-config.json`
- **Release type**: simple
- **Tag**: v-prefixed
- **Current version**: 0.5.0
- **Changelog**: `CHANGELOG.md`
- **PR title pattern**: `chore: release ${version}`

### `railway.toml`
- Backend service config (see Scope D)

### Root `tsconfig.json`
- Present in root? (not deeply explored — individual workspace tsconfigs used)

---

## H. Docs (`docs/`)

### Directory Structure

| Path | Content |
|------|---------|
| `adr/` | 8 Architecture Decision Records (0001-0007) |
| `ai/` | AI runbook, PULSE guides, atomic edit docs |
| `api/` | API documentation |
| `audit/` | Audit documents |
| `audits/` | Audit reports |
| `calibrations/` | Calibration records (e.g., rac-table-access-migrations) |
| `codacy/` | Codacy configuration docs |
| `codebase-exploration/` | Exploration output (this file is #8) |
| `compliance/` | Compliance documentation |
| `contracts/` | Contract definitions |
| `delivery/` | Delivery reports |
| `deployment/` | `env-vars.md` — environment variables doc |
| `design/` | Design docs (protected) |
| `devtools/` | Developer tools docs |
| `evidence/` | Evidence artifacts |
| `implementation/` | Implementation notes |
| `marketing/` | Marketing docs |
| `monitoring/` | Monitoring docs |
| `plans/` | 12 plan docs (channel audit, cash audit, HUD upgrade, Stripe migration, cognitive organism, etc.) |
| `production-hardening/` | Production hardening docs |
| `runbooks/` | 6 runbooks (admin MFA override, financial ops, hardening rollback/rollout, Meta OAuth setup, RAC rename deployment) |
| `security/` | Security docs |
| `superpowers/` | Superpowers docs + specs |
| `design/` | Protected design docs |

### Standalone Docs
- `DISASTER_RECOVERY.md` — Disaster recovery procedures
- `GITHUB_REPOSITORY_SETTINGS.md` — GitHub settings
- `HUD_README.md` — HUD documentation
- `KLOEL_BRAIN_PRODUCTION_CHECKLIST.md` — Production checklist
- `KLOEL_MIND_OMNICHANNEL_DELIVERY_REPORT.md` — MIND delivery report
- `KLOEL_PR266_FINAL_DELIVERY.md` — PR #266 delivery
- `KLOEL-HANDOFF.md` — Handoff notes
- `LEGAL_AND_FINANCIAL_COMPLIANCE.md` — Legal compliance
- `MONITORING_AND_ALERTING.md` — Monitoring guide
- `PRODUCTION_DEPLOY.md` — Deploy guide
- `PRODUCTION_READINESS.md` — Readiness guide
- `RESTORE.md` — Restore procedures
- `RUNBOOK.md` — Operations runbook
- `STAGING_ENVIRONMENT.md` — Staging guide
- `visual-freeze.md` — Visual baseline freeze
- `workspace-gates.md` — Workspace gate configuration

### ADR Index
1. `0001-whatsapp-source-of-truth.md` — WhatsApp provider as source of truth
2. `0002-security-triage.md` — Security triage
3. `0003-stripe-connect-marketplace-model.md` — Stripe Connect marketplace
4. `0004-cia-legacy-decommission.md` — CIA legacy decommission
5. `0004-obsidian-as-production-hud.md` — Obsidian as production HUD
6. `0005-codex-opencode-shim.md` — Codex/OpenCode shim
7. `0006-papeis-cognitivos-canonicos.md` — Canonical cognitive roles (PT-BR)
8. `0007-portao-unico-de-regras.md` — Single rule gate (PT-BR)

### AI Docs
- `AGENT_RUNBOOK.md` — Agent operating runbook
- `ATOMIC_EDIT_CLI_ACTIVATION_MATRIX.md` — CLI activation matrix
- `ATOMIC_EDIT_OPERATING_GUIDE.md` — Operating guide
- `ATOMIC_EDIT_PROGRESS.md` — Progress tracking
- `PULSE_NO_HARDCODED_REALITY_DEBT_GUIDE.md` — Hardcoded reality debt guide
- `PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md` — Subagent delegation rules

---

## Cross-Cutting Architecture

### Technology Stack (Unified View)
| Layer | Tech |
|-------|------|
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS |
| **Admin** | Next.js 15 (App Router), React 19, SWR, Shadcn/UI |
| **Backend** | NestJS, Prisma, PostgreSQL (pgvector) |
| **Worker** | Node.js, BullMQ, Redis, Puppeteer |
| **E2E** | Playwright, custom helpers |
| **Infra** | Docker Compose, Railway, Nginx, Certbot |
| **Queue** | BullMQ + Redis (9 queues, lazy init) |
| **Monitoring** | Prometheus, Grafana, Alertmanager, Datadog (RUM + APM), Sentry |
| **Quality** | Codacy (6 engines), ESLint, Biome, Prettier, Knip, CodeQL |
| **CI/CD** | GitHub Actions (14 workflows), Release Please, Codecov |

### Service Ports
| Service | Port | Notes |
|---------|------|-------|
| Frontend | 3000 | Next.js |
| Backend | 3001 | NestJS API |
| Grafana | 3002 | Monitoring dashboards |
| Worker | 3003 | Metrics + health |
| Worker screencast | 3004 | WebSocket screencast |
| PostgreSQL | 5432 | (55432 for test) |
| Redis | 6379 | (56379 for test) |
| Nginx | 80, 443 | Reverse proxy |
| Prometheus | 9090 | Metrics collection |
| Alertmanager | 9093 | Alert routing |
| Test WAHA (test) | 3300 | Simulated WhatsApp API |

### Security Model
- Multi-tenant workspace isolation
- JWT-based authentication
- Internal API key for service-to-service communication
- Redis password auth in production
- Read-only containers with tmpfs
- `no-new-privileges:true` on all Docker services
- SSL via Certbot + Nginx in production
- Dependabot auto-merge only for minor/patch updates

### Key Integration Points
1. **Backend ↔ Worker**: Via HTTP (BACKEND_URL) + shared Redis (BullMQ)
2. **Frontend ↔ Backend**: Via HTTP API (Nginx reverse proxy, `/api/` → backend)
3. **Frontend ↔ Worker**: Screencast WebSocket (`/ws/screencast/`)
4. **All ↔ WhatsApp**: Via WAHA API (external) or Meta Cloud API
5. **All ↔ Stripe**: Via Stripe SDK (backend + worker)
6. **All ↔ OpenAI**: Via OpenAI SDK (worker primarily)
7. **Monitoring**: All services expose `/metrics` for Prometheus scraping

---

## Start Here

For another agent to understand the full system topography:

1. **Root `package.json`** — All ~80 scripts reveal the operational surface area
2. **`docker-compose.yml`** — See all services and their interdependencies
3. **`.github/workflows/ci-cd.yml`** — CI pipeline flow with all quality gates
4. **`worker/processor.ts`** — Worker orchestration and all processor registrations
5. **`frontend-admin/src/app/(admin)/layout.tsx`** — Admin auth guard
6. **`e2e/specs/e2e-helpers.ts`** — E2E auth bootstrap (shared by all specs)
7. **`nginx/nginx.conf`** — Routing table for all services
8. **`scripts/pulse/index.ts`** — PULSE entry point
9. **`docs/adr/`** — Architecture decisions

### Files Retrieved
1. `frontend-admin/src/app/(admin)/**` (all pages, layout) — Admin route/component map
2. `frontend-admin/src/components/admin/**` — Admin UI component library
3. `frontend-admin/src/lib/api/**`, `lib/auth/**` — API client layer + auth
4. `e2e/specs/*.spec.ts` (all 32) — E2E test inventory
5. `e2e/specs/e2e-helpers.ts`, `e2e-auth-session.ts` — Test infrastructure
6. `worker/bootstrap.ts` — Entry point
7. `worker/processor.ts` — Worker process lifecycle
8. `worker/queue.ts` — Lazy queue system
9. `worker/providers/**` — Provider layer
10. `worker/processors/autopilot/**`, `processors/cia/**` — Autopilot + CIA
11. `worker/Dockerfile` — Build pipeline
12. `docker-compose.yml`, `docker-compose.test.yml`, `docker-compose.prod.yml` — All deployment modes
13. `nginx/nginx.conf` — Routing
14. `railway.toml` — Railway deploy config
15. `docker/prometheus/prometheus.yml`, `docker/alertmanager/alertmanager.yml` — Monitoring config
16. `scripts/pulse/**` — PULSE structure
17. `scripts/ops/**` — Quality gates
18. `scripts/orchestration/**` — Orchestration tooling
19. `scripts/findings-engines/**` — Finding engines
20. `.github/workflows/*.yml` (all 14) — CI/CD workflows
21. `package.json`, `biome.json`, `knip.json`, `.codacy.yml` — Root configs
22. `codecov.yml`, `release-please-config.json`, `commitlint.config.cjs` — Configs
23. `backend/eslint.config.mjs` — ESLint config
24. `docs/` — Full directory structure
