import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { QueueStatsService } from './queue-stats.service';

describe('QueueStatsService', () => {
  let service: QueueStatsService;
  let prisma: { queue: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { queue: { findMany: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueStatsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(QueueStatsService);
  });

  it('returns mapped stats with waitingCount derived from _count.conversations', async () => {
    prisma.queue.findMany.mockResolvedValue([
      { id: 'q1', name: 'Sales', _count: { conversations: 3 } },
      { id: 'q2', name: 'Support', _count: { conversations: 0 } },
    ]);
    const result = await service.getQueueStats('ws-1');
    expect(result).toEqual([
      { id: 'q1', name: 'Sales', waitingCount: 3 },
      { id: 'q2', name: 'Support', waitingCount: 0 },
    ]);
  });

  it('enforces workspace isolation in the Prisma query', async () => {
    prisma.queue.findMany.mockResolvedValue([]);
    await service.getQueueStats('ws-tenant-A');
    expect(prisma.queue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'ws-tenant-A' } }),
    );
  });

  it('caps results at 100 and only counts OPEN unassigned conversations', async () => {
    prisma.queue.findMany.mockResolvedValue([]);
    await service.getQueueStats('ws-1');
    const arg = prisma.queue.findMany.mock.calls[0][0];
    expect(arg.take).toBe(100);
    expect(arg.select._count.select.conversations.where).toEqual({
      status: 'OPEN',
      assignedAgentId: null,
    });
  });

  it('returns empty array when no queues exist', async () => {
    prisma.queue.findMany.mockResolvedValue([]);
    await expect(service.getQueueStats('ws-empty')).resolves.toEqual([]);
  });
});
