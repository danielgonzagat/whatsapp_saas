import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminDashboardService } from '../dashboard/admin-dashboard.service';
import { AdminMarketingService } from './admin-marketing.service';

jest.mock('../dashboard/range.util', () => ({ resolveAdminHomeRange: jest.fn() }));

import { resolveAdminHomeRange } from '../dashboard/range.util';

const makeDashboardStub = () => ({
  kpis: {
    revenueKloel: { value: 5000, previous: 4000, deltaPct: 25 },
    approvedCount: { value: 10, previous: 8, deltaPct: 25 },
    gmv: { value: 100000, previous: 80000, deltaPct: 25 },
    declinedCount: { value: 2, previous: 1, deltaPct: 100 },
    pendingCount: { value: 3, previous: 2, deltaPct: 50 },
    approvalRate: { value: 0.83, previous: 0.8, deltaPct: 3.75 },
    refundCount: { value: 1, previous: 0, deltaPct: null },
    refundAmount: { value: 2000, previous: 0, deltaPct: null },
    chargebackCount: { value: 0, previous: 0, deltaPct: null },
    chargebackAmount: { value: 0, previous: 0, deltaPct: null },
    averageTicket: { value: 10000, previous: 10000, deltaPct: 0 },
    activeProducers: { value: 20, windowDays: 30 },
    newProducers: { value: 5, previous: 3, deltaPct: 66 },
    totalProducers: { value: 50 },
    revenueKloelRate: { value: 0.05, previous: 0.05, deltaPct: 0 },
    mrrProjected: { value: 50000, previous: 40000, deltaPct: 25 },
    churnRate: { value: 0.05, previous: 0.03, deltaPct: 66 },
    conversations: { value: 100, previous: 80, deltaPct: 25 },
    responseTimeMinutes: { value: 13, previous: 15, deltaPct: -13 },
  },
});

describe('AdminMarketingService', () => {
  let service: AdminMarketingService;

  const mockConversationFindMany = jest.fn();
  const mockQueryRaw = jest.fn();
  const mockSocialLeadCount = jest.fn();
  const mockOrderFindMany = jest.fn();
  const mockWorkspaceFindMany = jest.fn();

  const prismaMock = {
    conversation: {
      findMany: mockConversationFindMany,
    },
    $queryRaw: mockQueryRaw,
    checkoutSocialLead: {
      count: mockSocialLeadCount,
    },
    checkoutOrder: {
      findMany: mockOrderFindMany,
    },
    workspace: {
      findMany: mockWorkspaceFindMany,
    },
  };

  const dashboardMock = {
    getHome: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    (resolveAdminHomeRange as jest.Mock).mockReturnValue({
      period: '30D',
      compare: 'NONE',
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-05-10T23:59:59Z'),
      label: 'Últimos 30 dias',
      previous: null,
    });

    dashboardMock.getHome.mockResolvedValue(makeDashboardStub());

    mockConversationFindMany
      .mockResolvedValueOnce([
        {
          id: 'conv_1',
          channel: 'WHATSAPP',
          workspaceId: 'ws_1',
          lastMessageAt: new Date('2026-05-10T12:00:00Z'),
          workspace: { name: 'Loja A' },
          contact: { name: 'João', email: null, phone: null },
          messages: [{ content: 'Olá', createdAt: new Date() }],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'conv_1',
          lastMessageAt: new Date('2026-05-10T12:00:00Z'),
          workspace: { name: 'Loja A' },
          contact: { name: 'João', email: null, phone: null },
          messages: [{ content: 'Olá' }],
        },
      ]);

    mockQueryRaw.mockResolvedValue([{ channel: 'WHATSAPP', count: 5n }]);
    mockSocialLeadCount.mockResolvedValue(12);
    mockOrderFindMany.mockResolvedValue([
      {
        id: 'order_1',
        totalInCents: 5000,
        plan: {
          product: {
            id: 'prod_1',
            name: 'Produto A',
            imageUrl: null,
            workspaceId: 'ws_1',
          },
        },
      },
    ]);
    mockWorkspaceFindMany.mockResolvedValue([{ id: 'ws_1', name: 'Loja A' }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminMarketingService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminDashboardService, useValue: dashboardMock },
      ],
    }).compile();

    service = module.get(AdminMarketingService);
  });

  describe('overview', () => {
    it('returns marketing data with hero, channels, and rankings', async () => {
      const result = await service.overview('30D');

      expect(result.hero.revenueKloelInCents).toBe(5000);
      expect(result.hero.messages).toBe(5);
      expect(result.hero.leads).toBe(12);
      expect(result.hero.approvedOrders).toBe(10);
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].key).toBe('WHATSAPP');
      expect(result.channels[0].status).toBe('Conectado');
      expect(result.rankings).toHaveLength(3);
      expect(result.feed).toBeDefined();
    });

    it('returns empty channels when no conversations', async () => {
      mockConversationFindMany.mockReset();
      mockConversationFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockQueryRaw.mockResolvedValue([]);

      const result = await service.overview('30D');

      expect(result.channels).toHaveLength(0);
    });

    it('returns top products sorted by GMV', async () => {
      mockOrderFindMany.mockResolvedValue([
        {
          id: 'order_1',
          totalInCents: 3000,
          plan: {
            product: {
              id: 'prod_1',
              name: 'Produto A',
              imageUrl: null,
              workspaceId: 'ws_1',
            },
          },
        },
        {
          id: 'order_2',
          totalInCents: 7000,
          plan: {
            product: {
              id: 'prod_2',
              name: 'Produto B',
              imageUrl: null,
              workspaceId: 'ws_2',
            },
          },
        },
      ]);
      mockWorkspaceFindMany.mockResolvedValue([
        { id: 'ws_1', name: 'Loja A' },
        { id: 'ws_2', name: 'Loja B' },
      ]);

      const result = await service.overview('30D');

      expect(result.topProducts).toHaveLength(2);
      expect(result.topProducts[0].name).toBe('Produto B');
      expect(result.topProducts[0].gmvInCents).toBe(7000);
      expect(result.topProducts[1].name).toBe('Produto A');
    });

    it('identifies top workspace by conversations', async () => {
      mockConversationFindMany.mockReset();
      mockConversationFindMany
        .mockResolvedValueOnce([
          {
            id: 'conv_1',
            channel: 'WHATSAPP',
            workspaceId: 'ws_1',
            lastMessageAt: new Date(),
            workspace: { name: 'Loja A' },
            contact: { name: 'João', email: null, phone: null },
            messages: [{ content: 'Olá', createdAt: new Date() }],
          },
          {
            id: 'conv_2',
            channel: 'WHATSAPP',
            workspaceId: 'ws_1',
            lastMessageAt: new Date(),
            workspace: { name: 'Loja A' },
            contact: { name: 'Maria', email: null, phone: null },
            messages: [{ content: 'Oi', createdAt: new Date() }],
          },
          {
            id: 'conv_3',
            channel: 'INSTAGRAM',
            workspaceId: 'ws_2',
            lastMessageAt: new Date(),
            workspace: { name: 'Loja B' },
            contact: { name: 'Pedro', email: null, phone: null },
            messages: [{ content: 'Hey', createdAt: new Date() }],
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'conv_1',
            lastMessageAt: new Date(),
            workspace: { name: 'Loja A' },
            contact: { name: 'João', email: null, phone: null },
            messages: [{ content: 'Olá' }],
          },
        ]);
      mockWorkspaceFindMany.mockResolvedValue([
        { id: 'ws_1', name: 'Loja A' },
        { id: 'ws_2', name: 'Loja B' },
      ]);

      const result = await service.overview('30D');

      const topWorkspaceRanking = result.rankings.find(
        (r) => r.label === 'Top produtores por conversas',
      );
      expect(topWorkspaceRanking?.value).toBe(2);
      expect(topWorkspaceRanking?.detail).toBe('Loja A');
    });

    it('returns feed from recent conversations', async () => {
      const result = await service.overview('30D');

      expect(result.feed).toHaveLength(1);
      expect(result.feed[0].title).toBe('João');
      expect(result.feed[0].body).toBe('Olá');
    });

    it('passes period to dashboard.getHome', async () => {
      await service.overview('TODAY');

      expect(dashboardMock.getHome).toHaveBeenCalledWith('TODAY', 'NONE', undefined, undefined);
    });
  });
});
