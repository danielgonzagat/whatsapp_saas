import { ConflictException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IdempotencyGuard,
  IDEMPOTENCY_METADATA,
  IDEMPOTENCY_TTL_METADATA,
} from './idempotency.guard';
import { FeatureFlagService } from './feature-flags/feature-flag.service';
import { bodyFingerprint, buildCacheKey, buildScopeKey } from './idempotency-fingerprint';

type SetCall = { key: string; value: string; ttl?: number; mode?: string };
type GuardRequest = {
  headers: Record<string, string>;
  body: unknown;
  method: string;
  route: { path: string };
  user: {
    workspaceId: string;
    sub: string;
  };
  _idempotencyKey?: string;
  _idempotencyTtl?: number;
};
type GuardResponse = {
  _status: number;
  _body: unknown;
  status: jest.Mock;
  json: jest.Mock;
};

/**
 * Fake Redis that implements the subset of commands the guard uses:
 *   - get(key)
 *   - set(key, value, 'EX', ttl)           — plain set with expiry (v1)
 *   - set(key, value, 'EX', ttl, 'NX')     — SET NX (v2 scope claim)
 *   - del(key)
 *
 * `_directSet` lets tests seed existing state without going through the
 * guard's write path.
 */
function makeFakeRedis() {
  const store = new Map<string, string>();
  const setCalls: SetCall[] = [];
  return {
    setCalls,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, mode?: string, ttl?: number, nx?: string) {
      setCalls.push({ key, value, mode, ttl });
      if (nx === 'NX' && store.has(key)) {
        return null;
      } // SET NX loser
      store.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
    _directSet(key: string, value: string) {
      store.set(key, value);
    },
    _has(key: string) {
      return store.has(key);
    },
  };
}

function makeContext(options: {
  headerKey?: string;
  body?: unknown;
  workspaceId?: string;
  actorId?: string;
  routePath?: string;
  method?: string;
}) {
  const request: GuardRequest = {
    headers: {},
    body: options.body ?? {},
    method: options.method ?? 'POST',
    route: { path: options.routePath ?? '/wallet/withdrawal' },
    user: {
      workspaceId: options.workspaceId ?? 'ws-1',
      sub: options.actorId ?? 'user-42',
    },
  };
  if (options.headerKey) {
    request.headers['x-idempotency-key'] = options.headerKey;
  }

  const response: GuardResponse = {
    _status: 200,
    _body: undefined,
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status = jest.fn((code: number) => {
    response._status = code;
    return response;
  });
  response.json = jest.fn((body: unknown) => {
    response._body = body;
    return response;
  });

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => ({}),
  };

  return {
    request,
    response,
    context: context as unknown as Parameters<IdempotencyGuard['canActivate']>[0],
  };
}

function standardKeyParts(body: unknown) {
  return {
    workspaceId: 'ws-1',
    actorId: 'user-42',
    routeTemplate: '/wallet/withdrawal',
    method: 'POST',
    idempotencyKey: 'abc',
    bodyFp: bodyFingerprint(body),
  };
}

describe('IdempotencyGuard — v2 (I13) scoped key + body fingerprint', () => {
  let reflector: Reflector;
  let redis: ReturnType<typeof makeFakeRedis>;
  let guard: IdempotencyGuard;
  let featureFlags: FeatureFlagService;

  beforeEach(() => {
    reflector = new Reflector();
    redis = makeFakeRedis();
    featureFlags = new FeatureFlagService();
    // idempotency.v2 defaults to true; explicit here for readability.
    jest.spyOn(featureFlags, 'isEnabled').mockImplementation((flag: string) => {
      if (flag === 'idempotency.v2') {
        return true;
      }
      return true;
    });
    guard = new IdempotencyGuard(
      reflector,
      redis as unknown as ConstructorParameters<typeof IdempotencyGuard>[1],
      undefined,
      featureFlags,
    );
    jest.spyOn(reflector, 'get').mockImplementation((metadataKey: unknown) => {
      if (metadataKey === IDEMPOTENCY_METADATA) {
        return true;
      }
      if (metadataKey === IDEMPOTENCY_TTL_METADATA) {
        return 86400;
      }
      return undefined;
    });
  });

  it('allows the request through when there is no x-idempotency-key header', async () => {
    const { context } = makeContext({ body: { amount: 100 } });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(redis.setCalls).toHaveLength(0);
  });

  it('stores a scoped cache key + scope key on first request', async () => {
    const { context, request } = makeContext({ headerKey: 'abc', body: { amount: 100 } });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const parts = standardKeyParts({ amount: 100 });
    const expectedCacheKey = buildCacheKey(parts);
    const expectedScopeKey = buildScopeKey(parts);

    // Scope key was written (SET NX) with the body fingerprint as value.
    expect(redis._has(expectedScopeKey)).toBe(true);
    // Cache key was written with the processing placeholder.
    expect(redis._has(expectedCacheKey)).toBe(true);
    expect(request._idempotencyKey).toBe(expectedCacheKey);
  });

  it('returns 409 when same header is reused with a DIFFERENT body (I13)', async () => {
    // First request: amount=100
    const { context: firstCtx } = makeContext({ headerKey: 'abc', body: { amount: 100 } });
    await guard.canActivate(firstCtx);

    // Second request: same header, amount=9999 — attack/bug scenario
    const { context: secondCtx } = makeContext({ headerKey: 'abc', body: { amount: 9999 } });
    await expect(guard.canActivate(secondCtx)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does NOT return 409 when same header is reused with SAME body (structural equality)', async () => {
    // Keys are reordered but semantically identical — must match.
    const { context: firstCtx } = makeContext({
      headerKey: 'abc',
      body: { amount: 100, currency: 'BRL' },
    });
    await guard.canActivate(firstCtx);

    const { context: secondCtx } = makeContext({
      headerKey: 'abc',
      body: { currency: 'BRL', amount: 100 },
    });
    // Second request should either return the cached response or fall through
    // to the placeholder — but NEVER throw 409.
    await expect(guard.canActivate(secondCtx)).resolves.not.toThrow();
  });

  it('scopes by workspaceId — same header, same body, DIFFERENT workspace is not a reuse', async () => {
    const { context: wsA } = makeContext({
      headerKey: 'abc',
      body: { amount: 100 },
      workspaceId: 'ws-A',
    });
    await guard.canActivate(wsA);

    // A different workspace uses the same header — legitimate, not a collision.
    const { context: wsB } = makeContext({
      headerKey: 'abc',
      body: { amount: 100 },
      workspaceId: 'ws-B',
    });
    await expect(guard.canActivate(wsB)).resolves.toBe(true);
  });

  it('returns the cached response when same (header, body) is replayed', async () => {
    const { context, response } = makeContext({ headerKey: 'abc', body: { amount: 100 } });
    const parts = standardKeyParts({ amount: 100 });
    // Seed a completed cache entry at the v2 key.
    redis._directSet(buildScopeKey(parts), parts.bodyFp);
    redis._directSet(
      buildCacheKey(parts),
      JSON.stringify({ statusCode: 201, body: { id: 42, ok: true }, bodyFp: parts.bodyFp }),
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(false);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({ id: 42, ok: true });
  });

  it('never sends a response with undefined body when only a placeholder is cached', async () => {
    const { context, response } = makeContext({ headerKey: 'abc', body: { amount: 100 } });
    const parts = standardKeyParts({ amount: 100 });
    redis._directSet(buildScopeKey(parts), parts.bodyFp);
    redis._directSet(
      buildCacheKey(parts),
      JSON.stringify({ processing: true, startedAt: Date.now() - 60_000, bodyFp: parts.bodyFp }),
    );

    await guard.canActivate(context);

    // The guard must NOT call response.json(undefined).
    const jsonCalls = response.json.mock.calls;
    for (const call of jsonCalls) {
      expect(call[0]).toBeDefined();
    }
  });

  it('polls and returns the real response when placeholder transitions mid-poll', async () => {
    const { context, response } = makeContext({ headerKey: 'abc', body: { amount: 100 } });
    const parts = standardKeyParts({ amount: 100 });
    redis._directSet(buildScopeKey(parts), parts.bodyFp);
    redis._directSet(
      buildCacheKey(parts),
      JSON.stringify({ processing: true, startedAt: Date.now(), bodyFp: parts.bodyFp }),
    );
    setTimeout(() => {
      redis._directSet(
        buildCacheKey(parts),
        JSON.stringify({ statusCode: 200, body: { finished: true }, bodyFp: parts.bodyFp }),
      );
    }, 250);

    const result = await guard.canActivate(context);

    expect(result).toBe(false);
    expect(response.json).toHaveBeenCalledWith({ finished: true });
  });

  it('degrades to pass-through (no dedup) when Redis throws on non-ConflictException errors', async () => {
    // Break get() — v2 falls through to pass-through, not 500.
    redis.get = jest.fn().mockRejectedValue(new Error('redis down'));
    const { context } = makeContext({ headerKey: 'abc', body: { amount: 100 } });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('IdempotencyGuard — v1 (rollback lever, legacy header-only key)', () => {
  let reflector: Reflector;
  let redis: ReturnType<typeof makeFakeRedis>;
  let guard: IdempotencyGuard;
  let featureFlags: FeatureFlagService;

  beforeEach(() => {
    reflector = new Reflector();
    redis = makeFakeRedis();
    featureFlags = new FeatureFlagService();
    jest.spyOn(featureFlags, 'isEnabled').mockImplementation((flag: string) => {
      if (flag === 'idempotency.v2') {
        return false;
      } // rollback path
      return true;
    });
    guard = new IdempotencyGuard(
      reflector,
      redis as unknown as ConstructorParameters<typeof IdempotencyGuard>[1],
      undefined,
      featureFlags,
    );
    jest.spyOn(reflector, 'get').mockImplementation((metadataKey: unknown) => {
      if (metadataKey === IDEMPOTENCY_METADATA) {
        return true;
      }
      if (metadataKey === IDEMPOTENCY_TTL_METADATA) {
        return 86400;
      }
      return undefined;
    });
  });

  it('uses the legacy idempotency:<header> key when v2 flag is off', async () => {
    const { context, request } = makeContext({ headerKey: 'abc', body: { amount: 100 } });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request._idempotencyKey).toBe('idempotency:abc');
  });

  it('v1: same header + different body RETURNS cached response (the known bug v2 fixes)', async () => {
    const { context: firstCtx } = makeContext({ headerKey: 'abc', body: { amount: 100 } });
    await guard.canActivate(firstCtx);

    // Seed the completed response for the first request.
    redis._directSet('idempotency:abc', JSON.stringify({ statusCode: 200, body: { ok: true } }));

    const { context: secondCtx, response } = makeContext({
      headerKey: 'abc',
      body: { amount: 9999 },
    });
    const result = await guard.canActivate(secondCtx);

    // v1 bug preserved as a rollback lever: no 409, stale body returned.
    expect(result).toBe(false);
    expect(response.json).toHaveBeenCalledWith({ ok: true });
  });
});
