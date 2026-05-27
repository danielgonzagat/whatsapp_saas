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

import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { KloelCodeToolsService } from './kloel-code-tools.service';
import { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import { AccountService } from './account.service';
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
  createAccountMock,
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
  DispatcherAccountMock,
} from './kloel-tool-dispatcher.service.fixtures';

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

describe('KloelToolDispatcherService — chat tools routing', () => {
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
  let accountService: DispatcherAccountMock;

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
    accountService = createAccountMock();

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
        { provide: AccountService, useValue: accountService },
        CapabilityRegistryV2Service,
      ],
    }).compile();

    service = module.get<KloelToolDispatcherService>(KloelToolDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('routes save_product to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'save_product', { name: 'P', price: 10 });
    expect(chatToolsService.toolSaveProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'P',
      price: 10,
    });
  });

  it('routes canonical products.create with the requesting actor id', async () => {
    await service.executeTool(
      DEFAULT_WS_ID,
      'products.create',
      { name: 'P', price: 10 },
      'user-42',
    );
    expect(chatToolsService.toolSaveProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'P',
      price: 10,
      actorId: 'user-42',
    });
  });

  it('returns a material receipt for canonical products.create executions', async () => {
    jest.mocked(chatToolsService.toolSaveProduct).mockResolvedValueOnce({
      success: true,
      message: 'Produto criado',
      product: { id: 'prod-123', slug: 'pdrn' },
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'products.create',
      { name: 'PDRN', price: 197 },
      'user-42',
    );

    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('products.create');
    expect(result.outputs).toEqual(objectContaining({ productId: 'prod-123' }));
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'products.create',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'PDRN', price: 197 },
        outputs: objectContaining({ productId: 'prod-123' }),
        domainEvents: ['product.created'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/produtos/prod-123',
        idempotencyKey: stringContaining('products.create'),
        success: true,
      }),
    );
  });

  it('routes canonical products.update with actor id and a material receipt', async () => {
    jest.mocked(chatToolsService.toolUpdateProduct).mockResolvedValueOnce({
      success: true,
      product: { id: 'prod-123', name: 'PDRN Plus' },
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'products.update',
      { productId: 'prod-123', name: 'PDRN Plus' },
      'user-42',
    );

    expect(chatToolsService.toolUpdateProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      productId: 'prod-123',
      name: 'PDRN Plus',
      actorId: 'user-42',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('products.update');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'products.update',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { productId: 'prod-123', name: 'PDRN Plus' },
        outputs: objectContaining({ productId: 'prod-123' }),
        domainEvents: ['product.updated'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/produtos/prod-123',
        idempotencyKey: stringContaining('products.update'),
        success: true,
      }),
    );
  });

  it('routes canonical products.upload_image with actor id and a material receipt', async () => {
    jest.mocked(chatToolsService.toolUploadProductImage).mockResolvedValueOnce({
      success: true,
      product: { id: 'prod-123', imageUrl: 'https://img.test/pdrn.png' },
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'products.upload_image',
      { productId: 'prod-123', imageUrl: 'https://img.test/pdrn.png' },
      'user-42',
    );

    expect(chatToolsService.toolUploadProductImage).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      productId: 'prod-123',
      imageUrl: 'https://img.test/pdrn.png',
      actorId: 'user-42',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('products.upload_image');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'products.upload_image',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { productId: 'prod-123', imageUrl: 'https://img.test/pdrn.png' },
        outputs: objectContaining({ productId: 'prod-123' }),
        domainEvents: ['product.updated'],
        auditLogId: stringMatching(/^audit_/),
        evidenceUrl: '/produtos/prod-123',
        idempotencyKey: stringContaining('products.upload_image'),
        success: true,
      }),
    );
  });

  it('does not produce a successful material receipt when products.upload_image is missing image input', async () => {
    jest.mocked(chatToolsService.toolUploadProductImage).mockResolvedValueOnce({
      success: false,
      error: 'image_url_required',
      message: 'Envie a URL da imagem ou faça upload pelo chat.',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'products.upload_image',
      { productId: 'prod-123' },
      'user-42',
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('image_url_required');
    expect(result.domainEvents).toEqual([]);
    expect(result.evidenceUrl).toBeUndefined();
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'products.upload_image',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { productId: 'prod-123' },
        outputs: {},
        domainEvents: [],
        error: 'image_url_required',
        success: false,
      }),
    );
  });

  it('requires approval before canonical products.review_and_publish publishes', async () => {
    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'products.review_and_publish',
      { productId: 'prod-123' },
      'user-42',
    );

    expect(chatToolsService.toolPublishProduct).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.approvalRequired).toBe(true);
    expect(result.approvalRequestId).toBe('ap-1');
  });

  it('routes list_products to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'list_products', {});
    expect(chatToolsService.toolListProducts).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });

  it('routes delete_product to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolDeleteProduct).mockResolvedValueOnce({
      success: true,
      message: 'Produto removido',
      product: { id: 'p-1', name: 'PDRN' },
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'delete_product',
      { productId: 'p-1' },
      'user-42',
    );

    expect(chatToolsService.toolDeleteProduct).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      productId: 'p-1',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('delete_product');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'delete_product',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { productId: 'p-1' },
        outputs: objectContaining({ productId: 'p-1' }),
        domainEvents: ['product.deleted'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('delete_product'),
        success: true,
      }),
    );
  });

  it('routes toggle_autopilot to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolToggleAutopilot).mockResolvedValueOnce({
      success: true,
      enabled: true,
      message: 'Autopilot ativado.',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'toggle_autopilot',
      { enabled: true },
      'user-42',
    );

    expect(chatToolsService.toolToggleAutopilot).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      enabled: true,
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('toggle_autopilot');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'toggle_autopilot',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { enabled: true },
        outputs: objectContaining({ enabled: true }),
        domainEvents: ['autopilot.toggled'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('toggle_autopilot'),
        success: true,
      }),
    );
  });

  it('routes set_brand_voice to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolSetBrandVoice).mockResolvedValueOnce({
      success: true,
      message: 'Tom de voz definido como "formal"',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'set_brand_voice',
      { tone: 'formal' },
      'user-42',
    );

    expect(chatToolsService.toolSetBrandVoice).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      tone: 'formal',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('set_brand_voice');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'set_brand_voice',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { tone: 'formal' },
        outputs: objectContaining({ tone: 'formal' }),
        domainEvents: ['brand.voice_updated'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('set_brand_voice'),
        success: true,
      }),
    );
  });

  it('routes set_sales_policy to chatToolsService with a material receipt', async () => {
    const policy = {
      aggressiveness: 'aggressive',
      tone: 'direto',
      instructions: 'Avancar para oferta objetiva apos dois abandonos.',
      appliesTo: 'checkout_abandoned_twice',
      updatedByUserId: 'user-42',
    };
    jest.mocked(chatToolsService.toolSetSalesPolicy).mockResolvedValueOnce({
      success: true,
      policy,
      message: 'Politica comercial atualizada.',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'set_sales_policy',
      {
        aggressiveness: 'aggressive',
        tone: 'direto',
        instructions: 'Avancar para oferta objetiva apos dois abandonos.',
        appliesTo: 'checkout_abandoned_twice',
      },
      'user-42',
    );

    expect(chatToolsService.toolSetSalesPolicy).toHaveBeenCalledWith(
      DEFAULT_WS_ID,
      {
        aggressiveness: 'aggressive',
        tone: 'direto',
        instructions: 'Avancar para oferta objetiva apos dois abandonos.',
        appliesTo: 'checkout_abandoned_twice',
      },
      'user-42',
    );
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('set_sales_policy');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'set_sales_policy',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: {
          aggressiveness: 'aggressive',
          tone: 'direto',
          instructions: 'Avancar para oferta objetiva apos dois abandonos.',
          appliesTo: 'checkout_abandoned_twice',
        },
        outputs: objectContaining({ policy: objectContaining({ aggressiveness: 'aggressive' }) }),
        domainEvents: ['workspace.updated'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('set_sales_policy'),
        success: true,
      }),
    );
  });

  it('routes create_broadcast to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolCreateBroadcast).mockResolvedValueOnce({
      success: true,
      campaign: { id: 'campaign-1', name: 'PDRN Launch', status: 'DRAFT' },
      message: 'Broadcast criado.',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'create_broadcast',
      { name: 'PDRN Launch', message: 'Oferta hoje' },
      'user-42',
    );

    expect(chatToolsService.toolCreateBroadcast).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'PDRN Launch',
      message: 'Oferta hoje',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('create_broadcast');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'create_broadcast',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'PDRN Launch', message: 'Oferta hoje' },
        outputs: objectContaining({ campaignId: 'campaign-1' }),
        domainEvents: ['campaign.created'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('create_broadcast'),
        success: true,
      }),
    );
  });

  it('routes configure_ai_persona to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolConfigureAiPersona).mockResolvedValueOnce({
      success: true,
      persona: { name: 'Kloel', tone: 'formal', personality: 'professional' },
      message: 'Persona atualizada.',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'configure_ai_persona',
      { name: 'Kloel', tone: 'formal', personality: 'professional' },
      'user-42',
    );

    expect(chatToolsService.toolConfigureAiPersona).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'Kloel',
      tone: 'formal',
      personality: 'professional',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('configure_ai_persona');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'configure_ai_persona',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'Kloel', tone: 'formal', personality: 'professional' },
        outputs: objectContaining({
          persona: objectContaining({ name: 'Kloel', tone: 'formal' }),
        }),
        domainEvents: ['ai.persona_updated'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('configure_ai_persona'),
        success: true,
      }),
    );
  });

  it('returns a canonical failure receipt for blocked create_broadcast', async () => {
    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'create_broadcast',
      { name: 'PDRN Launch', message: 'Oferta hoje' },
      'user-42',
    );

    expect(chatToolsService.toolCreateBroadcast).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'PDRN Launch',
      message: 'Oferta hoje',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('campaign_service_required');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'create_broadcast',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'PDRN Launch', message: 'Oferta hoje' },
        outputs: {},
        domainEvents: [],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('create_broadcast'),
        success: false,
        error: 'campaign_service_required',
      }),
    );
  });

  it('returns a canonical failure receipt for blocked configure_ai_persona', async () => {
    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'configure_ai_persona',
      { name: 'Kloel', tone: 'formal', personality: 'professional' },
      'user-42',
    );

    expect(chatToolsService.toolConfigureAiPersona).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'Kloel',
      tone: 'formal',
      personality: 'professional',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('ai_config_service_required');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'configure_ai_persona',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'Kloel', tone: 'formal', personality: 'professional' },
        outputs: {},
        domainEvents: [],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('configure_ai_persona'),
        success: false,
        error: 'ai_config_service_required',
      }),
    );
  });

  it('routes configure_warranty to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolConfigureWarranty).mockResolvedValueOnce({
      success: true,
      product: { id: 'prod-1', warrantyDays: 30 },
      message: 'Garantia atualizada.',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'configure_warranty',
      { productName: 'PDRN', warrantyDays: 30 },
      'user-42',
    );

    expect(chatToolsService.toolConfigureWarranty).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      productName: 'PDRN',
      warrantyDays: 30,
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('configure_warranty');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'configure_warranty',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { productName: 'PDRN', warrantyDays: 30 },
        outputs: objectContaining({ productId: 'prod-1' }),
        domainEvents: ['product.updated'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('configure_warranty'),
        success: true,
      }),
    );
  });

  it('returns canonical failure receipts for blocked placeholder configuration tools', async () => {
    const cases = [
      {
        toolName: 'configure_pixel',
        args: { productName: 'PDRN' },
        error: 'pixel_configuration_service_required',
        serviceCall: () => chatToolsService.toolConfigurePixel,
      },
      {
        toolName: 'configure_shipping',
        args: { productName: 'PDRN' },
        error: 'shipping_configuration_service_required',
        serviceCall: () => chatToolsService.toolConfigureShipping,
      },
      {
        toolName: 'configure_social_proof',
        args: { productName: 'PDRN' },
        error: 'checkout_social_proof_service_required',
        serviceCall: () => chatToolsService.toolConfigureSocialProof,
      },
      {
        toolName: 'configure_order_bump',
        args: { productName: 'PDRN' },
        error: 'checkout_order_bump_service_required',
        serviceCall: () => chatToolsService.toolConfigureOrderBump,
      },
      {
        toolName: 'configure_exit_intent',
        args: { productName: 'PDRN' },
        error: 'checkout_exit_intent_service_required',
        serviceCall: () => chatToolsService.toolConfigureExitIntent,
      },
      {
        toolName: 'configure_after_pay',
        args: { productName: 'PDRN' },
        error: 'checkout_after_pay_service_required',
        serviceCall: () => chatToolsService.toolConfigureAfterPay,
      },
    ];

    for (const testCase of cases) {
      const result = await service.executeTool(
        DEFAULT_WS_ID,
        testCase.toolName,
        testCase.args,
        'user-42',
      );

      expect(testCase.serviceCall()).toHaveBeenCalledWith(DEFAULT_WS_ID, testCase.args);
      expect(result.success).toBe(false);
      expect(result.error).toBe(testCase.error);
      expect(result.receipt).toEqual(
        objectContaining({
          capabilityId: testCase.toolName,
          workspaceId: DEFAULT_WS_ID,
          actorId: 'user-42',
          inputs: testCase.args,
          outputs: {},
          domainEvents: [],
          error: testCase.error,
          auditLogId: stringMatching(/^audit_/),
          idempotencyKey: stringContaining(testCase.toolName),
          success: false,
        }),
      );
    }
  });

  it('routes remember_user_info to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolRememberUserInfo).mockResolvedValueOnce({
      success: true,
      message: 'Memoria "lang" salva.',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'remember_user_info',
      { key: 'lang', value: 'pt' },
      'user-42',
    );

    expect(chatToolsService.toolRememberUserInfo).toHaveBeenCalledWith(
      DEFAULT_WS_ID,
      { key: 'lang', value: 'pt' },
      'user-42',
    );
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('remember_user_info');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'remember_user_info',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { key: 'lang', value: 'pt' },
        outputs: objectContaining({ key: 'lang', value: 'pt' }),
        domainEvents: ['memory.updated'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('remember_user_info'),
        success: true,
      }),
    );
  });

  it('routes get_dashboard_summary to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'get_dashboard_summary', { period: 'today' });
    expect(chatToolsService.toolGetDashboardSummary).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      period: 'today',
    });
  });

  it('routes create_flow to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolCreateFlow).mockResolvedValueOnce({
      success: true,
      message: 'Fluxo criado',
      flow: { id: 'flow-1', name: 'Flow' },
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'create_flow',
      { name: 'Flow', trigger: 'welcome' },
      'user-42',
    );

    expect(chatToolsService.toolCreateFlow).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'Flow',
      trigger: 'welcome',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('create_flow');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'create_flow',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'Flow', trigger: 'welcome' },
        outputs: objectContaining({ flow: objectContaining({ id: 'flow-1' }) }),
        domainEvents: ['flow.created'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('create_flow'),
        success: true,
      }),
    );
  });

  it('returns a canonical failure receipt for blocked create_flow', async () => {
    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'create_flow',
      { name: 'Flow', trigger: 'welcome' },
      'user-42',
    );

    expect(chatToolsService.toolCreateFlow).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'Flow',
      trigger: 'welcome',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('flow_service_required');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'create_flow',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'Flow', trigger: 'welcome' },
        outputs: {},
        domainEvents: [],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('create_flow'),
        success: false,
        error: 'flow_service_required',
      }),
    );
  });

  it('routes list_flows to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'list_flows', {});
    expect(chatToolsService.toolListFlows).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });

  it('routes create_agent_job to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'create_agent_job', {
      title: 'Daily audit',
      prompt: 'Review memory',
    });
    expect(chatToolsService.toolCreateAgentJob).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      title: 'Daily audit',
      prompt: 'Review memory',
    });
  });

  it('routes list_agent_jobs to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'list_agent_jobs', {});
    expect(chatToolsService.toolListAgentJobs).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });

  it('routes set_agent_job_enabled to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'set_agent_job_enabled', {
      jobId: 'daily',
      enabled: false,
    });
    expect(chatToolsService.toolSetAgentJobEnabled).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      jobId: 'daily',
      enabled: false,
    });
  });

  it('routes search_agent_memory to chatToolsService memory/contact search', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'search_agent_memory', { query: 'checkout' });
    expect(chatToolsService.toolSearchAgentMemoryWithContacts).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      query: 'checkout',
    });
  });

  it('routes search_agent_sessions to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'search_agent_sessions', { query: 'checkout' });
    expect(chatToolsService.toolSearchAgentSessions).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      query: 'checkout',
    });
  });

  it('routes get_agent_artifact to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'get_agent_artifact', {
      artifactId: 'tool_artifact:search_agent_memory:123:abcd',
    });
    expect(chatToolsService.toolGetAgentArtifact).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      artifactId: 'tool_artifact:search_agent_memory:123:abcd',
    });
  });

  it('routes upsert_agent_skill to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'upsert_agent_skill', {
      id: 'checkout',
      title: 'Checkout',
      summary: 'Recover checkout',
    });
    expect(chatToolsService.toolUpsertAgentSkill).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      id: 'checkout',
      title: 'Checkout',
      summary: 'Recover checkout',
    });
  });

  it('routes record_agent_skill_outcome to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'record_agent_skill_outcome', {
      skillId: 'checkout',
      outcome: 'succeeded',
    });
    expect(chatToolsService.toolRecordAgentSkillOutcome).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      skillId: 'checkout',
      outcome: 'succeeded',
    });
  });

  it('routes record_agent_delegation to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'record_agent_delegation', {
      task: 'Inspect Hermes delegation',
      result: 'Found governed child sessions',
    });
    expect(chatToolsService.toolRecordAgentDelegation).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      task: 'Inspect Hermes delegation',
      result: 'Found governed child sessions',
    });
  });

  it('routes agent evidence tools to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'record_agent_evidence', {
      source: 'jest',
      content: 'validated',
    });
    await service.executeTool(DEFAULT_WS_ID, 'search_agent_evidence', { query: 'validated' });
    await service.executeTool(DEFAULT_WS_ID, 'list_agent_evidence', { type: 'validation' });
    await service.executeTool(DEFAULT_WS_ID, 'verify_agent_evidence', {});

    expect(chatToolsService.toolRecordAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      source: 'jest',
      content: 'validated',
    });
    expect(chatToolsService.toolSearchAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      query: 'validated',
    });
    expect(chatToolsService.toolListAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      type: 'validation',
    });
    expect(chatToolsService.toolVerifyAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });
});
