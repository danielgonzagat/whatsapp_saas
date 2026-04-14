import {
  createService,
  expectNthBackgroundTaskCall,
  flushMicrotasks,
  getInternalAsyncMethod,
  getInternalTaskRunner,
  setInternalValue,
  spyOnRunBackgroundTask,
} from '../../test/pulse/pulse.service-test-helpers';

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

    await flushMicrotasks();

    expect(warn).toHaveBeenCalledWith(
      'Pulse background task failed (critical stale sweep): redis temporarily unavailable',
    );
  });

  it('schedules and dispatches pulse background tasks on module init outside tests', async () => {
    const { service } = createService();
    const fakeTimers = [{ id: 'heartbeat' }, { id: 'stale' }, { id: 'frontend-prune' }];
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const captureBackendHeartbeat = jest
      .spyOn(service, 'captureBackendHeartbeat')
      .mockResolvedValue(undefined);
    const detectStaleNodes = jest.fn().mockResolvedValue(undefined);
    const pruneExpiredFrontendNodes = jest.fn().mockResolvedValue(undefined);
    const runScheduled = async (index: number) => {
      scheduled[index]?.callback();
      await flushMicrotasks();
    };
    let timerIndex = 0;

    delete process.env.JEST_WORKER_ID;
    process.env.NODE_ENV = 'production';

    setInternalValue(service, 'detectStaleNodes', detectStaleNodes);
    setInternalValue(service, 'pruneExpiredFrontendNodes', pruneExpiredFrontendNodes);
    const runBackgroundTask = spyOnRunBackgroundTask(service);

    jest.spyOn(global, 'setInterval').mockImplementation(((
      callback: TimerHandler,
      delay?: number,
    ) => {
      if (typeof callback !== 'function') {
        throw new Error('Expected callback interval handler');
      }
      scheduled.push({ callback: () => callback(), delay: Number(delay) });
      const timer = fakeTimers[timerIndex];
      timerIndex += 1;
      return timer as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);

    service.onModuleInit();
    await flushMicrotasks();

    expectNthBackgroundTaskCall(runBackgroundTask, 1, 'backend heartbeat startup');
    expect(scheduled.map((entry) => entry.delay)).toEqual([15_000, 60_000, 900_000]);

    expect(captureBackendHeartbeat).toHaveBeenCalledWith('startup');

    await runScheduled(0);
    expectNthBackgroundTaskCall(runBackgroundTask, 2, 'backend heartbeat interval');
    expect(captureBackendHeartbeat).toHaveBeenCalledWith('interval');

    await runScheduled(1);
    expectNthBackgroundTaskCall(runBackgroundTask, 3, 'critical stale sweep');
    expect(detectStaleNodes).toHaveBeenCalledTimes(1);

    await runScheduled(2);
    expectNthBackgroundTaskCall(runBackgroundTask, 4, 'frontend stale prune');
    expect(pruneExpiredFrontendNodes).toHaveBeenCalledTimes(1);
  });
});
