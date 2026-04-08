import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';
import { bodyFingerprint, buildCacheKey, buildScopeKey } from './idempotency-fingerprint';
import { FeatureFlagService } from './feature-flags/feature-flag.service';

export const IDEMPOTENCY_KEY = 'idempotency';
export const IDEMPOTENCY_TTL_KEY = 'idempotency_ttl';

/**
 * Decorator: mark a controller method as requiring idempotency enforcement.
 * @param ttlSeconds - How long to cache the idempotency key (default: 86400 = 24h)
 */
export const Idempotent = (ttlSeconds = 86400) => {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    SetMetadata(IDEMPOTENCY_KEY, true)(target, key, descriptor);
    SetMetadata(IDEMPOTENCY_TTL_KEY, ttlSeconds)(target, key, descriptor);
    return descriptor;
  };
};

// Number of times to poll a processing placeholder before giving up and
// treating the placeholder as stale.
const POLL_MAX_ATTEMPTS = 5;
// Delay between polls in milliseconds. 5 attempts × 200ms = 1s max wait.
const POLL_INTERVAL_MS = 200;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * IdempotencyGuard enforces Wave 1 invariant I1 (cached-response replay-safe)
 * and Wave 2 invariant I13 (body-fingerprint scoping).
 *
 * Two code paths:
 *
 *   v1 (legacy, rollback lever):
 *     cacheKey = `idempotency:${header}`
 *     — no workspace, no actor, no route, no method, no body fingerprint.
 *     Reusing the same header with a different body returns the stale
 *     cached response. Silent data corruption. Preserved here ONLY so the
 *     `idempotency.v2` feature flag can roll back if v2 misfires.
 *
 *   v2 (default, I13):
 *     cacheKey = idem:v2:{ws}:{actor}:{route}:{method}:{header}:{sha256(body)}
 *     scopeKey = idem:v2:scope:{ws}:{actor}:{route}:{method}:{header}
 *     — the scopeKey records the bodyFp of the FIRST request seen with this
 *     scope. Subsequent requests compute their own bodyFp and compare. A
 *     mismatch throws HTTP 409 `idempotency_key_reuse_different_body`. A
 *     match falls through to the full cacheKey, which behaves like v1
 *     (placeholder → real body, poll, stale-detection).
 *
 * The v2 scopeKey write uses `SET NX` so two concurrent requests with the
 * same header but different bodies cannot both "win" — one sets the scope,
 * the other re-reads it, sees the mismatch, and throws 409.
 */
@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly logger = new Logger(IdempotencyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @InjectRedis() private readonly redis: Redis,
    @Optional() private readonly featureFlags?: FeatureFlagService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isIdempotent = this.reflector.get<boolean>(IDEMPOTENCY_KEY, context.getHandler());
    if (!isIdempotent) return true;

    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['x-idempotency-key'];
    if (!idempotencyKey) return true;

    const ttl = this.reflector.get<number>(IDEMPOTENCY_TTL_KEY, context.getHandler()) || 86400;
    const v2Enabled = this.featureFlags?.isEnabled('idempotency.v2') ?? true;

    if (v2Enabled) {
      return this.canActivateV2(context, idempotencyKey as string, ttl);
    }
    return this.canActivateV1(context, idempotencyKey as string, ttl);
  }

  // ------------------------------------------------------------
  // v2 — scoped key + body fingerprint (I13, P6-5)
  // ------------------------------------------------------------
  private async canActivateV2(
    context: ExecutionContext,
    idempotencyKey: string,
    ttl: number,
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const workspaceId = request.user?.workspaceId ?? request.workspaceId ?? 'anon';
    const actorId = request.user?.sub ?? request.user?.id ?? 'anon';
    const routeTemplate = request.route?.path ?? request.url ?? 'unknown';
    const method = request.method ?? 'UNKNOWN';
    const bodyFp = bodyFingerprint(request.body ?? null);

    const scopeKey = buildScopeKey({
      workspaceId,
      actorId,
      routeTemplate,
      method,
      idempotencyKey,
    });
    const cacheKey = buildCacheKey({
      workspaceId,
      actorId,
      routeTemplate,
      method,
      idempotencyKey,
      bodyFp,
    });

    try {
      // Phase 1: atomically claim the scope with this bodyFp. If another
      // request beat us to it with a DIFFERENT bodyFp, we must throw 409.
      // SET NX returns 'OK' on success and null on a pre-existing key.
      const claimed = await this.redis.set(scopeKey, bodyFp, 'EX', ttl, 'NX');
      if (claimed !== 'OK') {
        const existingFp = await this.redis.get(scopeKey);
        if (existingFp !== null && existingFp !== bodyFp) {
          this.logger.warn(
            `idempotency_key_reuse_different_body: scope=${scopeKey} stored=${existingFp} incoming=${bodyFp}`,
          );
          throw new ConflictException({
            code: 'idempotency_key_reuse_different_body',
            message:
              'This idempotency key was previously used with a different request body. ' +
              'Use a fresh key for a different request.',
          });
        }
        // existingFp matches (or is null because the scope expired between
        // check and re-read) — fall through to the cacheKey lookup.
      }

      // Phase 2: same body → standard cache lookup flow.
      const existing = await this.redis.get(cacheKey);
      if (existing) {
        const decision = await this.handleExistingEntry(cacheKey, existing, context);
        if (decision.kind === 'responded') return false;
        // 'proceed' falls through to store a new placeholder
      }

      await this.redis.set(
        cacheKey,
        JSON.stringify({ processing: true, startedAt: Date.now(), bodyFp }),
        'EX',
        ttl,
      );

      request._idempotencyKey = cacheKey;
      request._idempotencyTtl = ttl;
      return true;
    } catch (err: any) {
      // Re-throw ConflictException (our 409) — do NOT degrade to "no dedup"
      // when the error is deliberate.
      if (err instanceof ConflictException) throw err;
      // Redis failure degrades to "no dedup", same as v1. Log loudly.
      this.logger.warn(`Idempotency v2 check failed: ${err?.message}`);
      return true;
    }
  }

  // ------------------------------------------------------------
  // v1 — legacy header-only key (rollback lever behind flag)
  // ------------------------------------------------------------
  private async canActivateV1(
    context: ExecutionContext,
    idempotencyKey: string,
    ttl: number,
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const cacheKey = `idempotency:${idempotencyKey}`;

    try {
      const existing = await this.redis.get(cacheKey);

      if (existing) {
        const decision = await this.handleExistingEntry(cacheKey, existing, context);
        if (decision.kind === 'responded') return false;
      }

      await this.redis.set(
        cacheKey,
        JSON.stringify({ processing: true, startedAt: Date.now() }),
        'EX',
        ttl,
      );

      request._idempotencyKey = cacheKey;
      request._idempotencyTtl = ttl;
    } catch (err: any) {
      this.logger.warn(`Idempotency check failed: ${err?.message}`);
    }

    return true;
  }

  /**
   * Handle an existing Redis entry for the idempotency key. Either:
   *   - Sends a cached response and returns { kind: 'responded' }
   *   - Clears a stale placeholder and returns { kind: 'proceed' }
   */
  private async handleExistingEntry(
    cacheKey: string,
    existing: string,
    context: ExecutionContext,
  ): Promise<{ kind: 'responded' | 'proceed' }> {
    let cached: any;
    try {
      cached = JSON.parse(existing);
    } catch {
      // Corrupt cache entry — treat as if no entry exists.
      await this.redis.del(cacheKey).catch(() => undefined);
      return { kind: 'proceed' };
    }

    if (cached?.processing === true) {
      // Another request is in flight. Poll briefly for its completion.
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        await sleep(POLL_INTERVAL_MS);
        const retry = await this.redis.get(cacheKey).catch(() => null);
        if (!retry) {
          // The in-flight request errored and cleared the placeholder.
          return { kind: 'proceed' };
        }
        let retryParsed: any;
        try {
          retryParsed = JSON.parse(retry);
        } catch {
          return { kind: 'proceed' };
        }
        if (retryParsed?.processing !== true && retryParsed?.body !== undefined) {
          const response = context.switchToHttp().getResponse();
          response.status(retryParsed.statusCode || 200).json(retryParsed.body);
          return { kind: 'responded' };
        }
      }
      // Poll exhausted. The placeholder is stale (crashed peer?). Clear it
      // and let this request proceed normally.
      this.logger.warn(
        `Idempotency placeholder ${cacheKey} still processing after ` +
          `${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS}ms; clearing as stale`,
      );
      await this.redis.del(cacheKey).catch(() => undefined);
      return { kind: 'proceed' };
    }

    if (cached?.body !== undefined) {
      // Normal cached response. Return it verbatim.
      const response = context.switchToHttp().getResponse();
      response.status(cached.statusCode || 200).json(cached.body);
      return { kind: 'responded' };
    }

    // Entry exists but has no body and is not a processing placeholder.
    // This should not happen in practice — treat as corrupt and clear.
    this.logger.warn(`Idempotency entry ${cacheKey} has no body; clearing`);
    await this.redis.del(cacheKey).catch(() => undefined);
    return { kind: 'proceed' };
  }
}
