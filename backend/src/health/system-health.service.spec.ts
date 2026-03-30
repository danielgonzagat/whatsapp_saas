import { ConfigService } from '@nestjs/config';
import { SystemHealthService } from './system-health.service';

describe('SystemHealthService', () => {
  const originalFetch = global.fetch;

  let prisma: any;
  let redis: any;
  let config: any;
  let whatsappApi: any;
  let workerBrowserRuntime: any;
  let storageService: any;

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
          ANTHROPIC_API_KEY: 'anthropic-key',
          STRIPE_SECRET_KEY: 'stripe-key',
          GOOGLE_CLIENT_ID: 'google-client-id',
          GOOGLE_CLIENT_SECRET: 'google-secret',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    whatsappApi = {
      ping: jest.fn().mockResolvedValue(true),
      getRuntimeConfigDiagnostics: jest.fn().mockReturnValue({
        webhookUrl: 'https://api.kloel.test/webhooks/whatsapp-api',
        webhookConfigured: true,
        inboundEventsConfigured: true,
        events: ['session.status', 'message', 'message.any', 'message.ack'],
        secretConfigured: true,
        storeEnabled: true,
        storeFullSync: true,
        allowSessionWithoutWebhook: false,
        allowInternalWebhookUrl: false,
      }),
    };
    workerBrowserRuntime = {
      isAvailable: jest.fn().mockResolvedValue(false),
      getStatus: jest.fn().mockReturnValue({ connected: false }),
    };
    storageService = {
      healthCheck: jest.fn().mockResolvedValue({
        status: 'UP',
        driver: 'local',
        details: { uploadsDir: '/tmp/uploads', writable: true },
      }),
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
      workerBrowserRuntime,
      storageService,
    );

    const result = await service.check();

    expect(result.status).toBe('UP');
    expect(result.details.whatsapp).toEqual(
      expect.objectContaining({
        status: 'UP',
        auth: 'CONFIGURED',
        webhook: 'CONFIGURED',
        allowInternalWebhookUrl: false,
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
      workerBrowserRuntime,
      storageService,
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

  it('marks WAHA as down when the webhook runtime is not configured', async () => {
    whatsappApi.getRuntimeConfigDiagnostics.mockReturnValue({
      webhookUrl: null,
      webhookConfigured: false,
      inboundEventsConfigured: false,
      events: [],
      secretConfigured: false,
      storeEnabled: true,
      storeFullSync: true,
      allowSessionWithoutWebhook: false,
      allowInternalWebhookUrl: false,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    }) as any;

    const service = new SystemHealthService(
      prisma,
      redis,
      config,
      whatsappApi,
      workerBrowserRuntime,
      storageService,
    );

    const result = await service.check();

    expect(result.details.whatsapp).toEqual(
      expect.objectContaining({
        status: 'DOWN',
        webhook: 'MISSING',
      }),
    );
  });

  it('treats Google GIS as configured when only a client id is available', async () => {
    config.get = jest.fn((key: string) => {
      const values: Record<string, string | undefined> = {
        JWT_SECRET: 'secret',
        REDIS_URL: 'redis://redis:6379',
        WAHA_API_URL: 'https://waha.example.com',
        WAHA_API_KEY: 'waha-secret',
        NEXT_PUBLIC_GOOGLE_CLIENT_ID:
          'frontend-client-id.apps.googleusercontent.com',
      };
      return values[key];
    });

    const service = new SystemHealthService(
      prisma,
      redis,
      config,
      whatsappApi,
      workerBrowserRuntime,
      storageService,
    );

    const result = await service.check();

    expect(result.details.googleAuth).toEqual(
      expect.objectContaining({
        status: 'CONFIGURED',
        mode: 'google_identity_services',
        clientIdsConfigured: 1,
        clientSecret: 'OPTIONAL_MISSING',
      }),
    );
  });

  it('counts csv GOOGLE_ALLOWED_CLIENT_IDS in health details', async () => {
    config.get = jest.fn((key: string) => {
      const values: Record<string, string | undefined> = {
        JWT_SECRET: 'secret',
        REDIS_URL: 'redis://redis:6379',
        WAHA_API_URL: 'https://waha.example.com',
        WAHA_API_KEY: 'waha-secret',
        GOOGLE_ALLOWED_CLIENT_IDS:
          'prod.apps.googleusercontent.com,preview.apps.googleusercontent.com',
      };
      return values[key];
    });

    const service = new SystemHealthService(
      prisma,
      redis,
      config,
      whatsappApi,
      workerBrowserRuntime,
      storageService,
    );

    const result = await service.check();

    expect(result.details.googleAuth).toEqual(
      expect.objectContaining({
        status: 'CONFIGURED',
        clientIdsConfigured: 2,
      }),
    );
  });
});
