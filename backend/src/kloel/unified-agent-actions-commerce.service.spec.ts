import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnifiedAgentActionsCommerceService } from './unified-agent-actions-commerce.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentService } from './payment.service';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import { OpsAlertService } from '../observability/ops-alert.service';

jest.mock('./money-format.util', () => ({
  formatBrlAmount: jest.fn((n: number) => `R$ ${n.toFixed(2)}`),
}));

type CommercePrismaMock = {
  kloelMemory: { findFirst: jest.Mock };
  product: { findFirst: jest.Mock };
  contact: { findFirst: jest.Mock };
  kloelSale: { findFirst: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

describe('UnifiedAgentActionsCommerceService', () => {
  let service: UnifiedAgentActionsCommerceService;
  let prisma: CommercePrismaMock;
  let config: Pick<ConfigService, 'get'>;
  let paymentService: Pick<PaymentService, 'createPayment'>;
  let auditService: Pick<AuditService, 'logWithTx'>;
  let messaging: Pick<UnifiedAgentActionsMessagingService, 'actionSendMessage'>;
  let opsAlert: Pick<OpsAlertService, 'alertOnCriticalError'>;

  const wsId = 'ws-1';
  const phone = '5511999999999';

  beforeEach(async () => {
    prisma = {
      kloelMemory: { findFirst: jest.fn().mockResolvedValue(null) },
      product: { findFirst: jest.fn().mockResolvedValue(null) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      kloelSale: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(prisma);
        }
        return Promise.resolve(undefined);
      }),
    };
    config = {
      get: jest.fn().mockReturnValue('https://kloel.com'),
    };
    paymentService = {
      createPayment: jest.fn().mockResolvedValue({
        id: 'pay_1',
        paymentLink: 'https://pay.test/link',
        pixCopyPaste: 'pix-copy-paste-key',
        invoiceUrl: 'https://pay.test/invoice',
      }),
    };
    auditService = {
      logWithTx: jest.fn().mockResolvedValue(undefined),
    };
    messaging = {
      actionSendMessage: jest.fn().mockResolvedValue({ success: true, sent: true }),
    };
    opsAlert = {
      alertOnCriticalError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedAgentActionsCommerceService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: PaymentService, useValue: paymentService },
        { provide: AuditService, useValue: auditService },
        {
          provide: UnifiedAgentActionsMessagingService,
          useValue: messaging,
        },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();

    service = module.get<UnifiedAgentActionsCommerceService>(UnifiedAgentActionsCommerceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('actionSendProductInfo', () => {
    it('sends product info from kloelMemory when found', async () => {
      prisma.kloelMemory.findFirst.mockResolvedValue({
        value: {
          name: 'Produto Mem',
          description: 'Desc mem',
          price: 49.9,
          paymentLink: 'https://link.test',
        },
      });

      const result = await service.actionSendProductInfo(wsId, phone, {
        productName: 'Produto Mem',
      });

      expect(result.success).toBe(true);
      expect(messaging.actionSendMessage).toHaveBeenCalledWith(
        wsId,
        phone,
        expect.objectContaining({ message: expect.stringContaining('Produto Mem') }),
        undefined,
      );
    });

    it('falls back to db product when kloelMemory is empty', async () => {
      prisma.product.findFirst.mockResolvedValue({
        name: 'DB Product',
        description: 'DB desc',
        price: 199.9,
        paymentLink: 'https://db.link',
      });

      const result = await service.actionSendProductInfo(wsId, phone, {
        productName: 'DB Product',
      });

      expect(result.success).toBe(true);
      expect(result.product.name).toBe('DB Product');
      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: wsId,
            name: expect.objectContaining({ contains: 'DB Product' }),
            active: true,
          },
        }),
      );
    });

    it('returns error when product not found anywhere', async () => {
      const result = await service.actionSendProductInfo(wsId, phone, {
        productName: 'No Exist',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Produto não encontrado');
    });

    it('excludes price when includePrice is false', async () => {
      prisma.product.findFirst.mockResolvedValue({
        name: 'Product',
        description: 'Desc',
        price: 99.9,
      });

      const result = await service.actionSendProductInfo(wsId, phone, {
        productName: 'Product',
        includePrice: false,
      });

      expect(result.success).toBe(true);
      expect(result.message).not.toContain('R$');
    });

    it('queries kloelMemory scoped to workspaceId', async () => {
      await service.actionSendProductInfo('ws-tenant', phone, {
        productName: 'X',
      });

      expect(prisma.kloelMemory.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-tenant' }) }),
      );
    });
  });

  describe('actionCreatePaymentLink', () => {
    it('creates payment and sends message to customer', async () => {
      const result = await service.actionCreatePaymentLink(wsId, phone, {
        amount: 99.9,
        productName: 'Curso',
        description: 'Pagamento curso',
      });

      expect(result.success).toBe(true);
      expect(result.paymentLink).toBe('https://pay.test/link');
      expect(paymentService.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: wsId,
          amount: 99.9,
          description: 'Pagamento curso',
        }),
      );
      expect(messaging.actionSendMessage).toHaveBeenCalled();
    });

    it('logs audit event in transaction after payment', async () => {
      await service.actionCreatePaymentLink(wsId, phone, {
        amount: 50,
        productName: 'Prod',
      });

      expect(auditService.logWithTx).toHaveBeenCalled();
    });

    it('uses fallback when paymentService throws', async () => {
      paymentService.createPayment = jest.fn().mockRejectedValue(new Error('payment failed'));

      const result = await service.actionCreatePaymentLink(wsId, phone, {
        amount: 50,
        productName: 'Prod',
      });

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.paymentLink).toContain('https://kloel.com/pay/');
    });

    it('uses contact name from db when available', async () => {
      prisma.contact.findFirst.mockResolvedValue({
        id: 'c-1',
        name: 'João Silva',
        email: 'joao@test.com',
      });

      await service.actionCreatePaymentLink(wsId, phone, {
        amount: 99,
        productName: 'Prod',
      });

      expect(paymentService.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          customerName: 'João Silva',
          customerPhone: phone,
          customerEmail: 'joao@test.com',
        }),
      );
    });

    it('creates fallback kloelSale when payment service fails', async () => {
      paymentService.createPayment = jest.fn().mockRejectedValue(new Error('down'));

      await service.actionCreatePaymentLink(wsId, phone, {
        amount: 75,
        productName: 'Fallback Prod',
      });

      expect(prisma.kloelSale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: wsId,
            leadPhone: phone,
            amount: 75,
          }),
        }),
      );
    });
  });

  describe('tenant isolation', () => {
    it('actionSendProductInfo scopes db queries to workspaceId', async () => {
      await service.actionSendProductInfo('ws-isolated', phone, {
        productName: 'Test',
      });

      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-isolated' }),
        }),
      );
      expect(prisma.kloelMemory.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-isolated' }),
        }),
      );
    });

    it('actionCreatePaymentLink scopes contact lookup to workspaceId', async () => {
      await service.actionCreatePaymentLink('ws-isolated', phone, {
        amount: 10,
        productName: 'X',
      });

      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-isolated', phone },
        }),
      );
    });
  });

  describe('error handling', () => {
    it('actionSendProductInfo handles messaging failure', async () => {
      prisma.product.findFirst.mockResolvedValue({
        name: 'P',
        description: null,
        price: 10,
      });
      messaging.actionSendMessage = jest
        .fn()
        .mockResolvedValue({ success: false, error: 'send failed' });

      const result = await service.actionSendProductInfo(wsId, phone, {
        productName: 'P',
      });

      expect(result.success).toBe(false);
    });

    it('actionCreatePaymentLink handles messaging failure gracefully', async () => {
      messaging.actionSendMessage = jest.fn().mockResolvedValue({ success: true });
      paymentService.createPayment = jest.fn().mockRejectedValue(new Error('down'));

      const result = await service.actionCreatePaymentLink(wsId, phone, {
        amount: 50,
        productName: 'Prod',
      });

      expect(result.fallback).toBe(true);
    });
  });
});
