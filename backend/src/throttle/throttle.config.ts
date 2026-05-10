import { ExecutionContext } from '@nestjs/common';
import { ThrottlerOptions } from '@nestjs/throttler';

/**
 * Rate-limiting tier definitions.
 *
 * Each tier is a named {@link ThrottlerOptions} entry consumed by
 * {@link ThrottlerModule.forRoot}.  The `skipIf` predicate determines
 * whether the tier applies to the current request so only the relevant
 * tier fires — unused tiers are skipped per-request.
 *
 * ## Tier Summary
 *
 * | Tier           | Limit    | Window | Target                        |
 * | -------------- | -------- | ------ | ----------------------------- |
 * | `auth`         | 5 / min  | 60 s   | `/auth/*` (IP-based)           |
 * | `webhook`      | 200/min  | 60 s   | `/hooks/*`, `/webhooks/*`      |
 * | `get`          | 300/min  | 60 s   | All `GET` requests             |
 * | `mutation`     | 100/min  | 60 s   | `POST/PUT/PATCH/DELETE`        |
 * | `ai-tool`      | 60/min   | 60 s   | AI / LLM tool-call endpoints   |
 *
 * ## Per-tenant key extraction
 *
 * The {@link TenantThrottlerGuard} overrides `generateKey()` so every
 * storage key includes the resolved workspace/tenant identifier.  This
 * guarantees one tenant cannot consume another tenant's rate budget.
 *
 * ### Workspace resolution order
 * 1. `req.workspaceId` (set by `WorkspaceGuard` from the JWT)
 * 2. `req.params.workspaceId` (explicit URL param — webhooks, public APIs)
 * 3. `req.headers['x-workspace-id']` (API key / service-to-service)
 *
 * When no workspace is resolved the key falls back to the raw IP tracker,
 * which is the safe default for unauthenticated public routes (auth
 * login, registration, etc.).
 */

/** HTTP methods classified as mutations. */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function resolveHttpMethod(ctx: ExecutionContext): string {
  return ctx.switchToHttp().getRequest<{ method?: string }>().method ?? 'GET';
}

function resolveRequestPath(ctx: ExecutionContext): string {
  return ctx.switchToHttp().getRequest<{ url?: string }>().url ?? '';
}

function isAuthRoute(ctx: ExecutionContext): boolean {
  const path = resolveRequestPath(ctx);
  return path.startsWith('/auth/') || path.startsWith('/auth?');
}

function isWebhookRoute(ctx: ExecutionContext): boolean {
  const path = resolveRequestPath(ctx);
  return path.includes('/hooks/') || path.includes('/webhooks/');
}

function isGetRequest(ctx: ExecutionContext): boolean {
  return resolveHttpMethod(ctx) === 'GET';
}

function isMutationRequest(ctx: ExecutionContext): boolean {
  return MUTATION_METHODS.has(resolveHttpMethod(ctx));
}

function isAiToolRoute(ctx: ExecutionContext): boolean {
  const path = resolveRequestPath(ctx);
  return (
    path.startsWith('/kloel/agent/') ||
    path.startsWith('/copilot/') ||
    path.startsWith('/autopilot/') ||
    path.startsWith('/ai-brain/')
  );
}

/** Named throttler tier: authentication endpoints. */
const AUTH_TIER: ThrottlerOptions = {
  name: 'auth',
  limit: 5,
  ttl: 60000,
  skipIf: (ctx: ExecutionContext) => !isAuthRoute(ctx),
};

/** Named throttler tier: inbound external webhooks. */
const WEBHOOK_TIER: ThrottlerOptions = {
  name: 'webhook',
  limit: 200,
  ttl: 60000,
  skipIf: (ctx: ExecutionContext) => !isWebhookRoute(ctx),
};

/** Named throttler tier: generic read (GET) requests. */
const GET_TIER: ThrottlerOptions = {
  name: 'get',
  limit: 300,
  ttl: 60000,
  skipIf: (ctx: ExecutionContext) => !isGetRequest(ctx),
};

/** Named throttler tier: generic write (POST/PUT/PATCH/DELETE) requests. */
const MUTATION_TIER: ThrottlerOptions = {
  name: 'mutation',
  limit: 100,
  ttl: 60000,
  skipIf: (ctx: ExecutionContext) => !isMutationRequest(ctx),
};

/** Named throttler tier: AI / LLM tool-call endpoints. */
const AI_TOOL_TIER: ThrottlerOptions = {
  name: 'ai-tool',
  limit: 60,
  ttl: 60000,
  skipIf: (ctx: ExecutionContext) => !isAiToolRoute(ctx),
};

/** All tier definitions. */
export const THROTTLE_TIERS: ThrottlerOptions[] = [
  AUTH_TIER,
  WEBHOOK_TIER,
  GET_TIER,
  MUTATION_TIER,
  AI_TOOL_TIER,
];
