# KLOEL

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/de45b0033ec04323b31a4a3ec49b1ce9)](https://app.codacy.com/gh/danielgonzagat/whatsapp_saas/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![Codacy Badge](https://app.codacy.com/project/badge/Coverage/de45b0033ec04323b31a4a3ec49b1ce9)](https://app.codacy.com/gh/danielgonzagat/whatsapp_saas/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_coverage)

Plataforma AI-native de marketing digital, vendas, checkout, WhatsApp,
automacao e operacao financeira. O repositorio e um monorepo de producao com
frontend (Next.js / Vercel), backend (NestJS / Railway), worker (BullMQ /
Railway), suite E2E Playwright e a maquina PULSE de auditoria/autonomia.

O `main` e a fonte de verdade de release. Cada mudanca relevante passa por
gates de arquitetura, qualidade estatica, typecheck, testes, build, seguranca,
regressao visual, E2E e PULSE.

## Arquitetura

```
Frontend (Next.js 16 / Vercel)
  ├─ Dashboard & Analytics
  ├─ Product Nerve Center (editor com 10 tabs)
  ├─ Checkout publico (pay.kloel.com — temas Blanc / Noir)
  ├─ WhatsApp Console (inbox, autopilot, flows)
  ├─ CRM Pipeline
  ├─ Kloel AI Assistant (SSE streaming)
  ├─ Billing, Wallet, KYC e Settings
  ├─ Area de membros publica pos-compra
  └─ Landing page (kloel.com)

Backend (NestJS 11 / Railway)
  ├─ 136 controllers, 135 models Prisma, 40 migrations
  ├─ Auth (JWT + Google OAuth + Apple + WhatsApp OTP)
  ├─ Checkout (planos, pagamentos Stripe com Pix e card)
  ├─ Pos-pagamento (email, membro, pixel, WhatsApp, afiliacao)
  ├─ Wallet (saldo, saques, antecipacoes)
  ├─ Billing (setup de cobrança e meios de pagamento via Stripe)
  ├─ WhatsApp engine (WAHA + Meta Cloud API providers)
  ├─ Unified AI Agent (OpenAI + Anthropic)
  ├─ PULSE API e artefatos de auditoria
  ├─ Sentry + Prometheus metrics
  └─ SSRF protection, rate limiting, RBAC

Worker (BullMQ / Railway)
  ├─ Flow engine (avaliacao segura via mathjs)
  ├─ Autopilot processor
  ├─ WhatsApp send dispatcher (Meta Cloud + WAHA via shared resolver)
  └─ Sentry + Prometheus metrics

Infra
  ├─ PostgreSQL (pgvector)
  ├─ Redis
  ├─ 13 GitHub Actions workflows
  ├─ Playwright E2E + visual regression
  ├─ Codacy max-rigor + CodeQL + Semgrep
  ├─ PULSE quality/autonomy machine
  └─ Dependabot + release automation
```

## Stack

| Camada     | Tecnologia                             | Escala atual                     |
| ---------- | -------------------------------------- | -------------------------------- |
| Frontend   | Next.js 16, React 19, SWR, Vitest      | 797 arquivos TS/TSX, 50 suites   |
| Backend    | NestJS 11, Prisma 5, Jest              | 1.149 arquivos TS, 259 specs     |
| Worker     | BullMQ 5, mathjs, Prisma symlinked     | 347 arquivos TS, 182 specs       |
| Database   | PostgreSQL + pgvector                  | 135 models, 40 migrations        |
| E2E        | Playwright                             | Fluxos de produto, compra, auth  |
| CI/CD      | GitHub Actions                         | 13 workflows, CodeQL, Dependabot |
| Monitoring | Sentry, Prometheus, structured logging | Frontend, backend e worker       |

## Modulos

### Funcionais

- **Auth** — JWT + refresh + Google + Apple + WhatsApp OTP + anonymous + magic
  link
- **Products** — CRUD completo, editor com 10 tabs (dados, planos, checkouts,
  URLs, comissionamento, cupons, campanhas, avaliacoes, after pay, IA)
- **Checkout** — Temas Blanc/Noir com cores dinamicas do config, Stripe-only
  (Pix + card), coupon popup automatico
- **Post-payment** — efeitos aprovados de compra com idempotencia, email de
  confirmacao, area de membros, pixel/CAPI, notificacao WhatsApp e trilhas de
  afiliacao/comissao
- **WhatsApp** — Dual provider (Meta Cloud API + WAHA, configurable via
  WHATSAPP_PROVIDER_DEFAULT), inbox real, autopilot com LLM, flow engine. Ver
  `docs/adr/0001-whatsapp-source-of-truth.md` para a arquitetura completa.
- **Kloel AI** — SSE streaming, tool calling, conversation store, context
  formatter, modulos extraidos (StreamWriter, ToolRouter, ConversationStore)
- **CRM** — Pipeline, contacts, neuro-CRM, segmentation, deals
- **Billing** — Stripe integration, usage tracking, trial management
- **Wallet** — Saldo real, transacoes, saques com verificacao atomica,
  antecipacoes
- **KYC** — Profile, fiscal, documents, bank, auto-approval
- **Flows** — Builder visual + engine de execucao no worker
- **Analytics** — Dashboard stats, daily activity, advanced analytics
- **PULSE** — API, CLI, artefatos, autonomia, proof readiness, graph, Codacy
  evidence, GitNexus adapter, external signals e gates de overclaim

### Parcialmente funcionais

- Products partnerships e affiliate system
- Marketing channels, campaigns

### Fachada (shell visual, dados honestos)

- Anuncios, Sites/Builder, Canvas, Funnels, Webinarios, Leads Scraper

## Seguranca

- JWT + WorkspaceGuard + ThrottlerModule (rate limiting por endpoint)
- RBAC com `@Roles` decorator (36 endpoints protegidos)
- SSRF protection ( `url-validator.ts` ) em fetch calls dinamicos — bloqueia
  localhost, IPs privados, cloud metadata, IPv6 interno
- DOMPurify sanitization em todo conteudo HTML dinamico
- Webhook signature verification (Stripe, Meta)
- Idempotency guards em endpoints de pagamento
- `forbidNonWhitelisted: true` no ValidationPipe global
- DTOs com class-validator em auth, billing, team, KYC, sales, wallet
- `AuthenticatedRequest` + `JwtPayload` interfaces tipadas em 12+ controllers
- `@CurrentUser()` param decorator
- Prompt sanitizer middleware

## CI/CD

```
Pre-commit:  lint-staged + prettier + ESLint
Pre-push:    typecheck + build + testes + Prisma validate + guard db push
CI:          arquitetura + format + qualidade + typecheck + lint + test + build
E2E:         Playwright com servicos locais e mocks dedicados
Visual:      Playwright Chromium com baselines Linux/Darwin versionadas
Security:    CodeQL + Codacy max-rigor + Semgrep + guards anti-skip
PULSE:       certificacao, readiness, artifacts e auditoria de overclaim
Deploy:      staging/producao com health probes, DB backup e rollback
```

### Workflows

| Workflow              | Trigger               |
| --------------------- | --------------------- |
| CI                    | push/PR to main       |
| Visual Regression     | PRs                   |
| CodeQL                | push/PR + weekly cron |
| Codacy Analysis       | push/PR               |
| Nightly Ops Audit     | daily 9 AM UTC        |
| Deploy Staging        | CI completion         |
| Deploy Production     | push to main + manual |
| Dependabot Auto Merge | patch/minor PRs       |
| Claude Code Review    | PRs                   |
| Release Please        | release automation    |

## Maquina PULSE

PULSE e a maquina local/CI que transforma o repositorio em uma superficie
auditavel. Ela nao e apenas um linter: coleta evidencias, monta grafos,
classifica capacidades, cruza artefatos, mede readiness, gera diretivas,
detecta overclaim e impede que uma IA declare conclusao sem prova.

### Superficies principais

- `scripts/pulse/run.js` e `scripts/pulse/index.ts` — entradas CLI da maquina
- `backend/src/pulse/**` — API, servico, DTOs e testes do modulo PULSE
- `PULSE_CERTIFICATE.json` — certificado atual da execucao PULSE
- `PULSE_REPORT.md` — relatorio humano da auditoria
- `PULSE_CLI_DIRECTIVE.json` — diretivas executaveis para agentes
- `PULSE_WORLD_STATE.json` — estado agregado da realidade observada
- `PULSE_CODACY_STATE.json` — snapshot de integracao Codacy
- `pulse.manifest.json` — manifesto resolvido da maquina

### Capacidades

- Parser registry dinamico para backend, frontend, UI, schema, hooks e APIs
- Evidence graph, behavior graph, AST graph, command graph e product model
- Runtime fusion com OTEL, Sentry, Datadog, Prometheus e GitHub Actions adapters
- Codacy evidence, false-positive adjudication e max-rigor lock
- Scenario engine, Playwright generation, path coverage e execution harness
- PULSE GitNexus para indexacao, status, impacto e freshness
- Self-trust, overclaim guard, proof readiness e production-proof gates
- Safety sandbox com leitura de arquivos protegidos e classificacao de efeitos

O certificado versionado atual reporta `status: PARTIAL` e `score: 61`. Isso
quer dizer que a maquina consegue operar e auditar, mas nao autoriza declarar
producao perfeita sem os gates e artefatos correspondentes passarem.

## Design System — Terminator

- Void black: `#0A0A0C`
- Ember: `#E85D30`
- Font: Sora (UI), JetBrains Mono (numeros)
- Sem gradientes, sem emojis
- Border radius max 6px
- SVG icons only

## Quick Start

### 1. Configurar envs

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

### 2. Instalar

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
npm --prefix worker install
npm --prefix e2e install
npm run prisma:generate
```

### 3. Database

```bash
cd backend && npx prisma migrate deploy
```

### 4. Iniciar

```bash
# Terminal 1 — backend
cd backend && npm run start:dev

# Terminal 2 — frontend
cd frontend && npm run dev

# Terminal 3 — worker
cd worker && npm run start:watch
```

### 5. Acessar

| Servico       | URL                            |
| ------------- | ------------------------------ |
| Frontend      | <http://localhost:3000>        |
| Backend       | <http://localhost:3001>        |
| Swagger       | <http://localhost:3001/api>    |
| Worker health | <http://localhost:3003/health> |

## Scripts

```bash
npm run typecheck        # typecheck backend + frontend + worker
npm run test             # testes backend + frontend + worker
npm run build            # build backend + frontend + worker
npm run lint             # lint backend + frontend
npm run quality:static   # format, guard:new-code, arquitetura, seatbelt, ratchet
npm run check:all        # suite agregada de gates locais
npm run guard:new-code   # constituicao IA, ESLint changed, visual, arquitetura
npm run pulse            # execucao PULSE
npm run pulse:report     # gera PULSE_REPORT.md
npm run pulse:certify    # certificacao PULSE
npm run pulse:ci         # PULSE usado pelo CI
npm run readiness:check  # audit de production readiness
npm run prepush:scoped   # mesmo caminho do pre-push escopado
```

## Deploy

| Servico  | Plataforma | Branch |
| -------- | ---------- | ------ |
| Frontend | Vercel     | main   |
| Backend  | Railway    | main   |
| Worker   | Railway    | main   |

Para selecionar o provider WhatsApp em producao (default: meta-cloud):

```env
WHATSAPP_PROVIDER_DEFAULT=meta-cloud   # ou whatsapp-api/waha
```

Ver `docs/adr/0001-whatsapp-source-of-truth.md` para a granularidade e regras de
fallback. (O legado WhatsApp browser runtime / screencast foi removido — refs em
backend/src/whatsapp/whatsapp-watchdog.service.ts e historico antigo deste
README.)

## Health Checks

- `GET /health/live` — liveness probe (sempre 200, sem dependencias) —
  orchestrators
- `GET /health/ready` — readiness probe (DB + Redis) — orchestrators
- `GET /health/system` — deep check (DB, Redis, WhatsApp, Worker, Storage,
  OpenAI, Anthropic, Stripe) — dashboards
- Worker: `GET :3003/health`

## Observabilidade

- **Sentry** — error tracking em frontend, backend, worker
- **Prometheus** — metricas com histograms/gauges/counters, endpoints protegidos
  por token
- **Structured logging** — NestJS Logger + pino, 625+ chamadas estruturadas
- **Audit log** — operacoes financeiras, webhook events, KYC
- **Financial alerts** — alertas de operacoes monetarias
- **DLQ monitoring** — dead letter queue webhooks

---

## PULSE Auditor Immutability

`scripts/pulse/no-hardcoded-reality-audit.ts` is a locked PULSE governance surface.

No AI CLI may edit, weaken, bypass, rename, delete, chmod, unflag, move, or replace this auditor. This prohibition applies to Codex, Claude, OpenCode, and any autonomous or assisted AI agent.

The auditor must keep scanning every source file inside `scripts/pulse/**` and must preserve hardcode debt when hardcode is deleted without a dynamic production replacement, including accumulated Git history debt.

If the auditor itself needs to change, stop. The human owner must perform that change outside autonomous AI execution.
