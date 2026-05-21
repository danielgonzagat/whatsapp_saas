import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AgentPerformanceService } from './agent-performance.service';

describe('AgentPerformanceService', () => {
  let service: AgentPerformanceService;
  let prisma: {
    message: { groupBy: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      message: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentPerformanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AgentPerformanceService);
  });

  it('enforces workspace isolation on both queries', async () => {
    await service.getAgentPerformance('ws-A', new Date('2026-01-01'), new Date('2026-01-31'));
    expect(prisma.message.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'ws-A' }),
      }),
    );
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'ws-A' }),
      }),
    );
  });

  it('computes real avg response time from inbound→outbound pairs', async () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    const t30 = new Date('2026-01-01T10:00:30Z'); // 30s later
    prisma.message.groupBy.mockResolvedValue([
      { agentId: 'agent-1', _count: { id: 5 } },
    ]);
    prisma.message.findMany.mockResolvedValue([
      { id: 'm1', agentId: null, direction: 'INBOUND', createdAt: t0, conversationId: 'c1' },
      { id: 'm2', agentId: 'agent-1', direction: 'OUTBOUND', createdAt: t30, conversationId: 'c1' },
    ]);
    const result = await service.getAgentPerformance(
      'ws-1',
      new Date('2026-01-01'),
      new Date('2026-01-02'),
    );
    expect(result).toEqual([
      { agentId: 'agent-1', messageCount: 5, avgResponseTime: 30 },
    ]);
  });

  it('drops responses with delta >= 24h (outlier filter)', async () => {
    const t0 = new Date('2026-01-01T00:00:00Z');
    const tNextDay = new Date('2026-01-02T01:00:00Z'); // 25h later
    prisma.message.groupBy.mockResolvedValue([
      { agentId: 'agent-1', _count: { id: 1 } },
    ]);
    prisma.message.findMany.mockResolvedValue([
      { id: 'm1', agentId: null, direction: 'INBOUND', createdAt: t0, conversationId: 'c1' },
      { id: 'm2', agentId: 'agent-1', direction: 'OUTBOUND', createdAt: tNextDay, conversationId: 'c1' },
    ]);
    const result = await service.getAgentPerformance(
      'ws-1',
      new Date('2026-01-01'),
      new Date('2026-01-03'),
    );
    expect(result[0].avgResponseTime).toBe(0);
  });

  it('returns avgResponseTime=0 when there are no inbound→outbound pairs', async () => {
    prisma.message.groupBy.mockResolvedValue([
      { agentId: 'agent-2', _count: { id: 10 } },
    ]);
    prisma.message.findMany.mockResolvedValue([]);
    const result = await service.getAgentPerformance(
      'ws-1',
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );
    expect(result).toEqual([
      { agentId: 'agent-2', messageCount: 10, avgResponseTime: 0 },
    ]);
  });
});
