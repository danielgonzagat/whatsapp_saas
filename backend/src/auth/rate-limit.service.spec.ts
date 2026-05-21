import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';

interface MockRedis {
  incr: jest.Mock;
  expire: jest.Mock;
}

function createMockRedis(overrides?: Partial<MockRedis>): MockRedis {
  return {
    incr: jest.fn(),
    expire: jest.fn(),
    ...overrides,
  };
}

describe('RateLimitService', () => {
  let mockRedis: MockRedis;

  beforeEach(() => {
    mockRedis = createMockRedis();
    jest.clearAllMocks();
    delete process.env.RATE_LIMIT_DISABLED;
  });

  afterEach(() => {
    delete process.env.RATE_LIMIT_DISABLED;
  });

  describe('checkRateLimit', () => {
    it('bypasses rate limit when RATE_LIMIT_DISABLED is true', async () => {
      process.env.RATE_LIMIT_DISABLED = 'true';
      const service = new RateLimitService(null);

      await expect(service.checkRateLimit('test-key')).resolves.toBeUndefined();
    });

    it('throws 503 when Redis is not available', async () => {
      const service = new RateLimitService(null);

      await expect(service.checkRateLimit('test-key')).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws 429 when limit is exceeded', async () => {
      mockRedis.incr.mockResolvedValue(6);
      const service = new RateLimitService(mockRedis as import('ioredis').Redis);

      await expect(service.checkRateLimit('test-key', 5, 60000)).rejects.toThrow(HttpException);
      await expect(service.checkRateLimit('test-key', 5, 60000)).rejects.toMatchObject({
        status: 429,
      });
    });

    it('allows request when under limit', async () => {
      mockRedis.incr.mockResolvedValue(3);
      const service = new RateLimitService(mockRedis as import('ioredis').Redis);

      await expect(service.checkRateLimit('test-key', 5, 60000)).resolves.toBeUndefined();
    });

    it('increments counter and sets expiry on first call', async () => {
      mockRedis.incr.mockResolvedValue(1);
      const service = new RateLimitService(mockRedis as import('ioredis').Redis);

      await service.checkRateLimit('test-key', 5, 60000);

      expect(mockRedis.incr).toHaveBeenCalledWith('test-key');
      expect(mockRedis.expire).toHaveBeenCalledWith('test-key', 60);
    });

    it('throws 503 on Redis error (fail-closed)', async () => {
      mockRedis.incr.mockRejectedValue(new Error('connection refused'));
      const service = new RateLimitService(mockRedis as import('ioredis').Redis);

      await expect(service.checkRateLimit('test-key')).rejects.toThrow(ServiceUnavailableException);
    });

    it('re-throws HttpException from Redis catch block', async () => {
      mockRedis.incr.mockResolvedValue(6);
      const service = new RateLimitService(mockRedis as import('ioredis').Redis);

      await expect(service.checkRateLimit('test-key')).rejects.toThrow(HttpException);
      await expect(service.checkRateLimit('test-key')).rejects.toMatchObject({
        status: 429,
      });
    });
  });
});
