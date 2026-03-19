import { ConfigService } from '@nestjs/config';
import { SystemHealthService } from './system-health.service';

describe('SystemHealthService', () => {
  const originalFetch = global.fetch;

  let prisma: any;
  let redis: any;
  let config: any;
  let whatsappApi: any;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    redis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string | undefined> = {
          JWT_SECRET: 'secret',
          REDIS_URL: 'redis://redis:6379',
          WAHA_API_URL: 'https://waha.example.com',
          WAHA_API_KEY: 'waha-secret',
          WORKER_HEALTH_URL: 'http://worker:3003/health',
          WORKER_METRICS_TOKEN: 'worker-token',
          OPENAI_API_KEY: 'openai-key',
          STRIPE_SECRET_KEY: 'stripe-key',
          GOOGLE_CLIENT_ID: 'google-client-id',
          GOOGLE_CLIENT_SECRET: 'google-secret',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    whatsappApi = {
      ping: jest.fn().mockResolvedValue(true),
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('reports WAHA and worker health in the consolidated readiness response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', queues: { autopilot: { waiting: 0 } } }),
    }) as any;

    const service = new SystemHealthService(
      prisma,
      redis,
      config,
      whatsappApi,
    );

    const result = await service.check();

    expect(result.status).toBe('UP');
    expect(result.details.waha).toEqual(
      expect.objectContaining({
        status: 'UP',
        auth: 'CONFIGURED',
      }),
    );
    expect(result.details.worker).toEqual(
      expect.objectContaining({
        status: 'UP',
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'http://worker:3003/health',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer worker-token',
        },
      }),
    );
  });

  it('marks the system as down when WAHA critical config is missing', async () => {
    config.get = jest.fn((key: string) => {
      const values: Record<string, string | undefined> = {
        JWT_SECRET: 'secret',
        REDIS_URL: 'redis://redis:6379',
      };
      return values[key];
    });

    const service = new SystemHealthService(
      prisma,
      redis,
      config,
      whatsappApi,
    );

    const result = await service.check();

    expect(result.status).toBe('DOWN');
    expect(result.details.config).toEqual(
      expect.objectContaining({
        status: 'DOWN',
        missing: expect.arrayContaining(['WAHA_API_URL', 'WAHA_API_KEY']),
      }),
    );
  });
});
