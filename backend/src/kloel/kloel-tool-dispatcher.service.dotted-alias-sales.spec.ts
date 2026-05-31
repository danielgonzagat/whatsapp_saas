jest.mock('./kloel-chat-tools.service', () => ({
  KloelChatToolsService: class MockKloelChatToolsService {},
}));

jest.mock('./kloel-business-config-tools.service', () => ({
  KloelBusinessConfigToolsService: class MockKloelBusinessConfigToolsService {},
}));

jest.mock('./kloel-whatsapp-tools.service', () => ({
  KloelWhatsAppToolsService: class MockKloelWhatsAppToolsService {},
}));

jest.mock('./kloel-composer.service', () => ({
  KloelComposerService: class MockKloelComposerService {},
}));

jest.mock('../audit/audit.service', () => ({
  AuditService: class MockAuditService {},
}));

jest.mock('../observability/ops-alert.service', () => ({
  OpsAlertService: class MockOpsAlertService {},
}));

jest.mock('./kloel-code-tools.service', () => ({
  KloelCodeToolsService: class MockKloelCodeToolsService {},
}));

jest.mock('./kloel-product-sub-resource-tools.service', () => ({
  KloelProductSubResourceToolsService: class MockProductSubToolsService {},
}));

import { DEFAULT_WS_ID } from './kloel-tool-dispatcher.service.fixtures';
import {
  buildDispatcherTestBed,
  objectContaining,
  stringContaining,
  stringMatching,
  type DispatcherTestBed,
} from './kloel-tool-dispatcher.service.dotted-alias.test-bed';

describe('KloelToolDispatcherService — sales.* aliases', () => {
  let bed: DispatcherTestBed;

  beforeEach(async () => {
    bed = await buildDispatcherTestBed();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sales.create_pix executes SalesService.createPixOrder and returns a real sale receipt', async () => {
    bed.salesService.createPixOrder.mockResolvedValueOnce({
      saleId: 'sale-pix-1',
      pixQrCode: '000201',
      pixQrCodeBase64: 'base64qr',
      pixCopyPaste: '000201',
      pixExpiresAt: new Date('2026-05-27T16:00:00.000Z'),
      externalPaymentId: 'mp-pix-1',
      ticketUrl: 'https://mp.test/ticket',
    });
    const paymentArgs = {
      productId: 'prod-1',
      planId: 'plan-1',
      customerName: 'Joao',
      customerEmail: 'joao@test.com',
      customerCpf: '123.456.789-00',
      customerPhone: '11999999999',
    };

    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'sales.create_pix',
      paymentArgs,
      'user-42',
    );

    expect(bed.salesService.createPixOrder).toHaveBeenCalledWith(
      DEFAULT_WS_ID,
      'prod-1',
      'plan-1',
      {
        name: 'Joao',
        email: 'joao@test.com',
        cpf: '123.456.789-00',
        phone: '11999999999',
      },
    );
    expect(dotted.success).toBe(true);
    expect(dotted.capabilityId).toBe('sales.create_pix');
    expect(dotted.outputs).toEqual(
      objectContaining({
        saleId: 'sale-pix-1',
        orderId: 'sale-pix-1',
        paymentId: 'mp-pix-1',
        externalPaymentId: 'mp-pix-1',
        pixCopiaECola: '000201',
        qrCodeBase64: 'base64qr',
        paymentUrl: 'https://mp.test/ticket',
      }),
    );
    expect(dotted.receipt).toEqual(
      objectContaining({
        capabilityId: 'sales.create_pix',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: objectContaining({
          productId: 'prod-1',
          planId: 'plan-1',
          customerName: 'Joao',
          customerEmail: 'joao@test.com',
          customerPhone: '11999999999',
        }),
        outputs: objectContaining({ orderId: 'sale-pix-1', paymentId: 'mp-pix-1' }),
        domainEvents: ['sale.created', 'payment.pending'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/vendas/sale-pix-1',
        executionRail: objectContaining({
          provider: 'mercadopago',
          paymentMethod: 'PIX',
          providerMethod: 'pix',
          proofFields: ['saleId', 'externalPaymentId', 'pixCopiaECola', 'pixQrCode'],
        }),
        idempotencyKey: stringContaining('sales.create_pix'),
        success: true,
      }),
    );
  });

  it('sales.create_card_link executes SalesService.createStripeCardLink and returns Stripe checkout proof', async () => {
    bed.salesService.createStripeCardLink.mockResolvedValueOnce({
      saleId: 'sale-card-1',
      checkoutSessionId: 'cs_card_1',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_card_1',
      externalPaymentId: 'pi_card_1',
    });
    const paymentArgs = {
      productId: 'prod-1',
      planId: 'plan-1',
      customerName: 'Joao',
      customerEmail: 'joao@test.com',
      customerPhone: '11999999999',
    };

    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'sales.create_card_link',
      paymentArgs,
      'user-42',
    );

    expect(bed.salesService.createPixOrder).not.toHaveBeenCalled();
    expect(bed.salesService.createBoletoOrder).not.toHaveBeenCalled();
    expect(bed.salesService.createStripeCardLink).toHaveBeenCalledWith(
      DEFAULT_WS_ID,
      'prod-1',
      'plan-1',
      {
        name: 'Joao',
        email: 'joao@test.com',
        cpf: '',
        phone: '11999999999',
      },
    );
    expect(dotted.success).toBe(true);
    expect(dotted.capabilityId).toBe('sales.create_card_link');
    expect(dotted.outputs).toEqual(
      objectContaining({
        checkoutSessionId: 'cs_card_1',
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_card_1',
        externalPaymentId: 'pi_card_1',
        orderId: 'sale-card-1',
        paymentId: 'pi_card_1',
        paymentUrl: 'https://checkout.stripe.com/c/pay/cs_card_1',
        saleId: 'sale-card-1',
      }),
    );
    expect(dotted.receipt).toEqual(
      objectContaining({
        capabilityId: 'sales.create_card_link',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: objectContaining({
          productId: 'prod-1',
          planId: 'plan-1',
          customerName: 'Joao',
          customerEmail: 'joao@test.com',
          customerPhone: '11999999999',
        }),
        outputs: objectContaining({ orderId: 'sale-card-1', paymentId: 'pi_card_1' }),
        domainEvents: ['sale.created', 'payment.pending'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/vendas/sale-card-1',
        executionRail: objectContaining({
          provider: 'stripe',
          paymentMethod: 'CREDIT_CARD',
          providerMethod: 'card',
          proofFields: ['saleId', 'externalPaymentId', 'checkoutSessionId', 'checkoutUrl'],
        }),
        idempotencyKey: stringContaining('sales.create_card_link'),
        success: true,
      }),
    );
  });

  it('sales.create_pix returns missing inputs before creating a sale', async () => {
    const paymentArgs = {
      productName: 'PDRN',
      amount: 197,
      customerName: 'Joao',
      customerPhone: '11999999999',
    };

    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'sales.create_pix',
      paymentArgs,
      'user-42',
    );

    expect(bed.salesService.createPixOrder).not.toHaveBeenCalled();
    expect(dotted.success).toBe(false);
    expect(dotted.error).toBe('sales_create_pix_inputs_required');
    expect(dotted.missingInputs).toEqual(['productId', 'planId', 'customerEmail', 'customerCpf']);
    expect(dotted.receipt).toEqual(
      objectContaining({
        capabilityId: 'sales.create_pix',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: objectContaining(paymentArgs),
        outputs: {},
        domainEvents: [],
        auditLogId: stringMatching(/^audit_/),
        executionRail: objectContaining({
          provider: 'mercadopago',
          paymentMethod: 'PIX',
          providerMethod: 'pix',
        }),
        success: false,
      }),
    );
  });

  it('sales.create_boleto executes SalesService.createBoletoOrder and returns boleto proof', async () => {
    bed.salesService.createBoletoOrder.mockResolvedValueOnce({
      saleId: 'sale-boleto-1',
      boletoBarcode: '23793.38128 60000.000001 12345.678901 2 99990000019700',
      boletoExpiresAt: new Date('2026-06-03T12:00:00.000Z'),
      boletoUrl: 'https://mp.test/boleto/1',
      externalPaymentId: 'mp-boleto-1',
    });
    const paymentArgs = {
      productId: 'prod-1',
      planId: 'plan-1',
      customerName: 'Joao',
      customerEmail: 'joao@test.com',
      customerCpf: '123.456.789-00',
      customerPhone: '11999999999',
      customerZipCode: '01310-100',
      customerStreet: 'Av Paulista',
      customerNumber: '1000',
      customerNeighborhood: 'Bela Vista',
      customerCity: 'Sao Paulo',
      customerState: 'SP',
    };

    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'sales.create_boleto',
      paymentArgs,
      'user-42',
    );

    expect(bed.salesService.createPixOrder).not.toHaveBeenCalled();
    expect(bed.salesService.createBoletoOrder).toHaveBeenCalledWith(
      DEFAULT_WS_ID,
      'prod-1',
      'plan-1',
      {
        name: 'Joao',
        email: 'joao@test.com',
        cpf: '123.456.789-00',
        phone: '11999999999',
        address: {
          zipCode: '01310100',
          street: 'Av Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          city: 'Sao Paulo',
          state: 'SP',
        },
      },
    );
    expect(dotted.success).toBe(true);
    expect(dotted.capabilityId).toBe('sales.create_boleto');
    expect(dotted.outputs).toEqual(
      objectContaining({
        boletoBarcode: '23793.38128 60000.000001 12345.678901 2 99990000019700',
        boletoUrl: 'https://mp.test/boleto/1',
        externalPaymentId: 'mp-boleto-1',
        orderId: 'sale-boleto-1',
        paymentId: 'mp-boleto-1',
        saleId: 'sale-boleto-1',
      }),
    );
    expect(dotted.receipt).toEqual(
      objectContaining({
        capabilityId: 'sales.create_boleto',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: objectContaining({
          productId: 'prod-1',
          planId: 'plan-1',
          customerName: 'Joao',
          customerEmail: 'joao@test.com',
          customerPhone: '11999999999',
        }),
        outputs: objectContaining({ orderId: 'sale-boleto-1', paymentId: 'mp-boleto-1' }),
        domainEvents: ['sale.created', 'payment.pending'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/vendas/sale-boleto-1',
        executionRail: objectContaining({
          provider: 'mercadopago',
          paymentMethod: 'BOLETO',
          providerMethod: 'boleto',
          proofFields: ['saleId', 'externalPaymentId', 'boletoBarcode', 'boletoUrl'],
        }),
        idempotencyKey: stringContaining('sales.create_boleto'),
        success: true,
      }),
    );
  });

  it('sales.create_boleto returns missing inputs before creating a sale', async () => {
    const paymentArgs = {
      productId: 'prod-1',
      planId: 'plan-1',
      customerName: 'Joao',
      customerEmail: 'joao@test.com',
      customerCpf: '123.456.789-00',
    };

    const dotted = await bed.service.executeTool(
      DEFAULT_WS_ID,
      'sales.create_boleto',
      paymentArgs,
      'user-42',
    );

    expect(bed.salesService.createBoletoOrder).not.toHaveBeenCalled();
    expect(dotted.success).toBe(false);
    expect(dotted.error).toBe('sales_create_boleto_inputs_required');
    expect(dotted.missingInputs).toEqual([
      'customerPhone',
      'customerZipCode',
      'customerStreet',
      'customerNumber',
      'customerCity',
      'customerState',
    ]);
    expect(dotted.receipt).toEqual(
      objectContaining({
        capabilityId: 'sales.create_boleto',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: objectContaining({
          productId: paymentArgs.productId,
          planId: paymentArgs.planId,
          customerName: paymentArgs.customerName,
          customerEmail: paymentArgs.customerEmail,
        }),
        outputs: {},
        domainEvents: [],
        auditLogId: stringMatching(/^audit_/),
        executionRail: objectContaining({
          provider: 'mercadopago',
          paymentMethod: 'BOLETO',
          providerMethod: 'boleto',
        }),
        success: false,
      }),
    );
  });
});
