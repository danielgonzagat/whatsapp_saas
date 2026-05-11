import { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import { MetaHealthIndicator } from './meta.health-indicator';

describe('MetaHealthIndicator', () => {
  const originalFetch = global.fetch;
  let indicator: MetaHealthIndicator;
  let config: Pick<ConfigService, 'get'>;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      get: jest.fn((key: string) => {
        if (key === 'META_APP_ID') return 'test-app-id';
        if (key === 'META_APP_SECRET') return 'test-app-secret';
        return undefined;
      }),
    };
    indicator = new MetaHealthIndicator(config as ConfigService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns healthy when Meta Graph API responds 200', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as never;

    const result = await indicator.isHealthy('meta');

    expect(result.meta.status).toBe('up');
    expect(result.meta.appId).toBe('test...');
    expect(typeof result.meta.latencyMs).toBe('number');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws HealthCheckError when META_APP_ID is missing', async () => {
    config.get = jest.fn(() => undefined);

    await expect(indicator.isHealthy('meta')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('meta')).rejects.toMatchObject({
      message: 'Meta credentials not configured',
    });
  });

  it('throws HealthCheckError when META_APP_SECRET is missing', async () => {
    config.get = jest.fn((key: string) => {
      if (key === 'META_APP_ID') return 'test-app-id';
      return undefined;
    });

    await expect(indicator.isHealthy('meta')).rejects.toThrow(HealthCheckError);
  });

  it('throws HealthCheckError when Meta API returns non-200', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
    global.fetch = fetchMock as never;

    await expect(indicator.isHealthy('meta')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('meta')).rejects.toMatchObject({
      message: 'Meta API unreachable',
    });
  });

  it('throws HealthCheckError when fetch rejects', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('network error'));
    global.fetch = fetchMock as never;

    await expect(indicator.isHealthy('meta')).rejects.toThrow(HealthCheckError);
  });
});
