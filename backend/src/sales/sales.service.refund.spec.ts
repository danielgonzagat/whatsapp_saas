import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { SalesService } from './sales.service';

// -------------------------------------------------------------------------
// Claude-K53 — refund() tier-5 capability
// Split from sales.service.pix-refund.spec.ts to keep specs under 400 LOC cap.
// -------------------------------------------------------------------------

describe('SalesService (PI-K37 tier-5 capabilities) — refund', () => {
  let service: SalesService;
  let prisma: {
    product: { findFirst: jest.Mock };
    productPlan: { findFirst: jest.Mock };
    kloelSale: { create: jest.Mock; update: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mpBoleto: { create: jest.Mock };
  let mpPix: { create: jest.Mock };
  let stripe: { stripe: { checkout: { sessions: { create: jest.Mock } } } };
  let audit: { logWithTx: jest.Mock; log: jest.Mock };
  let spine: { emit: jest.Mock };

  const ws = 'ws-1';

  beforeEach(async () => {
    prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(null) },
      productPlan: { findFirst: jest.fn().mockResolvedValue(null) },
      kloelSale: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    };
    mpBoleto = { create: jest.fn() };
    mpPix = { create: jest.fn() };
    stripe = { stripe: { checkout: { sessions: { create: jest.fn() } } } };
    audit = { logWithTx: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
    spine = { emit: jest.fn().mockResolvedValue(undefined) };
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: MercadoPagoBoletoChargeService, useValue: mpBoleto },
        { provide: MercadoPagoPixChargeService, useValue: mpPix },
        { provide: StripeService, useValue: stripe },
        { provide: AuditService, useValue: audit },
        { provide: SpineEmitterService, useValue: spine },
      ],
    }).compile();
    service = m.get(SalesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('refund', () => {
    const orderId = 'order-1';

    it('refunds order and returns refundId with pending status', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue({
        id: orderId,
        status: 'paid',
        amount: 99.9,
        externalPaymentId: 'ext-1',
      });
      prisma.kloelSale.update.mockResolvedValue({});

      const r = await service.refund(ws, orderId, { reason: 'customer request' });

      expect(r.refundId).toBe(`refund_${orderId}`);
      expect(r.status).toBe('pending');
      const updCalls4 = prisma.kloelSale.update.mock.calls as Array<
        [
          {
            where: { id: string };
            data: { status: string; metadata: Record<string, unknown> };
          },
        ]
      >;
      expect(updCalls4[0]?.[0]?.where).toEqual({ id: orderId });
      expect(updCalls4[0]?.[0]?.data?.status).toBe('refunded');
      expect(updCalls4[0]?.[0]?.data?.metadata).toMatchObject({
        refundId: `refund_${orderId}`,
        refundReason: 'customer request',
        originalStatus: 'paid',
      });
    });

    it('returns { status: "processed" } when already refunded (idempotent)', async () => {
      prisma.kloelSale.findFirst
        .mockResolvedValueOnce({
          id: orderId,
          status: 'refunded',
          amount: 99.9,
          externalPaymentId: 'ext-1',
        })
        .mockResolvedValueOnce({ metadata: { refundId: `refund_${orderId}` } });

      const r = await service.refund(ws, orderId, { reason: 'duplicate' });

      expect(r.refundId).toBe(`refund_${orderId}`);
      expect(r.status).toBe('processed');
      expect(prisma.kloelSale.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for missing order', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue(null);
      await expect(service.refund(ws, 'nx', { reason: 'test' })).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for cross-workspace order', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue(null);
      await expect(service.refund('ws-other', orderId, { reason: 'test' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('uses provided amountCents for partial refund', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue({
        id: orderId,
        status: 'paid',
        amount: 99.9,
        externalPaymentId: 'ext-1',
      });
      prisma.kloelSale.update.mockResolvedValue({});

      await service.refund(ws, orderId, { amountCents: 5000n, reason: 'partial' });

      const updCalls5 = prisma.kloelSale.update.mock.calls as Array<
        [
          {
            data: { metadata: Record<string, unknown> };
          },
        ]
      >;
      expect(updCalls5[0]?.[0]?.data?.metadata).toMatchObject({ refundAmountCents: '5000' });
    });

    it('defaults amountCents to full sale amount when not provided', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue({
        id: orderId,
        status: 'paid',
        amount: 49.9,
        externalPaymentId: 'ext-1',
      });
      prisma.kloelSale.update.mockResolvedValue({});

      await service.refund(ws, orderId, { reason: 'full' });

      const updCalls6 = prisma.kloelSale.update.mock.calls as Array<
        [
          {
            data: { metadata: Record<string, unknown> };
          },
        ]
      >;
      expect(updCalls6[0]?.[0]?.data?.metadata).toMatchObject({ refundAmountCents: '4990' });
    });
  });
});
