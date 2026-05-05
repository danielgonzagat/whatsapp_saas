# KLOEL

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/de45b0033ec04323b31a4a3ec49b1ce9)](https://app.codacy.com/gh/danielgonzagat/whatsapp_saas/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)
[![Codacy Badge](https://app.codacy.com/project/badge/Coverage/de45b0033ec04323b31a4a3ec49b1ce9)](https://app.codacy.com/gh/danielgonzagat/whatsapp_saas/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_coverage)

Plataforma AI-native de marketing digital e vendas. Monorepo com frontend
(Next.js / Vercel), backend (NestJS / Railway), worker (BullMQ / Railway).

## Arquitetura

```
Frontend (Next.js 16 / Vercel)
  ├─ Dashboard & Analytics
  ├─ Product Nerve Center (editor com 10 tabs)
  ├─ Checkout publico (pay.kloel.com — temas Blanc / Noir)
  ├─ WhatsApp Console (inbox, autopilot, flows)
  ├─ CRM Pipeline
  ├─ Kloel AI Assistant (SSE streaming)
  └─ Landing page (kloel.com)

Backend (NestJS 11 / Railway)
  ├─ 89 controllers, 107 models Prisma
  ├─ Auth (JWT + Google OAuth + Apple + WhatsApp OTP)
  ├─ Checkout (planos, pagamentos Stripe-only com Pix e card)
  ├─ Wallet (saldo, saques, antecipacoes)
  ├─ Billing (setup de cobrança e meios de pagamento via Stripe)
  ├─ WhatsApp engine (WAHA + Meta Cloud API providers)
  ├─ Unified AI Agent (OpenAI + Anthropic)
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
  ├─ 10 GitHub Actions workflows
  ├─ PULSE quality scanner (90+ parsers)
  └─ Dependabot + CodeQL
```

## Stack

| Camada     | Tecnologia                             | Escala                           |
| ---------- | -------------------------------------- | -------------------------------- |
| Frontend   | Next.js 16, React 19, SWR, Vitest      | 448 arquivos, 15 test suites     |
| Backend    | NestJS 11, Prisma 5, Jest              | 398 arquivos, 47 test suites     |
| Worker     | BullMQ 5, mathjs, Prisma (symlinked)   | 70 arquivos, 20 test suites      |
| Database   | PostgreSQL + pgvector                  | 107 models, 21 migrations        |
| CI/CD      | GitHub Actions                         | 10 workflows, CodeQL, Dependabot |
| Monitoring | Sentry, Prometheus, structured logging | 3 servicos instrumentados        |

## Modulos

### Funcionais

- **Auth** — JWT + refresh + Google + Apple + WhatsApp OTP + anonymous + magic
  link
- **Products** — CRUD completo, editor com 10 tabs (dados, planos, checkouts,
  URLs, comissionamento, cupons, campanhas, avaliacoes, after pay, IA)
- **Checkout** — Temas Blanc/Noir com cores dinamicas do config, Stripe-only
  (Pix + card), coupon popup automatico
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

### Parcialmente funcionais

- Products partnerships, member area, affiliate system
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
CI:          typecheck + lint + test + build + PULSE certification + E2E Playwright
Deploy:      staging automatico, production com health probes + DB backup + rollback
```

### Workflows

| Workflow              | Trigger               |
| --------------------- | --------------------- |
| CI                    | push/PR to main       |
| CodeQL                | push/PR + weekly cron |
| Nightly Ops Audit     | daily 9 AM UTC        |
| Deploy Staging        | CI completion         |
| Deploy Production     | push to main + manual |
| Dependabot Auto Merge | patch/minor PRs       |
| Claude Code Review    | PRs                   |

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
cd backend && npm install && npx prisma generate
cd ../frontend && npm install
cd ../worker && npm install
cd ..
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
npm run typecheck      # typecheck todos os workspaces
npm run test           # testes de todos os workspaces
npm run build          # build completo
npm run lint           # lint backend + frontend
npm run pulse          # scan de qualidade PULSE
npm run pulse:report   # gera PULSE_REPORT.md
npm run guard:db-push  # verifica que ninguem usa db push em prod
npm run readiness:check # audit de production readiness
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

