import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QueueHealthService } from '../metrics/queue-health.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpsController } from './ops.controller';

const mockDlqQueue = {
  getJobs: jest.fn(),
  getJobCounts: jest.fn(),
  drain: jest.fn(),
  clean: jest.fn(),
};

const mockMainQueue = {
  name: 'default',
  add: jest.fn(),
};

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockDlqQueue),
}));

jest.mock('../queue/queue', () => ({
  queueRegistry: {
    get default() {
      return mockMainQueue;
    },
    notifications: { name: 'notifications', add: jest.fn() },
  },
  queueOptions: {
    defaultJobOptions: { removeOnComplete: true },
  },
  connection: {},
}));

jest.mock('../common/async-sequence', () => ({
  forEachSequential: jest.fn(async <T>(items: T[], fn: (item: T) => Promise<void>) => {
    for (const item of items) {
      await fn(item);
    }
  }),
}));

jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class MockJwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

describe('OpsController', () => {
  let controller: OpsController;
  let queueHealth: { getQueuesStatus: jest.Mock };
  let redis: { lrange: jest.Mock; del: jest.Mock };
  let prisma: { workspace: { findMany: jest.Mock } };

  beforeEach(async () => {
    queueHealth = { getQueuesStatus: jest.fn() };
    redis = { lrange: jest.fn(), del: jest.fn() };
    prisma = { workspace: { findMany: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpsController],
      providers: [
        { provide: QueueHealthService, useValue: queueHealth },
        { provide: 'default_IORedisModuleConnectionToken', useValue: redis },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideProvider('default_IORedisModuleConnectionToken')
      .useValue(redis)
      .compile();

    controller = module.get<OpsController>(OpsController);
  });

  describe('list', () => {
    it('returns queue statuses from QueueHealthService', async () => {
      const statuses = [{ name: 'default', status: 'ok' }];
      queueHealth.getQueuesStatus.mockResolvedValue(statuses);

      const result = await controller.list();

      expect(result).toEqual(statuses);
      expect(queueHealth.getQueuesStatus).toHaveBeenCalled();
    });

    it('propagates error when QueueHealthService fails', async () => {
      queueHealth.getQueuesStatus.mockRejectedValue(new Error('Redis unreachable'));

      await expect(controller.list()).rejects.toThrow('Redis unreachable');
    });
  });

  describe('listDlq', () => {
    it('returns dlq jobs for a known queue', async () => {
      const job = {
        id: 'j1',
        name: 'task',
        data: {},
        opts: {},
        failedReason: 'timeout',
        attemptsMade: 3,
        timestamp: Date.now(),
      };
      mockDlqQueue.getJobs.mockResolvedValue([job]);

      const result = await controller.listDlq('default', '10');

      expect(result).toEqual([
        {
          id: 'j1',
          name: 'task',
          data: {},
          opts: {},
          failedReason: 'timeout',
          attemptsMade: 3,
          timestamp: job.timestamp,
        },
      ]);
    });

    it('throws BadRequestException for unknown queue name', () => {
      expect(() => (controller as any)['getQueue']('nonexistent')).toThrow(BadRequestException);
    });

    it('clamps limit to valid range', async () => {
      mockDlqQueue.getJobs.mockResolvedValue([]);

      await controller.listDlq('default', '200');

      expect(mockDlqQueue.getJobs).toHaveBeenCalledWith(['waiting', 'failed'], 0, 99);
    });
  });

  describe('retryDlq', () => {
    it('retries dlq jobs and returns count', async () => {
      const job = {
        id: 'j1',
        name: 'task',
        data: { foo: 'bar' },
        opts: { priority: 1 },
        remove: jest.fn().mockResolvedValue(undefined),
      };
      mockDlqQueue.getJobs.mockResolvedValue([job]);
      mockMainQueue.add.mockResolvedValue({ id: 'retried' });

      const result = await controller.retryDlq('default', 10);

      expect(result).toEqual({ queue: 'default', retried: 1 });
      expect(mockMainQueue.add).toHaveBeenCalledWith(
        'task',
        { foo: 'bar' },
        { priority: 1, jobId: 'dlq-retry:j1' },
      );
      expect(job.remove).toHaveBeenCalled();
    });
  });

  describe('purgeDlq', () => {
    it('drains and cleans the dlq returning counts', async () => {
      mockDlqQueue.getJobCounts.mockResolvedValue({ waiting: 5, active: 0, delayed: 0, failed: 2 });
      mockDlqQueue.drain.mockResolvedValue(undefined);
      mockDlqQueue.clean.mockResolvedValue(undefined);

      const result = await controller.purgeDlq('default');

      expect(result).toEqual({
        queue: 'default',
        purged: { waiting: 5, active: 0, delayed: 0, failed: 2 },
      });
      expect(mockDlqQueue.drain).toHaveBeenCalled();
      expect(mockDlqQueue.clean).toHaveBeenCalledWith(0, 1000, 'failed');
    });
  });

  describe('listWebhookAlerts', () => {
    it('returns parsed alerts from redis', async () => {
      redis.lrange.mockResolvedValue([
        JSON.stringify({ type: 'error', message: 'webhook failed' }),
      ]);

      const result = await controller.listWebhookAlerts('10');

      expect(result).toEqual([{ type: 'error', message: 'webhook failed' }]);
      expect(redis.lrange).toHaveBeenCalledWith('alerts:webhooks', 0, 9);
    });

    it('handles malformed JSON entries gracefully', async () => {
      redis.lrange.mockResolvedValue(['not-json', JSON.stringify({ ok: true })]);

      const result = await controller.listWebhookAlerts('10');

      expect(result).toEqual([{ raw: 'not-json' }, { ok: true }]);
    });

    it('propagates redis errors', async () => {
      redis.lrange.mockRejectedValue(new Error('Redis connection lost'));

      await expect(controller.listWebhookAlerts()).rejects.toThrow('Redis connection lost');
    });
  });

  describe('clearWebhookAlerts', () => {
    it('clears the alerts key and returns success', async () => {
      redis.del.mockResolvedValue(1);

      const result = await controller.clearWebhookAlerts();

      expect(result).toEqual({ cleared: true });
      expect(redis.del).toHaveBeenCalledWith('alerts:webhooks');
    });
  });

  describe('listBillingSuspended', () => {
    it('returns workspaces with billing suspended', async () => {
      prisma.workspace.findMany.mockResolvedValue([
        {
          id: 'ws-1',
          name: 'Test Workspace',
          providerSettings: { billingSuspended: true },
          subscription: { status: 'active' },
        },
      ]);

      const result = await controller.listBillingSuspended();

      expect(result).toEqual([
        {
          id: 'ws-1',
          name: 'Test Workspace',
          subscriptionStatus: 'active',
        },
      ]);
      expect(prisma.workspace.findMany).toHaveBeenCalled();
    });

    it('returns UNKNOWN for workspaces without subscription', async () => {
      prisma.workspace.findMany.mockResolvedValue([
        {
          id: 'ws-2',
          name: 'No Sub',
          providerSettings: {},
          subscription: null,
        },
      ]);

      const result = await controller.listBillingSuspended();

      expect(result).toEqual([{ id: 'ws-2', name: 'No Sub', subscriptionStatus: 'UNKNOWN' }]);
    });

    it('propagates prisma errors', async () => {
      prisma.workspace.findMany.mockRejectedValue(new Error('Database timeout'));

      await expect(controller.listBillingSuspended()).rejects.toThrow('Database timeout');
    });
  });
});
