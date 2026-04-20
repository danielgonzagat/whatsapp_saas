import { ConfigService } from '@nestjs/config';
import { SystemHealthService } from './system-health.service';

describe('SystemHealthService', () => {
  const originalFetch = global.fetch;

  let prisma: any;
  let redis: any;
  let config: any;
  let whatsappApi: any;
  let storageService: any;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      metaConnection: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    redis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string | undefined> = {
          JWT_SECRET: 'secret',
          REDIS_URL: 'redis://redis:6379',
          WORKER_HEALTH_URL: 'http://worker:3003/health',
          WORKER_METRICS_TOKEN: 'worker-token',
          META_APP_ID: 'meta-app-id',
          META_APP_SECRET: 'meta-app-secret',
          META_VERIFY_TOKEN: 'meta-verify-token',
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
        provider: 'meta-cloud',
        webhookConfigured: true,
        inboundEventsConfigured: true,
        events: ['messages', 'message_template_status_update', 'comments'],
        secretConfigured: true,
        storeEnabled: true,
        storeFullSync: true,
        appIdConfigured: true,
        appSecretConfigured: true,
        accessTokenConfigured: false,
        phoneNumberIdConfigured: false,
      }),
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

  it('reports meta transport and worker health in the consolidated readiness response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        queues: { autopilot: { waiting: 0 } },
      }),
    }) as any;

    const service = new SystemHealthService(prisma, redis, config, whatsappApi, storageService);

    const result = await service.check();

    expect(result.status).toBe('UP');
    expect(result.details.whatsapp).toEqual(
      expect.objectContaining({
        status: 'UP',
        auth: 'WORKSPACE_OAUTH_PENDING',
        webhook: 'CONFIGURED',
        connectionMode: 'workspace-oauth',
        connectedWorkspaces: 0,
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

  it('marks the system as down when meta critical config is missing', async () => {
    config.get = jest.fn((key: string) => {
      const values: Record<string, string | undefined> = {
        JWT_SECRET: 'secret',
        REDIS_URL: 'redis://redis:6379',
      };
      return values[key];
    });

    const service = new SystemHealthService(prisma, redis, config, whatsappApi, storageService);

    const result = await service.check();

    expect(result.status).toBe('DOWN');
    expect(result.details.config).toEqual(
      expect.objectContaining({
        status: 'DOWN',
        missing: expect.arrayContaining(['META_APP_ID', 'META_APP_SECRET', 'META_VERIFY_TOKEN']),
      }),
    );
  });

  it('marks meta transport as down when the webhook runtime is not configured', async () => {
    whatsappApi.getRuntimeConfigDiagnostics.mockReturnValue({
      provider: 'meta-cloud',
      webhookConfigured: false,
      inboundEventsConfigured: false,
      events: [],
      secretConfigured: false,
      storeEnabled: true,
      storeFullSync: true,
      appIdConfigured: true,
      appSecretConfigured: true,
      accessTokenConfigured: false,
      phoneNumberIdConfigured: false,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    }) as any;

    const service = new SystemHealthService(prisma, redis, config, whatsappApi, storageService);

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
        META_APP_ID: 'meta-app-id',
        META_APP_SECRET: 'meta-app-secret',
        META_VERIFY_TOKEN: 'meta-verify-token',
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'frontend-client-id.apps.googleusercontent.com',
      };
      return values[key];
    });

    const service = new SystemHealthService(prisma, redis, config, whatsappApi, storageService);

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
        META_APP_ID: 'meta-app-id',
        META_APP_SECRET: 'meta-app-secret',
        META_VERIFY_TOKEN: 'meta-verify-token',
        GOOGLE_ALLOWED_CLIENT_IDS:
          'prod.apps.googleusercontent.com,preview.apps.googleusercontent.com',
      };
      return values[key];
    });

    const service = new SystemHealthService(prisma, redis, config, whatsappApi, storageService);

    const result = await service.check();

    expect(result.details.googleAuth).toEqual(
      expect.objectContaining({
        status: 'CONFIGURED',
        clientIdsConfigured: 2,
      }),
    );
  });

  it('discovers worker health from internal railway urls when explicit health url is missing', async () => {
    config.get = jest.fn((key: string) => {
      const values: Record<string, string | undefined> = {
        JWT_SECRET: 'secret',
        REDIS_URL: 'redis://redis:6379',
        META_APP_ID: 'meta-app-id',
        META_APP_SECRET: 'meta-app-secret',
        META_VERIFY_TOKEN: 'meta-verify-token',
        WORKER_INTERNAL_URL: '{ } http://worker.railway.internal:8080',
      };
      return values[key];
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    }) as any;

    const service = new SystemHealthService(prisma, redis, config, whatsappApi, storageService);

    const result = await service.check();

    expect(result.details.worker).toEqual(
      expect.objectContaining({
        status: 'UP',
        url: 'http://worker.railway.internal:8080/health',
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'http://worker.railway.internal:8080/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  describe('liveness probe', () => {
    it('returns UP without touching any dependency', () => {
      prisma.$queryRaw = jest.fn().mockRejectedValue(new Error('db down'));
      redis.ping = jest.fn().mockRejectedValue(new Error('redis down'));

      const service = new SystemHealthService(prisma, redis, config, whatsappApi, storageService);
      const result = service.liveness();

      expect(result.status).toBe('UP');
      expect(typeof result.timestamp).toBe('string');
      // Must not have called any dependency method
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(redis.ping).not.toHaveBeenCalled();
    });
  });

  describe('readiness probe', () => {
    it('returns UP when DB and Redis are healthy', async () => {
      const service = new SystemHealthService(prisma, redis, config, whatsappApi, storageService);
      const result = await service.readiness();

      expect(result.status).toBe('UP');
      expect(result.details.database.status).toBe('UP');
      expect(result.details.redis.status).toBe('UP');
    });

    it('returns DOWN when DB is unavailable', async () => {
      prisma.$queryRaw = jest.fn().mockRejectedValue(new Error('db down'));

      const service = new SystemHealthService(prisma, redis, config, whatsappApi, storageService);
      const result = await service.readiness();

      expect(result.status).toBe('DOWN');
      expect(result.details.database.status).toBe('DOWN');
    });

    it('returns DOWN when Redis is unavailable', async () => {
      redis.ping = jest.fn().mockRejectedValue(new Error('redis down'));

      const service = new SystemHealthService(prisma, redis, config, whatsappApi, storageService);
      const result = await service.readiness();

      expect(result.status).toBe('DOWN');
      expect(result.details.redis.status).toBe('DOWN');
    });

    it('does NOT check WhatsApp, Worker, Storage, or Stripe', async () => {
      global.fetch = jest.fn() as any;

      const service = new SystemHealthService(prisma, redis, config, whatsappApi, storageService);
      await service.readiness();

      expect(whatsappApi.ping).not.toHaveBeenCalled();
      expect(storageService.healthCheck).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
