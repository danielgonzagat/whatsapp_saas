import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrderAlertsService } from './order-alerts.service';
import { PrismaService } from '../prisma/prisma.service';

type OrderAlertRecord = {
  id: string;
  type: string;
  severity: string;
  orderId: string;
  resolved: boolean;
  resolvedAt: Date | null;
  createdAt: Date;
};

type OrderAlertsPrismaMock = {
  orderAlert: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    createMany: jest.Mock;
    updateMany: jest.Mock;
  };
  physicalOrder: { findMany: jest.Mock };
  checkoutPayment: { findMany: jest.Mock };
  kloelSale: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

describe('OrderAlertsService', () => {
  let service: OrderAlertsService;
  let prisma: OrderAlertsPrismaMock;

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      orderAlert: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      physicalOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      checkoutPayment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      kloelSale: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(prisma);
        }
        return Promise.resolve(undefined);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderAlertsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<OrderAlertsService>(OrderAlertsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAlerts', () => {
    it('returns zero when no anomalies exist', async () => {
      const result = await service.generateAlerts(wsId);

      expect(result.created).toBe(0);
      expect(prisma.orderAlert.createMany).not.toHaveBeenCalled();
    });

    it('generates MISSING_TRACKING alerts for physical orders without tracking after 48h', async () => {
      prisma.physicalOrder.findMany
        .mockResolvedValueOnce([
          {
            id: 'po-1',
            customerName: 'João',
            productName: 'Curso',
            createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.generateAlerts(wsId);

      expect(result.created).toBe(1);
      expect(prisma.orderAlert.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            workspaceId: wsId,
            type: 'MISSING_TRACKING',
            severity: 'WARNING',
            orderId: 'po-1',
          }),
        ]),
      });
    });

    it('generates CHARGEBACK alerts for payments with CHARGEBACK status', async () => {
      prisma.checkoutPayment.findMany.mockResolvedValue([
        {
          id: 'cp-1',
          orderId: 'o-1',
          order: {
            customerName: 'Maria',
            totalInCents: 19990,
            orderNumber: 42,
          },
        },
      ]);

      const result = await service.generateAlerts(wsId);

      expect(result.created).toBe(1);
      expect(prisma.orderAlert.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'CHARGEBACK',
            severity: 'CRITICAL',
            orderId: 'o-1',
          }),
        ]),
      });
    });

    it('generates REFUND_REQUEST alerts for sales with refund_requested status', async () => {
      prisma.kloelSale.findMany.mockResolvedValue([
        {
          id: 's-1',
          productName: 'Plano Pro',
          leadPhone: '5511999999999',
          amount: 99.9,
        },
      ]);

      const result = await service.generateAlerts(wsId);

      expect(result.created).toBe(1);
      expect(prisma.kloelSale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId, status: 'refund_requested' },
        }),
      );
    });

    it('generates POSSIBLE_LOSS alerts for shipped orders without delivery after 15 days', async () => {
      prisma.physicalOrder.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'po-2',
          customerName: 'Ana',
          trackingCode: 'BR123456',
          shippedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
          productName: 'Livro',
        },
      ]);

      const result = await service.generateAlerts(wsId);

      expect(result.created).toBe(1);
      expect(prisma.orderAlert.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'POSSIBLE_LOSS',
            severity: 'WARNING',
          }),
        ]),
      });
    });

    it('is idempotent — does not create duplicate alerts for same type+orderId', async () => {
      prisma.orderAlert.findMany.mockResolvedValue([{ type: 'MISSING_TRACKING', orderId: 'po-3' }]);
      prisma.physicalOrder.findMany
        .mockResolvedValueOnce([
          {
            id: 'po-3',
            customerName: 'Carlos',
            productName: 'Ebook',
            createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.generateAlerts(wsId);

      expect(result.created).toBe(0);
    });

    it('queries physical orders scoped to workspaceId', async () => {
      await service.generateAlerts(wsId);

      expect(prisma.physicalOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId }),
        }),
      );
    });
  });

  describe('getAlerts', () => {
    it('calls generateAlerts and returns alerts with counts', async () => {
      const alert: OrderAlertRecord = {
        id: 'a-1',
        type: 'CHARGEBACK',
        severity: 'CRITICAL',
        orderId: 'o-1',
        resolved: false,
        resolvedAt: null,
        createdAt: new Date(),
      };
      prisma.orderAlert.findMany.mockResolvedValue([alert]);

      const result = await service.getAlerts(wsId);

      expect(result.alerts).toHaveLength(1);
      expect(result.counts.total).toBe(1);
      expect(result.counts.critical).toBe(1);
      expect(result.counts.warning).toBe(0);
    });

    it('filters by resolved status when provided', async () => {
      await service.getAlerts(wsId, true);

      expect(prisma.orderAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId, resolved: true },
        }),
      );
    });
  });

  describe('resolveAlert', () => {
    it('marks alert as resolved within transaction', async () => {
      prisma.orderAlert.findFirst.mockResolvedValue({
        id: 'a-1',
        workspaceId: wsId,
        type: 'CHARGEBACK',
        severity: 'CRITICAL',
        orderId: 'o-1',
        resolved: false,
        resolvedAt: null,
        createdAt: new Date(),
      });

      const result = await service.resolveAlert('a-1', wsId);

      expect(result.success).toBe(true);
      expect(result.alert.resolved).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('throws NotFoundException when alert not found', async () => {
      prisma.orderAlert.findFirst.mockResolvedValue(null);

      await expect(service.resolveAlert('no-exist', wsId)).rejects.toThrow(NotFoundException);
    });

    it('scopes update to workspaceId', async () => {
      prisma.orderAlert.findFirst.mockResolvedValue({
        id: 'a-1',
        workspaceId: wsId,
        type: 'WARNING',
        severity: 'WARNING',
        orderId: 'o-1',
        resolved: false,
        resolvedAt: null,
        createdAt: new Date(),
      });

      await service.resolveAlert('a-1', wsId);

      expect(prisma.orderAlert.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a-1', workspaceId: wsId },
        }),
      );
    });
  });

  describe('tenant isolation', () => {
    it('generateAlerts scopes all queries to workspaceId', async () => {
      await service.generateAlerts('ws-tenant');

      expect(prisma.physicalOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-tenant' }),
        }),
      );
      expect(prisma.checkoutPayment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ order: { workspaceId: 'ws-tenant' } }),
        }),
      );
      expect(prisma.kloelSale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-tenant', status: 'refund_requested' },
        }),
      );
    });
  });

  describe('error handling', () => {
    it('generateAlerts propagates Prisma error', async () => {
      prisma.physicalOrder.findMany.mockRejectedValue(new Error('DB down'));

      await expect(service.generateAlerts(wsId)).rejects.toThrow('DB down');
    });
  });
});
