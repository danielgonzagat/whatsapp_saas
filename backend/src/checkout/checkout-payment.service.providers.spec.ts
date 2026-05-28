import {
  type CheckoutPaymentCreateArgs,
  type CheckoutPaymentTxCallback,
  type CheckoutPaymentTxClient,
} from './checkout-payment.service.fixtures';
import {
  buildCheckoutPaymentServiceTestEnv,
  type CheckoutPaymentServiceTestEnv,
} from './checkout-payment.service.spec.harness';

/**
 * Provider-routing sub-spec for CheckoutPaymentService.processPayment.
 *
 * Carved out of `checkout-payment.service.spec.ts` (Gate-fix2-D, 2026-05-28) so
 * the provider-arm assertions (PIX, boleto, card, router mismatches, automatic
 * Connect account provisioning) stay reviewable in isolation from the
 * fraud-engine and E2E-guard suites.
 */
describe('CheckoutPaymentService.processPayment — provider routing', () => {
  let env: CheckoutPaymentServiceTestEnv;

  beforeEach(async () => {
    env = await buildCheckoutPaymentServiceTestEnv();
  });

  it('creates a boleto payment through Mercado Pago, persists barcode data, and never calls Stripe', async () => {
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => ({
          id: 'pay_boleto_1',
          ...args.data,
        })),
      },
      checkoutOrder: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    env.prisma.$transaction.mockImplementation(async (cb: CheckoutPaymentTxCallback) => cb(tx));

    const result = await env.service.processPayment({
      orderId: 'order-1',
      idempotencyKey: 'idem-boleto-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente Boleto',
      customerEmail: 'boleto@example.com',
      customerCPF: '12345678909',
      customerPhone: '11999999999',
      paymentMethod: 'BOLETO',
      totalInCents: 10_000,
    });

    expect(env.providerRouter.resolve).toHaveBeenCalledWith({ method: 'boleto' });
    expect(env.stripeCharge.createSaleCharge).not.toHaveBeenCalled();
    expect(env.mercadoPagoBoleto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 13_990n,
        description: 'Produto X',
        externalReference: 'order-1',
        idempotencyKey: 'idem-boleto-1',
        notificationUrl: expect.stringContaining('/webhooks/mercadopago'),
        payerAddress: expect.objectContaining({
          city: 'São Paulo',
          number: '1000',
          state: 'SP',
          street: 'Av Paulista',
          zipCode: '01310100',
        }),
        payerDocument: '12345678909',
        payerEmail: 'boleto@example.com',
        payerName: 'Cliente Boleto',
      }),
    );
    expect(tx.checkoutPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gateway: 'mercadopago',
          externalId: 'mp_boleto_1',
          boletoUrl: 'https://www.mercadopago.com.br/payments/mp_boleto_1/ticket',
          boletoBarcode: '23793.38128 60000.000001 12345.678901 2 99990000013990',
          status: 'PENDING',
        }),
      }),
    );
    expect(result).toMatchObject({
      approved: false,
      boletoBarcode: '23793.38128 60000.000001 12345.678901 2 99990000013990',
      boletoUrl: 'https://www.mercadopago.com.br/payments/mp_boleto_1/ticket',
      clientSecret: null,
      paymentIntentId: 'mp_boleto_1',
      type: 'BOLETO',
    });
  });

  it('creates a card PaymentIntent, records a stripe payment row, and returns clientSecret for the checkout UI', async () => {
    const txCalls: string[] = [];
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => {
          txCalls.push('payment.create');
          return { id: 'pay_card_1', ...args.data };
        }),
      },
      checkoutOrder: {
        findFirst: jest.fn(),
        updateMany: jest.fn(async () => {
          txCalls.push('order.updateMany');
          return { count: 1 };
        }),
      },
    };
    env.prisma.$transaction.mockImplementation(
      async (cb: CheckoutPaymentTxCallback, opts: { isolationLevel: string }) => {
        expect(opts).toMatchObject({ isolationLevel: 'ReadCommitted' });
        return cb(tx);
      },
    );

    const result = await env.service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente Teste',
      customerEmail: 'cliente@example.com',
      customerCPF: '123.456.789-09',
      customerPhone: '11999999999',
      paymentMethod: 'CREDIT_CARD',
      totalInCents: 10_000,
      installments: 3,
    });

    expect(env.providerRouter.resolve).toHaveBeenCalledWith({ method: 'card' });
    expect(env.stripeCharge.createSaleCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        sellerStripeAccountId: 'acct_seller_1',
        buyerPaidCents: 13_990n,
        saleValueCents: 10_000n,
        marketplaceFeeCents: 990n,
        interestCents: 3_990n,
        paymentMethodTypes: ['card'],
      }),
    );
    expect(tx.checkoutPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gateway: 'stripe',
          externalId: 'pi_test_123',
          status: 'PENDING',
          cardLast4: null,
        }),
      }),
    );
    expect(txCalls).toEqual(['payment.create']);
    expect(result).toMatchObject({
      approved: false,
      clientSecret: 'pi_test_123_secret',
      paymentIntentId: 'pi_test_123',
      type: 'CREDIT_CARD',
    });
    expect(env.postPaymentEffects.markLeadConverted).not.toHaveBeenCalled();
    expect(env.postPaymentEffects.sendPurchaseSignals).not.toHaveBeenCalled();
    expect(env.fraudEngine.evaluate).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      buyerEmail: 'cliente@example.com',
      buyerCpf: '123.456.789-09',
      buyerCnpj: null,
      buyerIp: '127.0.0.1',
      deviceFingerprint: null,
      cardBin: null,
      cardCountry: null,
      orderCountry: 'BR',
      amountCents: 13_990n,
    });
  });

  it('creates a PIX payment through Mercado Pago, persists QR data, and never calls Stripe', async () => {
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => ({
          id: 'pay_pix_1',
          ...args.data,
        })),
      },
      checkoutOrder: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    env.prisma.$transaction.mockImplementation(async (cb: CheckoutPaymentTxCallback) => cb(tx));

    const result = await env.service.processPayment({
      orderId: 'order-1',
      idempotencyKey: 'idem-pix-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente Pix',
      customerEmail: 'pix@example.com',
      customerCPF: '12345678909',
      customerPhone: '11999999999',
      paymentMethod: 'PIX',
      totalInCents: 10_000,
    });

    expect(env.providerRouter.resolve).toHaveBeenCalledWith({ method: 'pix' });
    expect(env.stripeCharge.createSaleCharge).not.toHaveBeenCalled();
    expect(env.mercadoPagoPix.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 13_990n,
        description: 'Produto X',
        externalReference: 'order-1',
        idempotencyKey: 'idem-pix-1',
        notificationUrl: expect.stringContaining('/webhooks/mercadopago'),
        payerDocument: '12345678909',
        payerEmail: 'pix@example.com',
        payerName: 'Cliente Pix',
      }),
    );
    expect(tx.checkoutPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gateway: 'mercadopago',
          externalId: 'mp_pix_1',
          pixQrCode: 'data:image/png;base64,base64-mp-qr',
          pixCopyPaste: '000201mp-pix-copia-e-cola',
          status: 'PENDING',
        }),
      }),
    );
    expect(result).toMatchObject({
      approved: false,
      clientSecret: null,
      paymentIntentId: 'mp_pix_1',
      pixQrCode: 'data:image/png;base64,base64-mp-qr',
      pixCopyPaste: '000201mp-pix-copia-e-cola',
      type: 'PIX',
    });
  });

  it('fails closed before provider calls when the router sends PIX away from Mercado Pago', async () => {
    env.providerRouter.resolve.mockReturnValueOnce({ provider: 'stripe', reason: 'drift-test' });

    await expect(
      env.service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Cliente Pix',
        customerEmail: 'pix@example.com',
        customerCPF: '12345678909',
        customerPhone: '11999999999',
        paymentMethod: 'PIX',
        totalInCents: 10_000,
      }),
    ).rejects.toThrow('payment_provider_route_mismatch:PIX');

    expect(env.mercadoPagoPix.create).not.toHaveBeenCalled();
    expect(env.stripeCharge.createSaleCharge).not.toHaveBeenCalled();
  });

  it('fails closed before provider calls when the router sends card away from Stripe', async () => {
    env.providerRouter.resolve.mockReturnValueOnce({ provider: 'mercadopago', reason: 'drift-test' });

    await expect(
      env.service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Cliente Card',
        customerEmail: 'card@example.com',
        customerCPF: '12345678909',
        customerPhone: '11999999999',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 10_000,
      }),
    ).rejects.toThrow('payment_provider_route_mismatch:CREDIT_CARD');

    expect(env.connectService.createCustomAccount).not.toHaveBeenCalled();
    expect(env.stripeCharge.createSaleCharge).not.toHaveBeenCalled();
    expect(env.mercadoPagoPix.create).not.toHaveBeenCalled();
    expect(env.mercadoPagoBoleto.create).not.toHaveBeenCalled();
  });

  it('creates the seller connect account automatically when the workspace does not have one yet', async () => {
    env.prisma.connectAccountBalance.findFirst.mockResolvedValueOnce(null);
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => ({
          id: 'pay_card_2',
          ...args.data,
        })),
      },
      checkoutOrder: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    env.prisma.$transaction.mockImplementation(async (cb: CheckoutPaymentTxCallback) => cb(tx));

    await env.service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente',
      customerEmail: 'cliente@example.com',
      paymentMethod: 'CREDIT_CARD',
      totalInCents: 10_000,
    });

    expect(env.connectService.createCustomAccount).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      accountType: 'SELLER',
      email: 'owner@example.com',
      displayName: 'Workspace Teste',
    });
    expect(env.stripeCharge.createSaleCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerStripeAccountId: 'acct_seller_created',
      }),
    );
  });
});
