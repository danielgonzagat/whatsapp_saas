import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AgentPerformanceService } from './agent-performance.service';
import { QueueStatsService } from './queue-stats.service';
import { AdvancedAnalyticsService } from './advanced-analytics.service';

describe('AdvancedAnalyticsService', () => {
  let service: AdvancedAnalyticsService;
  let prisma: {
    kloelSale: { findMany: jest.Mock };
    conversation: { groupBy: jest.Mock };
    flowExecution: { groupBy: jest.Mock };
    contact: { count: jest.Mock };
    flow: { findMany: jest.Mock };
  };
  let agentPerformance: { getAgentPerformance: jest.Mock };
  let queueStats: { getQueueStats: jest.Mock };

  beforeEach(async () => {
    prisma = {
      kloelSale: { findMany: jest.fn().mockResolvedValue([]) },
      conversation: { groupBy: jest.fn().mockResolvedValue([]) },
      flowExecution: { groupBy: jest.fn().mockResolvedValue([]) },
      contact: { count: jest.fn().mockResolvedValue(0) },
      flow: { findMany: jest.fn().mockResolvedValue([]) },
    };
    agentPerformance = { getAgentPerformance: jest.fn().mockResolvedValue([]) };
    queueStats = { getQueueStats: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvancedAnalyticsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentPerformanceService, useValue: agentPerformance },
        { provide: QueueStatsService, useValue: queueStats },
      ],
    }).compile();
    service = module.get(AdvancedAnalyticsService);
  });

  const start = new Date('2026-01-01T00:00:00Z');
  const end = new Date('2026-01-31T23:59:59Z');

  it('enforces workspace isolation on all four parallel queries', async () => {
    await service.getAdvancedDashboard('ws-tenant-A', start, end);
    expect(prisma.kloelSale.findMany.mock.calls[0][0].where.workspaceId).toBe('ws-tenant-A');
    expect(prisma.conversation.groupBy.mock.calls[0][0].where.workspaceId).toBe('ws-tenant-A');
    expect(prisma.flowExecution.groupBy.mock.calls[0][0].where.workspaceId).toBe('ws-tenant-A');
    expect(prisma.contact.count.mock.calls[0][0].where.workspaceId).toBe('ws-tenant-A');
  });

  it('aggregates sales totals with conversionRate = paid/total', async () => {
    prisma.kloelSale.findMany.mockResolvedValue([
      { amount: 100, status: 'paid', createdAt: new Date('2026-01-05'), paidAt: new Date('2026-01-05') },
      { amount: 50, status: 'paid', createdAt: new Date('2026-01-06'), paidAt: new Date('2026-01-06') },
      { amount: 25, status: 'failed', createdAt: new Date('2026-01-07'), paidAt: null },
    ]);
    const result = await service.getAdvancedDashboard('ws-1', start, end);
    expect(result.sales.totals.totalCount).toBe(3);
    expect(result.sales.totals.totalAmount).toBe(175);
    expect(result.sales.totals.paidCount).toBe(2);
    expect(result.sales.totals.paidAmount).toBe(150);
    expect(result.sales.totals.conversionRate).toBeCloseTo(2 / 3);
  });

  it('returns conversionRate=0 when no sales', async () => {
    prisma.kloelSale.findMany.mockResolvedValue([]);
    const result = await service.getAdvancedDashboard('ws-1', start, end);
    expect(result.sales.totals.conversionRate).toBe(0);
  });

  it('groups sales by day key (YYYY-MM-DD) and totals match', async () => {
    // Use mid-day dates so local-TZ day-of-month is stable across runners.
    prisma.kloelSale.findMany.mockResolvedValue([
      { amount: 10, status: 'paid', createdAt: new Date('2026-01-05T12:00:00Z'), paidAt: new Date('2026-01-05T12:00:00Z') },
      { amount: 20, status: 'paid', createdAt: new Date('2026-01-05T12:00:00Z'), paidAt: new Date('2026-01-05T12:00:00Z') },
      { amount: 30, status: 'paid', createdAt: new Date('2026-01-06T12:00:00Z'), paidAt: new Date('2026-01-06T12:00:00Z') },
    ]);
    const result = await service.getAdvancedDashboard('ws-1', start, end);
    expect(result.sales.byDay.length).toBe(2);
    const sum = result.sales.byDay.reduce((acc, d) => acc + d.paidAmount, 0);
    expect(sum).toBe(60);
    const countSum = result.sales.byDay.reduce((acc, d) => acc + d.paidCount, 0);
    expect(countSum).toBe(3);
  });

  it('produces funnels.completionRate from flowExecution groups', async () => {
    prisma.flowExecution.groupBy
      .mockResolvedValueOnce([
        { status: 'COMPLETED', _count: { id: 8 } },
        { status: 'FAILED', _count: { id: 2 } },
      ])
      .mockResolvedValueOnce([]);
    const result = await service.getAdvancedDashboard('ws-1', start, end);
    expect(result.funnels.totals.total).toBe(10);
    expect(result.funnels.totals.completed).toBe(8);
    expect(result.funnels.totals.failed).toBe(2);
    expect(result.funnels.totals.completionRate).toBeCloseTo(0.8);
  });

  it('joins topFlows with flow names from flow table', async () => {
    prisma.flowExecution.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { flowId: 'flow-A', _count: { id: 5 } },
        { flowId: 'flow-B', _count: { id: 3 } },
      ]);
    prisma.flow.findMany.mockResolvedValue([
      { id: 'flow-A', name: 'Welcome flow' },
      { id: 'flow-B', name: 'Upsell flow' },
    ]);
    const result = await service.getAdvancedDashboard('ws-1', start, end);
    expect(result.funnels.topFlows).toEqual([
      { flowId: 'flow-A', name: 'Welcome flow', executions: 5 },
      { flowId: 'flow-B', name: 'Upsell flow', executions: 3 },
    ]);
  });
});
