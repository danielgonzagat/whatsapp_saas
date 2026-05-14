import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminComplianceService } from './admin-compliance.service';
import { listAdminTransactions } from '../transactions/queries/list-transactions.query';
import { resolveAdminHomeRange } from '../dashboard/range.util';

jest.mock('../transactions/queries/list-transactions.query', () => ({
  listAdminTransactions: jest.fn(),
}));
jest.mock('../dashboard/range.util', () => ({
  resolveAdminHomeRange: jest.fn(),
}));

describe('AdminComplianceService', () => {
  let service: AdminComplianceService;

  const makeRange = () => ({
    period: '30D' as const,
    compare: 'NONE' as const,
    from: new Date('2026-04-11'),
    to: new Date('2026-05-11'),
    label: 'Últimos 30 dias',
    previous: null,
  });

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
    status: OrderStatus.CHARGEBACK,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    paymentStatus: null,
    gateway: 'stripe',
    cardBrand: 'visa',
    cardLast4: '4242',
    installments: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    paidAt: '2026-05-01T00:00:00.000Z',
    affiliateId: null,
    ...overrides,
  });

  const mockAuditLogFindMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockAgentFindMany = jest.fn<Promise<unknown>, unknown[]>();

  const prismaMock = {
    adminAuditLog: { findMany: mockAuditLogFindMany },
    agent: { findMany: mockAgentFindMany },
  };

  const mockListAdminTransactions = listAdminTransactions as jest.MockedFunction<
    typeof listAdminTransactions
  >;
  const mockResolveAdminHomeRange = resolveAdminHomeRange as jest.MockedFunction<
    typeof resolveAdminHomeRange
  >;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockResolveAdminHomeRange.mockReturnValue(makeRange());
    mockListAdminTransactions.mockResolvedValue({
      items: [],
      total: 0,
      sum: { totalInCents: 0 },
    });
    mockAuditLogFindMany.mockResolvedValue([]);
    mockAgentFindMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminComplianceService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(AdminComplianceService);
  });

  describe('overview', () => {
    it('returns compliance data with chargebacks, refunds, and KYC', async () => {
      mockListAdminTransactions
        .mockResolvedValueOnce({
          items: [
            makeTransactionRow({
              id: 'tx_1',
              status: OrderStatus.CHARGEBACK,
              totalInCents: 50000,
              gateway: 'stripe',
            }),
          ],
          total: 1,
          sum: { totalInCents: 50000 },
        })
        .mockResolvedValueOnce({
          items: [
            makeTransactionRow({
              id: 'tx_2',
              status: OrderStatus.REFUNDED,
              totalInCents: 30000,
            }),
          ],
          total: 1,
          sum: { totalInCents: 30000 },
        });
      mockAuditLogFindMany.mockResolvedValue([
        {
          id: 'log_1',
          action: 'admin.kyc.approved',
          entityId: 'agent_1',
          createdAt: new Date('2026-05-10'),
          adminUser: { name: 'Admin' },
          details: {},
        },
      ]);
      mockAgentFindMany.mockResolvedValue([
        {
          id: 'agent_1',
          name: 'Agent A',
          email: 'agent@test.com',
          kycStatus: 'pending',
          workspace: { id: 'ws_1', name: 'Workspace A' },
        },
      ]);

      const result = await service.overview('30D');

      expect(result.summary.chargebackCount).toBe(1);
      expect(result.summary.chargebackAmountInCents).toBe(50000);
      expect(result.summary.refundCount).toBe(1);
      expect(result.summary.refundAmountInCents).toBe(30000);
      expect(result.kycQueue).toHaveLength(1);
      expect(result.recentKycEvents).toHaveLength(1);
    });

    it('returns empty risk maps when no transactions', async () => {
      const result = await service.overview('30D');

      expect(result.riskByGateway).toHaveLength(0);
      expect(result.riskByWorkspace).toHaveLength(0);
    });

    it('sorts riskByGateway by count descending', async () => {
      mockListAdminTransactions
        .mockResolvedValueOnce({
          items: [
            makeTransactionRow({
              id: 'tx_1',
              status: OrderStatus.CHARGEBACK,
              gateway: 'stripe',
              totalInCents: 50000,
              workspaceId: 'ws_1',
            }),
            makeTransactionRow({
              id: 'tx_2',
              status: OrderStatus.CHARGEBACK,
              gateway: 'mercadopago',
              totalInCents: 30000,
              workspaceId: 'ws_2',
            }),
            makeTransactionRow({
              id: 'tx_3',
              status: OrderStatus.CHARGEBACK,
              gateway: 'stripe',
              totalInCents: 20000,
              workspaceId: 'ws_3',
            }),
          ],
          total: 3,
          sum: { totalInCents: 100000 },
        })
        .mockResolvedValueOnce({
          items: [],
          total: 0,
          sum: { totalInCents: 0 },
        });

      const result = await service.overview('30D');

      expect(result.riskByGateway).toHaveLength(2);
      expect(result.riskByGateway[0].gateway).toBe('stripe');
      expect(result.riskByGateway[0].count).toBe(2);
      expect(result.riskByGateway[1].gateway).toBe('mercadopago');
      expect(result.riskByGateway[1].count).toBe(1);
    });

    it('sorts riskByWorkspace by totalInCents descending', async () => {
      mockListAdminTransactions
        .mockResolvedValueOnce({
          items: [
            makeTransactionRow({
              id: 'tx_1',
              status: OrderStatus.CHARGEBACK,
              totalInCents: 30000,
              gateway: 'stripe',
              workspaceId: 'ws_1',
              workspaceName: 'Workspace B',
            }),
            makeTransactionRow({
              id: 'tx_2',
              status: OrderStatus.CHARGEBACK,
              totalInCents: 50000,
              gateway: 'stripe',
              workspaceId: 'ws_2',
              workspaceName: 'Workspace A',
            }),
          ],
          total: 2,
          sum: { totalInCents: 80000 },
        })
        .mockResolvedValueOnce({
          items: [],
          total: 0,
          sum: { totalInCents: 0 },
        });

      const result = await service.overview('30D');

      expect(result.riskByWorkspace).toHaveLength(2);
      expect(result.riskByWorkspace[0].workspaceName).toBe('Workspace A');
      expect(result.riskByWorkspace[0].totalInCents).toBe(50000);
    });

    it('returns mapped KYC queue and events', async () => {
      mockAgentFindMany.mockResolvedValue([
        {
          id: 'agent_1',
          name: 'Agent A',
          email: 'agent@test.com',
          kycStatus: 'pending',
          workspace: { id: 'ws_1', name: 'Workspace A' },
        },
      ]);
      mockAuditLogFindMany.mockResolvedValue([
        {
          id: 'log_1',
          action: 'admin.kyc.reviewed',
          entityId: 'agent_1',
          createdAt: new Date('2026-05-10'),
          adminUser: { name: null },
          details: { resolution: 'approved' },
        },
      ]);

      const result = await service.overview('30D');

      expect(result.kycQueue[0].agentId).toBe('agent_1');
      expect(result.kycQueue[0].kycStatus).toBe('pending');
      expect(result.recentKycEvents[0].action).toBe('admin.kyc.reviewed');
      expect(result.recentKycEvents[0].actorName).toBeNull();
    });

    it('passes period to range util', async () => {
      await service.overview('CUSTOM', new Date('2026-04-01'), new Date('2026-05-01'));

      expect(mockResolveAdminHomeRange).toHaveBeenCalledWith(
        expect.objectContaining({
          period: 'CUSTOM',
          compare: 'NONE',
        }),
      );
      const callArgs = mockResolveAdminHomeRange.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.from).toBeInstanceOf(Date);
      expect(callArgs.to).toBeInstanceOf(Date);
    });
  });
});
