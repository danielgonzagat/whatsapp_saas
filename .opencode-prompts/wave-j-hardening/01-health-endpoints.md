# Wave J / Slice 1 — Hardening-HealthLivenessReadiness

## Mission

Expose three production health endpoints on the NestJS backend:
- `GET /health/liveness` — public, basic liveness only (returns 200 if process up)
- `GET /health/readiness` — public, validates each downstream indicator (Postgres, Redis, BullMQ, Stripe, Meta SDK, OpenAI, Anthropic). Returns 200 only if ALL UP. Returns 503 with breakdown if any DOWN.
- `GET /health/deep` — admin-auth-guarded, includes the readiness payload PLUS detailed performance metrics, queue depths, recent errors.

Endpoints must be Railway-/K8s-probeable. No tenant context required for liveness/readiness.

## Ownership set

- `backend/src/health/health.controller.ts`
- `backend/src/health/health.module.ts`
- `backend/src/health/system-health.service.ts` (likely extend, NOT decompose — 725 lines exceeds 600 touched, that's Wave K)
- `backend/src/health/system-health.service.spec.ts`
- `backend/src/health/indicators/` — each indicator (bullmq, redis, email, stripe, database-backup, prisma) — verify exist, add if missing for Meta/OpenAI/Anthropic
- `backend/src/health/indicators/meta.indicator.ts` (CREATE if missing)
- `backend/src/health/indicators/openai.indicator.ts` (CREATE if missing)
- `backend/src/health/indicators/anthropic.indicator.ts` (CREATE if missing)
- `backend/src/health/indicators/*.spec.ts` for each
- `e2e/specs/health.spec.ts` (CREATE or extend)

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE OBSERVABILIDADE.
2. `AGENTS.md`.
3. `docs/ai/PULSE_OPENCODE_SUBAGENT_DELEGATION_RULES.md`.
4. `backend/src/health/` — every file in this dir.
5. `backend/src/admin/auth/admin-auth.guard.ts` — for the deep endpoint guard.

## Implementation pattern

```ts
@Controller('health')
export class HealthController {
  constructor(private readonly health: SystemHealthService) {}

  @Get('liveness')
  liveness() {
    return { status: 'up', uptime: process.uptime(), timestamp: new Date().toISOString() };
  }

  @Get('readiness')
  async readiness(@Res() res: Response) {
    const result = await this.health.checkReadiness();  // returns { overall: 'up'|'down', indicators: {...} }
    res.status(result.overall === 'up' ? 200 : 503).json(result);
  }

  @UseGuards(AdminAuthGuard)
  @Get('deep')
  async deep() {
    return this.health.deepDiagnostic();
  }
}
```

Each indicator (10 total: prisma, redis, bullmq, email, stripe, meta, openai, anthropic, database-backup, websocket-if-applicable) must:
- Implement `HealthIndicator` interface
- Have `isHealthy(): Promise<HealthIndicatorResult>`
- Timeout at 2 seconds (don't hang the probe)
- Include the upstream's recent latency in the result payload

## Forbidden moves

- Health endpoint reads database for every request without caching — would
  cause hot loops. Cache readiness for max 5 seconds (small in-memory TTL).
- Bypass the admin guard on `/health/deep`.
- Include secrets in any response (no API keys, no tokens, no connection strings).
- Bypass tokens, new `any`, protected files.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/health/**/*.ts
npx jest --testPathPattern=health

cd ..
# E2E: spin backend in test mode, hit endpoints
pnpm --filter backend run start:test &
BACKEND_PID=$!
sleep 5
curl -s http://localhost:3000/health/liveness | jq .
curl -s http://localhost:3000/health/readiness | jq .
curl -s -H "Authorization: Bearer $TEST_ADMIN_JWT" http://localhost:3000/health/deep | jq . | head -50
kill $BACKEND_PID
```

## Definition of done

- All 3 endpoints respond correctly: liveness 200, readiness 200 OR 503 with details, deep 200 (admin) OR 401/403.
- 10 indicators each implemented and tested.
- Specs cover happy + each-indicator-down scenarios.
- `npx tsc` no regress.
- `npx eslint` clean.
- E2E spec passes locally.
- No bypass tokens, no protected files, no commits.

## Hard stop conditions

- If existing health indicators have hardcoded "always UP" — STOP, report (need
  ADR before fixing).
- If `system-health.service.ts` is so coupled that extending it triggers
  >600 lines on touched — STOP, report (decomp is Wave K).
- If admin auth guard requires complex setup — STOP, report.
