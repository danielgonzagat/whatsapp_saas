import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  zadd: vi.fn(),
  zrangebyscore: vi.fn(),
  zrem: vi.fn(),
  zcount: vi.fn(),
  zremrangebyscore: vi.fn(),
  publish: vi.fn(),
};

vi.mock('../redis-client', () => ({
  redis: mockRedis,
}));

describe('ContextStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('returns null when redis returns null', async () => {
      mockRedis.get.mockResolvedValue(null);
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      const result = await store.get<string>('mykey');
      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith('test:mykey');
    });

    it('returns parsed value when redis returns valid JSON', async () => {
      mockRedis.get.mockResolvedValue('{"hello":"world"}');
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      const result = await store.get<{ hello: string }>('mykey');
      expect(result).toEqual({ hello: 'world' });
    });

    it('returns null when JSON parse fails', async () => {
      mockRedis.get.mockResolvedValue('not-json');
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      const result = await store.get('mykey');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('sets value without TTL', async () => {
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      await store.set('mykey', { a: 1 });
      expect(mockRedis.set).toHaveBeenCalledWith('test:mykey', '{"a":1}');
    });

    it('sets value with TTL', async () => {
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      await store.set('mykey', 'value', 60);
      expect(mockRedis.set).toHaveBeenCalledWith('test:mykey', '"value"', 'EX', 60);
    });

    it('skips TTL when zero', async () => {
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      await store.set('mykey', 'value', 0);
      expect(mockRedis.set).toHaveBeenCalledWith('test:mykey', '"value"');
    });

    it('skips TTL when negative', async () => {
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      await store.set('mykey', 'value', -1);
      expect(mockRedis.set).toHaveBeenCalledWith('test:mykey', '"value"');
    });
  });

  describe('delete', () => {
    it('deletes key from redis', async () => {
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      await store.delete('mykey');
      expect(mockRedis.del).toHaveBeenCalledWith('test:mykey');
    });
  });

  describe('zadd', () => {
    it('adds member with score', async () => {
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      await store.zadd('zkey', 100, 'member1');
      expect(mockRedis.zadd).toHaveBeenCalledWith('test:zkey', 100, 'member1');
    });
  });

  describe('zrangeByScore', () => {
    it('queries range by score', async () => {
      mockRedis.zrangebyscore.mockResolvedValue(['m1', 'm2']);
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      const result = await store.zrangeByScore('zkey', 0, 100);
      expect(result).toEqual(['m1', 'm2']);
      expect(mockRedis.zrangebyscore).toHaveBeenCalledWith('test:zkey', 0, 100);
    });
  });

  describe('zrem', () => {
    it('removes member from zset', async () => {
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      await store.zrem('zkey', 'member1');
      expect(mockRedis.zrem).toHaveBeenCalledWith('test:zkey', 'member1');
    });
  });

  describe('zcount', () => {
    it('counts members in score range', async () => {
      mockRedis.zcount.mockResolvedValue(5);
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      const result = await store.zcount('zkey', 0, 100);
      expect(result).toBe(5);
      expect(mockRedis.zcount).toHaveBeenCalledWith('test:zkey', 0, 100);
    });
  });

  describe('zremRangeByScore', () => {
    it('removes range by score', async () => {
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      await store.zremRangeByScore('zkey', 0, 50);
      expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith('test:zkey', 0, 50);
    });
  });

  describe('publish', () => {
    it('publishes JSON message to channel', async () => {
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore('test');
      await store.publish('events', { type: 'test' });
      expect(mockRedis.publish).toHaveBeenCalledWith('events', '{"type":"test"}');
    });
  });

  describe('prefix', () => {
    it('uses default prefix when none provided', async () => {
      mockRedis.get.mockResolvedValue(null);
      const { ContextStore } = await import('../context-store');
      const store = new ContextStore();
      await store.get('key');
      expect(mockRedis.get).toHaveBeenCalledWith('flow-context:key');
    });
  });
});
