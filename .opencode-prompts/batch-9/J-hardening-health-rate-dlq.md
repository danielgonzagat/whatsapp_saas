# Wave J — Backend Hardening (Health + Rate-Limit + DLQ + Idempotency)

## Mission

Production-grade hardening of backend operational endpoints:

1. **Hardening-HealthLivenessReadiness**: ensure `/health/liveness`, `/health/readiness`, `/health/deep` endpoints work, validate all indicators (Postgres + Redis + BullMQ + Stripe + Meta + OpenAI + Anthropic)
2. **Hardening-RateLimitGlobal**: ThrottlerGuard global in `app.module.ts` with per-route classes (auth 10/min, webhook 100/min, leitura 300/min, mutação 60/min, IA 20/min)
3. **Hardening-DLQAdminPanel**: backend endpoints for `/admin/operations/dlq` (list/reprocess/discard/inspect per queue)
4. **Hardening-IdempotencyMiddleware**: NestJS middleware reading `Idempotency-Key` header, storing result in Redis 24h, applied to all external-mutation routes
5. **Hardening-LoggerSweep**: ensure Logger in all 247 services (6 currently missing); add correlation-id middleware
6. **Hardening-ObservabilityStack**: OpenTelemetry spans in all controllers + processors

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE OBSERVABILIDADE
3. `AGENTS.md`
4. `backend/src/health/` (existing scaffolding)
5. `backend/src/common/throttler/` (existing controller-classification.ts)
6. `backend/src/common/idempotency/idempotency.decorator.ts` (existing)

## Ownership set

- `backend/src/health/health.controller.ts` (extend or verify)
- `backend/src/health/indicators/` (verify all UP)
- `backend/src/app.module.ts` (Throttler global + IdempotencyMiddleware global)
- `backend/src/common/throttler/throttle.config.ts` (per-route classes)
- `backend/src/common/idempotency/idempotency.middleware.ts` (CREATE if missing)
- `backend/src/admin/operations/dlq.controller.ts` (CREATE)
- `backend/src/admin/operations/dlq.controller.spec.ts`
- `backend/src/common/observability/correlation-id.middleware.ts` (CREATE)
- 6 services missing Logger: identify via `grep -L "new Logger" src/**/*.service.ts | head` and add

## Constraints

- NO bypass tokens
- NO commits
- Health endpoints must FAIL CLOSED (if any indicator down, /readiness returns 503)
- Rate-limit keys must include IP + tenant + user (not just IP)
- DLQ admin operations require admin role guard + audit trail

## Definition of Done

- `curl https://api.kloel.com/health/readiness` returns 200 with all indicators UP (in CI/staging)
- `wrk -t8 -c200 -d30s` shows rate-limit kicking in
- DLQ admin panel returns list of failed jobs per queue
- `Idempotency-Key` header behavior works (replay returns cached result)
- All 247 services have Logger
- Correlation-id propagates through `AsyncLocalStorage`
- Report per-area completion

## Hard stop conditions

- Real Redis/Postgres needed for integration test in CI — STOP, report integration gap (must run in CI env)
- An indicator requires production env var (Stripe live key, etc) — STOP, report
