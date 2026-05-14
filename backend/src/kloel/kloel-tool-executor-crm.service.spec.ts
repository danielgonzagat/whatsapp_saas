import { Test, TestingModule } from '@nestjs/testing';
import { KloelToolExecutorCrmService } from './kloel-tool-executor-crm.service';
import { PrismaService } from '../prisma/prisma.service';
type CrmPrismaMock = {
  contact: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock };
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  flow: { findMany: jest.Mock; count: jest.Mock };
  checkoutOrder: { aggregate: jest.Mock };
  kloelWallet: { findUnique: jest.Mock };
  campaign: { create: jest.Mock; count: jest.Mock };
  message: { count: jest.Mock };
  $transaction: jest.Mock;
};
describe('KloelToolExecutorCrmService', () => {
  let service: KloelToolExecutorCrmService;
  let prisma: CrmPrismaMock;
  const wsId = 'ws-crm-1';
  beforeEach(async () => {
    prisma = {
      contact: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      flow: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      checkoutOrder: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0 },
          _sum: { totalInCents: 0 },
        }),
      },
      kloelWallet: { findUnique: jest.fn().mockResolvedValue(null) },
      campaign: { create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
      message: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(prisma);
        }
        return Promise.resolve(undefined);
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [KloelToolExecutorCrmService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<KloelToolExecutorCrmService>(KloelToolExecutorCrmService);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('toolListLeads', () => {
    it('returns empty list when no contacts exist', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      const result = await service.toolListLeads(wsId, {});
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.message).toContain('0 lead');
      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: wsId } }),
      );
    });
    it('filters qualified leads with leadScore >= 70', async () => {
      const contacts = [
        {
          id: 'c-1',
          name: 'Ana',
          phone: '5511',
          leadScore: 85,
          sentiment: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      prisma.contact.findMany.mockResolvedValue(contacts);
      const result = await service.toolListLeads(wsId, { status: 'qualified' });
      expect(result.count).toBe(1);
      expect(result.leads[0].score).toBe(85);
      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId, leadScore: { gte: 70 } },
        }),
      );
    });
    it('filters cold leads with leadScore < 30', async () => {
      prisma.contact.findMany.mockResolvedValue([]);

      await service.toolListLeads(wsId, { status: 'cold' });

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId, leadScore: { lt: 30 } },
        }),
      );
    });

    it('respects limit parameter', async () => {
      await service.toolListLeads(wsId, { limit: 5 });

      expect(prisma.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });
  });

  describe('toolGetLeadDetails', () => {
    const contactFixture = {
      id: 'c-1',
      name: 'Ana',
      phone: '5511999999999',
      email: 'ana@test.com',
      sentiment: 'positive',
      leadScore: 75,
      tags: [{ name: 'VIP' }, { name: 'Novo' }],
      conversations: [
        { messages: [{ content: 'Oi', direction: 'INBOUND', createdAt: new Date() }] },
      ],
    };

    it('finds lead by leadId', async () => {
      prisma.contact.findFirst.mockResolvedValue(contactFixture);

      const result = await service.toolGetLeadDetails(wsId, { leadId: 'c-1' });

      expect(result.success).toBe(true);
      expect((result as Record<string, unknown>).lead).toMatchObject({ id: 'c-1' });
      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c-1', workspaceId: wsId } }),
      );
    });

    it('finds lead by phone', async () => {
      prisma.contact.findFirst.mockResolvedValue(contactFixture);

      await service.toolGetLeadDetails(wsId, { phone: '(11) 99999-9999' });

      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { phone: { contains: '11999999999' }, workspaceId: wsId },
        }),
      );
    });

    it('returns error when lead not found', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);

      const result = await service.toolGetLeadDetails(wsId, { leadId: 'no-exist' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lead não encontrado');
    });
  });

  describe('toolSaveBusinessInfo', () => {
    it('updates business name only', async () => {
      const result = await service.toolSaveBusinessInfo(wsId, { businessName: 'Loja Teste' });

      expect(result.success).toBe(true);
      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: wsId },
        data: { name: 'Loja Teste' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('uses transaction when description or segment provided', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: {},
      });

      const result = await service.toolSaveBusinessInfo(wsId, {
        description: 'E-commerce de moda',
        segment: 'moda',
      });

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('toolSetBusinessHours', () => {
    it('configures business hours via transaction', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: {},
      });

      const result = await service.toolSetBusinessHours(wsId, {
        weekdayStart: '08:00',
        weekdayEnd: '18:00',
        saturdayStart: '09:00',
        saturdayEnd: '13:00',
      });

      expect(result.success).toBe(true);
      expect(result.businessHours).toEqual({
        weekday: { start: '08:00', end: '18:00' },
        saturday: { start: '09:00', end: '13:00' },
        sunday: null,
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('toolCreateCampaign', () => {
    it('creates campaign for hot leads target', async () => {
      prisma.contact.count.mockResolvedValue(12);
      prisma.campaign.create.mockResolvedValue({ id: 'cm-1', name: 'Campanha VIP' });

      const result = await service.toolCreateCampaign(wsId, {
        name: 'Campanha VIP',
        message: 'Oferta especial',
        targetAudience: 'leads_quentes',
      });

      expect(result.success).toBe(true);
      expect((result as Record<string, unknown>).campaign).toMatchObject({
        estimatedRecipients: 12,
      });
      expect(prisma.contact.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId, leadScore: { gte: 70 } },
        }),
      );
      expect(prisma.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: wsId,
            name: 'Campanha VIP',
            status: 'DRAFT',
          }),
        }),
      );
    });

    it('creates campaign for new contacts target', async () => {
      prisma.contact.count.mockResolvedValue(5);
      prisma.campaign.create.mockResolvedValue({ id: 'cm-2', name: 'Boas Vindas' });

      await service.toolCreateCampaign(wsId, {
        name: 'Boas Vindas',
        message: 'Bem-vindo!',
        targetAudience: 'novos',
      });

      const countArgs = prisma.contact.count.mock.calls[0][0];
      expect(countArgs.where).toEqual(
        expect.objectContaining({
          workspaceId: wsId,
          createdAt: { gte: countArgs.where.createdAt.gte },
        }),
      );
      expect(countArgs.where.createdAt.gte).toBeInstanceOf(Date);
    });
  });

  describe('toolGetDashboardSummary', () => {
    it('returns aggregated stats for today', async () => {
      prisma.contact.count.mockResolvedValue(10);
      prisma.message.count.mockResolvedValue(50);
      prisma.flow.count.mockResolvedValue(3);
      prisma.checkoutOrder.aggregate.mockResolvedValue({
        _count: { _all: 5 },
        _sum: { totalInCents: 125000 },
      });
      prisma.kloelWallet.findUnique.mockResolvedValue({
        availableBalanceInCents: 50000n,
        pendingBalanceInCents: 25000n,
        blockedBalanceInCents: 0n,
      });

      const result = await service.toolGetDashboardSummary(wsId, 'today');

      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        newContacts: 10,
        messages: 50,
        activeFlows: 3,
        paidOrders: 5,
        revenueInCents: 125000,
        revenue: 1250,
        wallet: {
          availableInCents: 50000,
          pendingInCents: 25000,
          blockedInCents: 0,
          totalInCents: 75000,
          available: 500,
          pending: 250,
          blocked: 0,
          total: 750,
        },
      });
    });

    it('uses week date filter', async () => {
      prisma.checkoutOrder.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { totalInCents: null },
      });

      await service.toolGetDashboardSummary(wsId, 'week');

      const countArgs = prisma.contact.count.mock.calls[0][0];
      expect(countArgs.where).toEqual({
        workspaceId: wsId,
        createdAt: { gte: countArgs.where.createdAt.gte },
      });
      expect(countArgs.where.createdAt.gte).toBeInstanceOf(Date);
    });

    it('uses month date filter', async () => {
      prisma.checkoutOrder.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { totalInCents: null },
      });

      await service.toolGetDashboardSummary(wsId, 'month');

      expect(prisma.checkoutOrder.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId, status: 'PAID' }),
        }),
      );
    });
  });

  describe('toolListFlows', () => {
    it('returns empty when no flows', async () => {
      prisma.flow.findMany.mockResolvedValue([]);

      const result = await service.toolListFlows(wsId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('0 fluxo');
    });

    it('lists flows filtered by workspaceId', async () => {
      const flows = [
        {
          id: 'f-1',
          name: 'Flow 1',
          isActive: true,
          createdAt: new Date(),
          _count: { executions: 10 },
        },
        {
          id: 'f-2',
          name: 'Flow 2',
          isActive: false,
          createdAt: new Date(),
          _count: { executions: 0 },
        },
      ];
      prisma.flow.findMany.mockResolvedValue(flows);

      const result = await service.toolListFlows(wsId);

      expect(result.flows).toHaveLength(2);
      expect(prisma.flow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: wsId } }),
      );
    });
  });

  describe('workspace isolation', () => {
    it('toolListLeads filters by correct workspaceId', async () => {
      await service.toolListLeads('ws-isolated', {});
      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-isolated' } }),
      );
    });

    it('toolCreateCampaign scopes to workspaceId', async () => {
      prisma.campaign.create.mockResolvedValue({ id: 'c-1', name: 'Test' });
      await service.toolCreateCampaign('ws-isolated', { name: 'Camp', message: 'msg' });
      expect(prisma.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workspaceId: 'ws-isolated' }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('toolListLeads propagates Prisma error', async () => {
      prisma.contact.findMany.mockRejectedValue(new Error('DB connection lost'));
      await expect(service.toolListLeads(wsId, {})).rejects.toThrow('DB connection lost');
    });

    it('toolGetDashboardSummary propagates aggregation error', async () => {
      prisma.contact.count.mockRejectedValue(new Error('timeout'));
      await expect(service.toolGetDashboardSummary(wsId, 'today')).rejects.toThrow('timeout');
    });
  });
});
