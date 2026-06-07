import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindService } from '../../mind.service';
import { MindReportService } from '../observability/mind-report.service';
import { MindSelfModelService } from '../self-model/mind-self-model.service';
import { MindProcessorService } from './mind-processor.service';

type ProcessorFn = () => Promise<unknown>;
type TickProcessorFn = (job: { data: unknown }) => Promise<unknown>;
let capturedSchedulerProcessor: ProcessorFn | null = null;
let capturedTickProcessor: TickProcessorFn | null = null;
const queueAddMock = jest.fn().mockResolvedValue(undefined);
const queueCloseMock = jest.fn().mockResolvedValue(undefined);
const workerCloseMock = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: queueAddMock,
    close: queueCloseMock,
  })),
  Worker: jest.fn().mockImplementation((name: string, processor: unknown, _opts?: unknown) => {
    if (name === 'mind-scheduler' && typeof processor === 'function') {
      capturedSchedulerProcessor = processor as ProcessorFn;
    }
    if (name === 'mind-tick' && typeof processor === 'function') {
      capturedTickProcessor = processor as TickProcessorFn;
    }
    return {
      on: jest.fn(),
      close: workerCloseMock,
    };
  }),
  QueueEvents: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../common/redis/redis.util', () => ({
  createBullMqConnectionOptions: jest.fn(() => ({
    url: 'redis://localhost:6379',
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  })),
  createRedisClient: jest.fn(() => ({})),
  isRedisConfigured: jest.fn(() => true),
  getRedisUrl: jest.fn(() => 'redis://localhost:6379'),
  maskRedisUrl: jest.fn((url: string) => url),
}));

describe('MindProcessorService', () => {
  let service: MindProcessorService;
  let prisma: { $queryRaw: jest.Mock };
  let mind: { tick: jest.Mock };
  let reports: { generateDaily: jest.Mock };
  let selfModel: { snapshot: jest.Mock };

  const realDisable = process.env.MIND_DISABLE_PROCESSOR;

  beforeEach(async () => {
    queueAddMock.mockClear();
    queueCloseMock.mockClear();
    workerCloseMock.mockClear();
    capturedSchedulerProcessor = null;
    capturedTickProcessor = null;

    prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    mind = { tick: jest.fn().mockResolvedValue({}) };
    reports = { generateDaily: jest.fn().mockResolvedValue(undefined) };
    selfModel = { snapshot: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MindProcessorService,
        { provide: PrismaService, useValue: prisma },
        { provide: MindService, useValue: mind },
        { provide: MindReportService, useValue: reports },
        { provide: MindSelfModelService, useValue: selfModel },
      ],
    }).compile();
    service = module.get(MindProcessorService);
  });

  afterEach(() => {
    if (realDisable === undefined) {
      delete process.env.MIND_DISABLE_PROCESSOR;
    } else {
      process.env.MIND_DISABLE_PROCESSOR = realDisable;
    }
  });

  describe('onModuleInit', () => {
    it('returns early when MIND_DISABLE_PROCESSOR is set', async () => {
      process.env.MIND_DISABLE_PROCESSOR = '1';
      await service.onModuleInit();
      expect(queueAddMock).not.toHaveBeenCalled();
    });

    it('initializes queues and workers when Redis is configured', async () => {
      process.env.MIND_DISABLE_PROCESSOR = '0';
      prisma.$queryRaw.mockResolvedValue([{ id: 'ws-1' }, { id: 'ws-2' }]);

      await service.onModuleInit();

      expect(queueAddMock).toHaveBeenCalledWith(
        'fanout',
        {},
        expect.objectContaining({ jobId: 'mind-fanout' }),
      );
    });
  });

  describe('scheduler fanout', () => {
    it('enqueues active workspaces when fanout processor runs', async () => {
      process.env.MIND_DISABLE_PROCESSOR = '0';
      prisma.$queryRaw.mockResolvedValue([{ id: 'ws-a' }, { id: 'ws-b' }]);

      await service.onModuleInit();
      expect(capturedSchedulerProcessor).toBeDefined();

      queueAddMock.mockClear();
      const result = await capturedSchedulerProcessor();

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(queueAddMock).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ dispatched: 2 });
    });
  });

  describe('tick worker', () => {
    it('invokes the self-model snapshot once per tick (fire-and-forget)', async () => {
      process.env.MIND_DISABLE_PROCESSOR = '0';
      await service.onModuleInit();
      expect(capturedTickProcessor).toBeDefined();

      await capturedTickProcessor({ data: { workspaceId: 'ws-snap' } });

      expect(mind.tick).toHaveBeenCalledWith('ws-snap');
      expect(selfModel.snapshot).toHaveBeenCalledWith('ws-snap');
    });

    it('stays fail-open: a snapshot rejection never breaks the tick', async () => {
      process.env.MIND_DISABLE_PROCESSOR = '0';
      selfModel.snapshot.mockRejectedValueOnce(new Error('db down'));
      await service.onModuleInit();
      expect(capturedTickProcessor).toBeDefined();

      const result = await capturedTickProcessor({ data: { workspaceId: 'ws-snap' } });

      // tick still resolved with the mind.tick result despite the snapshot throw.
      expect(result).toEqual({});
      expect(mind.tick).toHaveBeenCalledWith('ws-snap');
      // let the detached rejection settle without an unhandled-rejection.
      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  describe('onModuleDestroy', () => {
    it('closes workers and queues without error even when not initialized', async () => {
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });

    it('closes workers and queues gracefully after initialization', async () => {
      process.env.MIND_DISABLE_PROCESSOR = '0';
      await service.onModuleInit();

      queueCloseMock.mockClear();
      workerCloseMock.mockClear();

      await service.onModuleDestroy();

      expect(workerCloseMock).toHaveBeenCalled();
      expect(queueCloseMock).toHaveBeenCalled();
    });
  });
});
