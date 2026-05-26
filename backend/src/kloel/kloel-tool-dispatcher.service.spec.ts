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
});
