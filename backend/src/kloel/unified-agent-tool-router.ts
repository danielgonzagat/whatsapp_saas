import OpenAI from 'openai';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AgentRuntimeContextService } from './agent-runtime';
import type { RiskGateService } from './risk-class/risk-gate.service';
import type { UnifiedAgentActionsService } from './unified-agent-actions.service';
import type { ToolArgs } from './unified-agent.types';
type UnknownRecord = Record<string, unknown>;
type ToolRouterLogger = {
  log(message: string, meta?: unknown): void;
  warn(message: string): void;
  error(message: string): void;
};
function num(v: unknown, fb = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fb;
}
export async function executeUnifiedAgentToolAction(params: {
  readonly workspaceId: string;
  readonly contactId: string;
  readonly phone: string;
  readonly tool: string;
  readonly args: ToolArgs;
  readonly context?: UnknownRecord;
  readonly logger: ToolRouterLogger;
  readonly actions: UnifiedAgentActionsService;
  readonly prisma: PrismaService;
  readonly auditService: AuditService;
  readonly agentRuntime?: AgentRuntimeContextService;
  readonly riskGate?: RiskGateService;
  readonly openai: OpenAI | null;
  readonly primaryBrainModel: string;
  readonly fallbackBrainModel: string;
}): Promise<unknown> {
  const {
    workspaceId,
    contactId,
    phone,
    tool,
    args,
    context,
    logger,
    actions,
    prisma,
    auditService,
    agentRuntime,
    riskGate,
    openai,
    primaryBrainModel,
    fallbackBrainModel,
  } = params;
    logger.log(`Executing tool: ${tool}`, { args });
    const envelope = agentRuntime?.buildToolEnvelope({ workspaceId, toolName: tool }) ?? {
      id: 'agent-runtime-unavailable',
      toolName: tool,
      allowed: true,
    };
    switch (tool) {
      case 'send_message':
        return actions.actionSendMessage(workspaceId, phone, args, context);
      case 'send_product_info':
        return actions.actionSendProductInfo(workspaceId, phone, args, context);
      case 'create_payment_link': {
        const paymentAmount = num(args.amount);
        if (riskGate && paymentAmount > 0) {
          const gateDecision = riskGate.gatePaymentAction({
            amountCents: paymentAmount,
            reversible: true,
            target: 'lead',
          });
          if (gateDecision.verdict === 'block') {
            logger.error(
              `R4 BLOCKED: create_payment_link — ${gateDecision.reason}`,
            );
            return {
              success: false,
              blocked: true,
              riskClass: gateDecision.classification.class,
              error: gateDecision.reason,
            };
          }
          if (gateDecision.verdict === 'warn') {
            logger.warn(
              `Risk gate: payment ${gateDecision.classification.class} — ${gateDecision.reason}`,
            );
          }
        }
        const result = await actions.actionCreatePaymentLink(
          workspaceId,
          phone,
          args,
          context,
        );
        try {
          await prisma.$transaction(
            async (tx) => {
              await auditService.logWithTx(tx, {
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
          logger.warn(`Audit dispatch log failed: ${auditMsg}`);
        }
        return result;
      }
      case 'update_lead_status':
        return actions.actionUpdateLeadStatus(workspaceId, contactId, args);
      case 'add_tag':
        return actions.actionAddTag(workspaceId, contactId, args);
      case 'schedule_followup':
        return actions.actionScheduleFollowup(workspaceId, contactId, phone, args, context);
      case 'transfer_to_human':
        return actions.actionTransferToHuman(workspaceId, contactId, args, context);
      case 'search_knowledge_base':
        return actions.actionSearchKnowledgeBase(workspaceId, args);
      case 'trigger_flow':
        return actions.actionTriggerFlow(workspaceId, phone, args);
      case 'log_event':
        return actions.actionLogEvent(workspaceId, contactId, args);
      case 'send_media':
        return actions.actionSendMedia(workspaceId, phone, args, context);
      case 'send_document':
        return actions.actionSendDocument(workspaceId, phone, args, context);
      case 'send_voice_note':
        return actions.actionSendVoiceNote(workspaceId, phone, args, context);
      case 'send_audio':
        return actions.actionSendAudio(workspaceId, phone, args, context);
      case 'transcribe_audio':
        return actions.actionTranscribeAudio(workspaceId, args);
      case 'create_product':
        return actions.actionCreateProduct(workspaceId, args);
      case 'update_product':
        return actions.actionUpdateProduct(workspaceId, args);
      case 'get_product_plans':
        return actions.getProductPlans(actions.str(args.productId));
      case 'get_product_ai_config':
        return actions.getProductAIConfig(actions.str(args.productId));
      case 'get_product_reviews':
        return actions.getProductReviews(actions.str(args.productId));
      case 'get_product_urls':
        return actions.getProductUrls(actions.str(args.productId));
      case 'validate_coupon':
        return actions.validateCoupon(
          actions.str(args.productId),
          actions.str(args.code),
        );
      case 'create_flow':
        return actions.actionCreateFlow(workspaceId, args);
      case 'update_workspace_settings':
        return actions.actionUpdateWorkspaceSettings(workspaceId, args);
      case 'create_broadcast':
        return actions.actionCreateBroadcast(workspaceId, args, context);
      case 'get_analytics':
        return actions.actionGetAnalytics(workspaceId, args);
      case 'configure_ai_persona':
        return actions.actionConfigureAIPersona(workspaceId, args);
      case 'toggle_autopilot':
        return actions.actionToggleAutopilot(workspaceId, args);
      case 'create_flow_from_description':
        return actions.actionCreateFlowFromDescription(
          workspaceId,
          args,
          openai,
          primaryBrainModel,
          fallbackBrainModel,
        );
      case 'connect_whatsapp':
        return actions.actionConnectWhatsApp(workspaceId, args);
      case 'import_contacts':
        return actions.actionImportContacts(workspaceId, args);
      case 'generate_sales_funnel':
        return actions.actionGenerateSalesFunnel(workspaceId, args);
      case 'schedule_campaign':
        return actions.actionScheduleCampaign(workspaceId, args);
      case 'get_workspace_status':
        return actions.actionGetWorkspaceStatus(workspaceId, args);
      case 'update_billing_info':
        return actions.actionUpdateBillingInfo(workspaceId, args);
      case 'get_billing_status':
        return actions.actionGetBillingStatus(workspaceId);
      case 'change_plan':
        return actions.actionChangePlan(workspaceId, args);
      case 'apply_discount':
        if (riskGate) {
          const gateDecision = riskGate.gateDiscountOffer({
            amountCents: 0,
            reversible: true,
            target: 'lead',
          });
          if (gateDecision.verdict === 'block') {
            logger.error(
              `R4 BLOCKED: apply_discount — ${gateDecision.reason}`,
            );
            return {
              success: false,
              blocked: true,
              riskClass: gateDecision.classification.class,
              error: gateDecision.reason,
            };
          }
          if (gateDecision.verdict === 'warn') {
            logger.warn(
              `Risk gate: discount ${gateDecision.classification.class} — ${gateDecision.reason}`,
            );
          }
        }
        return actions.actionApplyDiscount(workspaceId, contactId, phone, args, context);
      case 'handle_objection':
        return actions.actionHandleObjection(workspaceId, contactId, phone, args, context);
      case 'qualify_lead':
        return actions.actionQualifyLead(workspaceId, contactId, phone, args, context);
      case 'schedule_meeting':
        return actions.actionScheduleMeeting(workspaceId, contactId, phone, args, context);
      case 'anti_churn_action':
        return actions.actionAntiChurn(workspaceId, contactId, phone, args, context);
      case 'reactivate_ghost':
        return actions.actionReactivateGhost(workspaceId, contactId, phone, args, context);
      default:
        logger.warn(`Unknown tool: ${tool}`);
        return { success: false, error: 'Unknown tool', policyEnvelope: envelope };
    }
}
