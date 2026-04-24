import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { UnifiedAgentActionsBillingService } from './unified-agent-actions-billing.service';
import { UnifiedAgentActionsCommerceService } from './unified-agent-actions-commerce.service';
import { UnifiedAgentActionsCrmService } from './unified-agent-actions-crm.service';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import { UnifiedAgentActionsSalesService } from './unified-agent-actions-sales.service';
import { UnifiedAgentActionsWorkspaceService } from './unified-agent-actions-workspace.service';
import type { ToolArgs } from './unified-agent.service';

type UnknownRecord = Record<string, unknown>;

/**
 * Orchestrator for all Unified Agent tool actions.
 * Delegates to domain-specific sub-services.
 * Keeps only: logAutopilotEvent and actionSendDocument (need Prisma+WhatsApp+Storage together).
 */
@Injectable()
export class UnifiedAgentActionsService {
  private readonly logger = new Logger(UnifiedAgentActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
    private readonly planLimits: PlanLimitsService,
    private readonly messaging: UnifiedAgentActionsMessagingService,
    private readonly crm: UnifiedAgentActionsCrmService,
    private readonly sales: UnifiedAgentActionsSalesService,
    private readonly workspace: UnifiedAgentActionsWorkspaceService,
    private readonly billing: UnifiedAgentActionsBillingService,
    private readonly commerce: UnifiedAgentActionsCommerceService,
    private readonly auditService: AuditService,
  ) {}

  str(v: unknown, fb = ''): string {
    return typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : fb;
  }
  num(v: unknown, fb = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  }

  async logAutopilotEvent(
    workspaceId: string,
    contactId: string,
    action: string,
    args: ToolArgs,
    result: unknown,
  ) {
    try {
      const r = (typeof result === 'object' && result !== null ? result : {}) as UnknownRecord;
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'TOOL_CALL',
          action,
          status: r.success ? 'completed' : 'failed',
          meta: { args, result: r } as object as Prisma.InputJsonValue,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
      const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
      if (isTestEnv) return;
      const code = (err as { code?: string } | null)?.code;
      if (code === 'P2003') {
        this.logger.debug(`Skipping autopilot event log due to FK (contactId=${contactId})`);
        return;
      }
      this.logger.warn(`Failed to log autopilot event: ${msg}`);
    }
  }

  async actionSendDocument(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const documentName = this.str(args.documentName);
      let documentUrl = this.str(args.url);
      let documentCaption = this.str(args.caption);
      if (documentName) {
        const document = await this.prisma.document.findFirst({
          where: {
            workspaceId,
            name: { contains: documentName, mode: 'insensitive' },
            isActive: true,
          },
        });
        if (document) {
          documentUrl = this.storageService.getSignedUrl(document.filePath, {
            expiresInSeconds: 15 * 60,
            downloadName: document.fileName,
          });
          if (!documentCaption && document.description) documentCaption = document.description;
        } else {
          return { success: false, error: `Documento "${documentName}" não encontrado.` };
        }
      }
      if (!documentUrl) return { success: false, error: 'URL ou nome do documento é obrigatório' };
      const result = await this.whatsappService.sendMessage(
        workspaceId,
        phone,
        documentCaption || '',
        this.messaging.buildWhatsAppSendOptions(context, {
          mediaUrl: documentUrl,
          mediaType: 'document',
          caption: documentCaption || '',
        }),
      );
      if (result.error) return { success: false, error: result.message };
      return {
        success: true,
        documentName: documentName || 'URL direta',
        url: documentUrl,
        caption: documentCaption,
        sent: true,
      };
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao enviar documento: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionSendMessage(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    return this.messaging.actionSendMessage(workspaceId, phone, args, context);
  }

  async actionSendMedia(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    return this.messaging.actionSendMedia(workspaceId, phone, args, context);
  }

  async actionSendVoiceNote(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    return this.messaging.actionSendVoiceNote(workspaceId, phone, args, context);
  }

  async actionSendAudio(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    return this.messaging.actionSendAudio(workspaceId, phone, args, context);
  }

  async actionTranscribeAudio(workspaceId: string, args: ToolArgs) {
    return this.messaging.actionTranscribeAudio(workspaceId, args);
  }

  async actionSendProductInfo(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    return this.commerce.actionSendProductInfo(workspaceId, phone, args, context);
  }

  async actionCreatePaymentLink(
    workspaceId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    const result = await this.commerce.actionCreatePaymentLink(workspaceId, phone, args, context);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.auditService.logWithTx(tx, {
          workspaceId,
          action: 'AGENT_ACTIONS_PAYMENT_LINK_DELEGATED',
          resource: 'UnifiedAgentActions',
          details: { phone },
        });
      });
    } catch (auditError: unknown) {
      const auditMsg =
        auditError instanceof Error
          ? auditError.message
          : typeof auditError === 'string'
            ? auditError
            : 'unknown';
      this.logger.warn(`Audit delegation log failed: ${auditMsg}`);
    }
    return result;
  }

  async actionUpdateLeadStatus(workspaceId: string, contactId: string, args: ToolArgs) {
    return this.crm.actionUpdateLeadStatus(workspaceId, contactId, args);
  }

  async actionAddTag(workspaceId: string, contactId: string, args: ToolArgs) {
    return this.crm.actionAddTag(workspaceId, contactId, args);
  }

  async actionScheduleFollowup(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
  ) {
    return this.crm.actionScheduleFollowup(workspaceId, contactId, phone, args);
  }

  async actionTransferToHuman(workspaceId: string, contactId: string, args: ToolArgs) {
    return this.crm.actionTransferToHuman(workspaceId, contactId, args);
  }

  async actionSearchKnowledgeBase(workspaceId: string, args: ToolArgs) {
    return this.crm.actionSearchKnowledgeBase(workspaceId, args);
  }

  async actionTriggerFlow(workspaceId: string, phone: string, args: ToolArgs) {
    return this.crm.actionTriggerFlow(workspaceId, phone, args);
  }

  async actionLogEvent(workspaceId: string, contactId: string, args: ToolArgs) {
    return this.crm.actionLogEvent(workspaceId, contactId, args);
  }

  async actionConnectWhatsApp(workspaceId: string, args: ToolArgs) {
    return this.crm.actionConnectWhatsApp(workspaceId, args);
  }

  async actionImportContacts(workspaceId: string, args: ToolArgs) {
    return this.crm.actionImportContacts(workspaceId, args);
  }

  async actionCreateProduct(workspaceId: string, args: ToolArgs) {
    return this.workspace.actionCreateProduct(workspaceId, args);
  }

  async actionUpdateProduct(workspaceId: string, args: ToolArgs) {
    return this.workspace.actionUpdateProduct(workspaceId, args);
  }

  async actionCreateFlow(workspaceId: string, args: ToolArgs) {
    return this.workspace.actionCreateFlow(workspaceId, args);
  }

  async actionUpdateWorkspaceSettings(workspaceId: string, args: ToolArgs) {
    return this.workspace.actionUpdateWorkspaceSettings(workspaceId, args);
  }

  async actionCreateBroadcast(workspaceId: string, args: ToolArgs) {
    return this.workspace.actionCreateBroadcast(workspaceId, args);
  }

  async actionConfigureAIPersona(workspaceId: string, args: ToolArgs) {
    return this.workspace.actionConfigureAIPersona(workspaceId, args);
  }

  async actionToggleAutopilot(workspaceId: string, args: ToolArgs) {
    return this.workspace.actionToggleAutopilot(workspaceId, args);
  }

  async actionCreateFlowFromDescription(
    workspaceId: string,
    args: ToolArgs,
    openai: OpenAI | null,
    primaryBrainModel: string,
    fallbackBrainModel: string,
  ) {
    return this.workspace.actionCreateFlowFromDescription(
      workspaceId,
      args,
      openai,
      primaryBrainModel,
      fallbackBrainModel,
    );
  }

  async actionScheduleCampaign(workspaceId: string, args: ToolArgs) {
    return this.workspace.actionScheduleCampaign(workspaceId, args);
  }

  async actionGetWorkspaceStatus(workspaceId: string, args: ToolArgs) {
    return this.workspace.actionGetWorkspaceStatus(workspaceId, args);
  }

  async actionGetAnalytics(workspaceId: string, args: ToolArgs) {
    return this.billing.actionGetAnalytics(workspaceId, args);
  }

  async actionGenerateSalesFunnel(workspaceId: string, args: ToolArgs) {
    return this.billing.actionGenerateSalesFunnel(workspaceId, args);
  }

  async actionUpdateBillingInfo(workspaceId: string, args: ToolArgs) {
    return this.billing.actionUpdateBillingInfo(workspaceId, args);
  }

  async actionGetBillingStatus(workspaceId: string) {
    return this.billing.actionGetBillingStatus(workspaceId);
  }

  async actionChangePlan(workspaceId: string, args: ToolArgs) {
    return this.billing.actionChangePlan(workspaceId, args);
  }

  async actionApplyDiscount(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    return this.sales.actionApplyDiscount(workspaceId, contactId, phone, args, context);
  }

  async actionHandleObjection(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    return this.sales.actionHandleObjection(workspaceId, contactId, phone, args, context);
  }

  async actionQualifyLead(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    return this.sales.actionQualifyLead(workspaceId, contactId, phone, args, context);
  }

  async actionScheduleMeeting(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    return this.sales.actionScheduleMeeting(workspaceId, contactId, phone, args, context);
  }

  async actionAntiChurn(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    return this.sales.actionAntiChurn(workspaceId, contactId, phone, args, context);
  }

  async actionReactivateGhost(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    return this.sales.actionReactivateGhost(workspaceId, contactId, phone, args, context);
  }

  async getProductPlans(productId: string) {
    return this.billing.getProductPlans(productId);
  }

  async getProductAIConfig(productId: string) {
    return this.billing.getProductAIConfig(productId);
  }

  async getProductReviews(productId: string) {
    return this.billing.getProductReviews(productId);
  }

  async getProductUrls(productId: string) {
    return this.billing.getProductUrls(productId);
  }

  async validateCoupon(productId: string, code: string) {
    return this.billing.validateCoupon(productId, code);
  }
}
