import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../whatsapp/whatsapp.tokens', () => ({
  WHATSAPP_MESSAGING: Symbol('WHATSAPP_MESSAGING'),
}));

jest.mock('./unified-agent-actions-messaging.service', () => ({
  UnifiedAgentActionsMessagingService: jest.fn().mockImplementation(() => ({
    actionSendMessage: jest.fn(),
    actionSendMedia: jest.fn(),
    actionSendVoiceNote: jest.fn(),
    actionSendAudio: jest.fn(),
    actionTranscribeAudio: jest.fn(),
    buildWhatsAppSendOptions: jest.fn(),
  })),
}));

jest.mock('./unified-agent-actions-crm.service', () => ({
  UnifiedAgentActionsCrmService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('./unified-agent-actions-sales.service', () => ({
  UnifiedAgentActionsSalesService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('./unified-agent-actions-workspace.service', () => ({
  UnifiedAgentActionsWorkspaceService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('./unified-agent-actions-billing.service', () => ({
  UnifiedAgentActionsBillingService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('./unified-agent-actions-commerce.service', () => ({
  UnifiedAgentActionsCommerceService: jest.fn().mockImplementation(() => ({})),
}));

import { UnifiedAgentActionsService } from './unified-agent-actions.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { WHATSAPP_MESSAGING } from '../whatsapp/whatsapp.tokens';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import { UnifiedAgentActionsCrmService } from './unified-agent-actions-crm.service';
import { UnifiedAgentActionsSalesService } from './unified-agent-actions-sales.service';
import { UnifiedAgentActionsWorkspaceService } from './unified-agent-actions-workspace.service';
import { UnifiedAgentActionsBillingService } from './unified-agent-actions-billing.service';
import { UnifiedAgentActionsCommerceService } from './unified-agent-actions-commerce.service';
import { AuditService } from '../audit/audit.service';

type ActionsPrismaMock = {
  autopilotEvent: { create: jest.Mock };
  document: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

describe('UnifiedAgentActionsService', () => {
  let service: UnifiedAgentActionsService;
  let prisma: ActionsPrismaMock;
  let storageService: Pick<StorageService, 'getSignedUrl'>;
  let whatsappService: { sendMessage: jest.Mock };
  let messaging: Pick<
    UnifiedAgentActionsMessagingService,
    | 'actionSendMessage'
    | 'actionSendMedia'
    | 'actionSendVoiceNote'
    | 'actionSendAudio'
    | 'actionTranscribeAudio'
    | 'buildWhatsAppSendOptions'
  >;
  let crm: Partial<UnifiedAgentActionsCrmService>;
  let sales: Partial<UnifiedAgentActionsSalesService>;
  let workspace: Partial<UnifiedAgentActionsWorkspaceService>;
  let billing: Partial<UnifiedAgentActionsBillingService>;
  let commerce: Partial<UnifiedAgentActionsCommerceService>;
  let auditService: Pick<AuditService, 'logWithTx'>;

  const wsId = 'ws-1';
  const contactId = 'contact-1';
  const phone = '5511999999999';

  beforeEach(async () => {
    prisma = {
      autopilotEvent: { create: jest.fn().mockResolvedValue({}) },
      document: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest
        .fn()
        .mockImplementation((fnOrArg: unknown) =>
          typeof fnOrArg === 'function' ? fnOrArg(prisma) : Promise.resolve(undefined),
        ),
    };
    storageService = {
      getSignedUrl: jest.fn().mockReturnValue('https://signed.url/doc.pdf'),
    };
    whatsappService = { sendMessage: jest.fn().mockResolvedValue({ success: true }) };
    messaging = {
      actionSendMessage: jest.fn().mockResolvedValue({ success: true }),
      actionSendMedia: jest.fn().mockResolvedValue({ success: true }),
      actionSendVoiceNote: jest.fn().mockResolvedValue({ success: true }),
      actionSendAudio: jest.fn().mockResolvedValue({ success: true }),
      actionTranscribeAudio: jest.fn().mockResolvedValue({ success: true }),
      buildWhatsAppSendOptions: jest.fn().mockReturnValue({}),
    };
    crm = {
      actionUpdateLeadStatus: jest.fn().mockResolvedValue({ success: true }),
      actionAddTag: jest.fn().mockResolvedValue({ success: true }),
      actionScheduleFollowup: jest.fn().mockResolvedValue({ success: true }),
      actionTransferToHuman: jest.fn().mockResolvedValue({ success: true }),
      actionSearchKnowledgeBase: jest.fn().mockResolvedValue({ success: true }),
      actionTriggerFlow: jest.fn().mockResolvedValue({ success: true }),
      actionLogEvent: jest.fn().mockResolvedValue({ success: true }),
      actionConnectWhatsApp: jest.fn().mockResolvedValue({ success: true }),
      actionImportContacts: jest.fn().mockResolvedValue({ success: true }),
    };
    sales = {
      actionApplyDiscount: jest.fn().mockResolvedValue({ success: true }),
      actionHandleObjection: jest.fn().mockResolvedValue({ success: true }),
      actionQualifyLead: jest.fn().mockResolvedValue({ success: true }),
      actionScheduleMeeting: jest.fn().mockResolvedValue({ success: true }),
      actionAntiChurn: jest.fn().mockResolvedValue({ success: true }),
      actionReactivateGhost: jest.fn().mockResolvedValue({ success: true }),
    };
    workspace = {
      actionCreateProduct: jest.fn().mockResolvedValue({ success: true }),
      actionUpdateProduct: jest.fn().mockResolvedValue({ success: true }),
      actionCreateFlow: jest.fn().mockResolvedValue({ success: true }),
      actionUpdateWorkspaceSettings: jest.fn().mockResolvedValue({ success: true }),
      actionCreateBroadcast: jest.fn().mockResolvedValue({ success: true }),
      actionConfigureAIPersona: jest.fn().mockResolvedValue({ success: true }),
      actionToggleAutopilot: jest.fn().mockResolvedValue({ success: true }),
      actionCreateFlowFromDescription: jest.fn().mockResolvedValue({ success: true }),
      actionScheduleCampaign: jest.fn().mockResolvedValue({ success: true }),
      actionGetWorkspaceStatus: jest.fn().mockResolvedValue({ success: true }),
    };
    billing = {
      actionGetAnalytics: jest.fn().mockResolvedValue({ success: true }),
      actionGenerateSalesFunnel: jest.fn().mockResolvedValue({ success: true }),
      actionUpdateBillingInfo: jest.fn().mockResolvedValue({ success: true }),
      actionGetBillingStatus: jest.fn().mockResolvedValue({ success: true }),
      actionChangePlan: jest.fn().mockResolvedValue({ success: true }),
      getProductPlans: jest.fn().mockResolvedValue([]),
      getProductAIConfig: jest.fn().mockResolvedValue(null),
      getProductReviews: jest.fn().mockResolvedValue([]),
      getProductUrls: jest.fn().mockResolvedValue([]),
      validateCoupon: jest.fn().mockResolvedValue({ valid: true }),
    };
    commerce = {
      actionSendProductInfo: jest.fn().mockResolvedValue({ success: true }),
      actionCreatePaymentLink: jest
        .fn()
        .mockResolvedValue({ success: true, paymentUrl: 'https://pay.test' }),
    };
    auditService = { logWithTx: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedAgentActionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storageService },
        { provide: WHATSAPP_MESSAGING, useValue: whatsappService },
        { provide: UnifiedAgentActionsMessagingService, useValue: messaging },
        { provide: UnifiedAgentActionsCrmService, useValue: crm },
        { provide: UnifiedAgentActionsSalesService, useValue: sales },
        { provide: UnifiedAgentActionsWorkspaceService, useValue: workspace },
        { provide: UnifiedAgentActionsBillingService, useValue: billing },
        { provide: UnifiedAgentActionsCommerceService, useValue: commerce },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<UnifiedAgentActionsService>(UnifiedAgentActionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logAutopilotEvent', () => {
    it('creates autopilotEvent for successful action', async () => {
      await service.logAutopilotEvent(wsId, contactId, 'send_message', {}, { success: true });

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: wsId,
            contactId,
            intent: 'TOOL_CALL',
            action: 'send_message',
            status: 'completed',
          }),
        }),
      );
    });

    it('logs failed status when result has success: false', async () => {
      await service.logAutopilotEvent(wsId, contactId, 'bad_action', {}, { success: false });

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });

    it('handles Prisma error gracefully', async () => {
      prisma.autopilotEvent.create.mockRejectedValue({ code: 'P2003' });

      await expect(
        service.logAutopilotEvent(wsId, contactId, 'test', {}, { success: true }),
      ).resolves.toBeUndefined();
    });
  });

  describe('actionSendDocument', () => {
    it('returns error when no url or documentName', async () => {
      const result = await service.actionSendDocument(wsId, phone, {});

      expect(result.success).toBe(false);
    });

    it('sends document by name', async () => {
      prisma.document.findFirst.mockResolvedValue({
        id: 'd-1',
        name: 'Boleto',
        filePath: '/files/boleto.pdf',
        fileName: 'boleto.pdf',
        description: 'Seu boleto',
        isActive: true,
      });

      const result = await service.actionSendDocument(wsId, phone, {
        documentName: 'Boleto',
      });

      expect(result.success).toBe(true);
      expect(result.documentName).toBe('Boleto');
      expect(result.sent).toBe(true);
      expect(storageService.getSignedUrl).toHaveBeenCalled();
      expect(whatsappService.sendMessage).toHaveBeenCalled();
    });

    it('returns error when document not found', async () => {
      const result = await service.actionSendDocument(wsId, phone, {
        documentName: 'Nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('não encontrado');
    });

    it('sends document by direct URL', async () => {
      const result = await service.actionSendDocument(wsId, phone, {
        url: 'https://example.com/doc.pdf',
        caption: 'Aqui está',
      });

      expect(result.success).toBe(true);
      expect(prisma.document.findFirst).not.toHaveBeenCalled();
    });

    it('returns error when sendMessage fails', async () => {
      whatsappService.sendMessage.mockResolvedValue({ error: true, message: 'send failed' });

      const result = await service.actionSendDocument(wsId, phone, {
        url: 'https://example.com/doc.pdf',
      });

      expect(result.success).toBe(false);
    });

    it('handles unexpected errors', async () => {
      whatsappService.sendMessage.mockRejectedValue(new Error('network error'));

      const result = await service.actionSendDocument(wsId, phone, {
        url: 'https://example.com/doc.pdf',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('delegation to sub-services', () => {
    it('actionSendMessage delegates to messaging service', async () => {
      await service.actionSendMessage(wsId, phone, { message: 'Oi' });
      expect(messaging.actionSendMessage).toHaveBeenCalledWith(
        wsId,
        phone,
        { message: 'Oi' },
        undefined,
      );
    });

    it('actionSendMedia delegates to messaging service', async () => {
      await service.actionSendMedia(wsId, phone, { url: 'http://img' });
      expect(messaging.actionSendMedia).toHaveBeenCalledWith(
        wsId,
        phone,
        { url: 'http://img' },
        undefined,
      );
    });

    it('actionSendVoiceNote delegates to messaging service', async () => {
      await service.actionSendVoiceNote(wsId, phone, { url: 'http://audio' });
      expect(messaging.actionSendVoiceNote).toHaveBeenCalledWith(
        wsId,
        phone,
        { url: 'http://audio' },
        undefined,
      );
    });

    it('actionSendAudio delegates to messaging service', async () => {
      await service.actionSendAudio(wsId, phone, { url: 'http://audio' });
      expect(messaging.actionSendAudio).toHaveBeenCalledWith(
        wsId,
        phone,
        { url: 'http://audio' },
        undefined,
      );
    });

    it('actionTranscribeAudio delegates to messaging service', async () => {
      await service.actionTranscribeAudio(wsId, { audioUrl: 'https://example.com/audio.ogg' });
      expect(messaging.actionTranscribeAudio).toHaveBeenCalledWith(wsId, {
        audioUrl: 'https://example.com/audio.ogg',
      });
    });

    it('actionSendProductInfo delegates to commerce service', async () => {
      await service.actionSendProductInfo(wsId, phone, { productId: 'p-1' });
      expect(commerce.actionSendProductInfo).toHaveBeenCalledWith(
        wsId,
        phone,
        { productId: 'p-1' },
        undefined,
      );
    });

    it('actionUpdateLeadStatus delegates to crm service', async () => {
      await service.actionUpdateLeadStatus(wsId, contactId, { status: 'qualified' });
      expect(crm.actionUpdateLeadStatus).toHaveBeenCalledWith(wsId, contactId, {
        status: 'qualified',
      });
    });

    it('actionAddTag delegates to crm service', async () => {
      await service.actionAddTag(wsId, contactId, { tag: 'vip' });
      expect(crm.actionAddTag).toHaveBeenCalledWith(wsId, contactId, { tag: 'vip' });
    });

    it('actionScheduleFollowup delegates to crm service', async () => {
      await service.actionScheduleFollowup(wsId, contactId, phone, { delayHours: 1 });
      expect(crm.actionScheduleFollowup).toHaveBeenCalledWith(
        wsId,
        contactId,
        phone,
        { delayHours: 1 },
        undefined,
      );
    });

    it('actionTransferToHuman delegates to crm service', async () => {
      await service.actionTransferToHuman(wsId, contactId, { reason: 'complex' });
      expect(crm.actionTransferToHuman).toHaveBeenCalledWith(
        wsId,
        contactId,
        { reason: 'complex' },
        undefined,
      );
    });

    it('actionSearchKnowledgeBase delegates to crm service', async () => {
      await service.actionSearchKnowledgeBase(wsId, { query: 'how to' });
      expect(crm.actionSearchKnowledgeBase).toHaveBeenCalledWith(wsId, { query: 'how to' });
    });

    it('actionTriggerFlow delegates to crm service', async () => {
      await service.actionTriggerFlow(wsId, phone, { flowId: 'f-1' });
      expect(crm.actionTriggerFlow).toHaveBeenCalledWith(wsId, phone, { flowId: 'f-1' });
    });

    it('actionLogEvent delegates to crm service', async () => {
      await service.actionLogEvent(wsId, contactId, { event: 'click' });
      expect(crm.actionLogEvent).toHaveBeenCalledWith(wsId, contactId, { event: 'click' });
    });

    it('actionConnectWhatsApp delegates to crm service', async () => {
      await service.actionConnectWhatsApp(wsId, {});
      expect(crm.actionConnectWhatsApp).toHaveBeenCalledWith(wsId, {});
    });

    it('actionImportContacts delegates to crm service', async () => {
      await service.actionImportContacts(wsId, {});
      expect(crm.actionImportContacts).toHaveBeenCalledWith(wsId, {});
    });

    it('actionCreateProduct delegates to workspace service', async () => {
      await service.actionCreateProduct(wsId, { name: 'P', price: 1 });
      expect(workspace.actionCreateProduct).toHaveBeenCalledWith(wsId, { name: 'P', price: 1 });
    });

    it('actionUpdateProduct delegates to workspace service', async () => {
      await service.actionUpdateProduct(wsId, { productId: 'p-1' });
      expect(workspace.actionUpdateProduct).toHaveBeenCalledWith(wsId, { productId: 'p-1' });
    });

    it('actionCreateFlow delegates to workspace service', async () => {
      await service.actionCreateFlow(wsId, { name: 'Flow' });
      expect(workspace.actionCreateFlow).toHaveBeenCalledWith(wsId, { name: 'Flow' });
    });

    it('actionUpdateWorkspaceSettings delegates to workspace service', async () => {
      await service.actionUpdateWorkspaceSettings(wsId, { businessName: 'A' });
      expect(workspace.actionUpdateWorkspaceSettings).toHaveBeenCalledWith(wsId, {
        businessName: 'A',
      });
    });

    it('actionCreateBroadcast delegates to workspace service', async () => {
      await service.actionCreateBroadcast(wsId, { name: 'B' });
      expect(workspace.actionCreateBroadcast).toHaveBeenCalledWith(wsId, { name: 'B' }, undefined);
    });

    it('actionConfigureAIPersona delegates to workspace service', async () => {
      await service.actionConfigureAIPersona(wsId, { tone: 'formal' });
      expect(workspace.actionConfigureAIPersona).toHaveBeenCalledWith(wsId, { tone: 'formal' });
    });

    it('actionToggleAutopilot delegates to workspace service', async () => {
      await service.actionToggleAutopilot(wsId, { enabled: true });
      expect(workspace.actionToggleAutopilot).toHaveBeenCalledWith(wsId, { enabled: true });
    });

    it('actionCreateFlowFromDescription delegates to workspace service', async () => {
      const openai = {};
      await service.actionCreateFlowFromDescription(wsId, { description: 'd' }, openai, 'm1', 'm2');
      expect(workspace.actionCreateFlowFromDescription).toHaveBeenCalledWith(
        wsId,
        { description: 'd' },
        openai,
        'm1',
        'm2',
      );
    });

    it('actionScheduleCampaign delegates to workspace service', async () => {
      await service.actionScheduleCampaign(wsId, { campaignId: 'c-1' });
      expect(workspace.actionScheduleCampaign).toHaveBeenCalledWith(wsId, { campaignId: 'c-1' });
    });

    it('actionGetWorkspaceStatus delegates to workspace service', async () => {
      await service.actionGetWorkspaceStatus(wsId, {});
      expect(workspace.actionGetWorkspaceStatus).toHaveBeenCalledWith(wsId, {});
    });

    it('actionGetAnalytics delegates to billing service', async () => {
      await service.actionGetAnalytics(wsId, { period: 'today' });
      expect(billing.actionGetAnalytics).toHaveBeenCalledWith(wsId, { period: 'today' });
    });

    it('actionGenerateSalesFunnel delegates to billing service', async () => {
      await service.actionGenerateSalesFunnel(wsId, {});
      expect(billing.actionGenerateSalesFunnel).toHaveBeenCalledWith(wsId, {});
    });

    it('actionUpdateBillingInfo delegates to billing service', async () => {
      await service.actionUpdateBillingInfo(wsId, {});
      expect(billing.actionUpdateBillingInfo).toHaveBeenCalledWith(wsId, {});
    });

    it('actionGetBillingStatus delegates to billing service', async () => {
      await service.actionGetBillingStatus(wsId);
      expect(billing.actionGetBillingStatus).toHaveBeenCalledWith(wsId);
    });

    it('actionChangePlan delegates to billing service', async () => {
      await service.actionChangePlan(wsId, { plan: 'pro' });
      expect(billing.actionChangePlan).toHaveBeenCalledWith(wsId, { plan: 'pro' });
    });

    it('actionApplyDiscount delegates to sales service', async () => {
      await service.actionApplyDiscount(wsId, contactId, phone, { discountPercent: 10 });
      expect(sales.actionApplyDiscount).toHaveBeenCalledWith(
        wsId,
        contactId,
        phone,
        { discountPercent: 10 },
        undefined,
      );
    });

    it('actionHandleObjection delegates to sales service', async () => {
      await service.actionHandleObjection(wsId, contactId, phone, { objectionType: 'price' });
      expect(sales.actionHandleObjection).toHaveBeenCalledWith(
        wsId,
        contactId,
        phone,
        { objectionType: 'price' },
        undefined,
      );
    });

    it('actionQualifyLead delegates to sales service', async () => {
      await service.actionQualifyLead(wsId, contactId, phone, {});
      expect(sales.actionQualifyLead).toHaveBeenCalledWith(wsId, contactId, phone, {}, undefined);
    });

    it('actionScheduleMeeting delegates to sales service', async () => {
      await service.actionScheduleMeeting(wsId, contactId, phone, { type: 'demo' });
      expect(sales.actionScheduleMeeting).toHaveBeenCalledWith(
        wsId,
        contactId,
        phone,
        { type: 'demo' },
        undefined,
      );
    });

    it('actionAntiChurn delegates to sales service', async () => {
      await service.actionAntiChurn(wsId, contactId, phone, { strategy: 'discount' });
      expect(sales.actionAntiChurn).toHaveBeenCalledWith(
        wsId,
        contactId,
        phone,
        { strategy: 'discount' },
        undefined,
      );
    });

    it('actionReactivateGhost delegates to sales service', async () => {
      await service.actionReactivateGhost(wsId, contactId, phone, { daysSilent: 7 });
      expect(sales.actionReactivateGhost).toHaveBeenCalledWith(
        wsId,
        contactId,
        phone,
        { daysSilent: 7 },
        undefined,
      );
    });

    it('actionCreatePaymentLink delegates to commerce and audits', async () => {
      const result = await service.actionCreatePaymentLink(wsId, phone, { amount: 99 });
      expect(result.success).toBe(true);
      expect(commerce.actionCreatePaymentLink).toHaveBeenCalled();
      expect(auditService.logWithTx).toHaveBeenCalled();
    });

    it('getProductPlans delegates to billing', async () => {
      await service.getProductPlans('p-1');
      expect(billing.getProductPlans).toHaveBeenCalledWith('p-1');
    });

    it('getProductAIConfig delegates to billing', async () => {
      await service.getProductAIConfig('p-1');
      expect(billing.getProductAIConfig).toHaveBeenCalledWith('p-1');
    });

    it('getProductReviews delegates to billing', async () => {
      await service.getProductReviews('p-1');
      expect(billing.getProductReviews).toHaveBeenCalledWith('p-1');
    });

    it('getProductUrls delegates to billing', async () => {
      await service.getProductUrls('p-1');
      expect(billing.getProductUrls).toHaveBeenCalledWith('p-1');
    });

    it('validateCoupon delegates to billing', async () => {
      await service.validateCoupon('p-1', 'CODE10');
      expect(billing.validateCoupon).toHaveBeenCalledWith('p-1', 'CODE10');
    });
  });

  describe('workspace isolation', () => {
    it('actionSendDocument scopes document lookup to workspaceId', async () => {
      await service.actionSendDocument('ws-tenant', phone, { documentName: 'Doc' });
      expect(prisma.document.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-tenant' }) }),
      );
    });
  });

  describe('error handling', () => {
    it('actionSendDocument handles errors gracefully', async () => {
      whatsappService.sendMessage.mockRejectedValue(new Error('network error'));
      const result = await service.actionSendDocument(wsId, phone, { url: 'http://x' });
      expect(result.success).toBe(false);
    });

    it('actionCreatePaymentLink handles audit failure gracefully', async () => {
      prisma.$transaction.mockRejectedValue(new Error('audit failed'));
      const result = await service.actionCreatePaymentLink(wsId, phone, { amount: 99 });
      expect(result.success).toBe(true);
    });
  });
});
