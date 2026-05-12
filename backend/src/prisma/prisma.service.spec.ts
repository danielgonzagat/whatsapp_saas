import { Test, TestingModule } from '@nestjs/testing';
import {
  createAffiliateCommissionFromPaidCheckoutUpdate,
  creditWalletFromPaidCheckoutUpdate,
  enqueuePurchaseWhatsappFromPaidCheckoutUpdate,
  markCheckoutSocialLeadConvertedFromPaidUpdate,
  sendFacebookCapiPurchaseFromPaidUpdate,
} from './checkout-paid-effects';
import { PrismaService } from './prisma.service';

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  const makeTransactionClient = () => ({
    $executeRaw: jest.fn(),
    auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    checkoutOrder: {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    checkoutPayment: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    memberArea: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    memberEnrollment: {
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _avg: { progress: null } }),
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
  });
  return {
    ...actual,
    PrismaClient: class MockPrismaClient {
      $connect = jest.fn();
      $disconnect = jest.fn();
      $transaction = jest.fn().mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(makeTransactionClient());
        }
        return [];
      });
      checkoutOrder = {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      checkoutPayment = {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      auditLog = { findFirst: jest.fn(), create: jest.fn() };
    },
  };
});

jest.mock('./checkout-paid-effects', () => ({
  createAffiliateCommissionFromPaidCheckoutUpdate: jest.fn().mockResolvedValue(undefined),
  creditWalletFromPaidCheckoutUpdate: jest.fn().mockResolvedValue(undefined),
  enqueuePurchaseWhatsappFromPaidCheckoutUpdate: jest.fn().mockResolvedValue(undefined),
  markCheckoutSocialLeadConvertedFromPaidUpdate: jest.fn().mockResolvedValue(undefined),
  sendFacebookCapiPurchaseFromPaidUpdate: jest.fn().mockResolvedValue(undefined),
  sendPurchaseConfirmationEmailFromPaidCheckoutUpdate: jest.fn().mockResolvedValue(undefined),
}));

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  describe('onModuleInit', () => {
    it('calls $connect when initializing the module', async () => {
      await service.onModuleInit();

      expect(service.$connect).toHaveBeenCalled();
    });

    it('survives $connect failure without throwing', async () => {
      (service.$connect as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('connects successfully on second attempt after first failure', async () => {
      (service.$connect as jest.Mock)
        .mockRejectedValueOnce(new Error('First attempt'))
        .mockResolvedValueOnce(undefined);

      await service.onModuleInit();
      await service.onModuleInit();

      expect(service.$connect).toHaveBeenCalledTimes(2);
    });
  });

  describe('onModuleDestroy', () => {
    it('calls $disconnect when destroying the module', async () => {
      await service.onModuleDestroy();

      expect(service.$disconnect).toHaveBeenCalled();
    });
  });

  describe('beforeApplicationShutdown', () => {
    it('calls $disconnect and handles shutdown signal', async () => {
      await service.beforeApplicationShutdown('SIGTERM');

      expect(service.$disconnect).toHaveBeenCalled();
    });

    it('survives $disconnect failure during shutdown', async () => {
      (service.$disconnect as jest.Mock).mockRejectedValueOnce(new Error('Already closed'));

      await expect(service.beforeApplicationShutdown('SIGINT')).resolves.toBeUndefined();
    });

    it('handles shutdown with undefined signal as unknown', async () => {
      await service.beforeApplicationShutdown();

      expect(service.$disconnect).toHaveBeenCalled();
    });
  });

  describe('constructor hook', () => {
    it('installs checkout paid hooks overriding updateMany', () => {
      expect(service.checkoutOrder).toBeDefined();
      expect(service.checkoutPayment).toBeDefined();
      expect(typeof service.checkoutOrder.updateMany).toBe('function');
      expect(typeof service.checkoutPayment.updateMany).toBe('function');
    });

    it('overrides $transaction for interactive transaction interception', () => {
      expect(typeof service.$transaction).toBe('function');

      const descriptor = Object.getOwnPropertyDescriptor(service, '$transaction');
      expect(descriptor).toBeDefined();
    });

    it('runs post-payment checkout effects after a direct PAID checkout update', async () => {
      const paidUpdate = {
        where: { id: 'order-1', workspaceId: 'ws-1' },
        data: { status: 'PAID' as const },
      };

      await service.checkoutOrder.updateMany(paidUpdate);

      expect(markCheckoutSocialLeadConvertedFromPaidUpdate).toHaveBeenCalledWith(
        service,
        paidUpdate,
      );
      expect(sendFacebookCapiPurchaseFromPaidUpdate).toHaveBeenCalledWith(service, paidUpdate);
      expect(createAffiliateCommissionFromPaidCheckoutUpdate).toHaveBeenCalledWith(
        service,
        paidUpdate,
      );
      expect(creditWalletFromPaidCheckoutUpdate).toHaveBeenCalledWith(service, paidUpdate);
      expect(enqueuePurchaseWhatsappFromPaidCheckoutUpdate).toHaveBeenCalledWith(
        service,
        paidUpdate,
      );
    });

    it('runs post-payment checkout effects after a PAID checkout update committed inside a transaction', async () => {
      const paidUpdate = {
        where: { id: 'order-1', workspaceId: 'ws-1' },
        data: { status: 'PAID' as const },
      };

      await service.$transaction(async (tx) => {
        await tx.checkoutOrder.updateMany(paidUpdate);
      });

      expect(markCheckoutSocialLeadConvertedFromPaidUpdate).toHaveBeenCalledWith(
        service,
        paidUpdate,
      );
      expect(sendFacebookCapiPurchaseFromPaidUpdate).toHaveBeenCalledWith(service, paidUpdate);
      expect(createAffiliateCommissionFromPaidCheckoutUpdate).toHaveBeenCalledWith(
        service,
        paidUpdate,
      );
      expect(creditWalletFromPaidCheckoutUpdate).toHaveBeenCalledWith(service, paidUpdate);
      expect(enqueuePurchaseWhatsappFromPaidCheckoutUpdate).toHaveBeenCalledWith(
        service,
        paidUpdate,
      );
    });
  });
});
