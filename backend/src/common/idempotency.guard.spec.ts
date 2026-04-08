import { Reflector } from '@nestjs/core';
import { IdempotencyGuard, IDEMPOTENCY_KEY, IDEMPOTENCY_TTL_KEY } from './idempotency.guard';

type SetCall = { key: string; value: string; ttl: number };

function makeFakeRedis() {
  const store = new Map<string, string>();
  const setCalls: SetCall[] = [];
  return {
    setCalls,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, _mode: string, ttl: number) {
      setCalls.push({ key, value, ttl });
      store.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
    _directSet(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function makeContext(headerKey?: string) {
  const request: any = { headers: {} };
  if (headerKey) request.headers['x-idempotency-key'] = headerKey;

  const response: any = { _status: 200, _body: undefined };
  response.status = jest.fn((code: number) => {
    response._status = code;
    return response;
  });
  response.json = jest.fn((body: any) => {
    response._body = body;
    return response;
  });

  const context: any = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => ({}),
  };

  return { request, response, context };
}

describe('IdempotencyGuard — invariant I1 (idempotency correctness)', () => {
  let reflector: Reflector;
  let redis: ReturnType<typeof makeFakeRedis>;
  let guard: IdempotencyGuard;

  beforeEach(() => {
    reflector = new Reflector();
    redis = makeFakeRedis();
    guard = new IdempotencyGuard(reflector, redis as any);
    jest.spyOn(reflector, 'get').mockImplementation((metadataKey: any) => {
      if (metadataKey === IDEMPOTENCY_KEY) return true;
      if (metadataKey === IDEMPOTENCY_TTL_KEY) return 86400;
      return undefined;
    });
  });

  it('allows the request through when there is no x-idempotency-key header', async () => {
    const { context } = makeContext();
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(redis.setCalls).toHaveLength(0);
  });

  it('stores a processing placeholder on first request with idempotency key', async () => {
    const { context, request } = makeContext('abc');
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(redis.setCalls).toHaveLength(1);
    expect(redis.setCalls[0].key).toBe('idempotency:abc');
    const stored = JSON.parse(redis.setCalls[0].value);
    expect(stored.processing).toBe(true);
    expect(typeof stored.startedAt).toBe('number');
    expect(request._idempotencyKey).toBe('idempotency:abc');
  });

  it('returns a real cached response body when one exists', async () => {
    const { context, response } = makeContext('abc');
    redis._directSet(
      'idempotency:abc',
      JSON.stringify({ statusCode: 201, body: { id: 42, name: 'ok' } }),
    );
    const result = await guard.canActivate(context);
    expect(result).toBe(false);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({ id: 42, name: 'ok' });
  });

  it('never sends a response with undefined body when only a placeholder is cached', async () => {
    const { context, response } = makeContext('abc');
    redis._directSet(
      'idempotency:abc',
      JSON.stringify({ processing: true, startedAt: Date.now() - 60_000 }),
    );

    await guard.canActivate(context);

    // The guard must NOT call response.json(undefined).
    const jsonCalls = (response.json as jest.Mock).mock.calls;
    for (const call of jsonCalls) {
      expect(call[0]).toBeDefined();
    }
  });

  it('polls and returns the real response when placeholder transitions mid-poll', async () => {
    const { context, response } = makeContext('abc');
    redis._directSet(
      'idempotency:abc',
      JSON.stringify({ processing: true, startedAt: Date.now() }),
    );
    // Simulate another worker finishing the request mid-poll
    setTimeout(() => {
      redis._directSet(
        'idempotency:abc',
        JSON.stringify({ statusCode: 200, body: { finished: true } }),
      );
    }, 250);

    const result = await guard.canActivate(context);

    expect(result).toBe(false);
    expect(response.json).toHaveBeenCalledWith({ finished: true });
  });
});
