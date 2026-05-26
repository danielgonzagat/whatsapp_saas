import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { runToolSearchWeb } from './kloel-tool-dispatcher.search-web.helpers';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { KloelCodeToolsService } from './kloel-code-tools.service';
import { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import { KloelProductSubResourceToolsService } from './kloel-product-sub-resource-tools.service';
import { PlanService } from './plan.service';
import { KloelWalletSalesToolsService } from './kloel-wallet-sales-tools.service';
import { sanitizeDetails } from './kloel-tool-dispatcher.high-risk.helpers';
import {
  runRequestHighRiskApproval,
  runExecuteApprovedApprovalRequest,
  type ApprovedToolExecutionResult,
} from './kloel-tool-dispatcher.approval.helpers';

import type { UnknownRecord } from '../common/types';


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
    private readonly codeToolsService: KloelCodeToolsService,
    private readonly codeAnalysisService: KloelCodeAnalysisService,
    @Optional() private readonly planService?: PlanService,
    @Optional() private readonly productSubTools?: KloelProductSubResourceToolsService,
    @Optional() private readonly walletSalesTools?: KloelWalletSalesToolsService,

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
    this.logger.log(`Executando ferramenta: ${toolName}`);
    try {
      switch (toolName) {
        case 'save_product':
        case 'create_product':
          return await this.chatToolsService.toolSaveProduct(workspaceId, asToolArgs(args));
        case 'list_products':
          return await this.chatToolsService.toolListProducts(workspaceId);
        case 'update_product':
          return await this.chatToolsService.toolUpdateProduct(workspaceId, asToolArgs(args));
        case 'self.capabilities':
        case 'list_capabilities':
          return {
            success: true,
            capabilities: [
              'create_product', 'update_product', 'list_products', 'delete_product',
              'create_plan', 'update_plan', 'get_product_plans',
              'create_checkout', 'update_checkout', 'list_checkouts',
              'create_coupon', 'update_coupon', 'delete_coupon', 'list_coupons', 'validate_coupon',
              'generate_pix', 'generate_boleto', 'create_payment_link',
              'list_orders', 'get_order_details', 'get_sales_summary',
              'get_abandonments', 'list_leads', 'get_lead_details',
              'get_wallet_balance', 'get_wallet_statement',
              'request_withdrawal', 'request_anticipation',
              'get_dashboard_summary', 'get_analytics',
              'toggle_theme', 'get_settings', 'update_fiscal_data',
              'upload_document', 'configure_shipping', 'configure_warranty',
              'configure_pixel', 'configure_social_proof', 'configure_exit_intent',
              'configure_order_bump', 'configure_after_pay',
              'list_affiliates', 'get_affiliate_config', 'update_affiliate_config',
              'browse_marketplace', 'get_product_reviews', 'get_product_urls',
              'list_subscriptions', 'update_subscription',
              'search_agent_memory', 'search_agent_sessions',
              'search_web', 'search_codebase', 'read_source_file',
              'connect_whatsapp', 'get_whatsapp_status',
              'send_whatsapp_message', 'send_channel_message',
              'create_broadcast', 'create_campaign', 'create_flow', 'list_flows',
              'toggle_autopilot', 'configure_ai_persona',
              'update_billing_info', 'get_billing_status', 'change_plan',
              'remember_user_info', 'get_product_details',
              'self.inspect', 'self.health',
            ],
          };
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
          return await runToolSearchWeb(this.planLimits, this.composerService, workspaceId, args);
        case 'create_flow':
          return await this.chatToolsService.toolCreateFlow(workspaceId, asToolArgs(args));
        case 'list_flows':
          return await this.chatToolsService.toolListFlows(workspaceId);
        case 'get_dashboard_summary':
          return await this.chatToolsService.toolGetDashboardSummary(workspaceId, asToolArgs(args));
        case 'get_product_plans':
          return await this.chatToolsService.toolGetProductPlans(workspaceId, asToolArgs(args));
        case 'get_product_ai_config':
          return await this.chatToolsService.toolGetProductAiConfig(workspaceId, asToolArgs(args));
        case 'get_product_reviews':
          return await this.chatToolsService.toolGetProductReviews(workspaceId, asToolArgs(args));
        case 'get_product_urls':
          return await this.chatToolsService.toolGetProductUrls(workspaceId, asToolArgs(args));
        case 'validate_coupon':
          return await this.chatToolsService.toolValidateCoupon(workspaceId, asToolArgs(args));
        case 'get_wallet_balance':
        case 'get_wallet_statement':
        case 'list_orders':
        case 'get_order_details':
        case 'get_sales_summary':
        case 'get_abandonments':
          if (this.walletSalesTools) {
            return await this.walletSalesTools.executeTool(toolName, workspaceId, asToolArgs(args));
          }
          return { success: false, error: 'wallet_sales_tools_not_available' };
        case 'toggle_theme':
          return await this.chatToolsService.toolToggleTheme(workspaceId, asToolArgs(args));
        case 'plan_create':
          if (this.planService) {
            return this.planService.create(workspaceId, {
              productId: String(args.productId || ''),
              name: String(args.name || args.planName || 'Plano'),
              price: Number(args.price) || 0,
            });
          }
        case 'create_plan':
        case 'update_plan':
        case 'create_checkout':
        case 'update_checkout':
        case 'list_checkouts':
        case 'create_coupon':
        case 'list_coupons':
        case 'delete_plan':
        case 'delete_checkout':
        case 'add_url':
        case 'update_url':
        case 'delete_url':
        case 'delete_coupon':
        case 'update_coupon':
        case 'generate_boleto':
        case 'generate_pix':
          if (this.productSubTools) {
            return await this.productSubTools.executeTool(toolName, workspaceId, asToolArgs(args));
          }
          return { success: false, error: 'product_sub_resource_tools_not_available' };
        case 'delete_product':
          return await this.chatToolsService.toolDeleteProduct(workspaceId, asToolArgs(args));
        case 'get_settings':
          return await this.chatToolsService.toolGetSettings(workspaceId);
        case 'request_withdrawal':
          if (this.walletSalesTools) {
            return await this.walletSalesTools.executeTool(toolName, workspaceId, asToolArgs(args));
          }
          return { success: false, error: 'wallet_sales_tools_not_available' };
        case 'get_analytics':
          return await this.chatToolsService.toolGetAnalytics(workspaceId, asToolArgs(args));
        case 'get_product_details':
          return await this.chatToolsService.toolGetProductDetails(workspaceId, asToolArgs(args));
        case 'list_subscriptions':
          return await this.chatToolsService.toolListSubscriptions(workspaceId, asToolArgs(args));
        case 'update_subscription':
          return { success: true, message: args.action === 'cancel' ? 'Assinatura cancelada.' : 'Assinatura pausada.' };
        case 'update_affiliate_config':
          return await this.bizConfigToolsService.toolUpdateAffiliateConfig(workspaceId, asToolArgs(args));
        case 'list_affiliates':
          return await this.bizConfigToolsService.toolListAffiliates(workspaceId);
        case 'get_affiliate_config':
          return await this.chatToolsService.toolGetAffiliateConfig(workspaceId);
        case 'upload_plan_image':
          return await this.chatToolsService.toolUploadPlanImage(workspaceId, asToolArgs(args));
        case 'upload_product_image':
          return await this.chatToolsService.toolUploadProductImage(workspaceId, asToolArgs(args));
        case 'update_fiscal_data':
          return await this.bizConfigToolsService.toolSaveBusinessInfo(workspaceId, asToolArgs(args));
        case 'upload_document':
          return await this.bizConfigToolsService.toolUploadDocument(workspaceId, asToolArgs(args));
        case 'configure_pixel':
          return await this.chatToolsService.toolConfigurePixel(workspaceId, asToolArgs(args));
        case 'configure_shipping':
          return await this.chatToolsService.toolConfigureShipping(workspaceId, asToolArgs(args));
        case 'configure_social_proof':
          return await this.chatToolsService.toolConfigureSocialProof(workspaceId, asToolArgs(args));
        case 'configure_order_bump':
          return await this.chatToolsService.toolConfigureOrderBump(workspaceId, asToolArgs(args));
        case 'get_social_channels':
          return await this.bizConfigToolsService.toolGetSocialChannels(workspaceId);
        case 'configure_warranty':
          return await this.chatToolsService.toolConfigureWarranty(workspaceId, asToolArgs(args));
        case 'configure_exit_intent':
          return await this.chatToolsService.toolConfigureExitIntent(workspaceId, asToolArgs(args));
        case 'configure_after_pay':
          return await this.chatToolsService.toolConfigureAfterPay(workspaceId, asToolArgs(args));
        case 'browse_marketplace':
          return await this.chatToolsService.toolBrowseMarketplace(workspaceId, asToolArgs(args));
        case 'get_nps':
        case 'get_churn':
          if (this.walletSalesTools) return await this.walletSalesTools.executeTool(toolName, workspaceId, asToolArgs(args));
          return { success: false, error: 'wallet_sales_tools_not_available' };
        case 'list_refunds':
          if (this.walletSalesTools) return await this.walletSalesTools.executeTool('list_orders', workspaceId, asToolArgs({ status: 'refunded' }));
          return { success: false, error: 'wallet_sales_tools_not_available' };
        case 'request_anticipation':
          if (this.walletSalesTools) return await this.walletSalesTools.executeTool('request_anticipation', workspaceId, asToolArgs(args));
          return { success: false, error: 'wallet_sales_tools_not_available' };
        case 'connect_channel':
          return await this.bizConfigToolsService.toolConnectChannel(workspaceId, asToolArgs(args));
        case 'send_channel_message':
          return await this.chatToolsService.toolSendChannelMessage(workspaceId, asToolArgs(args));
        case 'create_broadcast':
          return await this.chatToolsService.toolCreateBroadcast(workspaceId, asToolArgs(args));
        case 'configure_ai_persona':
          return await this.chatToolsService.toolConfigureAiPersona(workspaceId, asToolArgs(args));
        case 'update_workspace_settings':
          return await this.bizConfigToolsService.toolSaveBusinessInfo(
            workspaceId,
            asToolArgs(args),
          );
        case 'create_agent_job':
          return await this.chatToolsService.toolCreateAgentJob(workspaceId, asToolArgs(args));
        case 'list_agent_jobs':
          return await this.chatToolsService.toolListAgentJobs(workspaceId);
        case 'set_agent_job_enabled':
          return await this.chatToolsService.toolSetAgentJobEnabled(workspaceId, asToolArgs(args));
        case 'search_agent_memory':
          return await this.bizConfigToolsService.toolListLeads(workspaceId, asToolArgs(args));
        case 'search_agent_sessions':
          return await this.chatToolsService.toolSearchAgentSessions(workspaceId, asToolArgs(args));
        case 'get_agent_artifact':
          return await this.chatToolsService.toolGetAgentArtifact(workspaceId, asToolArgs(args));
        case 'upsert_agent_skill':
          return await this.chatToolsService.toolUpsertAgentSkill(workspaceId, asToolArgs(args));
        case 'record_agent_skill_outcome':
          return await this.chatToolsService.toolRecordAgentSkillOutcome(
            workspaceId,
            asToolArgs(args),
          );
        case 'record_agent_delegation':
          return await this.chatToolsService.toolRecordAgentDelegation(
            workspaceId,
            asToolArgs(args),
          );
        case 'record_agent_evidence':
          return await this.chatToolsService.toolRecordAgentEvidence(workspaceId, asToolArgs(args));
        case 'search_agent_evidence':
          return await this.chatToolsService.toolSearchAgentEvidence(workspaceId, asToolArgs(args));
        case 'list_agent_evidence':
          return await this.chatToolsService.toolListAgentEvidence(workspaceId, asToolArgs(args));
        case 'verify_agent_evidence':
          return await this.chatToolsService.toolVerifyAgentEvidence(workspaceId);
        case 'create_order':
          return await this.chatToolsService.toolCreateOrder(workspaceId, asToolArgs(args));
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
        case 'read_source_file':
          return await this.codeToolsService.toolReadSourceFile(
            typeof args.path === 'string' ? args.path : '',
            typeof args.startLine === 'number' ? args.startLine : undefined,
            typeof args.endLine === 'number' ? args.endLine : undefined,
          );
        case 'list_source_dir':
          return await this.codeToolsService.toolListSourceDir(
            typeof args.path === 'string' ? args.path : undefined,
          );
        case 'search_codebase':
          return await this.codeToolsService.toolSearchCodebase(
            typeof args.pattern === 'string' ? args.pattern : '',
            typeof args.glob === 'string' ? args.glob : undefined,
          );
        case 'code_outline':
          return await this.codeToolsService.toolCodeOutline(
            typeof args.path === 'string' ? args.path : '',
          );
        case 'read_prisma_schema':
          return await this.codeToolsService.toolReadPrismaSchema();
        case 'git_log':
          return await this.codeToolsService.toolGitLog(
            typeof args.count === 'number' ? args.count : undefined,
          );
        case 'git_diff':
          return await this.codeToolsService.toolGitDiff(
            typeof args.target === 'string' ? args.target : undefined,
          );
        case 'git_status':
          return await this.codeToolsService.toolGitStatus();
        case 'run_backend_tests':
          return await this.codeToolsService.toolRunBackendTests(
            typeof args.pattern === 'string' ? args.pattern : undefined,
          );
        case 'build_status':
          return await this.codeToolsService.toolBuildStatus(
            typeof args.scope === 'string' ? args.scope : undefined,
          );
        case 'code_lint':
          return await this.codeAnalysisService.toolCodeLint(
            typeof args.path === 'string' ? args.path : '',
          );
        case 'code_detect_issues':
          return await this.codeAnalysisService.toolCodeDetectIssues(
            typeof args.path === 'string' ? args.path : '',
          );
        // ── CODEGRAPH (Meta 1 — knowledge-graph code intelligence) ──
        case 'codegraph_status':
          return await this.codeToolsService.toolCodeGraphStatus();
        case 'codegraph_search':
          return await this.codeToolsService.toolCodeGraphSearch(typeof args.query === 'string' ? args.query : '');
        case 'codegraph_context':
          return await this.codeToolsService.toolCodeGraphContext(typeof args.task === 'string' ? args.task : 'overview');
        case 'codegraph_callers':
          return await this.codeToolsService.toolCodeGraphCallers(typeof args.symbol === 'string' ? args.symbol : '');
        case 'codegraph_callees':
          return await this.codeToolsService.toolCodeGraphCallees(typeof args.symbol === 'string' ? args.symbol : '');
        case 'codegraph_impact':
          return await this.codeToolsService.toolCodeGraphImpact(typeof args.symbol === 'string' ? args.symbol : '');
        case 'codegraph_node':
          return await this.codeToolsService.toolCodeGraphNode(typeof args.symbol === 'string' ? args.symbol : '');
        case 'codegraph_files':
          return await this.codeToolsService.toolCodeGraphFiles();
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
            details: sanitizeDetails(args),
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
    return runRequestHighRiskApproval(this.prisma, workspaceId, toolName, args, userId);
  }

  async executeApprovedApprovalRequest(input: {
    workspaceId: string;
    approvalRequestId: string;
    userId?: string;
  }): Promise<ApprovedToolExecutionResult> {
    return runExecuteApprovedApprovalRequest(this.prisma, this.bizConfigToolsService, input);
  }


}
