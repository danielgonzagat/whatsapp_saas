import { PulseService } from './pulse.service';

type InternalAsyncMethod = (...args: never[]) => Promise<unknown>;
type InternalTaskRunner = (label: string, task: () => Promise<unknown>) => void;

class FakeRedis {
  strings = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  lists = new Map<string, string[]>();
  published: Array<{ channel: string; message: string }> = [];

  get(key: string) {
    return Promise.resolve(this.strings.get(key) ?? null);
  }

  set(key: string, value: string, ...args: Array<string | number>) {
    const nx = args.includes('NX');
    if (nx && this.strings.has(key)) {
      return Promise.resolve(null);
    }
    this.strings.set(key, value);
    return Promise.resolve('OK');
  }

  del(key: string) {
    const existed = this.strings.delete(key);
    return Promise.resolve(existed ? 1 : 0);
  }

  hgetall(key: string) {
    return Promise.resolve(Object.fromEntries(this.hashes.get(key)?.entries() ?? []));
  }

  hdel(key: string, field: string) {
    const hash = this.hashes.get(key);
    if (!hash) return Promise.resolve(0);
    const existed = hash.delete(field);
    if (hash.size === 0) {
      this.hashes.delete(key);
    }
    return Promise.resolve(existed ? 1 : 0);
  }

  lrange(key: string, start: number, stop: number) {
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? undefined : stop + 1;
    return Promise.resolve(list.slice(start, end));
  }

  multi() {
    return new FakeRedisTransaction(this);
  }

  pipeline() {
    return new FakeRedisPipeline(this);
  }
}

class FakeRedisTransaction {
  private readonly actions: Array<() => unknown> = [];

  constructor(private readonly redis: FakeRedis) {}

  set(key: string, value: string, ...args: Array<string | number>) {
    this.actions.push(() => this.redis.set(key, value, ...args));
    return this;
  }

  hset(key: string, field: string, value: string) {
    this.actions.push(() => {
      let hash = this.redis.hashes.get(key);
      if (!hash) {
        hash = new Map();
        this.redis.hashes.set(key, hash);
      }
      hash.set(field, value);
      return 1;
    });
    return this;
  }

  hdel(key: string, field: string) {
    this.actions.push(() => this.redis.hdel(key, field));
    return this;
  }

  del(key: string) {
    this.actions.push(() => this.redis.del(key));
    return this;
  }

  lpush(key: string, value: string) {
    this.actions.push(() => {
      const list = this.redis.lists.get(key) ?? [];
      list.unshift(value);
      this.redis.lists.set(key, list);
      return list.length;
    });
    return this;
  }

  ltrim(key: string, start: number, stop: number) {
    this.actions.push(() => {
      const list = this.redis.lists.get(key) ?? [];
      const trimmed = list.slice(start, stop + 1);
      this.redis.lists.set(key, trimmed);
      return 'OK';
    });
    return this;
  }

  publish(channel: string, message: string) {
    this.actions.push(() => {
      this.redis.published.push({ channel, message });
      return 1;
    });
    return this;
  }

  async exec() {
    return Promise.all(
      this.actions.map(async (action) => [null, await action()] as [null, unknown]),
    );
  }
}

class FakeRedisPipeline {
  private readonly actions: Array<() => Promise<string | null> | string | null> = [];

  constructor(private readonly redis: FakeRedis) {}

  get(key: string) {
    this.actions.push(() => this.redis.get(key));
    return this;
  }

  async exec() {
    return Promise.all(
      this.actions.map(async (action) => [null, await action()] as [null, unknown]),
    );
  }
}

function createService({
  redis = new FakeRedis(),
  healthCheck = jest.fn().mockResolvedValue({ status: 'UP', details: {} }),
  configGet = jest.fn().mockReturnValue(''),
}: {
  redis?: FakeRedis;
  healthCheck?: jest.Mock;
  configGet?: jest.Mock;
} = {}) {
  const service = new PulseService(
    redis as never,
    { check: healthCheck } as never,
    { get: configGet } as never,
  );

  return {
    service,
    redis,
    healthCheck,
    configGet,
  };
}

function getInternalAsyncMethod(service: object, name: string): InternalAsyncMethod {
  const method = Reflect.get(service, name);
  if (typeof method !== 'function') {
    throw new Error(`Expected PulseService.${name} to be a function.`);
  }
  return method.bind(service) as InternalAsyncMethod;
}

function getInternalTaskRunner(service: object): InternalTaskRunner {
  const method = Reflect.get(service, 'runBackgroundTask');
  if (typeof method !== 'function') {
    throw new Error('Expected PulseService.runBackgroundTask to be a function.');
  }
  return method.bind(service) as InternalTaskRunner;
}

describe('PulseService', () => {
  const realNodeEnv = process.env.NODE_ENV;
  const realJestWorker = process.env.JEST_WORKER_ID;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.JEST_WORKER_ID = '1';
  });

  afterEach(() => {
    if (realNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = realNodeEnv;
    }

    if (realJestWorker === undefined) {
      delete process.env.JEST_WORKER_ID;
    } else {
      process.env.JEST_WORKER_ID = realJestWorker;
    }

    jest.restoreAllMocks();
  });

  it('returns a stale organism state when no live nodes are registered', async () => {
    const { service } = createService();

    await expect(service.getOrganismState()).resolves.toMatchObject({
      status: 'STALE',
      authorityMode: 'advisory-only',
      circulation: {
        registeredNodes: 0,
        freshNodes: 0,
        staleNodes: 0,
      },
      advice: {
        level: 'watch',
      },
    });
  });

  it('records frontend heartbeats into the live registry and organism state', async () => {
    const { service, redis } = createService();

    await service.recordFrontendHeartbeat(
      { workspaceId: 'ws_123' } as never,
      {
        sessionId: 'session_1',
        route: '/dashboard',
        visible: true,
        online: true,
        viewport: { width: 1440, height: 900 },
      } as never,
    );

    const registry = await redis.hgetall('pulse:organism:registry');
    const frontendRegistry = await redis.hgetall('pulse:organism:registry:frontend');
    const criticalRegistry = await redis.hgetall('pulse:organism:registry:critical');

    expect(Object.keys(registry)).toEqual(['frontend:ws_123:session_1']);
    expect(Object.keys(frontendRegistry)).toEqual(['frontend:ws_123:session_1']);
    expect(Object.keys(criticalRegistry)).toHaveLength(0);

    await expect(service.getOrganismState()).resolves.toMatchObject({
      status: 'UP',
      circulation: {
        registeredNodes: 1,
        freshNodes: 1,
        roleCounts: {
          frontend: 1,
        },
      },
    });
  });

  it('emits a stale incident once for a critical node that stopped pulsing', async () => {
    const { service, redis } = createService();
    const detectStaleNodes = getInternalAsyncMethod(service, 'detectStaleNodes');
    const staleRecord = {
      nodeId: 'backend:test-node',
      role: 'backend',
      status: 'UP',
      summary: 'Backend was healthy.',
      source: 'backend_runtime',
      observedAt: new Date(Date.now() - 90_000).toISOString(),
      expiresAt: new Date(Date.now() - 45_000).toISOString(),
      ttlMs: 45_000,
      critical: true,
      env: 'test',
      signals: {},
    };

    await redis
      .multi()
      .hset('pulse:organism:registry', staleRecord.nodeId, JSON.stringify(staleRecord))
      .hset('pulse:organism:registry:critical', staleRecord.nodeId, JSON.stringify(staleRecord))
      .exec();

    await detectStaleNodes();
    await detectStaleNodes();

    const incidents = await redis.lrange('pulse:organism:incidents', 0, 10);
    expect(incidents).toHaveLength(1);

    const parsed = JSON.parse(incidents[0]);
    expect(parsed).toMatchObject({
      nodeId: staleRecord.nodeId,
      role: 'backend',
      status: 'STALE',
      source: 'stale_detector',
    });

    expect(redis.strings.has('pulse:organism:stale-alert:backend:test-node')).toBe(true);
  });

  it('prunes stale frontend nodes that exceeded retention from both registries', async () => {
    const { service, redis } = createService();
    const pruneExpiredFrontendNodes = getInternalAsyncMethod(service, 'pruneExpiredFrontendNodes');
    const veryOldRecord = {
      nodeId: 'frontend:ws_123:old-session',
      role: 'frontend',
      status: 'DEGRADED',
      summary: 'Frontend hidden.',
      source: 'frontend_surface',
      observedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 26 * 60 * 60 * 1000 + 90_000).toISOString(),
      ttlMs: 90_000,
      critical: false,
      env: 'test',
      workspaceId: 'ws_123',
      surface: '/dashboard',
      signals: {},
    };

    await redis
      .multi()
      .hset('pulse:organism:registry', veryOldRecord.nodeId, JSON.stringify(veryOldRecord))
      .hset('pulse:organism:registry:frontend', veryOldRecord.nodeId, JSON.stringify(veryOldRecord))
      .exec();

    await pruneExpiredFrontendNodes();

    await expect(redis.hgetall('pulse:organism:registry')).resolves.toEqual({});
    await expect(redis.hgetall('pulse:organism:registry:frontend')).resolves.toEqual({});
  });

  it('logs and swallows async background task failures', async () => {
    const { service } = createService();
    const runBackgroundTask = getInternalTaskRunner(service);
    const warn = jest.fn();
    Object.defineProperty(service as object, 'logger', {
      value: { warn, error: jest.fn() },
      configurable: true,
    });

    runBackgroundTask('critical stale sweep', () =>
      Promise.reject(new Error('redis temporarily unavailable')),
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(warn).toHaveBeenCalledWith(
      'Pulse background task failed (critical stale sweep): redis temporarily unavailable',
    );
  });
});
