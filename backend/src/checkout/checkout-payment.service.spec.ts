import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, NotFoundException } from '@nestjs/common';
import { CheckoutPaymentService } from './checkout-payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { AuditService } from '../audit/audit.service';
import { MercadoPagoService } from '../kloel/mercado-pago.service';

/**
 * P6-10 — focused spec for CheckoutPaymentService.processPayment.
 *
 * The service is the money path between the public checkout and Mercado
 * Pago. Wave 1 P0-2 fail-closed-state-machine and Wave 2 P6-1 wallet-
 * ownership both rely on the contract that this service:
 *
 *   1. Refuses to operate on a missing order (NotFoundException).
 *   2. Refuses CREDIT_CARD without a card token (HttpException 400).
 *   3. Wraps the order/payment/audit triple in a single $transaction
 *      with isolationLevel: 'ReadCommitted'.
 *   4. Routes the payment status through the state machine:
 *      APPROVED   → order transitions to PAID (only if validateTransition allows)
 *      PROCESSING → order transitions to PROCESSING
 *      CANCELED   → order transitions to CANCELED
 *      else       → order status untouched (PENDING stays PENDING)
 *   5. Calls financialAlert.paymentFailed and RETHROWS on Mercado Pago
 *      provider errors — no silent swallow.
 *
 * The Mercado Pago client is fully mocked. Real provider integration
 * lives in `mercado-pago-checkout-policy.util.spec.ts`.
 */

function makeOrder(overrides: any = {}) {
  return {
    id: 'order-1',
    orderNumber: 'KLOEL-001',
    workspaceId: 'ws-1',
    status: 'PENDING',
    totalInCents: 9900,
    metadata: { lineItems: [] },
    shippingAddress: null,
    shippingPrice: 0,
    ipAddress: null,
    plan: {
      id: 'plan-1',
      name: 'Plano Mensal',
      product: { id: 'prod-1', name: 'Produto X', description: 'desc', imageUrl: null, images: [] },
    },
    ...overrides,
  };
}

function makeMercadoPagoResult(status: 'approved' | 'in_process' | 'cancelled' | 'rejected') {
  return {
    order: { id: 'mp-order-1' },
    split: { netInCents: 9000, marketplaceFeeInCents: 900 },
    primaryPayment: {
      externalId: 'mp-pay-1',
      status,
      pixQrCode: null,
      pixCopyPaste: null,
      pixExpiresAt: null,
      boletoUrl: null,
      boletoBarcode: null,
      boletoExpiresAt: null,
      cardBrand: 'visa',
    },
  };
}

describe('CheckoutPaymentService.processPayment (P6-10)', () => {
  let service: CheckoutPaymentService;
  let prisma: any;
  let mercadoPago: any;
  let financialAlert: any;
  let auditService: any;

  beforeEach(async () => {
    prisma = {
      checkoutOrder: {
        findUnique: jest.fn().mockResolvedValue(makeOrder()),
      },
      checkoutPayment: { create: jest.fn() },
      $transaction: jest.fn(),
    };

    mercadoPago = {
      createMarketplaceOrder: jest.fn(),
      extractPrimaryOrderPayment: jest.fn(),
    };
    financialAlert = { paymentFailed: jest.fn() };
    auditService = { logWithTx: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutPaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: MercadoPagoService, useValue: mercadoPago },
        { provide: FinancialAlertService, useValue: financialAlert },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = moduleRef.get(CheckoutPaymentService);
  });

  it('throws NotFoundException when the order does not exist', async () => {
    prisma.checkoutOrder.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.processPayment({
        orderId: 'missing',
        workspaceId: 'ws-1',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        paymentMethod: 'PIX',
        totalInCents: 9900,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws HttpException when CREDIT_CARD payment is missing cardToken (validation)', async () => {
    await expect(
      service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 9900,
        // cardToken intentionally missing
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('throws HttpException when CREDIT_CARD payment is missing cardPaymentMethodId', async () => {
    await expect(
      service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 9900,
        cardToken: 'tok-1',
        // cardPaymentMethodId intentionally missing
      }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  describe('APPROVED status', () => {
    it('runs payment + order PAID + audit log inside ONE $transaction at ReadCommitted', async () => {
      const mp = makeMercadoPagoResult('approved');
      mercadoPago.createMarketplaceOrder.mockResolvedValue(mp);
      mercadoPago.extractPrimaryOrderPayment.mockReturnValue(mp.primaryPayment);

      const txCalls: string[] = [];
      const tx = {
        checkoutPayment: {
          create: jest.fn(async () => {
            txCalls.push('payment.create');
            return { id: 'pay-1' };
          }),
        },
        checkoutOrder: {
          findUnique: jest.fn(async () => {
            txCalls.push('order.findUnique');
            return { status: 'PENDING' };
          }),
          update: jest.fn(async (args: any) => {
            txCalls.push(`order.update:${args.data.status}`);
            return { id: args.where.id, ...args.data };
          }),
        },
      };
      auditService.logWithTx.mockImplementation(async () => {
        txCalls.push('audit.logWithTx');
      });
      let isolationLevel: string | undefined;
      prisma.$transaction.mockImplementation(async (cb: any, opts: any) => {
        isolationLevel = opts?.isolationLevel;
        return cb(tx);
      });

      const result = await service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        paymentMethod: 'PIX',
        totalInCents: 9900,
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(isolationLevel).toBe('ReadCommitted');
      expect(txCalls).toContain('payment.create');
      expect(txCalls).toContain('order.update:PAID');
      expect(txCalls).toContain('audit.logWithTx');
      expect(result.approved).toBe(true);
    });

    it('does NOT update the order when state machine rejects the transition (fail-closed)', async () => {
      const mp = makeMercadoPagoResult('approved');
      mercadoPago.createMarketplaceOrder.mockResolvedValue(mp);
      mercadoPago.extractPrimaryOrderPayment.mockReturnValue(mp.primaryPayment);

      const tx = {
        checkoutPayment: { create: jest.fn().mockResolvedValue({ id: 'pay-2' }) },
        checkoutOrder: {
          // Order is already in REFUNDED, a terminal state. The Wave 1 P0-2
          // state machine forbids any further transition; the service must
          // create the payment record but NOT touch the order status.
          findUnique: jest.fn().mockResolvedValue({ status: 'REFUNDED' }),
          update: jest.fn(),
        },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        paymentMethod: 'PIX',
        totalInCents: 9900,
      });

      expect(tx.checkoutPayment.create).toHaveBeenCalled();
      expect(tx.checkoutOrder.update).not.toHaveBeenCalled();
    });
  });

  describe('non-APPROVED statuses', () => {
    it('PROCESSING transitions order to PROCESSING', async () => {
      const mp = makeMercadoPagoResult('in_process');
      mercadoPago.createMarketplaceOrder.mockResolvedValue(mp);
      mercadoPago.extractPrimaryOrderPayment.mockReturnValue(mp.primaryPayment);

      const tx = {
        checkoutPayment: { create: jest.fn().mockResolvedValue({ id: 'pay-3' }) },
        checkoutOrder: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const result = await service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 9900,
        cardToken: 'tok-x',
        cardPaymentMethodId: 'visa',
      });

      expect(tx.checkoutOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PROCESSING' } }),
      );
      expect(result.approved).toBe(false);
    });

    it('CANCELED transitions order to CANCELED with canceledAt timestamp', async () => {
      const mp = makeMercadoPagoResult('cancelled');
      mercadoPago.createMarketplaceOrder.mockResolvedValue(mp);
      mercadoPago.extractPrimaryOrderPayment.mockReturnValue(mp.primaryPayment);

      const tx = {
        checkoutPayment: { create: jest.fn().mockResolvedValue({ id: 'pay-4' }) },
        checkoutOrder: { findUnique: jest.fn(), update: jest.fn() },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        paymentMethod: 'PIX',
        totalInCents: 9900,
      });

      const updateCall = tx.checkoutOrder.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('CANCELED');
      expect(updateCall.data.canceledAt).toBeInstanceOf(Date);
    });

    it('PENDING (rejected) does NOT touch the order status — payment alone is recorded', async () => {
      const mp = makeMercadoPagoResult('rejected');
      mercadoPago.createMarketplaceOrder.mockResolvedValue(mp);
      mercadoPago.extractPrimaryOrderPayment.mockReturnValue(mp.primaryPayment);

      const tx = {
        checkoutPayment: { create: jest.fn().mockResolvedValue({ id: 'pay-5' }) },
        checkoutOrder: { findUnique: jest.fn(), update: jest.fn() },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const result = await service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        paymentMethod: 'PIX',
        totalInCents: 9900,
      });

      expect(tx.checkoutPayment.create).toHaveBeenCalled();
      // Rejected → maps to DECLINED, which is neither APPROVED nor PROCESSING
      // nor CANCELED, so no order update happens.
      expect(tx.checkoutOrder.update).not.toHaveBeenCalled();
      expect(result.approved).toBe(false);
    });
  });

  describe('error path', () => {
    it('rethrows Mercado Pago errors AND fires financialAlert.paymentFailed (no silent swallow)', async () => {
      const mpError = new Error('payment provider down');
      mercadoPago.createMarketplaceOrder.mockRejectedValue(mpError);

      await expect(
        service.processPayment({
          orderId: 'order-1',
          workspaceId: 'ws-1',
          customerName: 'Test',
          customerEmail: 'test@example.com',
          paymentMethod: 'PIX',
          totalInCents: 9900,
        }),
      ).rejects.toThrow('payment provider down');

      expect(financialAlert.paymentFailed).toHaveBeenCalledTimes(1);
      const alertCall = financialAlert.paymentFailed.mock.calls[0];
      expect(alertCall[0]).toBe(mpError);
      expect(alertCall[1]).toMatchObject({
        workspaceId: 'ws-1',
        orderId: 'order-1',
        gateway: 'mercadopago',
      });
    });
  });
});
