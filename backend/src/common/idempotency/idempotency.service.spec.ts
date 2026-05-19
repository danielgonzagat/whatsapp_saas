import { IdempotencyService } from './idempotency.service';

type FakeRedis = {
  store: Map<string, string>;
  get: jest.Mock;
  set: jest.Mock;
};

function makeFakeRedis(): FakeRedis {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
  };
}

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let fakeRedis: FakeRedis;

  beforeEach(() => {
    fakeRedis = makeFakeRedis();
    service = new IdempotencyService(fakeRedis as never);
  });

  describe('get', () => {
    it('returns null when no cached entry exists', async () => {
      const result = await service.get('key-1', 'POST', '/api/wallet/withdraw');
      expect(result).toBeNull();
    });

    it('returns cached response when entry exists', async () => {
      const cached = { status: 201, body: { id: 42 } };
      fakeRedis.store.set('idem:POST:/api/wallet/withdraw:key-1', JSON.stringify(cached));

      const result = await service.get('key-1', 'POST', '/api/wallet/withdraw');
      expect(result).toEqual(cached);
    });

    it('returns null on Redis error', async () => {
      fakeRedis.get.mockRejectedValueOnce(new Error('redis down'));

      const result = await service.get('key-1', 'POST', '/api/wallet/withdraw');
      expect(result).toBeNull();
    });

    it('returns null when cached entry is corrupt JSON', async () => {
      fakeRedis.store.set('idem:POST:/api/wallet/withdraw:key-1', 'not-json{');

      const result = await service.get('key-1', 'POST', '/api/wallet/withdraw');
      expect(result).toBeNull();
    });

    it('returns null when cached entry has no body', async () => {
      fakeRedis.store.set('idem:POST:/api/wallet/withdraw:key-1', JSON.stringify({ status: 200 }));

      const result = await service.get('key-1', 'POST', '/api/wallet/withdraw');
      expect(result).toBeNull();
    });

    it('different method produces different cache key', async () => {
      const cached = { status: 200, body: { ok: true } };
      fakeRedis.store.set('idem:POST:/api/test:key-1', JSON.stringify(cached));

      const result = await service.get('key-1', 'PATCH', '/api/test');
      expect(result).toBeNull();
    });

    it('different path produces different cache key', async () => {
      const cached = { status: 200, body: { ok: true } };
      fakeRedis.store.set('idem:POST:/api/route-a:key-1', JSON.stringify(cached));

      const result = await service.get('key-1', 'POST', '/api/route-b');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('writes status and body to Redis with TTL', async () => {
      await service.set('key-1', 'POST', '/api/wallet/withdraw', 200, { id: 99 }, 86400);

      expect(fakeRedis.set).toHaveBeenCalledWith(
        'idem:POST:/api/wallet/withdraw:key-1',
        JSON.stringify({ status: 200, body: { id: 99 } }),
        'EX',
        86400,
      );
    });

    it('correctly caches 4xx error responses', async () => {
      await service.set('key-1', 'POST', '/api/wallet/withdraw', 400, { error: 'bad' }, 86400);

      expect(fakeRedis.set).toHaveBeenCalledWith(
        'idem:POST:/api/wallet/withdraw:key-1',
        JSON.stringify({ status: 400, body: { error: 'bad' } }),
        'EX',
        86400,
      );
    });

    it('does not throw on Redis error', async () => {
      fakeRedis.set.mockRejectedValueOnce(new Error('redis down'));

      await expect(
        service.set('key-1', 'POST', '/api/test', 200, {}, 86400),
      ).resolves.toBeUndefined();
    });
  });
});
