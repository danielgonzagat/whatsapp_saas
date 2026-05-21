# Wave J — Idempotency-Key Middleware

## Mission

Implement NestJS middleware that:
1. Reads `Idempotency-Key` HTTP header on POST/PUT/PATCH/DELETE requests
2. Stores the response in Redis for 24h keyed by `idempotency:<method>:<path>:<key>`
3. On replay (same method+path+key), returns the cached response without re-executing the controller
4. Skips middleware when no header present (opt-in semantics)
5. Applies globally; controllers don't need decorator (zero-config opt-in)

## Pre-read

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` (REGRA DE PAGAMENTOS — idempotência mandatória)
3. `backend/src/app.module.ts` (global middleware registration pattern)
4. `backend/src/billing/billing-webhook.helpers.ts` (existing idempotency pattern via WebhookEvent)
5. `backend/src/common/redis/redis.util.ts` (Redis client factory)

## Ownership

Create:
- `backend/src/common/middleware/idempotency.middleware.ts` (the middleware)
- `backend/src/common/middleware/idempotency.middleware.spec.ts` (≥5 tests)
- Modify `backend/src/app.module.ts` to register middleware

Constraints:
- NO `as any`, NO `@ts-ignore`, NO eslint-disable, NO suppress markers
- Strict TypeScript
- Use existing `createRedisClient` pattern
- 24h TTL = 86400 seconds

## Implementation skeleton

```ts
@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);
  private readonly redis: Redis;
  private static readonly TTL_SECONDS = 86400;
  private static readonly MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  constructor() {
    this.redis = createRedisClient();
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const key = String(req.header('idempotency-key') ?? '').trim();
    if (!key) return next();
    if (!IdempotencyMiddleware.MUTATING_METHODS.has(req.method)) return next();

    const cacheKey = `idempotency:${req.method}:${req.path}:${key}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      const { status, body } = JSON.parse(cached);
      res.status(status).json(body);
      return;
    }

    // Capture original res.json
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      void this.redis
        .set(cacheKey, JSON.stringify({ status: res.statusCode, body }), 'EX', IdempotencyMiddleware.TTL_SECONDS)
        .catch(() => undefined);
      return originalJson(body);
    };
    next();
  }
}
```

## Validation

```bash
cd /Users/danielpenin/whatsapp_saas/backend
npx jest src/common/middleware/idempotency.middleware.spec.ts --silent
npx tsc --noEmit
```

## Definition of Done

- Middleware created + spec passes (≥5 tests: GET skip, mutating with key, cache hit returns cached, no-key skip, Redis error degrades gracefully)
- Wired into app.module.ts via `.apply(IdempotencyMiddleware).forRoutes('*')`
- `npx tsc --noEmit` PASS in backend
