import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RedisConfigurationError,
  describeRedisResolution,
  resolveRedisUrl,
} from '../resolve-redis-url';

const ENV_KEYS = [
  'NODE_ENV',
  'REDIS_MODE',
  'REDIS_URL',
  'REDIS_FALLBACK_URL',
  'REDIS_HOST',
  'REDISHOST',
  'REDIS_HOSTNAME',
  'REDIS_PORT',
  'REDISPORT',
  'REDIS_PASSWORD',
  'REDISPASSWORD',
  'REDIS_PASS',
  'REDIS_USERNAME',
  'REDISUSER',
  'REDIS_USER',
  'RAILWAY_PROJECT_ID',
  'RAILWAY_ENVIRONMENT_ID',
  'RAILWAY_SERVICE_ID',
  'RAILWAY_DEPLOYMENT_ID',
] as const;

const originalEnv = new Map<string, string | undefined>();

function resetRedisEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe('resolveRedisUrl', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
    }
    resetRedisEnv();
  });

  afterEach(() => {
    resetRedisEnv();
    for (const [key, value] of originalEnv) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
    originalEnv.clear();
  });

  it('keeps localhost fallback for plain development runtimes', () => {
    expect(resolveRedisUrl()).toBe('redis://localhost:6379');
    expect(describeRedisResolution().mode).toBe('auto');
  });

  it('treats Railway runtimes as Redis-required even without NODE_ENV=production', () => {
    process.env.RAILWAY_PROJECT_ID = 'proj_123';

    expect(() => resolveRedisUrl()).toThrow(RedisConfigurationError);
    expect(describeRedisResolution().mode).toBe('required');
  });

  it('rejects Railway public proxy hosts in Railway runtimes', () => {
    process.env.RAILWAY_SERVICE_ID = 'svc_123';
    process.env.REDIS_URL = 'redis://default:secret@mainline.proxy.rlwy.net:12345';

    expect(() => resolveRedisUrl()).toThrow(/public proxy/i);
  });

  it('does not assemble passwordless Redis hosts in Railway runtimes', () => {
    process.env.RAILWAY_ENVIRONMENT_ID = 'env_123';
    process.env.REDIS_HOST = 'redis.internal';

    expect(() => resolveRedisUrl()).toThrow(RedisConfigurationError);
  });
});
