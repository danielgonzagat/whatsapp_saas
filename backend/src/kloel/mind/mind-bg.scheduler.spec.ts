import { MindBackgroundScheduler } from './mind-bg.scheduler';
import { MindBackgroundProcessor } from './mind-bg.processor';
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

function buildScheduler() {
  const coordinator = new MultiTimescaleCoordinator();
  const aggregator = new ValenceAggregatorService();
  const hebbian = new HebbianService({ windowMs: 60_000 });
  const consolidation = new ConsolidationService();
  const processor = new MindBackgroundProcessor(
    coordinator,
    aggregator,
    hebbian,
    consolidation,
  );
  const spine = {
    recentEventsAsRef: jest.fn().mockReturnValue([]),
  } as SpineEmitterService;
  return { scheduler: new MindBackgroundScheduler(processor, spine), spine };
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
});
