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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      expect(t.kloelSale.updateMany).toHaveBeenCalledWith(
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      expect(t.kloelSale.updateMany).toHaveBeenCalledWith(
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
  // PI-K37 — Tier-5 capability methods (createPixOrder V2, fillBuyerData, refund)
  // moved to sales.service.pix-refund.spec.ts to keep this file under 600 LOC.
  // -------------------------------------------------------------------------
});
