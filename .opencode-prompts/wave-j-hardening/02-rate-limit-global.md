# Wave J / Slice 2 — Hardening-RateLimitGlobal

## Mission

Apply `@nestjs/throttler` rate limit GLOBALLY to all 141 controllers, calibrated
by route class:

| Class           | Limit       | Reason                                                |
|-----------------|-------------|-------------------------------------------------------|
| auth            | 10/min      | Prevent brute force on login/recovery                 |
| webhook         | 100/min     | High inbound from Stripe/Meta/WAHA                    |
| read            | 300/min     | Dashboards / lists                                    |
| mutate          | 60/min      | Create/update on resources                            |
| ai              | 20/min      | LLM-backed routes — expensive upstream                |
| public-checkout | 30/min      | Customer-facing, but throttled to deter scrapers      |

Key: `IP + tenantId + userId` compound — protect both anonymous and authenticated.

## Ownership set

- `backend/src/app.module.ts` (configure ThrottlerModule global)
- `backend/src/common/throttler/throttler-config.ts` (CREATE)
- `backend/src/common/throttler/route-class.decorator.ts` (CREATE — `@RouteClass('auth')` etc)
- `backend/src/common/throttler/route-class.guard.ts` (CREATE — reads decorator, applies bucket)
- `backend/src/common/throttler/route-class.spec.ts`
- Annotate the existing 141 controllers — add `@RouteClass(...)` decorator to each class
  (or to specific methods that deviate from class default).

## Mandatory pre-read

1. `CLAUDE.md` — REGRA DE API + REGRA DE INTEGRAÇÕES EXTERNAS.
2. `AGENTS.md`.
3. `backend/src/app.module.ts`.
4. List of controllers: `find backend/src -name "*.controller.ts" | xargs grep -l "@Controller"`.

## Pattern

```ts
// throttler-config.ts
export const ROUTE_CLASS_LIMITS = {
  auth: { ttl: 60000, limit: 10 },
  webhook: { ttl: 60000, limit: 100 },
  read: { ttl: 60000, limit: 300 },
  mutate: { ttl: 60000, limit: 60 },
  ai: { ttl: 60000, limit: 20 },
  'public-checkout': { ttl: 60000, limit: 30 },
} as const;

// route-class.decorator.ts
export const RouteClass = (cls: keyof typeof ROUTE_CLASS_LIMITS) =>
  SetMetadata('routeClass', cls);

// app.module.ts
@Module({
  imports: [
    ThrottlerModule.forRoot({ /* defaults */ }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: RouteClassGuard },
  ],
})

// example controller annotation
@Controller('auth')
@RouteClass('auth')
export class AuthController { ... }
```

## Forbidden moves

- Throttle key based only on IP — must include tenantId+userId so multi-user
  tenants aren't penalized by single user's bursts.
- Skip throttle on `@Public()` routes — public routes need the strictest limits.
- Configure a route to BYPASS throttle without explicit `@RouteClass('bypass')`
  + comment explaining why.
- Bypass tokens, new `any`, protected files.

## Validation gates

```bash
cd backend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/common/throttler/**/*.ts src/app.module.ts
npx jest --testPathPattern=throttler

# Integration: spin backend, hit auth route 11 times, expect 11th to 429
pnpm run start:test &
BACKEND_PID=$!
sleep 5
for i in {1..11}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/auth/login -d '{}' -H "Content-Type: application/json"; done
kill $BACKEND_PID
```

## Definition of done

- Global `ThrottlerGuard` (via `RouteClassGuard`) applied.
- All 141 controllers either annotated with `@RouteClass(...)` or rely on the
  class default. Spot-check 10 controllers in the report.
- Spec covers each route class hitting limit → 429.
- `npx tsc` no regress.
- `npx eslint` clean.
- No bypass, no protected, no commits.

## Hard stop conditions

- If `@nestjs/throttler` not in package.json — STOP, report (need install).
- If RedisStore for distributed throttle is needed but Redis isn't wired —
  STOP, report.
