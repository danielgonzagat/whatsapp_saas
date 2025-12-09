# KLOEL WhatsApp SaaS - AI Coding Agent Instructions

## Architecture Overview

**Monorepo Structure**: NestJS backend + Next.js frontend + BullMQ worker + PostgreSQL/Redis
- `backend/` - NestJS API (port 3001)
- `frontend/` - Next.js dashboard (port 3000)
- `worker/` - BullMQ job processors (flow-engine, autopilot, campaigns, media, voice)
- `docker-compose.yml` - pgvector/pg15 + Redis 7

**Core Services** (`backend/src/`):
- `kloel/` - AI brain with tool-calling (workspace admin, creates flows/campaigns/products)
- `autopilot/` - Autonomous AI sales agent with GPT-4o decision engine
- `flows/` - Visual flow builder + execution engine
- `crm/` - Contact management with lead scoring and sentiment analysis
- `whatsapp/` - Multi-provider abstraction (WPPConnect, Meta Cloud API, Evolution API)
- `inbox/` - Unified omnichannel inbox with AI copilot
- `campaigns/` - Mass messaging with SmartTime scheduling
- `billing/` - Stripe integration with workspace suspension logic

## Critical Patterns

### 1. Flow Engine (`worker/flow-engine-global.ts`)
- **Stateful execution**: Uses Redis `ContextStore` for WAIT nodes and timeouts
- **Queue-based**: Jobs pushed to `flow-engine` queue via `flowQueue.add()`
- **Node types**: `message`, `input`, `ai`, `condition`, `wait`, `http`, `subflow`, `crm-action`
- **Execution state**: Stored in `FlowExecution` table with `currentNodeId` and `state` JSONB
- **Watchdog**: 5s interval checks for timeouts (`timeoutAt` field)
- **Sub-flows**: Stack-based with `stack[]` tracking parent flow/node

### 2. Autopilot AI Agent (`backend/src/autopilot/`)
- **Intent detection**: GPT-4o analyzes messages → `BUY_SIGNAL`, `OBJECTION`, `QUESTION`, etc.
- **Action decision**: AI chooses `SEND_OFFER`, `SCHEDULE_MEETING`, `HANDOVER`, `GHOST_CLOSER`
- **Rate limiting**: `AUTOPILOT_CONTACT_DAILY_LIMIT` (default 5), `AUTOPILOT_WORKSPACE_DAILY_LIMIT` (1000)
- **Follow-up cycle**: Hourly job for silent conversations (`AUTOPILOT_SILENCE_HOURS` = 24h)
- **Billing guard**: Checks `billingSuspended` in `providerSettings` before enabling
- **Metrics**: Prometheus counters in `worker/metrics.ts` (`worker_autopilot_ghost_closer_total`, etc.)

### 3. KLOEL Tool-Calling Layer (`backend/src/kloel/`)
- **System prompt**: `KLOEL_SYSTEM_PROMPT` defines available tools (create_flow, create_campaign, update_crm, etc.)
- **Streaming**: SSE via `res.write()` with JSON events (`chunk`, `tool_call`, `done`)
- **Tool execution**: Directly calls Prisma/services (e.g., `FlowsService.save()`, `CampaignsService.create()`)
- **Context**: Loads workspace settings + conversation history from `KloelConversation` model
- **Modes**: `chat`, `onboarding`, `sales` - different system prompts per mode

### 4. Database (Prisma + pgvector)
- **Schema**: `backend/prisma/schema.prisma` (1100+ lines)
- **Extensions**: `extensions = [vector]` for RAG embeddings
- **Key models**: `Workspace`, `Contact`, `Flow`, `FlowExecution`, `Campaign`, `Conversation`, `Message`, `Agent`, `KnowledgeBase`, `Vector`
- **Multi-tenancy**: All tables scoped by `workspaceId`
- **Migrations**: Known drift (see `PRISMA_ALIGNMENT_PLAN.md`) - reconcile before deploy
- **Commands**: `npx prisma migrate deploy` (production), `npx prisma generate` (after schema changes)

### 5. Queue System (BullMQ)
- **Redis URL resolution**: `resolveRedisUrl()` in `backend/src/common/redis/redis.util.ts` (checks REDIS_PUBLIC_URL → REDIS_URL → REDIS_HOST/PORT → fallback)
- **Queues**: `autopilot-jobs`, `flow-engine`, `campaign-jobs`, `media-jobs`, `voice-jobs`, `scraper-jobs`
- **Worker**: `worker/processor.ts` - single entrypoint spawns all processors
- **Job data**: Always include `workspaceId` + domain-specific fields
- **Delayed jobs**: Used for WAIT nodes and scheduled follow-ups
- **Bull Board**: Dashboard at `/admin/queues` (see `backend/src/ops/ops.module.ts`)

### 6. WhatsApp Providers (`backend/src/whatsapp/`)
- **ProviderRegistry**: Factory pattern for `WppConnectProvider`, `MetaCloudProvider`, `EvolutionProvider`, `UltraWAProvider`
- **Normalization**: All providers implement `send()`, `sendMedia()`, `getQR()` with unified interface
- **Session storage**: `whatsapp-sessions/` directory for WPPConnect auth files
- **Webhook handling**: `webhooks/whatsapp-webhook.controller.ts` - normalizes incoming messages to `Message` model

## Developer Workflows

### Local Development
```bash
# Backend
cd backend
npm install
npx prisma generate
npm run start:dev  # Runs on port 3001

# Worker
cd worker
npm install
npm run start:watch  # Hot reload with nodemon

# Frontend
cd frontend
npm install
npm run dev  # Runs on port 3000
```

### Docker Compose
```bash
docker-compose up -d postgres redis  # Start DB only
docker-compose up  # Full stack (backend + worker + frontend)
```

### Migrations
- **Create**: `cd backend && npx prisma migrate dev --name add_feature`
- **Deploy**: `npx prisma migrate deploy` (production)
- **Reset** (dev only): `npx prisma migrate reset`
- **Generate client**: `npx prisma generate` (always after schema changes)

### Testing
- **Backend**: `cd backend && npm test` (Jest)
- **E2E flows**: `cd e2e && npm test` (Playwright - tests flow execution)
- **Smoke tests**: `scripts/smoke_all.sh` (requires `API_BASE`, `TOKEN`, `WORKSPACE_ID` env vars)

### Debugging
- **Logs**: Winston logger in `backend/src/logging/`, worker uses `WorkerLogger` class
- **Metrics**: Prometheus exposed at `/metrics` (backend + worker)
- **Grafana**: Pre-built dashboard in `worker/autopilot-grafana.json`
- **Queue monitoring**: Bull Board at `http://localhost:3001/admin/queues`
- **Sentry**: Configured in `backend/src/sentry.ts` (requires `SENTRY_DSN`)

## Project-Specific Conventions

### Module Pattern (NestJS)
- Every feature = standalone module (e.g., `AutopilotModule`, `FlowsModule`)
- Services injected via constructor DI
- Guards: `JwtAuthGuard` (auth), `RolesGuard` (permissions), `WorkspaceGuard` (multi-tenancy)
- Interceptors: `RequestLoggerInterceptor`, `MetricsInterceptor`, `RequestIdInterceptor`

### Error Handling
- **Database**: `PrismaErrorHandler` in `backend/src/prisma/` - translates P2021, P2025 errors
- **API**: NestJS exception filters return standardized JSON with `statusCode`, `message`, `error`
- **Workers**: Jobs retry 3x with exponential backoff, then move to DLQ (see `worker/dlq-monitor.ts`)

### Security Patterns
- **SSRF protection**: `safeRequest()` in `worker/utils/ssrf-protection.ts` - validates URLs before HTTP nodes
- **Prompt injection**: `sanitizeUserInput()` in `worker/utils/prompt-sanitizer.ts` - cleans AI inputs
- **Jitter**: `jitterMin`/`jitterMax` in `Workspace` model - random delays for anti-ban
- **Rate limiting**: `@Throttle()` decorator + `ThrottlerGuard` (100 req/min default)

### Data Flow: Incoming WhatsApp Message
1. Webhook hits `WebhooksController.whatsappWebhook()` (provider-specific endpoint)
2. Creates `Message` record with `workspaceId`, `conversationId`, `senderId`
3. If autopilot enabled: pushes to `autopilot-jobs` queue
4. Worker's `autopilot-processor.ts` runs AI analysis
5. AI decides action → executes (e.g., sends reply, starts flow, updates CRM)
6. WebSocket broadcast via `AlertsGateway` for inbox real-time updates

### Code Style
- **TypeScript**: Strict mode, prefer `interface` over `type`
- **Async/await**: Always use, never callbacks
- **Naming**: `camelCase` for variables/functions, `PascalCase` for classes/interfaces
- **Imports**: Absolute paths (`@/common/...`) configured in `tsconfig.json`
- **Comments**: JSDoc for public APIs, inline comments for complex logic only

## Critical Files for Reference

- `backend/src/app.module.ts` - Module registration, Redis config, global guards
- `worker/flow-engine-global.ts` - Flow execution engine (1342 lines)
- `backend/src/autopilot/autopilot.service.ts` - AI agent core logic (1667 lines)
- `backend/prisma/schema.prisma` - Database schema (1102 lines)
- `README.md` - Full feature list ("Moedas de Ouro" = unique differentiators)
- `README_AUTOPILOT.md` - Autopilot architecture and usage
- `PRISMA_ALIGNMENT_PLAN.md` - Known schema drift issues

## When Making Changes

1. **Adding a module**: Create in `backend/src/[module]/` with `[module].module.ts`, `[module].service.ts`, `[module].controller.ts`, register in `app.module.ts`
2. **Database changes**: Edit `schema.prisma` → `npx prisma migrate dev` → `npx prisma generate` → update DTOs
3. **Flow nodes**: Add type to `FlowEngineGlobal.processNode()` switch in `worker/flow-engine-global.ts`
4. **AI tools**: Add to `KLOEL_SYSTEM_PROMPT` + implement in `KloelService.executeTool()`
5. **Worker jobs**: Create processor file, export function, add to `worker/processor.ts` imports

## Common Pitfalls

- **Prisma client stale**: Run `npx prisma generate` after every schema change
- **Redis connection**: Check `REDIS_URL` or `REDIS_HOST`/`REDIS_PASSWORD` env vars (see `redis.util.ts` for precedence)
- **Queue not processing**: Ensure worker is running AND Redis is accessible
- **Flow WAIT nodes**: Must use `ContextStore.set()` to persist state, not just DB
- **Multi-tenancy**: ALWAYS filter by `workspaceId` in queries (security critical)
- **WhatsApp sessions**: WPPConnect requires persistent storage in `whatsapp-sessions/` (Docker volume)
