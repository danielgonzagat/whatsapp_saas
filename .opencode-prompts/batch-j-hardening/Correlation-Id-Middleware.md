# Wave J — Correlation-Id Middleware (AsyncLocalStorage)

## Mission

Implement NestJS middleware + AsyncLocalStorage that:
1. Reads `X-Request-ID` HTTP header; if absent, generates one via `crypto.randomUUID()`
2. Stores requestId in AsyncLocalStorage so any service can read it without prop drilling
3. Adds `X-Request-ID` to response headers so the client can correlate
4. Exposes a `getRequestId()` helper for services to enrich their logs

## Pre-read

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` (REGRA DE OBSERVABILIDADE — logs precisam de correlation-id)
3. `backend/src/app.module.ts`
4. `backend/src/logging/structured-logger.ts` (existing logger to integrate with)
5. `backend/src/bootstrap.ts` (where middleware order matters)

## Ownership

Create:
- `backend/src/common/middleware/correlation-id.middleware.ts`
- `backend/src/common/middleware/correlation-id.context.ts` (AsyncLocalStorage holder + getRequestId() helper)
- `backend/src/common/middleware/correlation-id.middleware.spec.ts` (≥5 tests)
- Modify `backend/src/app.module.ts` to register the middleware (FIRST in chain — must run before everything)

Constraints:
- NO bypass tokens
- Strict TypeScript
- Use `node:async_hooks` `AsyncLocalStorage`

## Implementation skeleton

```ts
// correlation-id.context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

interface CorrelationContext {
  requestId: string;
}

export const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

export function getRequestId(): string {
  return correlationStorage.getStore()?.requestId ?? 'no-correlation-id';
}

// correlation-id.middleware.ts
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = String(req.header('x-request-id') ?? '').trim();
    const requestId = incoming || randomUUID();
    res.setHeader('X-Request-ID', requestId);
    correlationStorage.run({ requestId }, () => next());
  }
}
```

## Validation

```bash
cd /Users/danielpenin/whatsapp_saas/backend
npx jest src/common/middleware/correlation-id.middleware.spec.ts --silent
npx tsc --noEmit
```

## Definition of Done

- Both files created + spec passes (≥5 tests: incoming header is respected, missing header generates UUID, response gets X-Request-ID header, getRequestId() returns value inside run(), getRequestId() returns sentinel outside run())
- Registered as `.apply(CorrelationIdMiddleware).forRoutes('*')` BEFORE IdempotencyMiddleware
- backend tsc=0
