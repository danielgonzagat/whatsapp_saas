import { Test, TestingModule } from '@nestjs/testing';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelToolExecutorBillingService } from './kloel-tool-executor-billing.service';
import { KloelToolExecutorCrmService } from './kloel-tool-executor-crm.service';
import { KloelToolExecutorWhatsAppService } from './kloel-tool-executor-whatsapp.service';
import { KloelToolExecutorService } from './kloel-tool-executor.service';
import { SmartPaymentService } from './smart-payment.service';

jest.mock('./kloel-tool-executor.helpers', () => ({
  toolSaveProduct: jest.fn().mockResolvedValue({ success: true, message: 'Produto salvo.' }),
  toolListProducts: jest.fn().mockResolvedValue({ success: true, products: [] }),
  toolDeleteProduct: jest.fn().mockResolvedValue({ success: true }),
  toolSetBrandVoice: jest.fn().mockResolvedValue({ success: true }),
  toolRememberUserInfo: jest.fn().mockResolvedValue({ success: true }),
  toolCreateFlow: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('./openai-wrapper', () => ({}));
jest.mock('../lib/openai-models', () => {
  const actual = jest.requireActual<typeof import('../lib/openai-models')>('../lib/openai-models');
  return {
    ...actual,
    resolveBackendOpenAIModel: jest.fn().mockReturnValue(actual.CANONICAL_MODEL_IDS.openAiTextOmni),
  };
});
jest.mock('../common/products/legacy-products.util', () => ({
  filterLegacyProducts: jest.fn((products: unknown[]) => products),
}));

type ExecutorPrismaMock = {
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

function isTransactionCallback(arg: unknown): arg is (tx: ExecutorPrismaMock) => unknown {
  return typeof arg === 'function';
}

async function buildSubject(): Promise<{
  service: KloelToolExecutorService;
  prisma: ExecutorPrismaMock;
  whatsappTools: Partial<KloelToolExecutorWhatsAppService>;
  crmTools: Partial<KloelToolExecutorCrmService>;
}> {
  const prisma: ExecutorPrismaMock = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation((arg: unknown) => {
      if (isTransactionCallback(arg)) {
        return arg(prisma);
      }
      return Promise.resolve(undefined);
    }),
  };
  const whatsappTools: Partial<KloelToolExecutorWhatsAppService> = {
    toolConnectWhatsapp: jest.fn().mockResolvedValue({ success: true }),
    toolSendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
  };
  const crmTools: Partial<KloelToolExecutorCrmService> = {
    toolListLeads: jest.fn().mockResolvedValue({ success: true, leads: [] }),
  };
  const planLimits = {
    ensureDailyMessageQuota: jest.fn().mockResolvedValue(undefined),
    ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
    trackAiUsage: jest.fn().mockResolvedValue(undefined),
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      KloelToolExecutorService,
      { provide: PrismaService, useValue: prisma },
      { provide: SmartPaymentService, useValue: {} },
      { provide: PlanLimitsService, useValue: planLimits },
      { provide: KloelToolExecutorWhatsAppService, useValue: whatsappTools },
      { provide: KloelToolExecutorBillingService, useValue: {} },
      { provide: KloelToolExecutorCrmService, useValue: crmTools },
    ],
  }).compile();

  return {
    service: module.get<KloelToolExecutorService>(KloelToolExecutorService),
    prisma,
    whatsappTools,
    crmTools,
  };
}

describe('KloelToolExecutorService error and isolation paths', () => {
  const wsId = 'ws-exec-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns error for unknown tool name', async () => {
    const { service } = await buildSubject();

    const result = await service.executeTool(wsId, 'nonexistent_tool', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Ferramenta desconhecida');
  });

  it('catches errors and returns structured error result', async () => {
    const { service, whatsappTools } = await buildSubject();
    whatsappTools.toolSendWhatsAppMessage = jest
      .fn()
      .mockRejectedValue(new Error('WhatsApp timeout'));

    const result = await service.executeTool(wsId, 'send_whatsapp_message', {
      phone: '5511',
      message: 'Test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('WhatsApp timeout');
  });

  it('handles non-Error thrown values', async () => {
    const { service, whatsappTools } = await buildSubject();
    whatsappTools.toolConnectWhatsapp = jest.fn().mockRejectedValue('string error');

    const result = await service.executeTool(wsId, 'connect_whatsapp', {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('string error');
  });

  it('handles null/undefined thrown values gracefully', async () => {
    const { service, crmTools } = await buildSubject();
    crmTools.toolListLeads = jest.fn().mockRejectedValue(null);

    const result = await service.executeTool(wsId, 'list_leads', {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('unknown error');
  });

  it('toggle_autopilot queries providerSettings for correct workspace', async () => {
    const { service, prisma } = await buildSubject();

    await service.executeTool('ws-tenant', 'toggle_autopilot', { enabled: true });

    expect(prisma.workspace.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ws-tenant' } }),
    );
  });

  it('passes correct workspaceId to sub-services', async () => {
    const { service, crmTools } = await buildSubject();

    await service.executeTool('ws-tenant', 'list_leads', {});

    expect(crmTools.toolListLeads).toHaveBeenCalledWith('ws-tenant', {});
  });
});
