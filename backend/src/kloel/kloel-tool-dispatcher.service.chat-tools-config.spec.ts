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

import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { DEFAULT_WS_ID } from './kloel-tool-dispatcher.service.fixtures';
import type { DispatcherChatToolsMock } from './kloel-tool-dispatcher.service.fixtures';
import {
  buildChatToolsHarness,
  objectContaining,
  stringMatching,
  stringContaining,
} from './kloel-tool-dispatcher.service.chat-tools.spec-setup';

describe('KloelToolDispatcherService — chat tools routing (config & policy)', () => {
  let service: KloelToolDispatcherService;
  let chatToolsService: DispatcherChatToolsMock;

  beforeEach(async () => {
    const harness = await buildChatToolsHarness();
    service = harness.service;
    chatToolsService = harness.chatToolsService;
  });

  afterEach(() => {
    jest.clearAllMocks();
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
});
