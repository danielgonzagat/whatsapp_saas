import { Test, TestingModule } from '@nestjs/testing';
import { KloelToolExecutorService } from './kloel-tool-executor.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelToolExecutorBillingService } from './kloel-tool-executor-billing.service';
import { KloelToolExecutorCrmService } from './kloel-tool-executor-crm.service';
import { KloelToolExecutorWhatsAppService } from './kloel-tool-executor-whatsapp.service';
import { asProviderSettings } from '../whatsapp/provider-settings.types';

jest.mock('./kloel-tool-executor.helpers', () => ({
  toolSaveProduct: jest.fn().mockResolvedValue({ success: true, message: 'Produto salvo.' }),
  toolListProducts: jest.fn().mockResolvedValue({ success: true, products: [] }),
  toolDeleteProduct: jest.fn().mockResolvedValue({ success: true }),
  toolSetBrandVoice: jest.fn().mockResolvedValue({ success: true }),
  toolRememberUserInfo: jest.fn().mockResolvedValue({ success: true }),
  toolCreateFlow: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('./openai-wrapper', () => ({}));
jest.mock('../lib/openai-models', () => ({
  resolveBackendOpenAIModel: jest.fn().mockReturnValue('gpt-4o'),
}));
jest.mock('../common/products/legacy-products.util', () => ({
  filterLegacyProducts: jest.fn((products: unknown[]) => products),
}));

type ExecutorPrismaMock = {
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

describe('KloelToolExecutorService', () => {
  let service: KloelToolExecutorService;
  let prisma: ExecutorPrismaMock;
  let smartPayment: { createSmartPayment: jest.Mock };
  let planLimits: { ensureDailyMessageQuota: jest.Mock; ensureTokenBudget: jest.Mock; trackAiUsage: jest.Mock };
  let whatsappTools: Partial<KloelToolExecutorWhatsAppService>;
  let billingTools: Partial<KloelToolExecutorBillingService>;
  let crmTools: Partial<KloelToolExecutorCrmService>;

  const wsId = 'ws-exec-1';

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === 'function') return arg(prisma);
        return Promise.resolve(undefined);
      }),
    };

    smartPayment = {
      createSmartPayment: jest.fn().mockResolvedValue({
        paymentId: 'pay-1',
        paymentUrl: 'https://pay.test',
      }),
    };

    planLimits = {
      ensureDailyMessageQuota: jest.fn().mockResolvedValue(undefined),
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };

    whatsappTools = {
      toolConnectWhatsapp: jest.fn().mockResolvedValue({ success: true, connected: true }),
      toolGetWhatsAppStatus: jest.fn().mockResolvedValue({ success: true, connected: true }),
      toolSendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'm-1' }),
      toolListWhatsAppContacts: jest.fn().mockResolvedValue({ success: true, contacts: [] }),
      toolCreateWhatsAppContact: jest.fn().mockResolvedValue({ success: true }),
      toolListWhatsAppChats: jest.fn().mockResolvedValue({ success: true, chats: [] }),
      toolGetWhatsAppMessages: jest.fn().mockResolvedValue({ success: true, messages: [] }),
      toolGetWhatsAppBacklog: jest.fn().mockResolvedValue({ success: true }),
      toolSetWhatsAppPresence: jest.fn().mockResolvedValue({ success: true }),
      toolSyncWhatsAppHistory: jest.fn().mockResolvedValue({ success: true }),
      toolSendAudio: jest.fn().mockResolvedValue({ success: true }),
      toolSendDocument: jest.fn().mockResolvedValue({ success: true }),
      toolTranscribeAudio: jest.fn().mockResolvedValue({ success: true }),
    };

    billingTools = {
      toolUpdateBillingInfo: jest.fn().mockResolvedValue({ success: true, url: 'https://billing.test' }),
      toolGetBillingStatus: jest.fn().mockResolvedValue({ success: true, plan: 'FREE', status: 'ACTIVE' }),
      toolChangePlan: jest.fn().mockResolvedValue({ success: true, newPlan: 'PRO' }),
    };

    crmTools = {
      toolListFlows: jest.fn().mockResolvedValue({ success: true, flows: [] }),
      toolGetDashboardSummary: jest.fn().mockResolvedValue({ success: true, stats: {} }),
      toolSaveBusinessInfo: jest.fn().mockResolvedValue({ success: true }),
      toolSetBusinessHours: jest.fn().mockResolvedValue({ success: true }),
      toolCreateCampaign: jest.fn().mockResolvedValue({ success: true }),
      toolListLeads: jest.fn().mockResolvedValue({ success: true, leads: [] }),
      toolGetLeadDetails: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelToolExecutorService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmartPaymentService, useValue: smartPayment },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: KloelToolExecutorWhatsAppService, useValue: whatsappTools },
        { provide: KloelToolExecutorBillingService, useValue: billingTools },
        { provide: KloelToolExecutorCrmService, useValue: crmTools },
      ],
    }).compile();

    service = module.get<KloelToolExecutorService>(KloelToolExecutorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeTool routing', () => {
    it('routes save_product to helper', async () => {
      const result = await service.executeTool(wsId, 'save_product', { name: 'X', price: 10 });
      expect(result.success).toBe(true);
    });

    it('routes list_products to helper', async () => {
      const result = await service.executeTool(wsId, 'list_products', {});
      expect(result.success).toBe(true);
    });

    it('routes delete_product to helper', async () => {
      const result = await service.executeTool(wsId, 'delete_product', { productId: 'p-1' });
      expect(result.success).toBe(true);
    });

    it('routes toggle_autopilot — enables via transaction', async () => {
      const result = await service.executeTool(wsId, 'toggle_autopilot', { enabled: true });
      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('routes toggle_autopilot — blocks when billing suspended', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { billingSuspended: true },
      });

      const result = await service.executeTool(wsId, 'toggle_autopilot', { enabled: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain('suspenso');
    });

    it('routes set_brand_voice to helper', async () => {
      const result = await service.executeTool(wsId, 'set_brand_voice', { tone: 'casual' });
      expect(result.success).toBe(true);
    });

    it('routes remember_user_info to helper', async () => {
      const result = await service.executeTool(wsId, 'remember_user_info', { key: 'lang', value: 'pt' }, 'u-1');
      expect(result.success).toBe(true);
    });

    it('routes search_web — missing query', async () => {
      const result = await service.executeTool(wsId, 'search_web', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('missing_query');
    });

    it('routes search_web — no search function provided', async () => {
      const result = await service.executeTool(wsId, 'search_web', { query: 'test' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('web_search_unavailable');
    });

    it('routes search_web — executes with searchWebFn', async () => {
      const searchFn = jest.fn().mockResolvedValue({
        answer: 'Resultado',
        sources: [{ title: 'Site', url: 'https://test.com' }],
      });

      const result = await service.executeTool(wsId, 'search_web', { query: 'typescript' }, undefined, searchFn);

      expect(result.success).toBe(true);
      expect(result.summary).toBe('Resultado');
      expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith(wsId);
    });

    it('routes create_flow to helper', async () => {
      const result = await service.executeTool(wsId, 'create_flow', { name: 'Flow', trigger: 'welcome' });
      expect(result.success).toBe(true);
    });

    it('routes list_flows to crmTools', async () => {
      await service.executeTool(wsId, 'list_flows', {});
      expect(crmTools.toolListFlows).toHaveBeenCalledWith(wsId);
    });

    it('routes get_dashboard_summary to crmTools', async () => {
      await service.executeTool(wsId, 'get_dashboard_summary', { period: 'week' });
      expect(crmTools.toolGetDashboardSummary).toHaveBeenCalledWith(wsId, 'week');
    });

    it('routes save_business_info to crmTools', async () => {
      await service.executeTool(wsId, 'save_business_info', { businessName: 'Loja' });
      expect(crmTools.toolSaveBusinessInfo).toHaveBeenCalledWith(wsId, { businessName: 'Loja' });
    });

    it('routes set_business_hours to crmTools', async () => {
      await service.executeTool(wsId, 'set_business_hours', { weekdayStart: '09:00' });
      expect(crmTools.toolSetBusinessHours).toHaveBeenCalledWith(wsId, { weekdayStart: '09:00' });
    });

    it('routes create_campaign to crmTools', async () => {
      await service.executeTool(wsId, 'create_campaign', { name: 'Camp', message: 'msg' });
      expect(crmTools.toolCreateCampaign).toHaveBeenCalledWith(wsId, { name: 'Camp', message: 'msg' });
    });

    it('routes list_leads to crmTools', async () => {
      await service.executeTool(wsId, 'list_leads', {});
      expect(crmTools.toolListLeads).toHaveBeenCalledWith(wsId, {});
    });

    it('routes get_lead_details to crmTools', async () => {
      await service.executeTool(wsId, 'get_lead_details', { leadId: 'l-1' });
      expect(crmTools.toolGetLeadDetails).toHaveBeenCalledWith(wsId, { leadId: 'l-1' });
    });

    it('routes create_payment_link to SmartPaymentService', async () => {
      const result = await service.executeTool(wsId, 'create_payment_link', {
        amount: 99.9,
        description: 'Produto',
      });

      expect(result.success).toBe(true);
      expect(smartPayment.createSmartPayment).toHaveBeenCalledWith({
        workspaceId: wsId,
        amount: 99.9,
        productName: 'Produto',
        customerName: 'Cliente',
        phone: '',
      });
    });

    it('routes connect_whatsapp to whatsappTools', async () => {
      await service.executeTool(wsId, 'connect_whatsapp', {});
      expect(whatsappTools.toolConnectWhatsapp).toHaveBeenCalledWith(wsId);
    });

    it('routes get_whatsapp_status to whatsappTools', async () => {
      await service.executeTool(wsId, 'get_whatsapp_status', {});
      expect(whatsappTools.toolGetWhatsAppStatus).toHaveBeenCalledWith(wsId);
    });

    it('routes send_whatsapp_message to whatsappTools', async () => {
      await service.executeTool(wsId, 'send_whatsapp_message', { phone: '5511', message: 'Test' });
      expect(whatsappTools.toolSendWhatsAppMessage).toHaveBeenCalledWith(wsId, { phone: '5511', message: 'Test' });
    });

    it('routes list_whatsapp_contacts to whatsappTools', async () => {
      await service.executeTool(wsId, 'list_whatsapp_contacts', {});
      expect(whatsappTools.toolListWhatsAppContacts).toHaveBeenCalledWith(wsId, {});
    });

    it('routes create_whatsapp_contact to whatsappTools', async () => {
      await service.executeTool(wsId, 'create_whatsapp_contact', { phone: '5511' });
      expect(whatsappTools.toolCreateWhatsAppContact).toHaveBeenCalledWith(wsId, { phone: '5511' });
    });

    it('routes list_whatsapp_chats to whatsappTools', async () => {
      await service.executeTool(wsId, 'list_whatsapp_chats', {});
      expect(whatsappTools.toolListWhatsAppChats).toHaveBeenCalledWith(wsId, {});
    });

    it('routes get_whatsapp_messages to whatsappTools', async () => {
      await service.executeTool(wsId, 'get_whatsapp_messages', { chatId: 'c1' });
      expect(whatsappTools.toolGetWhatsAppMessages).toHaveBeenCalledWith(wsId, { chatId: 'c1' });
    });

    it('routes get_whatsapp_backlog to whatsappTools', async () => {
      await service.executeTool(wsId, 'get_whatsapp_backlog', {});
      expect(whatsappTools.toolGetWhatsAppBacklog).toHaveBeenCalledWith(wsId);
    });

    it('routes set_whatsapp_presence to whatsappTools', async () => {
      await service.executeTool(wsId, 'set_whatsapp_presence', { chatId: 'c1', presence: 'typing' });
      expect(whatsappTools.toolSetWhatsAppPresence).toHaveBeenCalledWith(wsId, { chatId: 'c1', presence: 'typing' });
    });

    it('routes sync_whatsapp_history to whatsappTools', async () => {
      await service.executeTool(wsId, 'sync_whatsapp_history', {});
      expect(whatsappTools.toolSyncWhatsAppHistory).toHaveBeenCalledWith(wsId, {});
    });

    it('routes send_audio to whatsappTools', async () => {
      await service.executeTool(wsId, 'send_audio', { phone: '5511', text: 'audio' });
      expect(whatsappTools.toolSendAudio).toHaveBeenCalledWith(wsId, { phone: '5511', text: 'audio' });
    });

    it('routes send_document to whatsappTools', async () => {
      await service.executeTool(wsId, 'send_document', { phone: '5511', url: 'https://cdn.test/doc.pdf' });
      expect(whatsappTools.toolSendDocument).toHaveBeenCalledWith(wsId, { phone: '5511', url: 'https://cdn.test/doc.pdf' });
    });

    it('routes send_voice_note to sendAudio on whatsappTools', async () => {
      await service.executeTool(wsId, 'send_voice_note', { phone: '5511', text: 'note' });
      expect(whatsappTools.toolSendAudio).toHaveBeenCalledWith(wsId, { phone: '5511', text: 'note' });
    });

    it('routes transcribe_audio to whatsappTools', async () => {
      await service.executeTool(wsId, 'transcribe_audio', { audioUrl: 'https://cdn.test/audio.mp3' });
      expect(whatsappTools.toolTranscribeAudio).toHaveBeenCalledWith(wsId, { audioUrl: 'https://cdn.test/audio.mp3' });
    });

    it('routes update_billing_info to billingTools', async () => {
      await service.executeTool(wsId, 'update_billing_info', { returnUrl: '/billing' });
      expect(billingTools.toolUpdateBillingInfo).toHaveBeenCalledWith(wsId, { returnUrl: '/billing' });
    });

    it('routes get_billing_status to billingTools', async () => {
      await service.executeTool(wsId, 'get_billing_status', {});
      expect(billingTools.toolGetBillingStatus).toHaveBeenCalledWith(wsId);
    });

    it('routes change_plan to billingTools', async () => {
      await service.executeTool(wsId, 'change_plan', { newPlan: 'pro' });
      expect(billingTools.toolChangePlan).toHaveBeenCalledWith(wsId, { newPlan: 'pro' });
    });
  });

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const result = await service.executeTool(wsId, 'nonexistent_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Ferramenta desconhecida');
    });
  });

  describe('error handling', () => {
    it('catches errors and returns structured error result', async () => {
      whatsappTools.toolSendWhatsAppMessage = jest.fn().mockRejectedValue(new Error('WhatsApp timeout'));

      const result = await service.executeTool(wsId, 'send_whatsapp_message', {
        phone: '5511',
        message: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('WhatsApp timeout');
    });

    it('handles non-Error thrown values', async () => {
      whatsappTools.toolConnectWhatsapp = jest.fn().mockRejectedValue('string error');

      const result = await service.executeTool(wsId, 'connect_whatsapp', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });

    it('handles null/undefined thrown values gracefully', async () => {
      crmTools.toolListLeads = jest.fn().mockRejectedValue(null);

      const result = await service.executeTool(wsId, 'list_leads', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('unknown error');
    });
  });

  describe('workspace isolation', () => {
    it('toggle_autopilot queries providerSettings for correct workspace', async () => {
      await service.executeTool('ws-tenant', 'toggle_autopilot', { enabled: true });
      expect(prisma.workspace.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ws-tenant' } }),
      );
    });

    it('passes correct workspaceId to sub-services', async () => {
      await service.executeTool('ws-tenant', 'list_leads', {});
      expect(crmTools.toolListLeads).toHaveBeenCalledWith('ws-tenant', {});
    });
  });
});
