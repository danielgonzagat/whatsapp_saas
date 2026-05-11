import { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import { OpenAIHealthIndicator } from './openai.health-indicator';

describe('OpenAIHealthIndicator', () => {
  const originalFetch = global.fetch;
  let indicator: OpenAIHealthIndicator;
  let config: Pick<ConfigService, 'get'>;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-openai-key';
        return undefined;
      }),
    };
    indicator = new OpenAIHealthIndicator(config as ConfigService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns healthy when OpenAI API responds 200', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as never;

    const result = await indicator.isHealthy('openai');

    expect(result.openai.status).toBe('up');
    expect(typeof result.openai.latencyMs).toBe('number');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callArgs[0]).toBe('https://api.openai.com/v1/models');
    expect(callArgs[1].method).toBe('GET');
    expect((callArgs[1].headers as Record<string, string>).Authorization).toBe(
      'Bearer test-openai-key',
    );
  });

  it('throws HealthCheckError when OPENAI_API_KEY is missing', async () => {
    config.get = jest.fn(() => undefined);

    await expect(indicator.isHealthy('openai')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('openai')).rejects.toMatchObject({
      message: 'OpenAI key not configured',
    });
  });

  it('throws HealthCheckError when OpenAI API returns non-200', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
    global.fetch = fetchMock as never;

    await expect(indicator.isHealthy('openai')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('openai')).rejects.toMatchObject({
      message: 'OpenAI API unreachable',
    });
  });

  it('throws HealthCheckError when fetch rejects', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('network error'));
    global.fetch = fetchMock as never;

    await expect(indicator.isHealthy('openai')).rejects.toThrow(HealthCheckError);
  });
});
