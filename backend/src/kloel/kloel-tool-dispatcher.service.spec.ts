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
      ],
    }).compile();

    service = module.get<KloelToolDispatcherService>(KloelToolDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeTool', () => {
    it('returns error when workspaceId is empty', async () => {
      const result = await service.executeTool('', 'save_product', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace_id_required');
    });

    it('returns error when workspace not found', async () => {
      prisma.workspace.findUnique.mockResolvedValueOnce(null);

      const result = await service.executeTool('unknown-ws', 'save_product', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace_not_found');
    });

    it('returns error when billing is suspended', async () => {
      prisma.workspace.findUnique.mockResolvedValueOnce({
        id: DEFAULT_WS_ID,
        providerSettings: { billingSuspended: true },
      });

      const result = await service.executeTool(DEFAULT_WS_ID, 'save_product', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('billing_suspended');
    });

    it('returns error for unknown tool', async () => {
      const result = await service.executeTool(DEFAULT_WS_ID, 'unknown_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Ferramenta desconhecida');
    });

    describe('whatsapp tools routing', () => {
      it('routes connect_whatsapp to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'connect_whatsapp', {});
        expect(whatsappToolsService.toolConnectWhatsapp).toHaveBeenCalledWith(DEFAULT_WS_ID);
      });

      it('routes get_whatsapp_status to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'get_whatsapp_status', {});
        expect(whatsappToolsService.toolGetWhatsAppStatus).toHaveBeenCalledWith(DEFAULT_WS_ID);
      });

      it('routes send_whatsapp_message to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'send_whatsapp_message', {
          phone: '123',
          message: 'Hi',
        });
        expect(whatsappToolsService.toolSendWhatsAppMessage).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          phone: '123',
          message: 'Hi',
        });
      });

      it('routes list_whatsapp_contacts to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'list_whatsapp_contacts', {});
        expect(whatsappToolsService.toolListWhatsAppContacts).toHaveBeenCalledWith(
          DEFAULT_WS_ID,
          {},
        );
      });

      it('routes send_audio to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'send_audio', {
          phone: '123',
          audioUrl: 'url',
        });
        expect(whatsappToolsService.toolSendAudio).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          phone: '123',
          audioUrl: 'url',
        });
      });

      it('routes transcribe_audio to whatsappToolsService', async () => {
        await service.executeTool(DEFAULT_WS_ID, 'transcribe_audio', { audioUrl: 'url' });
        expect(whatsappToolsService.toolTranscribeAudio).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          audioUrl: 'url',
        });
      });
    });

    describe('business config tools routing', () => {
      it('routes list_leads to bizConfigToolsService', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'list_leads', {});
        expect(result.success).toBe(true);
        expect(bizConfigToolsService.toolListLeads).toHaveBeenCalledWith(DEFAULT_WS_ID, {});
      });

      it('routes get_lead_details to bizConfigToolsService', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'get_lead_details', {
          leadId: 'l-1',
        });
        expect(result.success).toBe(true);
        expect(bizConfigToolsService.toolGetLeadDetails).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          leadId: 'l-1',
        });
      });

      it('routes save_business_info to bizConfigToolsService', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'save_business_info', {
          name: 'Biz',
        });
        expect(result.success).toBe(true);
        expect(bizConfigToolsService.toolSaveBusinessInfo).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          name: 'Biz',
        });
      });

      it('routes change_plan to bizConfigToolsService', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'change_plan', { plan: 'pro' });
        expect(result.success).toBe(true);
      });
    });

    describe('create_payment_link', () => {
      it('routes create_payment_link and writes audit log', async () => {
        chatToolsService.toolCreatePaymentLink = jest.fn().mockResolvedValue({
          success: true,
          paymentUrl: 'https://pay.test/checkout',
          paymentId: 'pay-1',
        });

        const result = await service.executeTool(DEFAULT_WS_ID, 'create_payment_link', {
          amount: 99.9,
          description: 'Produto',
        });

        expect(result.success).toBe(true);
        expect(chatToolsService.toolCreatePaymentLink).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          amount: 99.9,
          description: 'Produto',
        });
        expect(prisma.$transaction).toHaveBeenCalled();
      });
    });

    describe('search_web', () => {
      it('routes search_web to composer service', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'search_web', {
          query: 'test query',
        });

        expect(result.success).toBe(true);
        expect(composerService.searchWeb).toHaveBeenCalledWith('test query');
        expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith(DEFAULT_WS_ID);
      });

      it('returns error for missing query', async () => {
        const result = await service.executeTool(DEFAULT_WS_ID, 'search_web', {});
        expect(result.success).toBe(false);
        expect(result.error).toBe('missing_query');
      });
    });
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
        (capRegistryV2Service as unknown as { list: jest.Mock }).list = jest.fn().mockReturnValue([
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
        ]);

        const result = await service.executeTool(DEFAULT_WS_ID, 'self.capabilities', {});

        expect(result.success).toBe(true);
        expect((capRegistryV2Service as unknown as { list: jest.Mock }).list).toHaveBeenCalledTimes(
          1,
        );
        expect(result.capabilities).toEqual(['self.capabilities', 'products.create']);
        expect(result.outputs).toEqual({
          total: 2,
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
        selfGapsService.diffRegistryVsDispatcher = jest.fn().mockResolvedValue({
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
