import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { SalesService } from './sales.service';

// -------------------------------------------------------------------------
// PI-K37 — Tier-5 capability methods
// Split from sales.service.spec.ts to keep specs under 600 LOC cap.
// -------------------------------------------------------------------------

describe('SalesService (PI-K37 tier-5 capabilities)', () => {
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

  describe('createPixOrder (V2 — tier-5, via SmartPaymentService)', () => {
    const pid = 'prod-1';
    const plid = 'plan-1';
    const product = { id: pid, name: 'Produto X', active: true, workspaceId: ws };
    const plan = { id: plid, name: 'Plano Pro', price: 99.9 };
    const dto = {
      productId: pid,
      planId: plid,
      buyer: {
        name: 'João',
        email: 'joao@test.com',
        phone: '+5511999999999',
        cpf: '123.456.789-00',
      },
    };
    let smartPayment: { createSmartPayment: jest.Mock };

    beforeEach(() => {
      smartPayment = { createSmartPayment: jest.fn() };
      (service as unknown as { smartPayment: typeof smartPayment }).smartPayment = smartPayment;
    });

    it('creates PIX order via SmartPaymentService returning orderId + QR data', async () => {
      prisma.product = { findFirst: jest.fn().mockResolvedValue(product) };
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      prisma.kloelSale.create.mockResolvedValue({});
      smartPayment.createSmartPayment.mockResolvedValue({
        pixCopyPaste: 'PIX_TEST_CP',
        pixQrCode: 'data:image/png;base64,PIX_TEST_QR',
        paymentUrl: 'https://pay.test',
        billingType: 'PIX',
        suggestedMessage: 'Pague com PIX',
      });

      const r = await service.createPixOrder(ws, dto);

      expect(r.orderId).toBeDefined();
      expect(typeof r.orderId).toBe('string');
      expect(r.pixCopyPaste).toBe('PIX_TEST_CP');
      expect(r.pixQrCode).toBe('data:image/png;base64,PIX_TEST_QR');
      expect(r.amountCents).toBe(9990n);
      expect(r.expiresAt).toBeInstanceOf(Date);
    });

    it('falls back to stub when SmartPaymentService is absent', async () => {
      (service as unknown as { smartPayment: undefined }).smartPayment = undefined;
      prisma.product = { findFirst: jest.fn().mockResolvedValue(product) };
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      prisma.kloelSale.create.mockResolvedValue({});

      const r = await service.createPixOrder(ws, dto);

      expect(r.pixCopyPaste).toContain('BR.GOV.BCB.PIX');
      expect(r.pixQrCode).toContain('stub_qr_');
      expect(r.amountCents).toBe(9990n);
    });

    it('falls back to stub when SmartPaymentService throws', async () => {
      prisma.product = { findFirst: jest.fn().mockResolvedValue(product) };
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      prisma.kloelSale.create.mockResolvedValue({});
      smartPayment.createSmartPayment.mockRejectedValue(new Error('down'));

      const r = await service.createPixOrder(ws, dto);

      expect(r.pixCopyPaste).toContain('BR.GOV.BCB.PIX');
      expect(r.amountCents).toBe(9990n);
    });

    it('throws NotFoundException when product is missing', async () => {
      prisma.product = { findFirst: jest.fn().mockResolvedValue(null) };
      await expect(service.createPixOrder(ws, dto)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for cross-workspace product', async () => {
      prisma.product = { findFirst: jest.fn().mockResolvedValue(null) };
      await expect(service.createPixOrder('ws-other', dto)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when specified plan is missing', async () => {
      prisma.product = { findFirst: jest.fn().mockResolvedValue(product) };
      prisma.productPlan.findFirst.mockResolvedValue(null);
      await expect(service.createPixOrder(ws, dto)).rejects.toThrow(NotFoundException);
    });

    it('falls back to cheapest active plan when planId is omitted', async () => {
      const dtoNoPlan = { productId: pid, buyer: dto.buyer };
      prisma.product = { findFirst: jest.fn().mockResolvedValue(product) };
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      prisma.kloelSale.create.mockResolvedValue({});
      smartPayment.createSmartPayment.mockResolvedValue({
        pixCopyPaste: 'CP',
        pixQrCode: 'QR',
        paymentUrl: 'url',
        billingType: 'PIX',
        suggestedMessage: 'msg',
      });

      const r = await service.createPixOrder(ws, dtoNoPlan);
      expect(r.amountCents).toBe(9990n);
      expect(prisma.productPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { price: 'asc' } }) as never,
      );
    });

    it('throws ServiceUnavailableException when plan price is zero', async () => {
      prisma.product = { findFirst: jest.fn().mockResolvedValue(product) };
      prisma.productPlan.findFirst.mockResolvedValue({ ...plan, price: 0 });
      await expect(service.createPixOrder(ws, dto)).rejects.toThrow(ServiceUnavailableException);
    });

    it('stores buyer CPF sanitized in sale metadata', async () => {
      prisma.product = { findFirst: jest.fn().mockResolvedValue(product) };
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      prisma.kloelSale.create.mockResolvedValue({});
      smartPayment.createSmartPayment.mockResolvedValue({
        pixCopyPaste: 'CP',
        pixQrCode: 'QR',
        paymentUrl: 'url',
        billingType: 'PIX',
        suggestedMessage: 'msg',
      });

      await service.createPixOrder(ws, { ...dto, buyer: { ...dto.buyer, cpf: '123.456.789-00' } });

      const createCallCalls = prisma.kloelSale.create.mock.calls as Array<
        [{ data?: { metadata?: Record<string, unknown> } }]
      >;
      const createCall = createCallCalls[0]?.[0];
      expect(createCall?.data?.metadata).toHaveProperty('buyerCpf', '12345678900');
    });

    it('omits buyerCpf from metadata when CPF is not provided', async () => {
      prisma.product = { findFirst: jest.fn().mockResolvedValue(product) };
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      prisma.kloelSale.create.mockResolvedValue({});
      smartPayment.createSmartPayment.mockResolvedValue({
        pixCopyPaste: 'CP',
        pixQrCode: 'QR',
        paymentUrl: 'url',
        billingType: 'PIX',
        suggestedMessage: 'msg',
      });

      const dtoNoCpf = { ...dto, buyer: { name: 'João', email: 'joao@test.com' } };
      await service.createPixOrder(ws, dtoNoCpf);

      const createCallCalls = prisma.kloelSale.create.mock.calls as Array<
        [{ data?: { metadata?: Record<string, unknown> } }]
      >;
      const createCall = createCallCalls[0]?.[0];
      expect(createCall?.data?.metadata).not.toHaveProperty('buyerCpf');
    });

    it('scopes sale to workspaceId', async () => {
      prisma.product = { findFirst: jest.fn().mockResolvedValue(product) };
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      prisma.kloelSale.create.mockResolvedValue({});
      smartPayment.createSmartPayment.mockResolvedValue({
        pixCopyPaste: 'CP',
        pixQrCode: 'QR',
        paymentUrl: 'url',
        billingType: 'PIX',
        suggestedMessage: 'msg',
      });

      await service.createPixOrder(ws, dto);

      const createCallCalls = prisma.kloelSale.create.mock.calls as Array<
        [{ data?: { workspaceId?: string } }]
      >;
      const createCall = createCallCalls[0]?.[0];
      expect(createCall?.data?.workspaceId).toBe(ws);
    });
  });

  describe('fillBuyerData', () => {
    const orderId = 'order-1';

    it('updates buyer data and returns { updated: true }', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue({
        id: orderId,
        metadata: { productId: 'p1' },
      });
      prisma.kloelSale.update.mockResolvedValue({});

      const r = await service.fillBuyerData(ws, orderId, {
        name: 'Maria',
        email: 'maria@test.com',
        cpf: '111.222.333-44',
      });

      expect(r).toEqual({ updated: true });
      const updCalls = prisma.kloelSale.update.mock.calls as Array<
        [
          {
            where: { id: string };
            data: { metadata: Record<string, unknown> };
          },
        ]
      >;
      expect(updCalls[0]?.[0]?.where).toEqual({ id: orderId });
      expect(updCalls[0]?.[0]?.data?.metadata).toMatchObject({
        buyerName: 'Maria',
        buyerCpf: '11122233344',
      });
    });

    it('throws NotFoundException for missing order', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue(null);
      await expect(service.fillBuyerData(ws, 'nx', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for cross-workspace order', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue(null);
      await expect(service.fillBuyerData('ws-other', orderId, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns { updated: true } immediately when no fields are provided', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue({ id: orderId, metadata: {} });
      const r = await service.fillBuyerData(ws, orderId, {});
      expect(r).toEqual({ updated: true });
      expect(prisma.kloelSale.update).not.toHaveBeenCalled();
    });

    it('sanitizes CPF digits', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue({
        id: orderId,
        metadata: {},
      });
      prisma.kloelSale.update.mockResolvedValue({});

      await service.fillBuyerData(ws, orderId, { cpf: '123.456.789-00' });

      const updCalls2 = prisma.kloelSale.update.mock.calls as Array<
        [
          {
            data: { metadata: Record<string, unknown> };
          },
        ]
      >;
      expect(updCalls2[0]?.[0]?.data?.metadata).toMatchObject({ buyerCpf: '12345678900' });
    });

    it('sets leadPhone when phone is provided', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue({
        id: orderId,
        metadata: {},
      });
      prisma.kloelSale.update.mockResolvedValue({});

      await service.fillBuyerData(ws, orderId, { phone: '+5511988888888' });

      const updCalls3 = prisma.kloelSale.update.mock.calls as Array<
        [
          {
            data: { leadPhone?: string };
          },
        ]
      >;
      expect(updCalls3[0]?.[0]?.data?.leadPhone).toBe('+5511988888888');
    });
  });

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
