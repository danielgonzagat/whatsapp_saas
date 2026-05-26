import { MindBackgroundScheduler } from './mind-bg.scheduler';
import { MindBackgroundProcessor } from './mind-bg.processor';
import { MindPredictionService } from './mind-prediction.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import {
  MultiTimescaleCoordinator,
} from './multi-timescale.coordinator';
import { ValenceAggregatorService } from './valence-aggregator.service';
import { HebbianService } from './hebbian.service';
import { ConsolidationService } from './consolidation.service';

// ---------------------------------------------------------------------------
// Mock bullmq — the factory creates fresh jest fns that we stash on
// globalThis so tests can assert on them. jest.mock is hoisted above all
// other top-level code; referencing outer variables in the factory body
// hits TDZ on `const`, so we inject references via a side channel.
// ---------------------------------------------------------------------------

jest.mock('bullmq', () => {
  const qAdd = jest.fn().mockResolvedValue(undefined);
  const qClose = jest.fn().mockResolvedValue(undefined);
  const qRemoveRepeatable = jest.fn().mockResolvedValue(undefined);
  const wClose = jest.fn().mockResolvedValue(undefined);

  const MockQueue = jest.fn().mockImplementation(() => ({
    add: qAdd,
    close: qClose,
    removeRepeatable: qRemoveRepeatable,
  }));

  const MockWorker = jest.fn().mockImplementation(() => ({
    close: wClose,
  }));

  (globalThis as Record<string, unknown>).__mindBgMocks = {
    queue: MockQueue,
    worker: MockWorker,
    qAdd,
    qClose,
    qRemoveRepeatable,
    wClose,
  };

  return { Queue: MockQueue, Worker: MockWorker };
});

function getMocks() {
  return (globalThis as Record<string, unknown>)
    .__mindBgMocks as {
    queue: jest.Mock;
    worker: jest.Mock;
    qAdd: jest.Mock<Promise<void>>;
    qClose: jest.Mock<Promise<void>>;
    qRemoveRepeatable: jest.Mock<Promise<void>>;
    wClose: jest.Mock<Promise<void>>;
  };
}

function buildScheduler(opts?: {
  cognitiveHealth?: {
    scanAndEscalate: jest.Mock<Promise<{ escalated: number }>>;
  };
}) {
  const coordinator = new MultiTimescaleCoordinator();
  const aggregator = new ValenceAggregatorService();
  const hebbian = new HebbianService({ windowMs: 60_000 });
  const consolidation = new ConsolidationService();
  const prediction = new MindPredictionService(
    undefined as unknown as never,
  );
  // Stub runCycle — the test spine returns no events, so the DB fallback
  // would fail without a real Prisma.  The tick path uses `void` so the
  // promise rejection from a naked undefined-prisma would crash the test
  // runner (unhandled rejection).
  prediction.runCycle = jest.fn().mockResolvedValue({
    cycleAt: new Date().toISOString(),
    predictionsGenerated: 0,
    predictionsEvaluated: 0,
    correctPredictions: 0,
    meanSurprise: 0,
    predictions: [],
  });
  const processor = new MindBackgroundProcessor(
    coordinator,
    aggregator,
    hebbian,
    consolidation,
    prediction,
    undefined as unknown as never,
  );
  const spine = {
    recentEventsAsRef: jest.fn().mockReturnValue([]),
  } as SpineEmitterService;
  const cognitiveHealth = opts?.cognitiveHealth as unknown as
    | import('../../cia/cia-cognitive-health.service').CiaCognitiveHealthService
    | undefined;
  return {
    scheduler: new MindBackgroundScheduler(
      processor,
      spine,
      undefined as unknown as never,
      cognitiveHealth,
    ),
    spine,
    cognitiveHealth,
  };
}

describe('MindBackgroundScheduler (UTP gap B)', () => {
  const managedEnvKeys = [
    'KLOEL_MIND_BG_ENABLED',
    'REDIS_MODE',
    'REDIS_URL',
    'REDIS_FALLBACK_URL',
    'REDIS_HOST',
    'REDISHOST',
    'REDIS_HOSTNAME',
    'REDIS_PORT',
    'REDISPORT',
    'REDIS_PASSWORD',
    'REDISPASSWORD',
    'REDIS_PASS',
    'REDIS_USERNAME',
    'REDISUSER',
    'REDIS_USER',
  ] as const;

  const prevEnv = new Map<string, string | undefined>();

  function clearRedisConnectionEnv(): void {
    for (const key of managedEnvKeys) {
      if (key !== 'KLOEL_MIND_BG_ENABLED' && key !== 'REDIS_MODE') {
        delete process.env[key];
      }
    }
  }

  beforeEach(() => {
    prevEnv.clear();
    for (const key of managedEnvKeys) {
      prevEnv.set(key, process.env[key]);
    }
  });

  afterEach(() => {
    for (const [key, value] of prevEnv) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    prevEnv.clear();
    jest.clearAllMocks();
  });

  it('does not create a BullMQ queue when KLOEL_MIND_BG_ENABLED=false', async () => {
    process.env['KLOEL_MIND_BG_ENABLED'] = 'false';
    process.env['REDIS_URL'] = 'redis://localhost:6379';
    const { scheduler } = buildScheduler();
    const { queue, worker } = getMocks();

    await scheduler.onModuleInit();

    expect(queue).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
  });

  it('does not create a BullMQ queue in default test mode', async () => {
    process.env['REDIS_URL'] = 'redis://localhost:6379';
    const { scheduler } = buildScheduler();
    const { queue, worker } = getMocks();

    await scheduler.onModuleInit();

    expect(queue).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
  });

  it('registers a recurring job with the short-timescale interval', async () => {
    process.env['KLOEL_MIND_BG_ENABLED'] = 'true';
    process.env['REDIS_URL'] = 'redis://localhost:6379';
    const { scheduler } = buildScheduler();
    const { queue, worker, qAdd } = getMocks();

    await scheduler.onModuleInit();

    expect(queue).toHaveBeenCalledTimes(1);
    expect(worker).toHaveBeenCalledTimes(1);
    expect(qAdd).toHaveBeenCalledWith('tick', {}, {
      repeat: { every: 5_000 },
    });
  });

  it('skips startup when Redis URL is not resolved', async () => {
    clearRedisConnectionEnv();
    process.env['KLOEL_MIND_BG_ENABLED'] = 'true';
    process.env['REDIS_MODE'] = 'disabled';
    const { scheduler } = buildScheduler();
    const { queue } = getMocks();

    await scheduler.onModuleInit();

    expect(queue).not.toHaveBeenCalled();
  });

  it('closes queue and worker on destroy', async () => {
    process.env['KLOEL_MIND_BG_ENABLED'] = 'true';
    process.env['REDIS_URL'] = 'redis://localhost:6379';
    const { scheduler } = buildScheduler();
    const { wClose, qClose } = getMocks();

    await scheduler.onModuleInit();
    await scheduler.onModuleDestroy();

    expect(wClose).toHaveBeenCalledTimes(1);
    expect(qClose).toHaveBeenCalledTimes(1);
  });

  // ── Wave 15: cognitive health on-tick wiring ──────────────────────

  describe('cognitive health on-tick (Wave 15)', () => {
    const cogHealthKey = 'CIA_COGNITIVE_HEALTH_TICK_ENABLED';

    afterEach(() => {
      delete process.env[cogHealthKey];
    });

    it('calls scanAndEscalate when CIA_COGNITIVE_HEALTH_TICK_ENABLED=true', async () => {
      process.env[cogHealthKey] = 'true';
      const scanMock = jest.fn().mockResolvedValue({ escalated: 0 });
      const { scheduler, cognitiveHealth } = buildScheduler({
        cognitiveHealth: { scanAndEscalate: scanMock },
      });

      await scheduler.executeTick();

      expect(scanMock).toHaveBeenCalledTimes(1);
      expect(scanMock).toHaveBeenCalledWith('ws-test-001');
    });

    it('does NOT call scanAndEscalate when flag is absent', async () => {
      // flag deliberately not set
      const scanMock = jest.fn().mockResolvedValue({ escalated: 0 });
      const { scheduler } = buildScheduler({
        cognitiveHealth: { scanAndEscalate: scanMock },
      });

      await scheduler.executeTick();

      expect(scanMock).not.toHaveBeenCalled();
    });

    it('does NOT call scanAndEscalate when CIA_COGNITIVE_HEALTH_TICK_ENABLED=false', async () => {
      process.env[cogHealthKey] = 'false';
      const scanMock = jest.fn().mockResolvedValue({ escalated: 0 });
      const { scheduler } = buildScheduler({
        cognitiveHealth: { scanAndEscalate: scanMock },
      });

      await scheduler.executeTick();

      expect(scanMock).not.toHaveBeenCalled();
    });

    it('continues tick processing when scanAndEscalate throws', async () => {
      process.env[cogHealthKey] = 'true';
      const scanMock = jest
        .fn()
        .mockRejectedValue(new Error('goal-field explosion'));
      const { scheduler } = buildScheduler({
        cognitiveHealth: { scanAndEscalate: scanMock },
      });

      // Must not throw
      await scheduler.executeTick();

      expect(scanMock).toHaveBeenCalledTimes(1);
    });

    it('tolerates missing cognitiveHealth (undefined / not provided)', async () => {
      process.env[cogHealthKey] = 'true';
      // No cognitiveHealth mock passed — simulates the @Optional() not resolving
      const { scheduler } = buildScheduler();

      // Must not throw on the optional chaining
      await scheduler.executeTick();
      // passes if no exception
    });
  });
});
