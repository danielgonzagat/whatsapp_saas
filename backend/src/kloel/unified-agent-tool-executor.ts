import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnifiedAgentActionsService } from './unified-agent-actions.service';
import { RiskGateService } from './risk-class/risk-gate.service';
import type { ToolArgs } from './unified-agent.types';

import type { UnknownRecord } from '../common/types';

@Injectable()
export class UnifiedAgentToolExecutorService {
  private readonly logger = StructuredLogger.from(UnifiedAgentToolExecutorService.name);

  constructor(
    private readonly actions: UnifiedAgentActionsService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Optional() private readonly riskGate?: RiskGateService,
  ) {}

  async execute(
    workspaceId: string,
    contactId: string,
    phone: string,
    tool: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ): Promise<unknown> {
    this.logger.log(`Executing tool: ${tool}`, { args });

    switch (tool) {
      case 'send_message':
        return this.actions.actionSendMessage(workspaceId, phone, args, context);
      case 'send_product_info':
        return this.actions.actionSendProductInfo(workspaceId, phone, args, context);
      case 'create_payment_link': {
        const paymentAmount = this.num(args.amount);
        if (this.riskGate && paymentAmount > 0) {
          const gateDecision = this.riskGate.gatePaymentAction({
            amountCents: paymentAmount,
            reversible: true,
            target: 'lead',
          });
          if (gateDecision.verdict === 'block') {
            this.logger.error(`R4 BLOCKED: create_payment_link — ${gateDecision.reason}`);
            return {
              success: false,
              blocked: true,
              riskClass: gateDecision.classification.class,
              error: gateDecision.reason,
            };
          }
          if (gateDecision.verdict === 'warn') {
            this.logger.warn(
              `Risk gate: payment ${gateDecision.classification.class} — ${gateDecision.reason}`,
            );
          }
        }
        const result = await this.actions.actionCreatePaymentLink(
          workspaceId,
          phone,
          args,
          context,
        );
        try {
          await this.prisma.$transaction(
            async (tx) => {
              await this.auditService.logWithTx(tx, {
                workspaceId,
                action: 'AGENT_DISPATCHED_PAYMENT_LINK',
                resource: 'UnifiedAgent',
                resourceId: contactId,
                details: { tool, phone },
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
          this.logger.warn(`Audit dispatch log failed: ${auditMsg}`);
        }
        return result;
      }
      case 'update_lead_status':
        return this.actions.actionUpdateLeadStatus(workspaceId, contactId, args);
      case 'add_tag':
        return this.actions.actionAddTag(workspaceId, contactId, args);
      case 'schedule_followup':
        return this.actions.actionScheduleFollowup(workspaceId, contactId, phone, args, context);
      case 'transfer_to_human':
        return this.actions.actionTransferToHuman(workspaceId, contactId, args, context);
      case 'search_knowledge_base':
        return this.actions.actionSearchKnowledgeBase(workspaceId, args);
      case 'trigger_flow':
        return this.actions.actionTriggerFlow(workspaceId, phone, args);
      case 'log_event':
        return this.actions.actionLogEvent(workspaceId, contactId, args);
      case 'send_media':
        return this.actions.actionSendMedia(workspaceId, phone, args, context);
      case 'send_document':
        return this.actions.actionSendDocument(workspaceId, phone, args, context);
      case 'send_voice_note':
        return this.actions.actionSendVoiceNote(workspaceId, phone, args, context);
      case 'send_audio':
        return this.actions.actionSendAudio(workspaceId, phone, args, context);
      case 'transcribe_audio':
        return this.actions.actionTranscribeAudio(workspaceId, args);
      case 'create_product':
        return this.actions.actionCreateProduct(workspaceId, args);
      case 'update_product':
        return this.actions.actionUpdateProduct(workspaceId, args);
      case 'get_product_plans':
        return this.actions.getProductPlans(this.actions.str(args.productId));
      case 'get_product_ai_config':
        return this.actions.getProductAIConfig(this.actions.str(args.productId));
      case 'get_product_reviews':
        return this.actions.getProductReviews(this.actions.str(args.productId));
      case 'get_product_urls':
        return this.actions.getProductUrls(this.actions.str(args.productId));
      case 'validate_coupon':
        return this.actions.validateCoupon(
          this.actions.str(args.productId),
          this.actions.str(args.code),
        );
      case 'create_flow':
        return this.actions.actionCreateFlow(workspaceId, args);
      case 'update_workspace_settings':
        return this.actions.actionUpdateWorkspaceSettings(workspaceId, args);
      case 'create_broadcast':
        return this.actions.actionCreateBroadcast(workspaceId, args, context);
      case 'get_analytics':
        return this.actions.actionGetAnalytics(workspaceId, args);
      case 'configure_ai_persona':
        return this.actions.actionConfigureAIPersona(workspaceId, args);
      case 'toggle_autopilot':
        return this.actions.actionToggleAutopilot(workspaceId, args);
      case 'create_flow_from_description':
        return this.actions.actionCreateFlowFromDescription(
          workspaceId,
          args,
          null,
          'deepseek-v4-pro',
          'deepseek-v4-flash',
        );
      case 'connect_whatsapp':
        return this.actions.actionConnectWhatsApp(workspaceId, args);
      case 'import_contacts':
        return this.actions.actionImportContacts(workspaceId, args);
      case 'generate_sales_funnel':
        return this.actions.actionGenerateSalesFunnel(workspaceId, args);
      case 'schedule_campaign':
        return this.actions.actionScheduleCampaign(workspaceId, args);
      case 'get_workspace_status':
        return this.actions.actionGetWorkspaceStatus(workspaceId, args);
      case 'update_billing_info':
        return this.actions.actionUpdateBillingInfo(workspaceId, args);
      case 'get_billing_status':
        return this.actions.actionGetBillingStatus(workspaceId);
      case 'change_plan':
        return this.actions.actionChangePlan(workspaceId, args);
      case 'apply_discount':
        if (this.riskGate) {
          const gateDecision = this.riskGate.gateDiscountOffer({
            amountCents: 0,
            reversible: true,
            target: 'lead',
          });
          if (gateDecision.verdict === 'block') {
            this.logger.error(`R4 BLOCKED: apply_discount — ${gateDecision.reason}`);
            return {
              success: false,
              blocked: true,
              riskClass: gateDecision.classification.class,
              error: gateDecision.reason,
            };
          }
          if (gateDecision.verdict === 'warn') {
            this.logger.warn(
              `Risk gate: discount ${gateDecision.classification.class} — ${gateDecision.reason}`,
            );
          }
        }
        return this.actions.actionApplyDiscount(workspaceId, contactId, phone, args, context);
      case 'handle_objection':
        return this.actions.actionHandleObjection(workspaceId, contactId, phone, args, context);
      case 'qualify_lead':
        return this.actions.actionQualifyLead(workspaceId, contactId, phone, args, context);
      case 'schedule_meeting':
        return this.actions.actionScheduleMeeting(workspaceId, contactId, phone, args, context);
      case 'anti_churn_action':
        return this.actions.actionAntiChurn(workspaceId, contactId, phone, args, context);
      case 'reactivate_ghost':
        return this.actions.actionReactivateGhost(workspaceId, contactId, phone, args, context);
      default:
        this.logger.warn(`Unknown tool: ${tool}`);
        return { success: false, error: 'Unknown tool' };
    }
  }

  private num(v: unknown, fb = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : fb;
  }
}
