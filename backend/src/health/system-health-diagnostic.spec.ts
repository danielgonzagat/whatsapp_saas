import { ConfigService } from '@nestjs/config';
import { SystemHealthService } from './system-health.service';
import { connection } from '../queue/queue';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  init: jest.fn(),
  setUser: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
  setExtra: jest.fn(),
  withScope: jest.fn((callback) => callback({ setTag: jest.fn(), setExtra: jest.fn() })),
}));

jest.mock('ioredis', () => {
  const events = jest.requireActual<typeof import('node:events')>('node:events');
  class MockRedis extends events.EventEmitter {
    get = jest.fn();
    set = jest.fn();
    del = jest.fn();
    keys = jest.fn();
    quit = jest.fn();
    disconnect = jest.fn();
    status = 'ready';
  }
  return { default: MockRedis, Redis: MockRedis };
});

jest.mock('../queue/queue', () => ({
  connection: { ping: jest.fn().mockResolvedValue('PONG') },
  queueRegistry: {},
  queueOptions: {},
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue([]),
  mkdirSync: jest.fn(),
  rmdirSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({ isDirectory: () => false }),
  writeFileSync: jest.fn(),
  openSync: jest.fn(),
  closeSync: jest.fn(),
  constants: { O_CREAT: 0, O_WRONLY: 0, O_RDONLY: 0 },
  promises: { readFile: jest.fn(), writeFile: jest.fn(), mkdir: jest.fn() },
}));

import { existsSync, readFileSync } from 'fs';

const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockedReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;

function stubBackupManifest() {
  mockedExistsSync.mockReturnValue(true);
  mockedReadFileSync.mockReturnValue(
    JSON.stringify({
      lastBackup: new Date(Date.now() - 10 * 60_000).toISOString(),
      lastVerifiedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      targetRpoMinutes: 60,
    }),
  );
}

describe('SystemHealthService deep probes', () => {
  const originalFetch = global.fetch;

  let prisma: {
    $queryRaw: jest.Mock;
    metaConnection: {
      count: jest.Mock;
    };
  };
  let redis: {
    ping: jest.Mock;
  };
  let config: Pick<ConfigService, 'get'>;
  let whatsappApi: {
    ping: jest.Mock;
    getRuntimeConfigDiagnostics: jest.Mock;
  };
  let storageService: {
    healthCheck: jest.Mock;
  };
  let observabilityQueries: {
    countConnectedMetaWorkspaces: jest.Mock;
    countAllMessagesSince: jest.Mock;
    countAllAutopilotEventsSince: jest.Mock;
  };
  let queueHealth: {
    getQueuesStatus: jest.Mock;
  };
  let stripeService: {
    healthCheck: jest.Mock;
    retrieveBalance: jest.Mock;
  };

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
    (connection.ping as jest.Mock).mockResolvedValue('PONG');
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
    };
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
    observabilityQueries = {
      countConnectedMetaWorkspaces: jest.fn().mockResolvedValue(0),
      countAllMessagesSince: jest.fn().mockResolvedValue(0),
      countAllAutopilotEventsSince: jest.fn().mockResolvedValue(0),
    };
    queueHealth = {
      getQueuesStatus: jest.fn().mockResolvedValue([]),
    };
    stripeService = {
      healthCheck: jest.fn().mockResolvedValue({ status: 'UP' }),
      retrieveBalance: jest.fn().mockResolvedValue({
        livemode: false,
        pending: [],
        available: [],
      }),
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  const createService = () =>
    new SystemHealthService(
      prisma as never as ConstructorParameters<typeof SystemHealthService>[0],
      redis as never as ConstructorParameters<typeof SystemHealthService>[1],
      config as never as ConstructorParameters<typeof SystemHealthService>[2],
      whatsappApi as never,
      storageService as never,
      observabilityQueries as never,
      queueHealth as never,
      stripeService as never,
    );

  const createSuccessFetchMock = () => {
    const mock = jest.fn() as jest.MockedFunction<typeof fetch>;
    mock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    } as Response);
    global.fetch = mock;
    return mock;
  };

  describe('deepDiagnostic', () => {
    it('includes readiness indicators, queue depths and memory performance', async () => {
      stubBackupManifest();
      createSuccessFetchMock();
      queueHealth.getQueuesStatus.mockResolvedValue([
        {
          name: 'autopilot',
          main: { waiting: 5, active: 2, delayed: 1, failed: 1 },
          dlq: { waiting: 0, active: 0, delayed: 0, failed: 0 },
          threshold: 200,
        },
        {
          name: 'campaign',
          main: { waiting: 0, active: 0, delayed: 0, failed: 0 },
          dlq: { waiting: 0, active: 0, delayed: 0, failed: 0 },
          threshold: 200,
        },
      ]);

      const service = createService();
      const result = await service.deepDiagnostic();

      expect(result.status).toBe('UP');
      expect(result.uptime).toBeGreaterThan(0);
      expect(result.failures).toHaveLength(0);
      expect(result.indicators.postgres.status).toBe('UP');
      expect(result.indicators.redis.status).toBe('UP');
      expect(result.queues.count).toBe(2);
      expect(result.queues.totalWaiting).toBe(5);
      expect(result.queues.totalFailed).toBe(1);
      expect(result.performance.memory.heapUsedMb).toBeGreaterThanOrEqual(0);
      expect(typeof result.performance.diagnosticDurationMs).toBe('number');
    });

    it('reflects DOWN status from readiness when a dependency fails', async () => {
      stubBackupManifest();
      createSuccessFetchMock();
      prisma.$queryRaw = jest.fn().mockRejectedValue(new Error('connection refused'));
      queueHealth.getQueuesStatus.mockResolvedValue([]);

      const service = createService();
      const result = await service.deepDiagnostic();

      expect(result.status).toBe('DOWN');
      expect(result.failures).toContain('postgres');
    });
  });
});
