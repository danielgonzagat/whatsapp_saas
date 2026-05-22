import {
  RedisConfigurationError,
  describeRedisResolution,
  resolveRedisUrl,
} from './resolve-redis-url';

const REDIS_ENV_KEYS = [
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

function resetRedisEnv(): void {
  for (const key of REDIS_ENV_KEYS) {
    delete process.env[key];
  }
}

describe('resolveRedisUrl', () => {
  beforeEach(() => {
    for (const key of REDIS_ENV_KEYS) {
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

  it('describes the development fallback without throwing', () => {
    expect(resolveRedisUrl()).toBe('redis://localhost:6379');
    expect(describeRedisResolution()).toMatchObject({
      mode: 'auto',
      masked: 'redis://localhost:6379',
      configured: false,
      isLocalhost: true,
    });
  });

  it('reports production-like required mode when Railway env is present', () => {
    process.env.RAILWAY_PROJECT_ID = 'proj_123';

    expect(() => resolveRedisUrl()).toThrow(RedisConfigurationError);
    expect(describeRedisResolution()).toMatchObject({
      mode: 'required',
      url: null,
      configured: false,
    });
  });
});
