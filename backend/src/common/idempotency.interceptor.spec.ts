import { of, throwError, firstValueFrom, lastValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

function makeFakeRedis(opts: { setDelayMs?: number; setShouldThrow?: boolean } = {}) {
  const store = new Map<string, string>();
  const setCalls: Array<{ key: string; value: string }> = [];
  const delCalls: string[] = [];
  return {
    setCalls,
    delCalls,
    async set(key: string, value: string) {
      if (opts.setDelayMs) {
        await new Promise((r) => setTimeout(r, opts.setDelayMs));
      }
      if (opts.setShouldThrow) {
        throw new Error('redis_down');
      }
      setCalls.push({ key, value });
      store.set(key, value);
      return 'OK';
    },
    async del(key: string) {
      delCalls.push(key);
      return store.delete(key) ? 1 : 0;
    },
    _get(key: string) {
      return store.get(key);
    },
  };
}

function makeContext(cacheKey: string | undefined) {
  const request: any = {
    _idempotencyKey: cacheKey,
    _idempotencyTtl: 86400,
  };
  const response: any = { statusCode: 200 };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => ({}),
  } as any;
}

describe('IdempotencyInterceptor — invariant I1 (idempotency correctness)', () => {
  it('passes through unchanged when the request has no cache key', async () => {
    const redis = makeFakeRedis();
    const interceptor = new IdempotencyInterceptor(redis as any);
    const context = makeContext(undefined);
    const handler = { handle: () => of({ value: 'passthrough' }) };

    const result = await firstValueFrom(interceptor.intercept(context, handler));

    expect(result).toEqual({ value: 'passthrough' });
    expect(redis.setCalls).toHaveLength(0);
  });

  it('awaits the Redis write before emitting the response body', async () => {
    // Previously used tap(async) which did not await the Promise — the HTTP
    // response was sent before Redis stored the body, opening a race window.
    const redis = makeFakeRedis({ setDelayMs: 100 });
    const interceptor = new IdempotencyInterceptor(redis as any);
    const context = makeContext('idempotency:xyz');
    const handler = { handle: () => of({ id: 1 }) };

    const before = Date.now();
    const result = await firstValueFrom(interceptor.intercept(context, handler));
    const elapsed = Date.now() - before;

    expect(result).toEqual({ id: 1 });
    // The 100ms delay must have elapsed before the value is emitted.
    expect(elapsed).toBeGreaterThanOrEqual(95);
    // And the Redis write must have been recorded.
    expect(redis.setCalls).toHaveLength(1);
    expect(redis.setCalls[0].key).toBe('idempotency:xyz');
    const stored = JSON.parse(redis.setCalls[0].value);
    expect(stored.body).toEqual({ id: 1 });
    expect(stored.statusCode).toBe(200);
  });

  it('cleans up the placeholder key when the handler throws', async () => {
    const redis = makeFakeRedis();
    const interceptor = new IdempotencyInterceptor(redis as any);
    const context = makeContext('idempotency:err');
    const handler = {
      handle: () => throwError(() => new Error('handler_failed')),
    };

    await expect(lastValueFrom(interceptor.intercept(context, handler))).rejects.toThrow(
      'handler_failed',
    );

    // Give the fire-and-forget del a microtask to run
    await new Promise((r) => setTimeout(r, 10));

    expect(redis.delCalls).toContain('idempotency:err');
  });

  it('does not fail the request if the Redis write itself errors', async () => {
    // Idempotency is a defensive layer. Losing the cache write is degraded
    // but should not break the user's request.
    const redis = makeFakeRedis({ setShouldThrow: true });
    const interceptor = new IdempotencyInterceptor(redis as any);
    const context = makeContext('idempotency:degraded');
    const handler = { handle: () => of({ ok: true }) };

    const result = await firstValueFrom(interceptor.intercept(context, handler));
    expect(result).toEqual({ ok: true });
  });
});
