import { redisInProductionValidator } from './redis-env-validator';

describe('redisInProductionValidator', () => {
  describe('non-production environments', () => {
    it('returns value unchanged when NODE_ENV is not production', () => {
      const input = { NODE_ENV: 'development', REDIS_URL: '' };
      const result = redisInProductionValidator(input);

      expect(result).toBe(input);
    });

    it('returns value unchanged in test environment', () => {
      const input = { NODE_ENV: 'test' };
      const result = redisInProductionValidator(input);

      expect(result).toBe(input);
    });

    it('returns value unchanged even with missing Redis config', () => {
      const input = { NODE_ENV: 'staging' };
      const result = redisInProductionValidator(input);

      expect(result).toBe(input);
    });
  });

  describe('production environment', () => {
    it('returns value when REDIS_MODE is disabled', () => {
      const input = { NODE_ENV: 'production', REDIS_MODE: 'disabled' };
      const result = redisInProductionValidator(input);

      expect(result).toBe(input);
    });

    it('returns value when REDIS_MODE disabled with mixed case', () => {
      const input = { NODE_ENV: 'production', REDIS_MODE: 'DISABLED' };
      const result = redisInProductionValidator(input);

      expect(result).toBe(input);
    });

    it('returns value when REDIS_URL is configured', () => {
      const input = { NODE_ENV: 'production', REDIS_URL: 'redis://localhost:6379' };
      const result = redisInProductionValidator(input);

      expect(result).toBe(input);
    });

    it('returns value when REDIS_FALLBACK_URL is configured', () => {
      const input = {
        NODE_ENV: 'production',
        REDIS_FALLBACK_URL: 'redis://fallback:6379',
      };
      const result = redisInProductionValidator(input);

      expect(result).toBe(input);
    });

    it('returns value when REDIS_HOST and REDIS_PASSWORD are configured', () => {
      const input = {
        NODE_ENV: 'production',
        REDIS_HOST: 'redis.internal',
        REDIS_PASSWORD: 'secret',
      };
      const result = redisInProductionValidator(input);

      expect(result).toBe(input);
    });

    it('returns value using REDISHOST and REDISPASSWORD aliases', () => {
      const input = {
        NODE_ENV: 'production',
        REDISHOST: 'redis.internal',
        REDISPASSWORD: 'secret',
      };
      const result = redisInProductionValidator(input);

      expect(result).toBe(input);
    });

    it('throws when neither REDIS_URL, REDIS_FALLBACK_URL, nor HOST+PASSWORD are configured', () => {
      const input = { NODE_ENV: 'production' };

      expect(() => redisInProductionValidator(input)).toThrow(
        'Redis is required in production',
      );
    });

    it('throws when Redis is not configured but REDIS_MODE is auto', () => {
      const input = { NODE_ENV: 'production', REDIS_MODE: 'auto' };

      expect(() => redisInProductionValidator(input)).toThrow(
        'Redis is required in production',
      );
    });

    it('throws when REDIS_URL points to Railway public proxy', () => {
      const input = {
        NODE_ENV: 'production',
        REDIS_URL: 'redis://mainline.proxy.rlwy.net:6379',
      };

      expect(() => redisInProductionValidator(input)).toThrow(
        'Redis must use Railway internal networking',
      );
    });

    it('throws when REDIS_URL points to a subdomain proxy.rlwy.net', () => {
      const input = {
        NODE_ENV: 'production',
        REDIS_URL: 'redis://custom.proxy.rlwy.net:6379',
      };

      expect(() => redisInProductionValidator(input)).toThrow(
        'Redis must use Railway internal networking',
      );
    });

    it('detects Railway proxy hostname without URL scheme', () => {
      const input = {
        NODE_ENV: 'production',
        REDIS_HOST: 'mainline.proxy.rlwy.net',
        REDIS_PASSWORD: 'secret',
      };

      expect(() => redisInProductionValidator(input)).toThrow(
        'Redis must use Railway internal networking',
      );
    });

    it('throws when any candidate is a Railway proxy host', () => {
      const input = {
        NODE_ENV: 'production',
        REDIS_URL: 'redis://safe.internal:6379',
        REDIS_FALLBACK_URL: 'redis://evil.proxy.rlwy.net:6379',
      };

      expect(() => redisInProductionValidator(input)).toThrow(
        'Redis must use Railway internal networking',
      );
    });

    it('handles invalid URL in proxy check gracefully', () => {
      const input = {
        NODE_ENV: 'production',
        REDIS_HOST: 'not-a-real---host::::',
      };

      // No Redis URL configured and no proxy host → should fail on missing Redis
      expect(() => redisInProductionValidator(input)).toThrow(
        'Redis is required in production',
      );
    });

    it('accepts valid internal Railway Redis URL', () => {
      const input = {
        NODE_ENV: 'production',
        REDIS_URL: 'redis://default:pass@redis.railway.internal:6379',
      };

      const result = redisInProductionValidator(input);

      expect(result).toBe(input);
    });

    it('handles boolean REDIS_MODE disabled truthy value', () => {
      const input = { NODE_ENV: 'production', REDIS_MODE: true };

      // Boolean true → "true" as string !== "disabled" → proceeds to assert Redis
      expect(() => redisInProductionValidator(input)).toThrow(
        'Redis is required in production',
      );
    });

    it('handles numeric REDIS_MODE value', () => {
      const input = { NODE_ENV: 'production', REDIS_MODE: 0 };

      // Numeric 0 → "0" as string !== "disabled" → proceeds to assert Redis
      expect(() => redisInProductionValidator(input)).toThrow(
        'Redis is required in production',
      );
    });
  });
});
