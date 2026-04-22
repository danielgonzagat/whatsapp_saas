import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
  let artifactRootDir: string;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.JEST_WORKER_ID = '1';
    artifactRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-runtime-'));
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
    fs.rmSync(artifactRootDir, { recursive: true, force: true });
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

  it('returns missing canonical artifacts when no pulse production snapshot exists yet', () => {
    const { service } = createService({
      configGet: jest.fn((key: string) => (key === 'PULSE_ARTIFACT_ROOT' ? artifactRootDir : '')),
    });

    expect(service.getProductionSnapshot()).toMatchObject({
      status: 'empty',
      authorityMode: 'advisory-only',
      missingArtifacts: expect.arrayContaining([
        'PULSE_CLI_DIRECTIVE.json',
        'PULSE_CERTIFICATE.json',
        'PULSE_PRODUCT_VISION.json',
        'PULSE_PARITY_GAPS.json',
        'PULSE_CONVERGENCE_PLAN.json',
      ]),
    });
  });

  it('reads canonical pulse artifacts for production runtime consumers', async () => {
    const canonicalDir = path.join(artifactRootDir, '.pulse', 'current');
    fs.mkdirSync(canonicalDir, { recursive: true });
    const generatedAt = new Date().toISOString();

    fs.writeFileSync(
      path.join(canonicalDir, 'PULSE_CLI_DIRECTIVE.json'),
      JSON.stringify(
        {
          generatedAt,
          currentCheckpoint: { tier: 0, status: 'NOT_CERTIFIED', score: 38 },
          nextWork: [
            { id: 'scenario-auth', title: 'Recover Auth', productImpact: 'transformational' },
          ],
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(canonicalDir, 'PULSE_CERTIFICATE.json'),
      JSON.stringify({ timestamp: generatedAt, status: 'NOT_CERTIFIED', score: 38 }, null, 2),
    );
    fs.writeFileSync(
      path.join(canonicalDir, 'PULSE_PRODUCT_VISION.json'),
      JSON.stringify({ generatedAt, distanceSummary: 'gap summary', topBlockers: ['A'] }, null, 2),
    );
    fs.writeFileSync(
      path.join(canonicalDir, 'PULSE_PARITY_GAPS.json'),
      JSON.stringify(
        { generatedAt, summary: { totalGaps: 12, criticalGaps: 0, highGaps: 8, byKind: {} } },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(canonicalDir, 'PULSE_SCOPE_STATE.json'),
      JSON.stringify({ generatedAt, summary: { totalFiles: 10 } }, null, 2),
    );
    fs.writeFileSync(
      path.join(canonicalDir, 'PULSE_CODACY_EVIDENCE.json'),
      JSON.stringify({ generatedAt, summary: { totalIssues: 33, highIssues: 7 } }, null, 2),
    );
    fs.writeFileSync(
      path.join(canonicalDir, 'PULSE_CAPABILITY_STATE.json'),
      JSON.stringify(
        { generatedAt, summary: { totalCapabilities: 4, realCapabilities: 2 } },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(canonicalDir, 'PULSE_FLOW_PROJECTION.json'),
      JSON.stringify({ generatedAt, summary: { totalFlows: 5, realFlows: 3 } }, null, 2),
    );
    fs.writeFileSync(
      path.join(canonicalDir, 'PULSE_CONVERGENCE_PLAN.json'),
      JSON.stringify(
        {
          generatedAt,
          summary: { totalUnits: 2, humanRequiredUnits: 0, observationOnlyUnits: 0 },
          queue: [{ id: 'scenario-auth', title: 'Recover Auth', executionMode: 'ai_safe' }],
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(canonicalDir, 'PULSE_ARTIFACT_INDEX.json'),
      JSON.stringify({ generatedAt, officialArtifacts: ['PULSE_CLI_DIRECTIVE.json'] }, null, 2),
    );

    const { service } = createService({
      configGet: jest.fn((key: string) => (key === 'PULSE_ARTIFACT_ROOT' ? artifactRootDir : '')),
    });

    expect(service.getLatestDirective()).toMatchObject({
      artifact: 'PULSE_CLI_DIRECTIVE.json',
      freshness: 'fresh',
      data: {
        currentCheckpoint: { score: 38 },
      },
    });

    expect(service.getProductionSnapshot()).toMatchObject({
      status: 'ready',
      canonicalDir,
      missingArtifacts: [],
      staleArtifacts: [],
      directive: {
        freshness: 'fresh',
        data: {
          nextWork: [{ id: 'scenario-auth' }],
        },
      },
      certificate: {
        freshness: 'fresh',
        data: {
          status: 'NOT_CERTIFIED',
        },
      },
      productVision: {
        freshness: 'fresh',
        data: {
          distanceSummary: 'gap summary',
        },
      },
      parityGaps: {
        freshness: 'fresh',
        data: {
          summary: {
            totalGaps: 12,
          },
        },
      },
      scopeState: {
        freshness: 'fresh',
        data: {
          summary: {
            totalFiles: 10,
          },
        },
      },
      codacyEvidence: {
        freshness: 'fresh',
        data: {
          summary: {
            totalIssues: 33,
          },
        },
      },
      capabilityState: {
        freshness: 'fresh',
        data: {
          summary: {
            totalCapabilities: 4,
          },
        },
      },
      flowProjection: {
        freshness: 'fresh',
        data: {
          summary: {
            totalFlows: 5,
          },
        },
      },
      convergencePlan: {
        freshness: 'fresh',
        data: {
          summary: {
            totalUnits: 2,
          },
        },
      },
    });

    await expect(service.getOrganismState()).resolves.toMatchObject({
      productionSnapshot: {
        status: 'ready',
        convergenceGeneratedAt: generatedAt,
        topActions: [{ id: 'scenario-auth' }],
      },
    });
  });

  it('detects the monorepo artifact root when the backend process starts from backend/', () => {
    const repoRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-monorepo-'));
    const backendDir = path.join(repoRootDir, 'backend');
    const canonicalDir = path.join(repoRootDir, '.pulse', 'current');
    const generatedAt = new Date().toISOString();
    fs.mkdirSync(path.join(repoRootDir, 'scripts', 'pulse'), { recursive: true });
    fs.mkdirSync(backendDir, { recursive: true });
    fs.mkdirSync(canonicalDir, { recursive: true });
    fs.writeFileSync(path.join(repoRootDir, 'package.json'), '{}\n');
    fs.writeFileSync(path.join(repoRootDir, 'scripts', 'pulse', 'run.js'), '#!/usr/bin/env node\n');
    fs.writeFileSync(
      path.join(canonicalDir, 'PULSE_CLI_DIRECTIVE.json'),
      JSON.stringify({ generatedAt, nextWork: [{ id: 'from-root' }] }, null, 2),
    );

    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(backendDir);
    try {
      const { service } = createService({
        configGet: jest.fn(() => ''),
      });

      expect(service.getLatestDirective()).toMatchObject({
        freshness: 'fresh',
        data: {
          nextWork: [{ id: 'from-root' }],
        },
        path: path.join(canonicalDir, 'PULSE_CLI_DIRECTIVE.json'),
      });
    } finally {
      cwdSpy.mockRestore();
      fs.rmSync(repoRootDir, { recursive: true, force: true });
    }
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
