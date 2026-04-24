import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { filterLegacyProducts } from '../common/products/legacy-products.util';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';
import { KloelToolExecutorBillingService } from './kloel-tool-executor-billing.service';
import { KloelToolExecutorCrmService } from './kloel-tool-executor-crm.service';
import { KloelToolExecutorWhatsAppService } from './kloel-tool-executor-whatsapp.service';

const NON_SLUG_CHAR_RE = /[^a-z0-9_:-]+/g;

/** Generic tool result shape returned by all tool* methods. */
export interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

type UnknownRecord = Record<string, unknown>;

export interface ToolSaveProductArgs extends UnknownRecord {
  name: string;
  price: number;
  description?: string;
}
export interface ToolDeleteProductArgs extends UnknownRecord {
  productId?: string;
  productName?: string;
}
export interface ToolToggleAutopilotArgs extends UnknownRecord {
  enabled: boolean;
}
export interface ToolSetBrandVoiceArgs extends UnknownRecord {
  tone: string;
  personality?: string;
}
export interface ToolRememberUserInfoArgs extends UnknownRecord {
  key: string;
  value: string;
}
export interface ToolSearchWebArgs extends UnknownRecord {
  query: string;
}
export interface ToolCreateFlowArgs extends UnknownRecord {
  name: string;
  trigger: string;
  actions?: string[];
}
export interface ToolDashboardSummaryArgs extends UnknownRecord {
  period?: 'today' | 'week' | 'month';
}
export interface ToolSendWhatsAppMessageArgs extends UnknownRecord {
  phone: string;
  message: string;
}
export interface ToolPaginationArgs extends UnknownRecord {
  limit?: number;
}
export interface ToolCreateWhatsAppContactArgs extends UnknownRecord {
  phone: string;
  name?: string;
  email?: string;
}
export interface ToolGetWhatsAppMessagesArgs extends UnknownRecord {
  chatId?: string;
  phone?: string;
  limit?: number;
  offset?: number;
}
export interface ToolSetWhatsAppPresenceArgs extends UnknownRecord {
  chatId?: string;
  phone?: string;
  presence?: 'typing' | 'paused' | 'seen';
}
export interface ToolSyncWhatsAppHistoryArgs extends UnknownRecord {
  reason?: string;
}
export interface ToolListLeadsArgs extends UnknownRecord {
  limit?: number;
  status?: string;
}
export interface ToolGetLeadDetailsArgs extends UnknownRecord {
  phone?: string;
  leadId?: string;
}
export interface ToolSaveBusinessInfoArgs extends UnknownRecord {
  businessName?: string;
  description?: string;
  segment?: string;
}
export interface ToolSetBusinessHoursArgs extends UnknownRecord {
  weekdayStart?: string;
  weekdayEnd?: string;
  saturdayStart?: string;
  saturdayEnd?: string;
  workOnSunday?: boolean;
}
export interface ToolCreateCampaignArgs extends UnknownRecord {
  name: string;
  message: string;
  targetAudience?: string;
}
export interface ToolSendAudioArgs extends UnknownRecord {
  phone: string;
  text: string;
  voice?: string;
}
export interface ToolSendDocumentArgs extends UnknownRecord {
  phone: string;
  documentName?: string;
  url?: string;
  caption?: string;
}
export interface ToolTranscribeAudioArgs extends UnknownRecord {
  audioUrl?: string;
  audioBase64?: string;
  language?: string;
}
export interface ToolUpdateBillingInfoArgs extends UnknownRecord {
  returnUrl?: string;
}
export interface ToolChangePlanArgs extends UnknownRecord {
  newPlan: string;
  immediate?: boolean;
}

/** Safely coerce unknown values to string. */
function safeStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

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
          return await this.toolDeleteProduct(workspaceId, args as ToolDeleteProductArgs);
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
        // CRM / campaign / business-config — delegated to KloelToolExecutorCrmService
        case 'list_flows':
          return await this.crmTools.toolListFlows(workspaceId);
        case 'get_dashboard_summary':
          return await this.crmTools.toolGetDashboardSummary(
            workspaceId,
            (args as ToolDashboardSummaryArgs).period,
          );
        case 'save_business_info':
          return await this.crmTools.toolSaveBusinessInfo(
            workspaceId,
            args as ToolSaveBusinessInfoArgs,
          );
        case 'set_business_hours':
          return await this.crmTools.toolSetBusinessHours(
            workspaceId,
            args as ToolSetBusinessHoursArgs,
          );
        case 'create_campaign':
          return await this.crmTools.toolCreateCampaign(
            workspaceId,
            args as ToolCreateCampaignArgs,
          );
        case 'list_leads':
          return await this.crmTools.toolListLeads(workspaceId, args as ToolListLeadsArgs);
        case 'get_lead_details':
          return await this.crmTools.toolGetLeadDetails(
            workspaceId,
            args as ToolGetLeadDetailsArgs,
          );
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
        // WhatsApp tools — delegated to KloelToolExecutorWhatsAppService
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
          return await this.whatsappTools.toolListWhatsAppContacts(
            workspaceId,
            args as ToolPaginationArgs,
          );
        case 'create_whatsapp_contact':
          return await this.whatsappTools.toolCreateWhatsAppContact(
            workspaceId,
            args as ToolCreateWhatsAppContactArgs,
          );
        case 'list_whatsapp_chats':
          return await this.whatsappTools.toolListWhatsAppChats(
            workspaceId,
            args as ToolPaginationArgs,
          );
        case 'get_whatsapp_messages':
          return await this.whatsappTools.toolGetWhatsAppMessages(
            workspaceId,
            args as ToolGetWhatsAppMessagesArgs,
          );
        case 'get_whatsapp_backlog':
          return await this.whatsappTools.toolGetWhatsAppBacklog(workspaceId);
        case 'set_whatsapp_presence':
          return await this.whatsappTools.toolSetWhatsAppPresence(
            workspaceId,
            args as ToolSetWhatsAppPresenceArgs,
          );
        case 'sync_whatsapp_history':
          return await this.whatsappTools.toolSyncWhatsAppHistory(
            workspaceId,
            args as ToolSyncWhatsAppHistoryArgs,
          );
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
          return await this.whatsappTools.toolTranscribeAudio(
            workspaceId,
            args as ToolTranscribeAudioArgs,
          );
        // Billing tools — delegated to KloelToolExecutorBillingService
        case 'update_billing_info':
          return await this.billingTools.toolUpdateBillingInfo(
            workspaceId,
            args as ToolUpdateBillingInfoArgs,
          );
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
    const product = await this.prisma.product.create({
      data: {
        workspaceId,
        name: args.name,
        price: args.price,
        description: args.description || '',
        active: true,
      },
    });
    return { success: true, product, message: `Produto "${args.name}" cadastrado com sucesso!` };
  }

  private async toolListProducts(workspaceId: string): Promise<ToolResult> {
    const products = filterLegacyProducts(
      await this.prisma.product.findMany({
        where: { workspaceId, active: true },
        select: { id: true, name: true, price: true, description: true, status: true },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    );
    if (products.length === 0)
      return { success: true, message: 'Nenhum produto cadastrado ainda.' };
    const list = products.map((p) => `- ${p.name}: R$ ${p.price}`).join('\n');
    return { success: true, products, message: `Aqui estão seus produtos:\n\n${list}` };
  }

  private async toolDeleteProduct(
    workspaceId: string,
    args: ToolDeleteProductArgs,
  ): Promise<ToolResult> {
    const where: Prisma.ProductWhereInput = { workspaceId };
    if (args.productId) {
      where.id = args.productId;
    } else if (args.productName) {
      where.name = { contains: args.productName, mode: 'insensitive' };
    }
    const product = await this.prisma.product.findFirst({ where });
    if (!product) return { success: false, error: 'Produto não encontrado.' };
    await this.prisma.$transaction([
      this.prisma.product.updateMany({
        where: { id: product.id, workspaceId },
        data: { active: false },
      }),
      this.prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'USER_DATA_DELETED',
          resource: 'Product',
          resourceId: product.id,
          details: {
            source: 'kloel_tool_delete_product',
            softDelete: true,
            productName: product.name,
          },
        },
      }),
    ]);
    return { success: true, message: `Produto "${product.name}" removido com sucesso.` };
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
      data: { providerSettings: newSettings as Prisma.InputJsonValue },
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
    const value = { style: args.tone, personality: args.personality || '' };
    const content = `Tom: ${args.tone}. ${args.personality || ''}`.trim();
    const metadata = { tone: args.tone, personality: args.personality || '' };
    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: 'brandVoice' } },
      update: { value, category: 'preferences', type: 'persona', content, metadata },
      create: {
        workspaceId,
        key: 'brandVoice',
        value,
        category: 'preferences',
        type: 'persona',
        content,
        metadata,
      },
    });
    return { success: true, message: `Tom de voz definido como "${args.tone}"` };
  }

  private async toolRememberUserInfo(
    workspaceId: string,
    args: ToolRememberUserInfoArgs,
    userId?: string,
  ): Promise<ToolResult> {
    const normalizedKey = String(args?.key || '')
      .trim()
      .toLowerCase()
      .replace(NON_SLUG_CHAR_RE, '_')
      .slice(0, 80);
    const value = String(args?.value || '').trim();
    if (!normalizedKey || !value) return { success: false, error: 'missing_user_memory_payload' };
    const profileKey = `user_profile:${userId || 'workspace_owner'}`;
    const existing = await this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key: profileKey } },
    });
    const currentValue =
      existing?.value && typeof existing.value === 'object'
        ? (existing.value as Record<string, Prisma.JsonValue>)
        : {};
    const nextValue: Record<string, Prisma.JsonValue> = {
      ...currentValue,
      [normalizedKey]: value,
      updatedAt: new Date().toISOString(),
      userId: userId || null,
    };
    const content = Object.entries(nextValue)
      .filter(([k]) => !['updatedAt', 'userId'].includes(k))
      .map(([k, v]) => k + ': ' + safeStr(v))
      .join('\n');
    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: profileKey } },
      update: {
        value: nextValue,
        category: 'user_preferences',
        type: 'user_profile',
        content,
        metadata: {
          ...((existing?.metadata as Record<string, unknown>) || {}),
          userId: userId || null,
          source: 'remember_user_info',
        },
      },
      create: {
        workspaceId,
        key: profileKey,
        value: nextValue,
        category: 'user_preferences',
        type: 'user_profile',
        content,
        metadata: { userId: userId || null, source: 'remember_user_info' },
      },
    });
    return { success: true, message: `Memória "${normalizedKey}" salva.` };
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
    const nodes = [
      {
        id: 'start',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: { trigger: args.trigger },
      },
      {
        id: 'msg1',
        type: 'message',
        position: { x: 100, y: 200 },
        data: { message: args.actions?.[0] || 'Olá!' },
      },
    ];
    const edges = [{ id: 'e1', source: 'start', target: 'msg1' }];
    const flow = await this.prisma.flow.create({
      data: {
        workspaceId,
        name: args.name,
        description: `Fluxo criado via chat: ${args.trigger}`,
        nodes,
        edges,
        isActive: true,
      },
    });
    return { success: true, flow, message: `Fluxo "${args.name}" criado com sucesso!` };
  }
}
