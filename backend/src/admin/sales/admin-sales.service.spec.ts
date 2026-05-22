import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminSalesService } from './admin-sales.service';
import { AdminDashboardService } from '../dashboard/admin-dashboard.service';
import { listAdminTransactions } from '../transactions/queries/list-transactions.query';

jest.mock('../transactions/queries/list-transactions.query', () => ({
  listAdminTransactions: jest.fn(),
}));

describe('AdminSalesService', () => {
  let service: AdminSalesService;

  const makeTransactionRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'tx_1',
    orderNumber: 'KLOEL-001',
    workspaceId: 'ws_1',
    workspaceName: 'Workspace A',
    customerEmail: 'test@test.com',
    customerName: 'Test Customer',
    customerCPF: null,
    totalInCents: 50000,
    subtotalInCents: 45000,
    status: OrderStatus.PAID,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    paymentStatus: 'APPROVED',
    gateway: 'stripe',
    cardBrand: 'visa',
    cardLast4: '4242',
    installments: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    paidAt: '2026-05-01T00:00:00.000Z',
    affiliateId: null,
    ...overrides,
  });

  const makeDashboardSnapshot = () => ({
    kpis: {
      gmv: { value: 100000, previous: null, deltaPct: null },
      revenueKloel: { value: 10000, previous: null, deltaPct: null },
      approvedCount: { value: 10, previous: null, deltaPct: null },
      declinedCount: { value: 1, previous: null, deltaPct: null },
      pendingCount: { value: 2, previous: null, deltaPct: null },
      approvalRate: { value: 0.9, previous: null, deltaPct: null },
      refundCount: { value: 0, previous: null, deltaPct: null },
      refundAmount: { value: 0, previous: null, deltaPct: null },
      chargebackCount: { value: 0, previous: null, deltaPct: null },
      chargebackAmount: { value: 0, previous: null, deltaPct: null },
      averageTicket: { value: 50000, previous: null, deltaPct: null },
      activeProducers: { value: 5, windowDays: 30 },
      newProducers: { value: 1, previous: null, deltaPct: null },
      totalProducers: { value: 20 },
      mrrProjected: { value: 50000, previous: null, deltaPct: null },
      churnRate: { value: 0.05, previous: null, deltaPct: null },
      conversations: { value: 100, previous: null, deltaPct: null },
      responseTimeMinutes: { value: 2, previous: null, deltaPct: null },
    },
  });

  const mockDashboardGetHome = jest.fn<Promise<unknown>, unknown[]>();

  const dashboardMock = {
    getHome: mockDashboardGetHome,
  };

  const prismaMock = {};

  const mockListAdminTransactions = listAdminTransactions as jest.MockedFunction<
    typeof listAdminTransactions
  >;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDashboardGetHome.mockResolvedValue(makeDashboardSnapshot());
    mockListAdminTransactions.mockResolvedValue({
      items: [makeTransactionRow()],
      total: 1,
      sum: { totalInCents: 50000 },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSalesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminDashboardService, useValue: dashboardMock },
      ],
    }).compile();

    service = module.get(AdminSalesService);
  });

  describe('overview', () => {
    it('returns summary with transaction breakdown', async () => {
      mockListAdminTransactions.mockResolvedValue({
        items: [
          makeTransactionRow({ id: 'tx_1', status: OrderStatus.PAID }),
          makeTransactionRow({ id: 'tx_2', status: OrderStatus.PENDING }),
          makeTransactionRow({ id: 'tx_3', status: OrderStatus.REFUNDED }),
        ],
        total: 3,
        sum: { totalInCents: 150000 },
      });

      const result = await service.overview({});

      expect(result.summary.paidCount).toBe(1);
      expect(result.summary.pendingCount).toBe(1);
      expect(result.summary.refundedCount).toBe(1);
      expect(result.summary.transactionCount).toBe(3);
    });

    it('returns chart data grouped by day', async () => {
      const result = await service.overview({});

      expect(result.chart).toHaveLength(1);
      expect(result.chart[0].totalInCents).toBe(50000);
    });

    it('returns gateway options from items', async () => {
      mockListAdminTransactions.mockResolvedValue({
        items: [
          makeTransactionRow({ id: 'tx_1', gateway: 'stripe' }),
          makeTransactionRow({ id: 'tx_2', gateway: 'mercadopago' }),
        ],
        total: 2,
        sum: { totalInCents: 100000 },
      });

      const result = await service.overview({});

      expect(result.gatewayOptions).toEqual(['mercadopago', 'stripe']);
    });

    it('passes search filter to transaction query', async () => {
      await service.overview({ search: 'KLOEL' });

      const [query, filters] = mockListAdminTransactions.mock.calls.at(-1) ?? [];
      expect(query).toBeDefined();
      expect(filters).toEqual(expect.objectContaining({ search: 'KLOEL' }));
    });

    it('passes status/method/gateway filters', async () => {
      await service.overview({
        status: OrderStatus.PAID,
        method: PaymentMethod.CREDIT_CARD,
        gateway: 'stripe',
      });

      const [, filters] = mockListAdminTransactions.mock.calls.at(-1) ?? [];
      expect(filters).toEqual(
        expect.objectContaining({
          status: OrderStatus.PAID,
          method: PaymentMethod.CREDIT_CARD,
          gateway: 'stripe',
        }),
      );
    });
  });
});
