import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminReportsService } from './admin-reports.service';
import { AdminDashboardService } from '../dashboard/admin-dashboard.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { listAdminTransactions } from '../transactions/queries/list-transactions.query';
import { createPartialPrismaMock } from '../../../test/helpers/prisma.mock';

jest.mock('../transactions/queries/list-transactions.query', () => ({
  listAdminTransactions: jest.fn(),
}));

describe('AdminReportsService', () => {
  let service: AdminReportsService;

  const actorId = 'admin_1';

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
      averageTicket: { value: 10000, previous: null, deltaPct: null },
      activeProducers: { value: 5, windowDays: 30 },
      newProducers: { value: 1, previous: null, deltaPct: null },
      totalProducers: { value: 20 },
      mrrProjected: { value: 50000, previous: null, deltaPct: null },
      churnRate: { value: 0.05, previous: null, deltaPct: null },
      conversations: { value: 100, previous: null, deltaPct: null },
      responseTimeMinutes: { value: 2, previous: null, deltaPct: null },
    },
  });

  const mockAuditAppend = jest.fn<Promise<void>, unknown[]>();
  const mockDashboardGetHome = jest.fn<Promise<unknown>, unknown[]>();

  const prismaMock = createPartialPrismaMock({
    adminAuditLog: ['findMany'],
  }) as unknown as { adminAuditLog: { findMany: jest.Mock } };
  const mockAuditLogFindMany = prismaMock.adminAuditLog.findMany;

  const dashboardMock = {
    getHome: mockDashboardGetHome,
  };

  const auditMock = {
    append: mockAuditAppend,
  };

  const mockListAdminTransactions = listAdminTransactions as jest.MockedFunction<
    typeof listAdminTransactions
  >;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDashboardGetHome.mockResolvedValue(makeDashboardSnapshot());
    mockAuditLogFindMany.mockResolvedValue([]);
    mockAuditAppend.mockResolvedValue(undefined);
    mockListAdminTransactions.mockResolvedValue({
      items: [makeTransactionRow()],
      total: 1,
      sum: { totalInCents: 50000 },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminReportsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminDashboardService, useValue: dashboardMock },
        { provide: AdminAuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get(AdminReportsService);
  });

  describe('overview', () => {
    it('returns snapshot from dashboard and export history', async () => {
      const result = await service.overview('30D');

      expect(mockDashboardGetHome).toHaveBeenCalledWith('30D', 'NONE', undefined, undefined);
      expect(result.snapshot).toBeDefined();
      expect(result.snapshot.kpis.gmv.value).toBe(100000);
      expect(result.exportHistory).toEqual([]);
    });

    it('handles export history with null adminUser name', async () => {
      mockAuditLogFindMany.mockResolvedValue([
        {
          id: 'log_1',
          action: 'admin.reports.export.csv',
          createdAt: new Date('2026-05-10'),
          adminUser: null,
          details: { period: '30D' },
        },
      ]);

      const result = await service.overview('30D');

      expect(result.exportHistory).toHaveLength(1);
      expect(result.exportHistory[0].actorName).toBeNull();
    });
  });

  describe('exportCsvRows', () => {
    it('returns mapped CSV rows', async () => {
      const rows = await service.exportCsvRows('30D', actorId);

      expect(rows).toHaveLength(1);
      expect(rows[0].orderNumber).toBe('KLOEL-001');
      expect(rows[0].totalBRL).toBe('500.00');
    });

    it('writes audit on export', async () => {
      await service.exportCsvRows('30D', actorId);

      expect(mockAuditAppend).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: actorId,
          action: 'admin.reports.export.csv',
          entityType: 'Report',
          entityId: 'sales-overview',
        }),
      );
    });

    it('handles empty transactions', async () => {
      mockListAdminTransactions.mockResolvedValue({
        items: [],
        total: 0,
        sum: { totalInCents: 0 },
      });

      const rows = await service.exportCsvRows('30D', actorId);

      expect(rows).toHaveLength(0);
    });
  });
});
