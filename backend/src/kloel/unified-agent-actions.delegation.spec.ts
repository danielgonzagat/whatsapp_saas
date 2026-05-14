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
  });
});
