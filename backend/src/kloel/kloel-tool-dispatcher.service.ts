import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';

type UnknownRecord = Record<string, unknown>;

/**
 * Dispatcher for KloelService tool execution. Extracted from kloel.service.ts
 * to keep the orchestrator file under the size limit and to host the
 * transactional audit log for financial tool calls (e.g. create_payment_link).
 */
@Injectable()
export class KloelToolDispatcherService {
  private readonly logger = new Logger(KloelToolDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly chatToolsService: KloelChatToolsService,
    private readonly bizConfigToolsService: KloelBusinessConfigToolsService,
    private readonly whatsappToolsService: KloelWhatsAppToolsService,
    private readonly composerService: KloelComposerService,
    private readonly auditService: AuditService,
  ) {}

  /** Execute a named tool, delegating to the appropriate sub-service. */
  async executeTool(
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId?: string,
  ): Promise<{ success: boolean; message?: string; error?: string; [key: string]: unknown }> {
    const asToolArgs = <T>(value: UnknownRecord): T => value as T;
    this.logger.log(`Executando ferramenta: ${toolName}`, args);
    try {
      switch (toolName) {
        case 'save_product':
          return await this.chatToolsService.toolSaveProduct(workspaceId, asToolArgs(args));
        case 'list_products':
          return await this.chatToolsService.toolListProducts(workspaceId);
        case 'delete_product':
          return await this.chatToolsService.toolDeleteProduct(workspaceId, asToolArgs(args));
        case 'toggle_autopilot':
          return await this.chatToolsService.toolToggleAutopilot(workspaceId, asToolArgs(args));
        case 'set_brand_voice':
          return await this.chatToolsService.toolSetBrandVoice(workspaceId, asToolArgs(args));
        case 'remember_user_info':
          return await this.chatToolsService.toolRememberUserInfo(
            workspaceId,
            asToolArgs(args),
            userId,
          );
        case 'search_web':
          return await this.toolSearchWeb(workspaceId, args as { query?: string });
        case 'create_flow':
          return await this.chatToolsService.toolCreateFlow(workspaceId, asToolArgs(args));
        case 'list_flows':
          return await this.chatToolsService.toolListFlows(workspaceId);
        case 'get_dashboard_summary':
          return await this.chatToolsService.toolGetDashboardSummary(workspaceId, asToolArgs(args));
        case 'create_payment_link':
          return await this.dispatchCreatePaymentLink(workspaceId, args, userId);
        case 'connect_whatsapp':
          return await this.whatsappToolsService.toolConnectWhatsapp(workspaceId);
        case 'get_whatsapp_status':
          return await this.whatsappToolsService.toolGetWhatsAppStatus(workspaceId);
        case 'send_whatsapp_message':
          return await this.whatsappToolsService.toolSendWhatsAppMessage(
            workspaceId,
            asToolArgs(args),
          );
        case 'list_whatsapp_contacts':
          return await this.whatsappToolsService.toolListWhatsAppContacts(
            workspaceId,
            asToolArgs(args),
          );
        case 'create_whatsapp_contact':
          return await this.whatsappToolsService.toolCreateWhatsAppContact(
            workspaceId,
            asToolArgs(args),
          );
        case 'list_whatsapp_chats':
          return await this.whatsappToolsService.toolListWhatsAppChats(
            workspaceId,
            asToolArgs(args),
          );
        case 'get_whatsapp_messages':
          return await this.whatsappToolsService.toolGetWhatsAppMessages(
            workspaceId,
            asToolArgs(args),
          );
        case 'get_whatsapp_backlog':
          return await this.whatsappToolsService.toolGetWhatsAppBacklog(workspaceId);
        case 'set_whatsapp_presence':
          return await this.whatsappToolsService.toolSetWhatsAppPresence(
            workspaceId,
            asToolArgs(args),
          );
        case 'sync_whatsapp_history':
          return await this.whatsappToolsService.toolSyncWhatsAppHistory(
            workspaceId,
            asToolArgs(args),
          );
        case 'send_audio':
          return await this.whatsappToolsService.toolSendAudio(workspaceId, asToolArgs(args));
        case 'send_document':
          return await this.whatsappToolsService.toolSendDocument(workspaceId, asToolArgs(args));
        case 'send_voice_note':
          return await this.whatsappToolsService.toolSendVoiceNote(workspaceId, asToolArgs(args));
        case 'transcribe_audio':
          return await this.whatsappToolsService.toolTranscribeAudio(workspaceId, asToolArgs(args));
        case 'list_leads':
          return await this.bizConfigToolsService.toolListLeads(workspaceId, asToolArgs(args));
        case 'get_lead_details':
          return await this.bizConfigToolsService.toolGetLeadDetails(workspaceId, asToolArgs(args));
        case 'save_business_info':
          return await this.bizConfigToolsService.toolSaveBusinessInfo(
            workspaceId,
            asToolArgs(args),
          );
        case 'set_business_hours':
          return await this.bizConfigToolsService.toolSetBusinessHours(
            workspaceId,
            asToolArgs(args),
          );
        case 'create_campaign':
          return await this.bizConfigToolsService.toolCreateCampaign(workspaceId, asToolArgs(args));
        case 'update_billing_info':
          return await this.bizConfigToolsService.toolUpdateBillingInfo(
            workspaceId,
            asToolArgs(args),
          );
        case 'get_billing_status':
          return await this.bizConfigToolsService.toolGetBillingStatus(workspaceId);
        case 'change_plan':
          return await this.bizConfigToolsService.toolChangePlan(workspaceId, asToolArgs(args));
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

  /**
   * Dispatch a create_payment_link tool call and write a transactional
   * audit log entry alongside the actual payment-link creation.
   * Audit failure is logged but never blocks payment-link delivery.
   */
  private async dispatchCreatePaymentLink(
    workspaceId: string,
    args: UnknownRecord,
    userId?: string,
  ): Promise<{ success: boolean; message?: string; error?: string; [key: string]: unknown }> {
    const paymentArgs = args as never as {
      amount: number;
      description: string;
      customerName?: string;
    };
    const result = await this.chatToolsService.toolCreatePaymentLink(workspaceId, paymentArgs);
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const paymentIdValue: unknown = result.paymentId;
          const resourceId = typeof paymentIdValue === 'string' ? paymentIdValue : undefined;
          await this.auditService.logWithTx(tx, {
            workspaceId,
            action: 'KLOEL_TOOL_PAYMENT_LINK_DISPATCHED',
            resource: 'KloelToolDispatcher',
            resourceId,
            agentId: userId,
            details: this.sanitizeDetails(args),
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (auditError: unknown) {
      const auditMsg =
        auditError instanceof Error
          ? auditError.message
          : typeof auditError === 'string'
            ? auditError
            : 'unknown';
      this.logger.warn(`Audit dispatch (payment link) failed: ${auditMsg}`);
    }
    return result;
  }

  /**
   * Strip sensitive fields (password, token, secret, cpf, ssn, full PAN/card)
   * from a tool args record before persisting to the audit log.
   */
  private sanitizeDetails(args: UnknownRecord): UnknownRecord {
    const SENSITIVE_KEY_RE = /password|token|secret|cpf|ssn|card|pan/i;
    const out: UnknownRecord = {};
    for (const [k, v] of Object.entries(args ?? {})) {
      if (SENSITIVE_KEY_RE.test(k)) continue;
      out[k] = v;
    }
    return out;
  }

  private async toolSearchWeb(
    workspaceId: string,
    args: { query?: string },
  ): Promise<{
    success: boolean;
    query?: string;
    summary?: string;
    sources?: unknown[];
    error?: string;
  }> {
    const query = String(args?.query || '').trim();
    if (!query) return { success: false, error: 'missing_query' };
    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const digest = await this.composerService.searchWeb(query);
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
}
