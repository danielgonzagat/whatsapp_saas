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
});
