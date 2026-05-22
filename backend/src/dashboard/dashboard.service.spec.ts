import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

describe('DashboardService.getStats', () => {
  let service: DashboardService;
  let prisma: {
    workspace: { findUnique: jest.Mock };
    contact: { count: jest.Mock };
    campaign: { count: jest.Mock };
    flow: { count: jest.Mock };
    message: { groupBy: jest.Mock };
    conversation: { count: jest.Mock };
    flowExecution: { groupBy: jest.Mock };
  };
  let redis: { lrange: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }) },
      contact: { count: jest.fn().mockResolvedValue(0) },
      campaign: { count: jest.fn().mockResolvedValue(0) },
      flow: { count: jest.fn().mockResolvedValue(0) },
      message: { groupBy: jest.fn().mockResolvedValue([]) },
      conversation: { count: jest.fn().mockResolvedValue(0) },
      flowExecution: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    redis = { lrange: jest.fn().mockResolvedValue([]) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_TOKEN, useValue: redis },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  it('enforces workspace isolation on contact/campaign/flow counts', async () => {
    await service.getStats('ws-tenant-A');
    expect(prisma.contact.count.mock.calls[0][0].where.workspaceId).toBe('ws-tenant-A');
    expect(prisma.campaign.count.mock.calls[0][0].where.workspaceId).toBe('ws-tenant-A');
    expect(prisma.flow.count.mock.calls[0][0].where.workspaceId).toBe('ws-tenant-A');
  });

  it('exposes billingSuspended from providerSettings', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: { billingSuspended: true },
    });
    const result = await service.getStats('ws-1');
    expect(result.billingSuspended).toBe(true);
  });

  it('computes deliveryRate = (delivered+read)/total * 100', async () => {
    prisma.message.groupBy.mockResolvedValue([
      { status: 'SENT', _count: { status: 10 } },
      { status: 'DELIVERED', _count: { status: 30 } },
      { status: 'READ', _count: { status: 40 } },
      { status: 'FAILED', _count: { status: 20 } },
    ]);
    const result = await service.getStats('ws-1');
    expect(result.messages).toBe(100);
    expect(result.deliveryRate).toBe(70);
    expect(result.errorRate).toBe(20);
  });

  it('readRate = read / (delivered+read) * 100', async () => {
    prisma.message.groupBy.mockResolvedValue([
      { status: 'DELIVERED', _count: { status: 60 } },
      { status: 'READ', _count: { status: 40 } },
    ]);
    const result = await service.getStats('ws-1');
    expect(result.readRate).toBe(40);
  });

  it('defaults all rates to 0 when no outbound messages', async () => {
    prisma.message.groupBy.mockResolvedValue([]);
    const result = await service.getStats('ws-1');
    expect(result.deliveryRate).toBe(0);
    expect(result.readRate).toBe(0);
    expect(result.errorRate).toBe(0);
  });

  it('computes healthScore from Redis metrics events (success ratio)', async () => {
    redis.lrange.mockResolvedValue(['1:100', '1:200', '0:0', '1:50']);
    const result = await service.getStats('ws-1');
    expect(result.healthScore).toBe(75); // 3/4
    expect(result.avgLatency).toBeGreaterThan(0);
  });

  it('healthScore defaults to 100 when no events present', async () => {
    redis.lrange.mockResolvedValue([]);
    const result = await service.getStats('ws-1');
    expect(result.healthScore).toBe(100);
    expect(result.avgLatency).toBe(0);
  });

  it('reports flow funnel for today from flowExecution groups', async () => {
    prisma.flowExecution.groupBy.mockResolvedValue([
      { status: 'COMPLETED', _count: { status: 5 } },
      { status: 'RUNNING', _count: { status: 2 } },
      { status: 'FAILED', _count: { status: 1 } },
    ]);
    const result = await service.getStats('ws-1');
    expect(result.flowCompleted).toBe(5);
    expect(result.flowRunning).toBe(2);
    expect(result.flowFailed).toBe(1);
  });
});
