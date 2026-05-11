import { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import { AnthropicHealthIndicator } from './anthropic.health-indicator';

describe('AnthropicHealthIndicator', () => {
  const originalFetch = global.fetch;
  let indicator: AnthropicHealthIndicator;
  let config: Pick<ConfigService, 'get'>;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      get: jest.fn((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'test-anthropic-key';
        return undefined;
      }),
    };
    indicator = new AnthropicHealthIndicator(config as ConfigService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns healthy when Anthropic API responds 200', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as never;

    const result = await indicator.isHealthy('anthropic');

    expect(result.anthropic.status).toBe('up');
    expect(typeof result.anthropic.latencyMs).toBe('number');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callArgs[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(callArgs[1].method).toBe('POST');
    expect((callArgs[1].headers as Record<string, string>)['x-api-key']).toBe('test-anthropic-key');
    expect((callArgs[1].headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');
  });

  it('throws HealthCheckError when ANTHROPIC_API_KEY is missing', async () => {
    config.get = jest.fn(() => undefined);

    await expect(indicator.isHealthy('anthropic')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('anthropic')).rejects.toMatchObject({
      message: 'Anthropic key not configured',
    });
  });

  it('throws HealthCheckError when Anthropic API returns non-200', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 403, text: async () => 'Forbidden' });
    global.fetch = fetchMock as never;

    await expect(indicator.isHealthy('anthropic')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('anthropic')).rejects.toMatchObject({
      message: 'Anthropic API unreachable',
    });
  });

  it('throws HealthCheckError when fetch rejects', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('network error'));
    global.fetch = fetchMock as never;

    await expect(indicator.isHealthy('anthropic')).rejects.toThrow(HealthCheckError);
  });
});
