import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { OpsAlertService } from '../observability/ops-alert.service';

type UnknownRecord = Record<string, unknown>;
type ApprovedToolExecutionResult = {
  success: boolean;
  approvalRequestId: string;
  state: string;
  executed: boolean;
  toolName?: string;
  result?: unknown;
};

/**
 * Dispatcher for KloelService tool execution. Extracted from kloel.service.ts
 * to keep the orchestrator file under the size limit and to host the
 * transactional audit log for financial tool calls (e.g. create_payment_link).
 */
/** Idempotency: enforced at HTTP layer via @Idempotent() guard + Stripe idempotencyKey. */
@Injectable()
export class KloelToolDispatcherService {
  private readonly logger = StructuredLogger.from(KloelToolDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly chatToolsService: KloelChatToolsService,
    private readonly bizConfigToolsService: KloelBusinessConfigToolsService,
    private readonly whatsappToolsService: KloelWhatsAppToolsService,
    private readonly composerService: KloelComposerService,
    private readonly auditService: AuditService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** Execute a named tool, delegating to the appropriate sub-service. */
  async executeTool(
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId?: string,
  ): Promise<{ success: boolean; message?: string; error?: string; [key: string]: unknown }> {
    const asToolArgs = <T>(value: UnknownRecord): T => value as T;

    if (!workspaceId || typeof workspaceId !== 'string' || !workspaceId.trim()) {
      return { success: false, error: 'workspace_id_required' };
    }

    const workspace = await this.prisma.workspace
      .findUnique({
        where: { id: workspaceId },
        select: { id: true, providerSettings: true },
      })
      .catch(() => null);

    if (!workspace) {
      return { success: false, error: 'workspace_not_found' };
    }

    const settings = (workspace.providerSettings ?? {}) as Record<string, unknown>;
    if (settings.billingSuspended === true) {
      return { success: false, error: 'billing_suspended' };
    }
    this.logger.log(`Executando ferramenta: ${toolName}`, this.sanitizeDetails(args));
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
        case 'set_sales_policy':
          return await this.chatToolsService.toolSetSalesPolicy(
            workspaceId,
            asToolArgs(args),
            userId,
          );
        case 'remember_user_info':
          return await this.chatToolsService.toolRememberUserInfo(
            workspaceId,
            asToolArgs(args),
            userId,
          );
        case 'search_web':
          return await this.toolSearchWeb(workspaceId, args);
        case 'create_flow':
          return await this.chatToolsService.toolCreateFlow(workspaceId, asToolArgs(args));
        case 'list_flows':
          return await this.chatToolsService.toolListFlows(workspaceId);
        case 'get_dashboard_summary':
          return await this.chatToolsService.toolGetDashboardSummary(workspaceId, asToolArgs(args));
        case 'create_agent_job':
          return await this.chatToolsService.toolCreateAgentJob(workspaceId, asToolArgs(args));
        case 'list_agent_jobs':
          return await this.chatToolsService.toolListAgentJobs(workspaceId);
        case 'set_agent_job_enabled':
          return await this.chatToolsService.toolSetAgentJobEnabled(workspaceId, asToolArgs(args));
        case 'search_agent_memory':
          return await this.chatToolsService.toolSearchAgentMemory(workspaceId, asToolArgs(args));
        case 'search_agent_sessions':
          return await this.chatToolsService.toolSearchAgentSessions(workspaceId, asToolArgs(args));
        case 'upsert_agent_skill':
          return await this.chatToolsService.toolUpsertAgentSkill(workspaceId, asToolArgs(args));
        case 'record_agent_delegation':
          return await this.chatToolsService.toolRecordAgentDelegation(
            workspaceId,
            asToolArgs(args),
          );
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
          return await this.requestHighRiskApproval(workspaceId, toolName, args, userId);
        case 'update_billing_info':
          return await this.bizConfigToolsService.toolUpdateBillingInfo(
            workspaceId,
            asToolArgs(args),
          );
        case 'get_billing_status':
          return await this.bizConfigToolsService.toolGetBillingStatus(workspaceId);
        case 'change_plan':
          return await this.requestHighRiskApproval(workspaceId, toolName, args, userId);
        default:
          return { success: false, error: `Ferramenta desconhecida: ${toolName}` };
      }
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KloelToolDispatcherService.toolChangePlan');
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
            ...(resourceId !== undefined ? { resourceId } : {}),
            ...(userId !== undefined ? { agentId: userId } : {}),
            details: this.sanitizeDetails(args),
          });
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (auditError: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        auditError,
        'KloelToolDispatcherService.sanitizeDetails',
      );
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

  private async requestHighRiskApproval(
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId?: string,
  ): Promise<{ success: boolean; message?: string; [key: string]: unknown }> {
    const approval = await this.prisma.approvalRequest.create({
      data: {
        workspaceId,
        kind: `kloel_tool:${toolName}`,
        scope: 'workspace',
        entityType: 'KloelTool',
        entityId: toolName,
        state: 'OPEN',
        title: this.titleForHighRiskTool(toolName),
        prompt: this.promptForHighRiskTool(toolName, args),
        payload: {
          toolName,
          args: this.sanitizeDetails(args),
          requestedByUserId: userId || null,
          risk: 'high',
          requiresApproval: true,
        } as Prisma.InputJsonObject,
      },
      select: {
        id: true,
        kind: true,
        state: true,
        title: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      approvalRequired: true,
      approvalRequestId: approval.id,
      approvalState: approval.state,
      message: 'Acao de alto risco enviada para aprovacao humana antes da execucao.',
      approval,
    };
  }

  async executeApprovedApprovalRequest(input: {
    workspaceId: string;
    approvalRequestId: string;
    userId?: string;
  }): Promise<ApprovedToolExecutionResult> {
    const approval = await this.prisma.approvalRequest.findFirst({
      where: {
        id: input.approvalRequestId,
        workspaceId: input.workspaceId,
        state: 'APPROVED',
      },
    });
    if (!approval) {
      return {
        success: false,
        approvalRequestId: input.approvalRequestId,
        state: 'APPROVED',
        executed: false,
      };
    }

    const payload = this.readApprovedToolPayload(approval.payload);
    if (!payload || approval.kind !== `kloel_tool:${payload.toolName}`) {
      return {
        success: true,
        approvalRequestId: approval.id,
        state: approval.state,
        executed: false,
      };
    }

    if (!this.isSupportedApprovedHighRiskTool(payload.toolName)) {
      return {
        success: true,
        approvalRequestId: approval.id,
        state: approval.state,
        executed: false,
        toolName: payload.toolName,
      };
    }

    try {
      const result = await this.executeApprovedHighRiskTool(
        input.workspaceId,
        payload.toolName,
        payload.args,
      );
      await this.prisma.approvalRequest.updateMany({
        where: { id: approval.id, workspaceId: input.workspaceId, state: 'APPROVED' },
        data: {
          state: 'COMPLETED',
          respondedAt: new Date(),
          response: {
            action: 'approved_executed',
            executedToolName: payload.toolName,
            executedByUserId: input.userId ?? null,
            executedAt: new Date().toISOString(),
            result: result as Prisma.InputJsonValue,
          },
        },
      });
      return {
        success: true,
        approvalRequestId: approval.id,
        state: 'COMPLETED',
        executed: true,
        toolName: payload.toolName,
        result,
      };
    } catch (error: unknown) {
      await this.prisma.approvalRequest.updateMany({
        where: { id: approval.id, workspaceId: input.workspaceId, state: 'APPROVED' },
        data: {
          state: 'FAILED',
          respondedAt: new Date(),
          response: {
            action: 'approved_execution_failed',
            executedToolName: payload.toolName,
            executedByUserId: input.userId ?? null,
            failedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
          },
        },
      });
      throw error;
    }
  }

  private readApprovedToolPayload(payload: Prisma.JsonValue): {
    toolName: string;
    args: UnknownRecord;
  } | null {
    if (!this.isRecord(payload)) {
      return null;
    }
    const toolName = typeof payload.toolName === 'string' ? payload.toolName.trim() : '';
    if (!toolName || !this.isRecord(payload.args)) {
      return null;
    }
    return { toolName, args: payload.args };
  }

  private async executeApprovedHighRiskTool(
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
  ): Promise<unknown> {
    switch (toolName) {
      case 'create_campaign':
        return this.bizConfigToolsService.toolCreateCampaign(workspaceId, args as never);
      case 'change_plan':
        return this.bizConfigToolsService.toolChangePlan(workspaceId, args as never);
      default:
        throw new Error(`unsupported_approved_tool:${toolName}`);
    }
  }

  private isSupportedApprovedHighRiskTool(toolName: string): boolean {
    return toolName === 'create_campaign' || toolName === 'change_plan';
  }

  private titleForHighRiskTool(toolName: string): string {
    if (toolName === 'create_campaign') {
      return 'Aprovar criacao de campanha pela CIA';
    }
    if (toolName === 'change_plan') {
      return 'Aprovar alteracao de plano pela CIA';
    }
    return `Aprovar acao ${toolName}`;
  }

  private promptForHighRiskTool(toolName: string, args: UnknownRecord): string {
    if (toolName === 'create_campaign') {
      const name =
        typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'sem nome';
      const audience =
        typeof args.targetAudience === 'string' && args.targetAudience.trim()
          ? args.targetAudience.trim()
          : 'all';
      return `A CIA quer criar a campanha "${name}" para o publico "${audience}". Revise antes de autorizar qualquer disparo.`;
    }
    if (toolName === 'change_plan') {
      const plan =
        typeof args.newPlan === 'string' && args.newPlan.trim()
          ? args.newPlan.trim()
          : typeof args.planId === 'string' && args.planId.trim()
            ? args.planId.trim()
            : typeof args.plan === 'string' && args.plan.trim()
              ? args.plan.trim()
              : 'plano solicitado';
      return `A CIA quer alterar o plano do workspace para "${plan}". Revise impacto de cobranca e limites antes de autorizar.`;
    }
    return `A CIA solicitou a acao ${toolName}. Revise o contexto antes de executar.`;
  }

  /**
   * Strip sensitive fields (password, token, secret, cpf, ssn, full PAN/card)
   * from a tool args record before persisting to the audit log.
   */
  private sanitizeDetails(args: UnknownRecord): UnknownRecord {
    const SENSITIVE_KEY_RE = /password|token|secret|cpf|ssn|card|pan/i;
    const out: UnknownRecord = {};
    for (const [k, v] of Object.entries(args ?? {})) {
      if (SENSITIVE_KEY_RE.test(k)) {
        continue;
      }
      out[k] = v;
    }
    return out;
  }

  private isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
    if (!query) {
      return { success: false, error: 'missing_query' };
    }
    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const digest = await this.composerService.searchWeb(query);
      await this.planLimits
        .trackAiUsage(workspaceId, Math.max(180, Math.ceil(digest.answer.length / 4)))
        .catch(() => {});
      return { success: true, query, summary: digest.answer, sources: digest.sources };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KloelToolDispatcherService.trackAiUsage');
      const msg = error instanceof Error ? error.message : 'web_search_failed';
      this.logger.warn(`Falha em search_web para "${query}": ${msg}`);
      return { success: false, error: msg };
    }
  }
}
