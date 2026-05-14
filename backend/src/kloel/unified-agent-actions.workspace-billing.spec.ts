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
