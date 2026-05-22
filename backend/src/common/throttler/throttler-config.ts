import { ExecutionContext } from '@nestjs/common';
import { ThrottlerOptions } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';

/**
 * Rate-limit buckets by route class.
 *
 * Each entry defines a named throttler consumed by {@link ThrottlerModule.forRoot}.
 * The `skipIf` predicate reads the `@RouteClass(...)` decorator metadata and
 * only activates when the controller class is annotated with the matching
 * route class.
 *
 * ## Compound key
 *
 * {@link RouteClassGuard} overrides `generateKey()` to include tenantId + userId
 * in every storage key, isolating rate budgets per tenant and per user.
 *
 * Unannotated controllers fall back to the `read` tier (300/min) as the safest
 * default.
 */
export const ROUTE_CLASS_LIMITS = {
  auth: { ttl: 60000, limit: 10 },
  webhook: { ttl: 60000, limit: 100 },
  read: { ttl: 60000, limit: 300 },
  mutate: { ttl: 60000, limit: 60 },
  ai: { ttl: 60000, limit: 20 },
  'public-checkout': { ttl: 60000, limit: 30 },
} as const;

export type RouteClassKey = keyof typeof ROUTE_CLASS_LIMITS;

const ROUTE_CLASS_METADATA_KEY = 'routeClass';

const reflector = new Reflector();

function getRouteClass(ctx: ExecutionContext): RouteClassKey | undefined {
  return reflector.get<RouteClassKey>(ROUTE_CLASS_METADATA_KEY, ctx.getClass());
}

function skipUnlessRouteClass(routeClass: RouteClassKey): (ctx: ExecutionContext) => boolean {
  return (ctx: ExecutionContext) => {
    const cls = getRouteClass(ctx);
    if (!cls) {
      return routeClass !== 'read';
    }
    return cls !== routeClass;
  };
}

/** Named throttler tiers consumed by {@link ThrottlerModule.forRoot}. */
export const THROTTLE_TIERS: ThrottlerOptions[] = (
  Object.entries(ROUTE_CLASS_LIMITS) as [RouteClassKey, { ttl: number; limit: number }][]
).map(([name, { limit, ttl }]) => ({
  name,
  limit,
  ttl,
  skipIf: skipUnlessRouteClass(name),
}));
