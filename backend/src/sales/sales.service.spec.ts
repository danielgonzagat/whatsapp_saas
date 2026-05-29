import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { SalesService } from './sales.service';

describe('SalesService', () => {
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
  const buyer = {
    name: 'João',
    email: 'joao@test.com',
    cpf: '123.456.789-00',
    phone: '+5511999999999',
  };

  function firstMockArg<T>(mock: jest.Mock, callIndex = 0): T {
    const call = mock.mock.calls[callIndex] as readonly unknown[] | undefined;
    return call?.[0] as T;
  }

  function objectContaining<T extends object>(sample: T): T {
    return expect.objectContaining(sample) as T;
  }

  function stringContaining(sample: string): string {
    return expect.stringContaining(sample) as string;
  }

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

  describe('createPixOrder', () => {
    const pid = 'prod-1';
    const plid = 'plan-1';
    const plan = {
      id: plid,
      productId: pid,
      name: 'Plano Pro',
      price: 99.9,
      active: true,
      product: { name: 'Produto X' },
    };
    const pixOk = {
      externalId: 'mp-ext',
      qrCode: 'qr',
      qrCodeBase64: 'b64',
      ticketUrl: 'url',
      status: 'pending',
    };
    const tx = () => ({
      kloelSale: {
        create: jest.fn().mockResolvedValue({
          id: 's1',
          workspaceId: ws,
          productName: 'X',
          amount: 99.9,
          status: 'pending',
          paymentMethod: 'PIX',
          leadPhone: buyer.phone,
          metadata: {},
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    const runTransaction =
      (transaction: ReturnType<typeof tx>) =>
      async (cb: (tx: ReturnType<typeof tx>) => unknown): Promise<unknown> =>
        cb(transaction);

    it('creates PIX order returning QR data', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(runTransaction(t));
      mpPix.create.mockResolvedValue(pixOk);
      const r = await service.createPixOrder(ws, pid, plid, buyer);
      expect(r.saleId).toBe('s1');
      expect(r.pixQrCode).toBe('qr');
      expect(r.pixCopyPaste).toBe('qr');
      expect(r.externalPaymentId).toBe('mp-ext');
      expect(r.pixExpiresAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when plan missing', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(null);
      await expect(service.createPixOrder(ws, pid, plid, buyer)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for cross-workspace', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(null);
      await expect(service.createPixOrder('ws-other', pid, plid, buyer)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ServiceUnavailableException when price ≤ 0', async () => {
      prisma.productPlan.findFirst.mockResolvedValue({ ...plan, price: 0 });
      await expect(service.createPixOrder(ws, pid, plid, buyer)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws ServiceUnavailableException when price negative', async () => {
      prisma.productPlan.findFirst.mockResolvedValue({ ...plan, price: -5 });
      await expect(service.createPixOrder(ws, pid, plid, buyer)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('scopes sale to workspace', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(runTransaction(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, buyer);
      expect(
        firstMockArg<{ data: { workspaceId: string } }>(t.kloelSale.create).data.workspaceId,
      ).toBe(ws);
    });

    it('strips CPF formatting', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(runTransaction(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, { ...buyer, cpf: '123.456.789-00' });
      expect(mpPix.create).toHaveBeenCalledWith(
        expect.objectContaining({ payerDocument: '12345678900' }) as never,
      );
    });

    it('omits payerDocument when CPF empty', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(runTransaction(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, { ...buyer, cpf: '' });
      expect(firstMockArg<Record<string, unknown>>(mpPix.create)).not.toHaveProperty(
        'payerDocument',
      );
    });

    it('audit-logs sale + payment pending', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(runTransaction(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, buyer);
      expect(audit.logWithTx).toHaveBeenCalledTimes(2);
      expect(audit.logWithTx).toHaveBeenNthCalledWith(
        1,
        t,
        expect.objectContaining({ action: 'SALE_CREATED' }) as never,
      );
      expect(audit.logWithTx).toHaveBeenNthCalledWith(
        2,
        t,
        expect.objectContaining({ action: 'PAYMENT_PENDING' }) as never,
      );
    });

    it('emits sale.created + payment.pending spine events', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(runTransaction(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, buyer);
      expect(spine.emit).toHaveBeenCalledTimes(2);
      expect(spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'sale.created' }) as never,
      );
      expect(spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'payment.pending' }) as never,
      );
    });

    it('survives spine failure', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(runTransaction(t));
      mpPix.create.mockResolvedValue(pixOk);
      spine.emit.mockRejectedValue(new Error('down'));
      const r = await service.createPixOrder(ws, pid, plid, buyer);
      expect(r.saleId).toBe('s1');
    });

    it('persists external payment id', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(runTransaction(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, buyer);
      expect(t.kloelSale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ externalPaymentId: 'mp-ext' }) as unknown,
        }) as never,
      );
    });
  });

  describe('createBoletoOrder', () => {
    const pid = 'prod-1';
    const plid = 'plan-1';
    const plan = {
      id: plid,
      productId: pid,
      name: 'Plano Pro',
      price: 99.9,
      active: true,
      product: { name: 'Produto X' },
    };
    const boletoOk = {
      externalId: 'mp-boleto-1',
      status: 'pending',
      ticketUrl: 'https://mp.test/boleto/1',
      barcodeContent: '23793381286000000000123456789012345678901234',
      digitableLine: '23793.38128 60000.000001 12345.678901 2 99990000009990',
      expiresAt: new Date('2026-06-03T12:00:00.000Z'),
      raw: { id: 'mp-boleto-1', status: 'pending' },
    };
    const boletoBuyer = {
      ...buyer,
      address: {
        zipCode: '01310100',
        street: 'Av Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'Sao Paulo',
        state: 'SP',
      },
    };
    const tx = () => ({
      kloelSale: {
        create: jest.fn().mockResolvedValue({
          id: 's-boleto-1',
          workspaceId: ws,
          productName: 'Produto X',
          amount: 99.9,
          status: 'pending',
          paymentMethod: 'BOLETO',
          leadPhone: buyer.phone,
          metadata: {},
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    const runTransaction =
      (transaction: ReturnType<typeof tx>) =>
      async (cb: (tx: ReturnType<typeof tx>) => unknown): Promise<unknown> =>
        cb(transaction);

    it('creates boleto order returning Mercado Pago boleto proof', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(runTransaction(t));
      mpBoleto.create.mockResolvedValue(boletoOk);

      const result = await service.createBoletoOrder(ws, pid, plid, boletoBuyer);

      expect(result).toMatchObject({
        saleId: 's-boleto-1',
        boletoBarcode: '23793.38128 60000.000001 12345.678901 2 99990000009990',
        boletoUrl: 'https://mp.test/boleto/1',
        externalPaymentId: 'mp-boleto-1',
      });
      expect(mpBoleto.create).toHaveBeenCalledWith(
        objectContaining({
          amountCents: 9990n,
          description: 'Produto X',
          externalReference: 's-boleto-1',
          notificationUrl: stringContaining('/webhooks/mercadopago'),
          payerAddress: boletoBuyer.address,
          payerDocument: '12345678900',
          payerEmail: 'joao@test.com',
          payerName: 'João',
        }),
      );
      expect(t.kloelSale.create).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({
            paymentMethod: 'BOLETO',
            metadata: objectContaining({
              buyerAddress: boletoBuyer.address,
              buyerEmail: 'joao@test.com',
            }),
          }),
        }),
      );
      expect(t.kloelSale.update).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({
            externalPaymentId: 'mp-boleto-1',
            paymentLink: 'https://mp.test/boleto/1',
            metadata: objectContaining({
              boletoBarcode: '23793.38128 60000.000001 12345.678901 2 99990000009990',
              boletoExternalId: 'mp-boleto-1',
              boletoStatus: 'pending',
            }),
          }),
        }),
      );
      expect(audit.logWithTx).toHaveBeenCalledTimes(2);
      expect(spine.emit).toHaveBeenCalledWith(
        objectContaining({
          eventName: 'sale.created',
          payload: objectContaining({ paymentMethod: 'BOLETO' }),
        }),
      );
      expect(spine.emit).toHaveBeenCalledWith(
        objectContaining({
          eventName: 'payment.pending',
          payload: objectContaining({ gateway: 'mercadopago', method: 'BOLETO' }),
        }),
      );
    });
  });

  describe('createStripeCardLink', () => {
    const pid = 'prod-1';
    const plid = 'plan-1';
    const plan = {
      id: plid,
      productId: pid,
      name: 'Plano Pro',
      price: 99.9,
      active: true,
      product: { name: 'Produto X' },
    };
    const tx = () => ({
      kloelSale: {
        create: jest.fn().mockResolvedValue({
          id: 's-card-1',
          workspaceId: ws,
          productName: 'Produto X',
          amount: 99.9,
          status: 'pending',
          paymentMethod: 'CREDIT_CARD',
          leadPhone: buyer.phone,
          metadata: {},
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    const runTransaction =
      (transaction: ReturnType<typeof tx>) =>
      async (cb: (tx: ReturnType<typeof tx>) => unknown): Promise<unknown> =>
        cb(transaction);

    it('creates card checkout link using Stripe card-only Checkout Session', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(runTransaction(t));
      stripe.stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_card_1',
        url: 'https://checkout.stripe.com/c/pay/cs_card_1',
        payment_intent: 'pi_card_1',
      });

      const result = await service.createStripeCardLink(ws, pid, plid, buyer);

      expect(result).toEqual({
        saleId: 's-card-1',
        checkoutSessionId: 'cs_card_1',
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_card_1',
        externalPaymentId: 'pi_card_1',
      });
      expect(mpPix.create).not.toHaveBeenCalled();
      expect(mpBoleto.create).not.toHaveBeenCalled();
      expect(stripe.stripe.checkout.sessions.create).toHaveBeenCalledWith(
        objectContaining({
          customer_email: 'joao@test.com',
          line_items: [
            objectContaining({
              price_data: objectContaining({ currency: 'brl', unit_amount: 9990 }),
              quantity: 1,
            }),
          ],
          metadata: objectContaining({
            kloel_order_id: 's-card-1',
            orderId: 's-card-1',
            payment_method: 'CREDIT_CARD',
            planId: plid,
            productId: pid,
            productName: 'Produto X',
            saleId: 's-card-1',
            sourceCapability: 'sales.create_card_link',
            workspace_id: ws,
            workspaceId: ws,
          }),
          mode: 'payment',
          payment_intent_data: objectContaining({
            metadata: objectContaining({
              kloel_order_id: 's-card-1',
              orderId: 's-card-1',
              payment_method: 'CREDIT_CARD',
              saleId: 's-card-1',
              sourceCapability: 'sales.create_card_link',
              workspace_id: ws,
              workspaceId: ws,
            }),
          }),
          payment_method_types: ['card'],
        }),
        objectContaining({
          idempotencyKey: stringContaining('sale-card:ws-1:s-card-1:'),
        }),
      );
      expect(t.kloelSale.create).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({
            paymentMethod: 'CREDIT_CARD',
            status: 'pending',
            metadata: objectContaining({
              buyerEmail: 'joao@test.com',
              productId: pid,
            }),
          }),
        }),
      );
      expect(t.kloelSale.update).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({
            externalPaymentId: 'pi_card_1',
            paymentLink: 'https://checkout.stripe.com/c/pay/cs_card_1',
            metadata: objectContaining({
              stripeCheckoutSessionId: 'cs_card_1',
              stripePaymentIntentId: 'pi_card_1',
            }),
          }),
        }),
      );
      expect(audit.logWithTx).toHaveBeenCalledTimes(2);
      expect(spine.emit).toHaveBeenCalledWith(
        objectContaining({
          eventName: 'sale.created',
          payload: objectContaining({ paymentMethod: 'CREDIT_CARD' }),
        }),
      );
      expect(spine.emit).toHaveBeenCalledWith(
        objectContaining({
          eventName: 'payment.pending',
          payload: objectContaining({
            gateway: 'stripe',
            method: 'CREDIT_CARD',
            checkoutSessionId: 'cs_card_1',
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('returns workspace-scoped sale', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue({ id: 's1', workspaceId: ws });
      expect((await service.findById(ws, 's1'))?.id).toBe('s1');
    });
    it('returns null for missing', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue(null);
      expect(await service.findById(ws, 'nx')).toBeNull();
    });
  });

  describe('listByWorkspace', () => {
    it('returns desc-sorted sales', async () => {
      prisma.kloelSale.findMany.mockResolvedValue([{ id: 's2' }, { id: 's1' }]);
      expect(await service.listByWorkspace(ws)).toHaveLength(2);
      expect(prisma.kloelSale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 50 }) as never,
      );
    });
    it('respects limit', async () => {
      prisma.kloelSale.findMany.mockResolvedValue([]);
      await service.listByWorkspace(ws, 5);
      expect(prisma.kloelSale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }) as never,
      );
    });
    it('returns [] when empty', async () => {
      prisma.kloelSale.findMany.mockResolvedValue([]);
      expect(await service.listByWorkspace(ws)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // PI-K37 — Tier-5 capability methods
  // -------------------------------------------------------------------------

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
