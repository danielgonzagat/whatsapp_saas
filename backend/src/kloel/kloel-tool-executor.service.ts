import { Injectable, Logger } from '@nestjs/common';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';
import { KloelToolExecutorBillingService } from './kloel-tool-executor-billing.service';
import { KloelToolExecutorCrmService } from './kloel-tool-executor-crm.service';
import { KloelToolExecutorWhatsAppService } from './kloel-tool-executor-whatsapp.service';
import {
  toolSaveProduct,
  toolListProducts,
  toolDeleteProduct,
  toolSetBrandVoice,
  toolRememberUserInfo,
  toolCreateFlow,
} from './kloel-tool-executor.helpers';
export type * from './kloel-tool-executor.types';
import type {
  ToolResult,
  ToolSaveProductArgs,
  ToolDeleteProductArgs,
  ToolToggleAutopilotArgs,
  ToolSetBrandVoiceArgs,
  ToolRememberUserInfoArgs,
  ToolSearchWebArgs,
  ToolCreateFlowArgs,
  ToolDashboardSummaryArgs,
  ToolSendWhatsAppMessageArgs,
  ToolCreateWhatsAppContactArgs,
  ToolCreateCampaignArgs,
  ToolSendAudioArgs,
  ToolSendDocumentArgs,
  ToolChangePlanArgs,
} from './kloel-tool-executor.types';

type UnknownRecord = Record<string, unknown>;

/** Service that executes all AI-chat tool calls on behalf of KloelService. */
@Injectable()
export class KloelToolExecutorService {
  private readonly logger = new Logger(KloelToolExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smartPaymentService: SmartPaymentService,
    private readonly planLimits: PlanLimitsService,
    private readonly whatsappTools: KloelToolExecutorWhatsAppService,
    private readonly billingTools: KloelToolExecutorBillingService,
    private readonly crmTools: KloelToolExecutorCrmService,
  ) {}

  async executeTool(
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId?: string,
    searchWebFn?: (
      query: string,
    ) => Promise<{ answer: string; sources: Array<{ title: string; url: string }> }>,
  ): Promise<ToolResult> {
    this.logger.log(`Executando ferramenta: ${toolName}`, args);
    try {
      switch (toolName) {
        case 'save_product':
          return await this.toolSaveProduct(workspaceId, args as ToolSaveProductArgs);
        case 'list_products':
          return await this.toolListProducts(workspaceId);
        case 'delete_product':
          return await this.toolDeleteProduct(workspaceId, args);
        case 'toggle_autopilot':
          return await this.toolToggleAutopilot(workspaceId, args as ToolToggleAutopilotArgs);
        case 'set_brand_voice':
          return await this.toolSetBrandVoice(workspaceId, args as ToolSetBrandVoiceArgs);
        case 'remember_user_info':
          return await this.toolRememberUserInfo(
            workspaceId,
            args as ToolRememberUserInfoArgs,
            userId,
          );
        case 'search_web':
          return await this.toolSearchWeb(workspaceId, args as ToolSearchWebArgs, searchWebFn);
        case 'create_flow':
          return await this.toolCreateFlow(workspaceId, args as ToolCreateFlowArgs);
        case 'list_flows':
          return await this.crmTools.toolListFlows(workspaceId);
        case 'get_dashboard_summary':
          return await this.crmTools.toolGetDashboardSummary(
            workspaceId,
            (args as ToolDashboardSummaryArgs).period,
          );
        case 'save_business_info':
          return await this.crmTools.toolSaveBusinessInfo(workspaceId, args);
        case 'set_business_hours':
          return await this.crmTools.toolSetBusinessHours(workspaceId, args);
        case 'create_campaign':
          return await this.crmTools.toolCreateCampaign(
            workspaceId,
            args as ToolCreateCampaignArgs,
          );
        case 'list_leads':
          return await this.crmTools.toolListLeads(workspaceId, args);
        case 'get_lead_details':
          return await this.crmTools.toolGetLeadDetails(workspaceId, args);
        case 'create_payment_link': {
          const paymentResult = await this.smartPaymentService.createSmartPayment({
            workspaceId,
            amount: Number(args.amount) || 0,
            productName: typeof args.description === 'string' ? args.description : '',
            customerName: typeof args.customerName === 'string' ? args.customerName : 'Cliente',
            phone: '',
          });
          return { success: true, ...paymentResult };
        }
        case 'connect_whatsapp':
          return await this.whatsappTools.toolConnectWhatsapp(workspaceId);
        case 'get_whatsapp_status':
          return await this.whatsappTools.toolGetWhatsAppStatus(workspaceId);
        case 'send_whatsapp_message':
          return await this.whatsappTools.toolSendWhatsAppMessage(
            workspaceId,
            args as ToolSendWhatsAppMessageArgs,
          );
        case 'list_whatsapp_contacts':
          return await this.whatsappTools.toolListWhatsAppContacts(workspaceId, args);
        case 'create_whatsapp_contact':
          return await this.whatsappTools.toolCreateWhatsAppContact(
            workspaceId,
            args as ToolCreateWhatsAppContactArgs,
          );
        case 'list_whatsapp_chats':
          return await this.whatsappTools.toolListWhatsAppChats(workspaceId, args);
        case 'get_whatsapp_messages':
          return await this.whatsappTools.toolGetWhatsAppMessages(workspaceId, args);
        case 'get_whatsapp_backlog':
          return await this.whatsappTools.toolGetWhatsAppBacklog(workspaceId);
        case 'set_whatsapp_presence':
          return await this.whatsappTools.toolSetWhatsAppPresence(workspaceId, args);
        case 'sync_whatsapp_history':
          return await this.whatsappTools.toolSyncWhatsAppHistory(workspaceId, args);
        case 'send_audio':
          return await this.whatsappTools.toolSendAudio(workspaceId, args as ToolSendAudioArgs);
        case 'send_document':
          return await this.whatsappTools.toolSendDocument(
            workspaceId,
            args as ToolSendDocumentArgs,
          );
        case 'send_voice_note':
          return this.whatsappTools.toolSendAudio(workspaceId, args as ToolSendAudioArgs);
        case 'transcribe_audio':
          return await this.whatsappTools.toolTranscribeAudio(workspaceId, args);
        // Billing tools — delegated to KloelToolExecutorBillingService
        case 'update_billing_info':
          return await this.billingTools.toolUpdateBillingInfo(workspaceId, args);
        case 'get_billing_status':
          return await this.billingTools.toolGetBillingStatus(workspaceId);
        case 'change_plan':
          return await this.billingTools.toolChangePlan(workspaceId, args as ToolChangePlanArgs);
        default:
          return { success: false, error: `Ferramenta desconhecida: ${toolName}` };
      }
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      this.logger.error(`Erro ao executar ferramenta ${toolName}:`, error);
      return { success: false, error: msg };
    }
  }

  private async toolSaveProduct(
    workspaceId: string,
    args: ToolSaveProductArgs,
  ): Promise<ToolResult> {
    return toolSaveProduct(this.prisma, workspaceId, args);
  }

  private async toolListProducts(workspaceId: string): Promise<ToolResult> {
    return toolListProducts(this.prisma, workspaceId);
  }

  private async toolDeleteProduct(
    workspaceId: string,
    args: ToolDeleteProductArgs,
  ): Promise<ToolResult> {
    return toolDeleteProduct(this.prisma, workspaceId, args);
  }

  private async toolToggleAutopilot(
    workspaceId: string,
    args: ToolToggleAutopilotArgs,
  ): Promise<ToolResult> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    if (args.enabled && currentSettings.billingSuspended === true) {
      return {
        success: false,
        enabled: false,
        error: 'Autopilot suspenso: regularize cobrança para ativar.',
      };
    }
    const newSettings = {
      ...currentSettings,
      autopilot: {
        ...((currentSettings.autopilot as Record<string, unknown>) || {}),
        enabled: args.enabled,
      },
      autopilotEnabled: args.enabled,
    };
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: newSettings },
    });
    return {
      success: true,
      enabled: args.enabled,
      message: args.enabled ? 'Autopilot ativado.' : 'Autopilot desativado.',
    };
  }

  private async toolSetBrandVoice(
    workspaceId: string,
    args: ToolSetBrandVoiceArgs,
  ): Promise<ToolResult> {
    return toolSetBrandVoice(this.prisma, workspaceId, args);
  }

  private async toolRememberUserInfo(
    workspaceId: string,
    args: ToolRememberUserInfoArgs,
    userId?: string,
  ): Promise<ToolResult> {
    return toolRememberUserInfo(this.prisma, workspaceId, args, userId);
  }

  private async toolSearchWeb(
    workspaceId: string,
    args: ToolSearchWebArgs,
    searchWebFn?: (
      query: string,
    ) => Promise<{ answer: string; sources: Array<{ title: string; url: string }> }>,
  ): Promise<ToolResult> {
    const query = String(args?.query || '').trim();
    if (!query) return { success: false, error: 'missing_query' };
    if (!searchWebFn) return { success: false, error: 'web_search_unavailable' };
    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const digest = await searchWebFn(query);
      await this.planLimits
        .trackAiUsage(workspaceId, Math.max(180, Math.ceil(digest.answer.length / 4)))
        .catch(() => {});
      return { success: true, query, summary: digest.answer, sources: digest.sources };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'web_search_failed';
      this.logger.warn(`Falha em search_web para "${query}": ${msg}`);
      return { success: false, error: msg };
    }
  }

  private async toolCreateFlow(workspaceId: string, args: ToolCreateFlowArgs): Promise<ToolResult> {
    return toolCreateFlow(this.prisma, workspaceId, args);
  }
}
