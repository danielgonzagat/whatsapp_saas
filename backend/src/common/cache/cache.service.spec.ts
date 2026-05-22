import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

describe('CacheService', () => {
  let service: CacheService;
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(0),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: REDIS_TOKEN, useValue: redis },
      ],
    }).compile();
    service = module.get(CacheService);
  });

  describe('get', () => {
    it('returns null on miss', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.get('k')).resolves.toBeNull();
    });

    it('parses JSON on hit', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ a: 1 }));
      await expect(service.get('k')).resolves.toEqual({ a: 1 });
    });

    it('returns null gracefully when Redis throws', async () => {
      redis.get.mockRejectedValue(new Error('REDIS down'));
      await expect(service.get('k')).resolves.toBeNull();
    });
  });

  describe('set', () => {
    it('uses default TTL=60s when ttl not provided', async () => {
      await service.set('k', { v: 1 });
      expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify({ v: 1 }), 'EX', 60);
    });

    it('honors custom ttl', async () => {
      await service.set('k', 'x', { ttl: 300 });
      expect(redis.set).toHaveBeenCalledWith('k', '"x"', 'EX', 300);
    });

    it('returns false when Redis throws', async () => {
      redis.set.mockRejectedValue(new Error('REDIS down'));
      await expect(service.set('k', 'v')).resolves.toBe(false);
    });
  });

  describe('del', () => {
    it('returns number of deleted keys', async () => {
      redis.del.mockResolvedValue(2);
      await expect(service.del('a', 'b')).resolves.toBe(2);
    });

    it('returns 0 gracefully when Redis throws', async () => {
      redis.del.mockRejectedValue(new Error('boom'));
      await expect(service.del('x')).resolves.toBe(0);
    });
  });

  describe('wrap', () => {
    it('skips fn on cache hit', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ a: 'cached' }));
      const fn = jest.fn();
      const result = await service.wrap('k', fn);
      expect(result).toEqual({ a: 'cached' });
      expect(fn).not.toHaveBeenCalled();
    });

    it('calls fn on cache miss and caches the result', async () => {
      redis.get.mockResolvedValue(null);
      const fn = jest.fn().mockResolvedValue({ fresh: true });
      const result = await service.wrap('k', fn, { ttl: 120 });
      expect(result).toEqual({ fresh: true });
      expect(fn).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify({ fresh: true }), 'EX', 120);
    });

    it('propagates exceptions thrown by fn (does not cache them)', async () => {
      redis.get.mockResolvedValue(null);
      const fn = jest.fn().mockRejectedValue(new Error('expensive op failed'));
      await expect(service.wrap('k', fn)).rejects.toThrow('expensive op failed');
      expect(redis.set).not.toHaveBeenCalled();
    });
  });
});
