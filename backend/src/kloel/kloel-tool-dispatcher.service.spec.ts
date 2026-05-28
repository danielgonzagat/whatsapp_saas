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

jest.mock('./smart-payment.service', () => ({
  SmartPaymentService: class MockSmartPaymentService {},
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
import { SelfHealthService } from './self-awareness/self-health.service';
import { SelfGapsService } from './self-awareness/self-gaps.service';
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
  createSelfHealthMock,
  createSelfGapsMock,
  createCapRegistryV2Mock,
  createSmartPaymentMock,
  DEFAULT_WS_ID,
} from './kloel-tool-dispatcher.service.fixtures';
import { SmartPaymentService } from './smart-payment.service';
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
  DispatcherSelfHealthMock,
  DispatcherSelfGapsMock,
  DispatcherCapRegistryV2Mock,
} from './kloel-tool-dispatcher.service.fixtures';

describe('KloelToolDispatcherService', () => {
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
  let selfHealthService: DispatcherSelfHealthMock;
  let selfGapsService: DispatcherSelfGapsMock;
  let capRegistryV2Service: DispatcherCapRegistryV2Mock;

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
    selfHealthService = createSelfHealthMock();
    selfGapsService = createSelfGapsMock();
    capRegistryV2Service = createCapRegistryV2Mock();

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
        { provide: SelfHealthService, useValue: selfHealthService },
        { provide: SelfGapsService, useValue: selfGapsService },
        { provide: CapabilityRegistryV2Service, useValue: capRegistryV2Service },
        { provide: SmartPaymentService, useValue: createSmartPaymentMock() },
      ],
    }).compile();

    service = module.get<KloelToolDispatcherService>(KloelToolDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('tenant isolation', () => {
    it('executeTool looks up workspace by correct ID', async () => {
      await service.executeTool('ws-tenant', 'save_product', { name: 'X', price: 1 });
      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where: { id: 'ws-tenant' },
        select: { id: true, providerSettings: true },
      });
    });

    it('executeTool passes workspaceId to sub-service', async () => {
      await service.executeTool('ws-tenant', 'list_products', {});
      expect(chatToolsService.toolListProducts).toHaveBeenCalledWith('ws-tenant');
    });
  });

  describe('error handling', () => {
    it('catches errors from sub-services and returns error result', async () => {
      chatToolsService.toolSaveProduct = jest.fn().mockRejectedValue(new Error('Save failed'));

      const result = await service.executeTool(DEFAULT_WS_ID, 'save_product', {
        name: 'X',
        price: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Save failed');
    });

    it('catches non-Error exceptions', async () => {
      chatToolsService.toolSaveProduct = jest.fn().mockRejectedValue('string error');

      const result = await service.executeTool(DEFAULT_WS_ID, 'save_product', {
        name: 'X',
        price: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });

    it('returns workspace_not_found when findUnique returns null', async () => {
      prisma.workspace.findUnique.mockResolvedValueOnce(null);

      const result = await service.executeTool('unknown-ws', 'save_product', {
        name: 'X',
        price: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace_not_found');
    });
  });

  describe('self-awareness meta capabilities', () => {
    describe('self.capabilities', () => {
      it('returns the live CapabilityRegistryV2 manifest instead of a hardcoded list', async () => {
        (capRegistryV2Service as { list: jest.Mock }).list = jest.fn().mockReturnValue([
          {
            id: 'self.capabilities',
            title: 'Listar capacidades',
            category: 'SELF_AWARENESS',
            tier: 0,
            requiresConfirmation: false,
            requiredPermissions: [],
            surface: ['dashboard-chat'],
            maturity: 'verified',
          },
          {
            id: 'products.create',
            title: 'Criar produto',
            category: 'MUTATION_SAFE',
            tier: 1,
            requiresConfirmation: true,
            requiredPermissions: ['product:write'],
            surface: ['dashboard-chat'],
            maturity: 'testable',
          },
          {
            id: 'sales.create_pix',
            title: 'Gerar PIX',
            category: 'MUTATION_SENSITIVE',
            tier: 5,
            requiresConfirmation: true,
            requiredPermissions: ['sale:write'],
            surface: ['dashboard-chat'],
            maturity: 'verified',
            executionRail: {
              provider: 'mercadopago',
              paymentMethod: 'PIX',
              providerMethod: 'pix',
              providerService: 'MercadoPagoPixChargeService.create',
              webhookPath: '/webhooks/mercadopago',
              proofFields: ['saleId', 'externalPaymentId', 'pixCopiaECola', 'pixQrCode'],
            },
          },
        ]);

        const result = await service.executeTool(DEFAULT_WS_ID, 'self.capabilities', {});

        expect(result.success).toBe(true);
        expect((capRegistryV2Service as { list: jest.Mock }).list).toHaveBeenCalledTimes(1);
        expect(result.capabilities).toEqual([
          'self.capabilities',
          'products.create',
          'sales.create_pix',
        ]);
        expect(result.outputs).toEqual({
          total: 3,
          capabilities: [
            {
              id: 'self.capabilities',
              title: 'Listar capacidades',
              category: 'SELF_AWARENESS',
              tier: 0,
              requiresConfirmation: false,
              requiredPermissions: [],
              surface: ['dashboard-chat'],
              maturity: 'verified',
            },
            {
              id: 'products.create',
              title: 'Criar produto',
              category: 'MUTATION_SAFE',
              tier: 1,
              requiresConfirmation: true,
              requiredPermissions: ['product:write'],
              surface: ['dashboard-chat'],
              maturity: 'testable',
            },
            {
              id: 'sales.create_pix',
              title: 'Gerar PIX',
              category: 'MUTATION_SENSITIVE',
              tier: 5,
              requiresConfirmation: true,
              requiredPermissions: ['sale:write'],
              surface: ['dashboard-chat'],
              maturity: 'verified',
              executionRail: {
                provider: 'mercadopago',
                paymentMethod: 'PIX',
                providerMethod: 'pix',
                providerService: 'MercadoPagoPixChargeService.create',
                webhookPath: '/webhooks/mercadopago',
                proofFields: ['saleId', 'externalPaymentId', 'pixCopiaECola', 'pixQrCode'],
              },
            },
          ],
        });
      });
    });

    describe('self.audit_log', () => {
      it('returns recent audit entries', async () => {
        auditService.recentForWorkspace = jest.fn().mockResolvedValue([
          {
            id: 'al-1',
            action: 'CREATE_PRODUCT',
            agentId: 'agent-1',
            agent: { name: 'João', email: 'joao@example.com' },
            createdAt: new Date('2026-05-26T10:00:00Z'),
          },
        ]);

        const result = await service.executeTool(DEFAULT_WS_ID, 'self.audit_log', {});

        expect(result.success).toBe(true);
        expect(auditService.recentForWorkspace).toHaveBeenCalledWith(DEFAULT_WS_ID, 20);
        expect(result.outputs).toBeDefined();
        const outputs = result.outputs as { entries: unknown[] };
        expect(outputs.entries.length).toBe(1);
      });

      it('respects limit argument', async () => {
        auditService.recentForWorkspace = jest.fn().mockResolvedValue([]);

        await service.executeTool(DEFAULT_WS_ID, 'self.audit_log', { limit: 5 });

        expect(auditService.recentForWorkspace).toHaveBeenCalledWith(DEFAULT_WS_ID, 5);
      });
    });

    describe('self.explain', () => {
      it('describes a capability by ID', async () => {
        capRegistryV2Service.get = jest.fn().mockReturnValue({
          id: 'self.health',
          title: 'Saúde do sistema',
          description: 'Status de serviços',
          tier: 0,
          category: 'SELF_AWARENESS',
          requiresConfirmation: false,
          inputSchema: [],
          surface: ['dashboard-chat'],
        });

        const result = await service.executeTool(DEFAULT_WS_ID, 'self.explain', {
          capabilityId: 'self.health',
        });

        expect(result.success).toBe(true);
        const outputs = result.outputs as Record<string, unknown>;
        expect(outputs.title).toBe('Saúde do sistema');
      });

      it('returns error when capability not found', async () => {
        capRegistryV2Service.get = jest.fn().mockReturnValue(undefined);

        const result = await service.executeTool(DEFAULT_WS_ID, 'self.explain', {
          capabilityId: 'nonexistent',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('capability_not_found');
      });

      it('returns error when no capabilityId or lastReceiptId', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'self.explain', {});
        expect(result.success).toBe(false);
        expect(result.error).toBe('capabilityId_or_lastReceiptId_required');
      });
    });

    describe('self.gaps', () => {
      it('returns unwired capabilities', async () => {
        selfGapsService.diffRegistryVsDispatcher = jest.fn().mockReturnValue({
          unwired: [{ id: 'test.gap', title: 'Test Gap', tier: 1 }],
          wired: [],
        });

        const result = await service.executeTool(DEFAULT_WS_ID, 'self.gaps', {});

        expect(result.success).toBe(true);
        const outputs = result.outputs as { unwiredCount: number };
        expect(outputs.unwiredCount).toBe(1);
      });
    });

    describe('self.health', () => {
      it('returns health snapshot', async () => {
        selfHealthService.snapshot = jest.fn().mockResolvedValue({
          db: 'ok',
          redis: 'ok',
          whatsapp: 'unknown',
          llm: 'unknown',
          lastChecked: '2026-05-26T10:00:00.000Z',
        });

        const result = await service.executeTool(DEFAULT_WS_ID, 'self.health', {});

        expect(result.success).toBe(true);
        const outputs = result.outputs as { db: string };
        expect(outputs.db).toBe('ok');
      });
    });
  });
});
