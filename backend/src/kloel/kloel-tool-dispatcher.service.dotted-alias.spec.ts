import { Test, TestingModule } from '@nestjs/testing';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';

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

import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { KloelCodeToolsService } from './kloel-code-tools.service';
import { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import { KloelProductSubResourceToolsService } from './kloel-product-sub-resource-tools.service';
import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import {
  createPrismaMock,
  createPlanLimitsMock,
  createChatToolsMock,
  createBizConfigToolsMock,
  createWhatsappToolsMock,
  createComposerMock,
  createAuditMock,
  createOpsAlertMock,
  createCodeToolsMock,
  createCodeAnalysisMock,
  DEFAULT_WS_ID,
} from './kloel-tool-dispatcher.service.fixtures';
import type {
  DispatcherPrismaMock,
  DispatcherChatToolsMock,
  DispatcherBizConfigMock,
  DispatcherWhatsappMock,
  DispatcherComposerMock,
  DispatcherAuditMock,
  DispatcherOpsAlertMock,
  DispatcherPlanLimitsMock,
  DispatcherCodeToolsMock,
  DispatcherCodeAnalysisMock,
} from './kloel-tool-dispatcher.service.fixtures';
import { SalesService } from '../sales/sales.service';

type ProductSubToolsMock = { executeTool: jest.Mock };

function objectContaining<T extends object>(sample: T): T {
  const matcher: unknown = expect.objectContaining(sample);
  return matcher as T;
}

function stringMatching(pattern: RegExp): string {
  const matcher: unknown = expect.stringMatching(pattern);
  return matcher as string;
}

function stringContaining(sample: string): string {
  const matcher: unknown = expect.stringContaining(sample);
  return matcher as string;
}

describe('KloelToolDispatcherService — dotted aliases', () => {
  let service: KloelToolDispatcherService;
  let prisma: DispatcherPrismaMock;
  let planLimits: DispatcherPlanLimitsMock;
  let chatToolsService: DispatcherChatToolsMock;
  let bizConfigToolsService: DispatcherBizConfigMock;
  let whatsappToolsService: DispatcherWhatsappMock;
  let composerService: DispatcherComposerMock;
  let auditService: DispatcherAuditMock;
  let opsAlert: DispatcherOpsAlertMock;
  let codeToolsService: DispatcherCodeToolsMock;
  let codeAnalysisService: DispatcherCodeAnalysisMock;
  let productSubTools: ProductSubToolsMock;
  let salesService: {
    createBoletoOrder: jest.Mock;
    createPixOrder: jest.Mock;
    createStripeCardLink: jest.Mock;
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    planLimits = createPlanLimitsMock();
    chatToolsService = createChatToolsMock();
    bizConfigToolsService = createBizConfigToolsMock();
    whatsappToolsService = createWhatsappToolsMock();
    composerService = createComposerMock();
    auditService = createAuditMock();
    opsAlert = createOpsAlertMock();
    codeToolsService = createCodeToolsMock();
    codeAnalysisService = createCodeAnalysisMock();
    productSubTools = { executeTool: jest.fn().mockResolvedValue({ success: true }) };
    salesService = {
      createBoletoOrder: jest.fn(),
      createPixOrder: jest.fn(),
      createStripeCardLink: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelToolDispatcherService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: KloelChatToolsService, useValue: chatToolsService },
        { provide: KloelBusinessConfigToolsService, useValue: bizConfigToolsService },
        { provide: KloelWhatsAppToolsService, useValue: whatsappToolsService },
        { provide: KloelComposerService, useValue: composerService },
        { provide: AuditService, useValue: auditService },
        { provide: KloelCodeToolsService, useValue: codeToolsService },
        { provide: KloelCodeAnalysisService, useValue: codeAnalysisService },
        { provide: OpsAlertService, useValue: opsAlert },
        { provide: KloelProductSubResourceToolsService, useValue: productSubTools },
        { provide: SalesService, useValue: salesService },
        CapabilityRegistryV2Service,
      ],
    }).compile();

    service = module.get<KloelToolDispatcherService>(KloelToolDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const args = { name: 'Test', price: 99 };
  describe('products.* aliases', () => {
    it('products.create forwards to create_product and returns a material receipt', async () => {
      chatToolsService.toolSaveProduct = jest.fn().mockResolvedValue({
        success: true,
        product: { id: 'prod-1', name: 'Test' },
      });

      const prodResult = await service.executeTool(
        DEFAULT_WS_ID,
        'products.create',
        args,
        'user-42',
      );

      expect(chatToolsService.toolSaveProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
        ...args,
        actorId: 'user-42',
      });
      expect(prodResult).toEqual(
        objectContaining({
          success: true,
          capabilityId: 'products.create',
          outputs: objectContaining({ productId: 'prod-1' }),
          receipt: objectContaining({
            capabilityId: 'products.create',
            actorId: 'user-42',
            inputs: args,
            outputs: objectContaining({ productId: 'prod-1' }),
            domainEvents: ['product.created'],
            evidenceUrl: '/produtos/prod-1',
            success: true,
          }),
        }),
      );
    });

    it('products.update forwards to update_product and returns a material receipt', async () => {
      chatToolsService.toolUpdateProduct = jest.fn().mockResolvedValue({
        success: true,
        product: { id: 'prod-1', name: 'Test' },
      });

      const dotted = await service.executeTool(DEFAULT_WS_ID, 'products.update', args, 'user-42');

      expect(chatToolsService.toolUpdateProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
        ...args,
        actorId: 'user-42',
      });
      expect(dotted).toEqual(
        objectContaining({
          success: true,
          capabilityId: 'products.update',
          outputs: objectContaining({ productId: 'prod-1' }),
          receipt: objectContaining({
            capabilityId: 'products.update',
            actorId: 'user-42',
            inputs: args,
            outputs: objectContaining({ productId: 'prod-1' }),
            domainEvents: ['product.updated'],
            evidenceUrl: '/produtos/prod-1',
            success: true,
          }),
        }),
      );
    });

    it('products.upload_image reaches upload_product_image', async () => {
      chatToolsService.toolUploadProductImage = jest
        .fn()
        .mockResolvedValue({ success: true, url: 'https://img.test/x.png' });

      await service.executeTool(DEFAULT_WS_ID, 'products.upload_image', args);

      expect(chatToolsService.toolUploadProductImage).toHaveBeenCalledWith(DEFAULT_WS_ID, args);
    });
  });
  describe('plans.* aliases', () => {
    it('plans.create forwards to create_plan and returns a material receipt', async () => {
      productSubTools.executeTool.mockResolvedValue({
        success: true,
        plan: { id: 'plan-1', name: 'Basic' },
      });

      const dotted = await service.executeTool(
        DEFAULT_WS_ID,
        'plans.create',
        { productId: 'prod-1', name: 'Basic', price: 99 },
        'user-42',
      );

      expect(productSubTools.executeTool).toHaveBeenCalledWith('create_plan', DEFAULT_WS_ID, {
        productId: 'prod-1',
        name: 'Basic',
        price: 99,
      });
      expect(dotted.success).toBe(true);
      expect(dotted.capabilityId).toBe('plans.create');
      expect(dotted.outputs).toEqual(objectContaining({ planId: 'plan-1' }));
      expect(dotted.receipt).toEqual(
        objectContaining({
          capabilityId: 'plans.create',
          workspaceId: DEFAULT_WS_ID,
          actorId: 'user-42',
          inputs: { productId: 'prod-1', name: 'Basic', price: 99 },
          outputs: objectContaining({ planId: 'plan-1' }),
          domainEvents: ['plan.created'],
          auditLogId: stringMatching(/^audit_/),
          evidenceUrl: '/produtos/prod-1/planos/plan-1',
          idempotencyKey: stringContaining('plans.create'),
          success: true,
        }),
      );
    });

    it('plans.update forwards to update_plan and returns a material receipt', async () => {
      productSubTools.executeTool.mockResolvedValue({
        success: true,
        plan: { id: 'plan-1', name: 'Pro' },
      });

      const planArgs = { productId: 'prod-1', planId: 'plan-1', name: 'Pro', price: 199 };
      const dotted = await service.executeTool(DEFAULT_WS_ID, 'plans.update', planArgs, 'user-42');

      expect(productSubTools.executeTool).toHaveBeenCalledWith(
        'update_plan',
        DEFAULT_WS_ID,
        planArgs,
      );
      expect(dotted.success).toBe(true);
      expect(dotted.capabilityId).toBe('plans.update');
      expect(dotted.outputs).toEqual(objectContaining({ planId: 'plan-1' }));
      expect(dotted.receipt).toEqual(
        objectContaining({
          capabilityId: 'plans.update',
          workspaceId: DEFAULT_WS_ID,
          actorId: 'user-42',
          inputs: planArgs,
          outputs: objectContaining({ productId: 'prod-1', planId: 'plan-1' }),
          domainEvents: ['plan.updated'],
          auditLogId: stringMatching(/^audit_/),
          evidenceUrl: '/produtos/prod-1/planos/plan-1',
          idempotencyKey: stringContaining('plans.update'),
          success: true,
        }),
      );
    });
  });
  describe('checkouts.* aliases', () => {
    it('checkouts.create forwards to create_checkout and returns a material receipt', async () => {
      productSubTools.executeTool.mockResolvedValue({
        success: true,
        checkout: { id: 'chk-1', name: 'Checkout Principal' },
      });

      const dotted = await service.executeTool(
        DEFAULT_WS_ID,
        'checkouts.create',
        { productId: 'prod-1', name: 'Checkout Principal' },
        'user-42',
      );

      expect(productSubTools.executeTool).toHaveBeenCalledWith('create_checkout', DEFAULT_WS_ID, {
        productId: 'prod-1',
        name: 'Checkout Principal',
      });
      expect(dotted.success).toBe(true);
      expect(dotted.capabilityId).toBe('checkouts.create');
      expect(dotted.outputs).toEqual(objectContaining({ checkoutId: 'chk-1' }));
      expect(dotted.receipt).toEqual(
        objectContaining({
          capabilityId: 'checkouts.create',
          workspaceId: DEFAULT_WS_ID,
          actorId: 'user-42',
          inputs: { productId: 'prod-1', name: 'Checkout Principal' },
          outputs: objectContaining({ checkoutId: 'chk-1' }),
          domainEvents: ['checkout.created'],
          auditLogId: stringMatching(/^audit_/),
          evidenceUrl: '/produtos/prod-1/checkouts/chk-1',
          idempotencyKey: stringContaining('checkouts.create'),
          success: true,
        }),
      );
    });

    it('checkouts.update forwards to update_checkout and returns a material receipt', async () => {
      productSubTools.executeTool.mockResolvedValue({
        success: true,
        checkout: { id: 'chk-1', name: 'Checkout Pro' },
      });

      const checkoutArgs = {
        productId: 'prod-1',
        checkoutId: 'chk-1',
        name: 'Checkout Pro',
        buttonText: 'Comprar Agora',
      };
      const dotted = await service.executeTool(
        DEFAULT_WS_ID,
        'checkouts.update',
        checkoutArgs,
        'user-42',
      );

      expect(productSubTools.executeTool).toHaveBeenCalledWith(
        'update_checkout',
        DEFAULT_WS_ID,
        checkoutArgs,
      );
      expect(dotted.success).toBe(true);
      expect(dotted.capabilityId).toBe('checkouts.update');
      expect(dotted.outputs).toEqual(objectContaining({ checkoutId: 'chk-1' }));
      expect(dotted.receipt).toEqual(
        objectContaining({
          capabilityId: 'checkouts.update',
          workspaceId: DEFAULT_WS_ID,
          actorId: 'user-42',
          inputs: checkoutArgs,
          outputs: objectContaining({ productId: 'prod-1', checkoutId: 'chk-1' }),
          domainEvents: ['checkout.updated'],
          auditLogId: stringMatching(/^audit_/),
          evidenceUrl: '/produtos/prod-1/checkouts/chk-1',
          idempotencyKey: stringContaining('checkouts.update'),
          success: true,
        }),
      );
    });
  });
  describe('coupons.* aliases', () => {
    it('coupons.create forwards to create_coupon and returns a material receipt', async () => {
      productSubTools.executeTool.mockResolvedValue({
        success: true,
        coupon: { id: 'coupon-1', code: 'PDRN10' },
      });

      const dotted = await service.executeTool(
        DEFAULT_WS_ID,
        'coupons.create',
        { productId: 'prod-1', code: 'PDRN10', discountType: 'percentage', discountValue: 10 },
        'user-42',
      );

      expect(productSubTools.executeTool).toHaveBeenCalledWith('create_coupon', DEFAULT_WS_ID, {
        productId: 'prod-1',
        code: 'PDRN10',
        discountType: 'percentage',
        discountValue: 10,
      });
      expect(dotted.success).toBe(true);
      expect(dotted.capabilityId).toBe('coupons.create');
      expect(dotted.outputs).toEqual(objectContaining({ couponId: 'coupon-1' }));
      expect(dotted.receipt).toEqual(
        objectContaining({
          capabilityId: 'coupons.create',
          workspaceId: DEFAULT_WS_ID,
          actorId: 'user-42',
          inputs: {
            productId: 'prod-1',
            code: 'PDRN10',
            discountType: 'percentage',
            discountValue: 10,
          },
          outputs: objectContaining({ couponId: 'coupon-1' }),
          domainEvents: ['coupon.created'],
          auditLogId: stringMatching(/^audit_/),
          evidenceUrl: '/produtos/prod-1/cupons/coupon-1',
          idempotencyKey: stringContaining('coupons.create'),
          success: true,
        }),
      );
    });

    it('coupons.delete forwards to delete_coupon and returns a material receipt', async () => {
      productSubTools.executeTool.mockResolvedValue({ success: true, couponId: 'coupon-1' });

      const deleteArgs = { couponId: 'coupon-1' };
      const dotted = await service.executeTool(
        DEFAULT_WS_ID,
        'coupons.delete',
        deleteArgs,
        'user-42',
      );

      expect(productSubTools.executeTool).toHaveBeenCalledWith(
        'delete_coupon',
        DEFAULT_WS_ID,
        deleteArgs,
      );
      expect(dotted.success).toBe(true);
      expect(dotted.capabilityId).toBe('coupons.delete');
      expect(dotted.outputs).toEqual(objectContaining({ couponId: 'coupon-1' }));
      expect(dotted.receipt).toEqual(
        objectContaining({
          capabilityId: 'coupons.delete',
          workspaceId: DEFAULT_WS_ID,
          actorId: 'user-42',
          inputs: deleteArgs,
          outputs: objectContaining({ couponId: 'coupon-1' }),
          domainEvents: ['coupon.deleted'],
          auditLogId: stringMatching(/^audit_/),
          idempotencyKey: stringContaining('coupons.delete'),
          success: true,
        }),
      );
    });
  });
  describe('legacy payment link', () => {
    it('create_payment_link returns a canonical material receipt with payment proof', async () => {
      const toolCreatePaymentLink = chatToolsService.toolCreatePaymentLink as jest.Mock;
      toolCreatePaymentLink.mockResolvedValueOnce({
        success: true,
        paymentId: 'pay-link-1',
        paymentUrl: 'https://pay.test/pay-link-1',
        pixQrCode: 'data:image/png;base64,qr',
        pixCopyPaste: '000201link',
        billingType: 'PIX',
      });
      const paymentArgs = {
        amount: 197,
        description: 'PDRN',
        customerName: 'Joao',
      };

      const result = await service.executeTool(
        DEFAULT_WS_ID,
        'create_payment_link',
        paymentArgs,
        'user-42',
      );

      expect(toolCreatePaymentLink).toHaveBeenCalledWith(DEFAULT_WS_ID, {
        ...paymentArgs,
        executionPath: 'dispatcher',
      });
      expect(result.success).toBe(true);
      expect(result.capabilityId).toBe('create_payment_link');
      expect(result.outputs).toEqual(
        objectContaining({
          paymentId: 'pay-link-1',
          paymentUrl: 'https://pay.test/pay-link-1',
          pixCopyPaste: '000201link',
          pixQrCode: 'data:image/png;base64,qr',
        }),
      );
      expect(result.receipt).toEqual(
        objectContaining({
          capabilityId: 'create_payment_link',
          workspaceId: DEFAULT_WS_ID,
          actorId: 'user-42',
          inputs: paymentArgs,
          outputs: objectContaining({
            paymentId: 'pay-link-1',
            paymentUrl: 'https://pay.test/pay-link-1',
            pixCopyPaste: '000201link',
          }),
          domainEvents: ['payment.link_created'],
          auditLogId: stringMatching(/^audit_/),
          idempotencyKey: stringContaining('create_payment_link'),
          success: true,
        }),
      );
    });
  });

  describe('sales.* aliases', () => {
    it('sales.create_pix executes SalesService.createPixOrder and returns a real sale receipt', async () => {
      salesService.createPixOrder.mockResolvedValueOnce({
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

      const dotted = await service.executeTool(
        DEFAULT_WS_ID,
        'sales.create_pix',
        paymentArgs,
        'user-42',
      );

      expect(salesService.createPixOrder).toHaveBeenCalledWith(DEFAULT_WS_ID, 'prod-1', 'plan-1', {
        name: 'Joao',
        email: 'joao@test.com',
        cpf: '123.456.789-00',
        phone: '11999999999',
      });
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
      salesService.createStripeCardLink.mockResolvedValueOnce({
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

      const dotted = await service.executeTool(
        DEFAULT_WS_ID,
        'sales.create_card_link',
        paymentArgs,
        'user-42',
      );

      expect(salesService.createPixOrder).not.toHaveBeenCalled();
      expect(salesService.createBoletoOrder).not.toHaveBeenCalled();
      expect(salesService.createStripeCardLink).toHaveBeenCalledWith(
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

      const dotted = await service.executeTool(
        DEFAULT_WS_ID,
        'sales.create_pix',
        paymentArgs,
        'user-42',
      );

      expect(salesService.createPixOrder).not.toHaveBeenCalled();
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
      salesService.createBoletoOrder.mockResolvedValueOnce({
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

      const dotted = await service.executeTool(
        DEFAULT_WS_ID,
        'sales.create_boleto',
        paymentArgs,
        'user-42',
      );

      expect(salesService.createPixOrder).not.toHaveBeenCalled();
      expect(salesService.createBoletoOrder).toHaveBeenCalledWith(
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

      const dotted = await service.executeTool(
        DEFAULT_WS_ID,
        'sales.create_boleto',
        paymentArgs,
        'user-42',
      );

      expect(salesService.createBoletoOrder).not.toHaveBeenCalled();
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
});
