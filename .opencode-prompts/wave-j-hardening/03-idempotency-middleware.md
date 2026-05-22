# Wave J / Slice 3 — Hardening-IdempotencyMiddleware

## Mission

Install a NestJS middleware that reads `Idempotency-Key` HTTP header, looks up
prior results in Redis (with 24h TTL), and returns cached result if found.
Apply to all mutating routes (POST/PUT/PATCH/DELETE) on external-facing
controllers: payments, ads-sync, WhatsApp send, email send, wallet operations.

## Ownership set

- `backend/src/common/idempotency/idempotency.middleware.ts` (CREATE)
- `backend/src/common/idempotency/idempotency.service.ts` (CREATE)
- `backend/src/common/idempotency/idempotency.decorator.ts` (CREATE or extend if `@Idempotent()` already exists)
- `backend/src/common/idempotency/idempotency.module.ts` (CREATE)
- `backend/src/common/idempotency/idempotency.service.spec.ts`
- `backend/src/common/idempotency/idempotency.middleware.spec.ts`
- `backend/src/app.module.ts` (register module + middleware globally)
- Apply `@Idempotent()` decorator to controller methods (only the methods listed in mission):
  - `payments/*.controller.ts` — all POST/PATCH
  - `meta/*.controller.ts` — webhook + sync trigger endpoints
  - `whatsapp/*.controller.ts` — send-message endpoints
  - `kloel/wallet.controller.ts` — processSale, confirmPayment, withdraw, addBankAccount
  - `kloel/sales.controller.ts` — create order/sale
  - `email/*.controller.ts` — send email endpoints

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE API + REGRA DE PAGAMENTOS + REGRA DE INTEGRAÇÕES.
2. `AGENTS.md`.
3. `backend/src/common/idempotency/` — see if it already exists; extend if so.
4. `backend/src/app.module.ts`.
5. Redis configuration in backend module.

## Implementation pattern

```ts
// idempotency.middleware.ts
@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(private readonly idempotency: IdempotencyService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const key = req.header('Idempotency-Key');
    if (!key) return next();
    
    // Only apply to mutating methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    
    const cached = await this.idempotency.get(key, req.method, req.path);
    if (cached) {
      res.status(cached.status).json(cached.body);
      return;
    }
    
    // Capture response for caching
    const originalSend = res.json.bind(res);
    res.json = (body: unknown) => {
      this.idempotency.set(key, req.method, req.path, res.statusCode, body, 24 * 3600);
      return originalSend(body);
    };
    
    next();
  }
}

// idempotency.service.ts
@Injectable()
export class IdempotencyService {
  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  private cacheKey(idemKey: string, method: string, path: string): string {
    return `idem:${method}:${path}:${idemKey}`;
  }

  async get(key: string, method: string, path: string) {
    const raw = await this.redis.get(this.cacheKey(key, method, path));
    return raw ? JSON.parse(raw) : null;
  }

  async set(key: string, method: string, path: string, status: number, body: unknown, ttlSec: number) {
    const cacheKey = this.cacheKey(key, method, path);
    const payload = JSON.stringify({ status, body });
    await this.redis.set(cacheKey, payload, 'EX', ttlSec);
  }
}
```

Key uniqueness includes `method+path+idemKey` to prevent same key replaying
different operations.

## Forbidden moves

- Apply to GET routes (idempotency-key on GET is meaningless).
- Cache successful AND failed responses without distinguishing them. Cache
  ALL responses (including 4xx) — the goal is "exactly same response on replay".
- Use only `idempotency-key` without method+path — collision risk.
- Bypass tokens, new `any`, protected files.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/common/idempotency/**/*.ts
npx jest --testPathPattern=idempotency

# Integration: spin backend, send same Idempotency-Key twice → second returns cached
pnpm run start:test &
BACKEND_PID=$!
sleep 5
RESP1=$(curl -s -H "Idempotency-Key: test-123" -X POST http://localhost:3000/api/wallet/withdraw -d '{"amount":1000}' -H "Content-Type: application/json" -H "Authorization: Bearer $TEST_JWT")
RESP2=$(curl -s -H "Idempotency-Key: test-123" -X POST http://localhost:3000/api/wallet/withdraw -d '{"amount":1000}' -H "Content-Type: application/json" -H "Authorization: Bearer $TEST_JWT")
test "$RESP1" = "$RESP2" || echo "FAIL: responses differ"
kill $BACKEND_PID
```

## Definition of done

- Middleware globally registered via `MiddlewareConsumer` in app.module.
- 6+ controllers annotated with `@Idempotent()` on mutating methods.
- Specs cover happy + cache-hit + different-method-same-key + TTL-expire.
- `npx tsc` no regress.
- `npx eslint` clean.
- No bypass, no protected files, no commits.

## Hard stop conditions

- Redis not configured in backend — STOP, report.
- @nestjs-modules/ioredis or ioredis not in package.json — STOP, report.
- Any controller method that mutates external state has NO Idempotency-Key
  contract AT THE OPENAPI / DOC level — note in report but do NOT silently
  add (the contract should be designed before middleware).
