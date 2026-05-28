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
import { CouponService } from './coupon.service';
import { KloelChatCheckoutTool } from './kloel-chat-checkout.tool';
import { KloelWalletSalesToolsService } from './kloel-wallet-sales-tools.service';
import { SalesService } from '../sales/sales.service';
import { AccountService } from './account.service';
import { SelfHealthService } from './self-awareness/self-health.service';
import { SelfGapsService } from './self-awareness/self-gaps.service';
import { DepsCoverageService } from './self-awareness/deps-coverage.service';
import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import { ReportService } from './report.service';
import { sanitizeDetails } from './kloel-tool-dispatcher.high-risk.helpers';
import {
  runRequestHighRiskApproval,
  runExecuteApprovedApprovalRequest,
  type ApprovedToolExecutionResult,
} from './kloel-tool-dispatcher.approval.helpers';
import { asString, asNumber } from './kloel-tool-dispatcher.helpers';
import { buildCanonicalReceipt } from './kloel-tool-dispatcher.receipt.helpers';
import { dispatchWhatsAppTool, isWhatsAppTool } from './kloel-tool-dispatcher.whatsapp.handlers';
import { dispatchCodeTool, isCodeTool } from './kloel-tool-dispatcher.code.handlers';
import { dispatchSelfTool, isSelfTool } from './kloel-tool-dispatcher.self.handlers';
import { dispatchConfigureTool, isConfigureTool } from './kloel-tool-dispatcher.configure.handlers';
import { dispatchSalesTool, isSalesTool } from './kloel-tool-dispatcher.sales.handlers';
import { dispatchAgentTool, isAgentTool } from './kloel-tool-dispatcher.agent.handlers';
import { dispatchAccountTool, isAccountTool } from './kloel-tool-dispatcher.account.handlers';
import {
  dispatchDottedAliasTool,
  isDottedAliasTool,
} from './kloel-tool-dispatcher.dotted-alias.handlers';
import { dispatchReportsTool, isReportsTool } from './kloel-tool-dispatcher.reports.handlers';
import {
  dispatchDepsCoverageTool,
  isDepsCoverageTool,
} from './kloel-tool-dispatcher.deps-coverage.handlers';
import {
  dispatchWalletSalesTool,
  isWalletSalesTool,
} from './kloel-tool-dispatcher.wallet-sales.handlers';

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
    @Optional() private readonly accountService?: AccountService,
    @Optional() private readonly couponService?: CouponService,
    @Optional() private readonly checkoutService?: KloelChatCheckoutTool,
    @Optional() private readonly productSubTools?: KloelProductSubResourceToolsService,
    @Optional() private readonly walletSalesTools?: KloelWalletSalesToolsService,
    @Optional() private readonly salesService?: SalesService,
    @Optional() private readonly reportService?: ReportService,

    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly selfHealth?: SelfHealthService,
    @Optional() private readonly selfGaps?: SelfGapsService,
    @Optional() private readonly depsCoverage?: DepsCoverageService,
    @Optional() private readonly capRegistryV2?: CapabilityRegistryV2Service,
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
      if (isWhatsAppTool(toolName)) {
        const whatsappResult = await dispatchWhatsAppTool(
          this.whatsappToolsService,
          workspaceId,
          toolName,
          args,
        );
        if (whatsappResult !== null) {
          return whatsappResult;
        }
      }
      if (isCodeTool(toolName)) {
        const codeResult = await dispatchCodeTool(
          this.codeToolsService,
          this.codeAnalysisService,
          toolName,
          args,
        );
        if (codeResult !== null) {
          return codeResult;
        }
      }
      if (isSelfTool(toolName)) {
        const selfResult = await dispatchSelfTool(
          {
            auditService: this.auditService,
            selfGaps: this.selfGaps,
            selfHealth: this.selfHealth,
            capRegistryV2: this.capRegistryV2,
          },
          workspaceId,
          toolName,
          args,
        );
        if (selfResult !== null) {
          return selfResult;
        }
      }
      if (isConfigureTool(toolName)) {
        const configureResult = await dispatchConfigureTool(
          this.chatToolsService,
          this.capRegistryV2,
          workspaceId,
          toolName,
          args,
          userId,
        );
        if (configureResult !== null) {
          return configureResult;
        }
      }
      if (isSalesTool(toolName)) {
        const salesResult = await dispatchSalesTool(
          {
            salesService: this.salesService,
            capRegistryV2: this.capRegistryV2,
            userId,
          },
          workspaceId,
          toolName,
          args,
        );
        if (salesResult !== null) {
          return salesResult;
        }
      }
      if (isAgentTool(toolName)) {
        const agentResult = await dispatchAgentTool(
          this.chatToolsService,
          workspaceId,
          toolName,
          args,
        );
        if (agentResult !== null) {
          return agentResult;
        }
      }
      if (isAccountTool(toolName)) {
        const accountResult = await dispatchAccountTool(
          {
            accountService: this.accountService,
            walletSalesTools: this.walletSalesTools,
            executeTool: (ws, name, a, u) => this.executeTool(ws, name, a, u),
            userId,
          },
          workspaceId,
          toolName,
          args,
        );
        if (accountResult !== null) {
          return accountResult;
        }
      }
      if (isDottedAliasTool(toolName)) {
        const aliasResult = await dispatchDottedAliasTool(
          {
            capRegistryV2: this.capRegistryV2,
            executeTool: (ws, name, a, u) => this.executeTool(ws, name, a, u),
            userId,
          },
          workspaceId,
          toolName,
          args,
        );
        if (aliasResult !== null) {
          return aliasResult;
        }
      }
      if (isReportsTool(toolName)) {
        const reportsResult = await dispatchReportsTool(
          { reportService: this.reportService },
          workspaceId,
          toolName,
          args,
        );
        if (reportsResult !== null) {
          return reportsResult;
        }
      }
      if (isDepsCoverageTool(toolName)) {
        const depsResult = await dispatchDepsCoverageTool(
          { depsCoverage: this.depsCoverage },
          toolName,
          args,
        );
        if (depsResult !== null) {
          return depsResult;
        }
      }
      if (isWalletSalesTool(toolName)) {
        const walletSalesResult = await dispatchWalletSalesTool(
          { walletSalesTools: this.walletSalesTools },
          workspaceId,
          toolName,
          args,
        );
        if (walletSalesResult !== null) {
          return walletSalesResult;
        }
      }
      switch (toolName) {
        case 'save_product':
        case 'create_product': {
          const productArgs = userId ? { ...args, actorId: userId } : args;
          return await this.chatToolsService.toolSaveProduct(workspaceId, asToolArgs(productArgs));
        }
        // ── products.create handled via isDottedAliasTool fast-path above ──
        case 'list_products':
          return await this.chatToolsService.toolListProducts(workspaceId);
        case 'update_product': {
          const productArgs = userId ? { ...args, actorId: userId } : args;
          return await this.chatToolsService.toolUpdateProduct(
            workspaceId,
            asToolArgs(productArgs),
          );
        }
        // ── products.update handled via isDottedAliasTool fast-path above ──
        case 'publish_product':
        case 'products.review_and_publish':
          return await this.requestHighRiskApproval(workspaceId, toolName, args, userId);
        // ── SELF-AWARENESS handled via isSelfTool fast-path above ──
        case 'toggle_autopilot': {
          const startedAt = Date.now();
          const result = await this.chatToolsService.toolToggleAutopilot(
            workspaceId,
            asToolArgs(args),
          );
          return this.withCanonicalReceipt(
            'toggle_autopilot',
            workspaceId,
            args,
            result,
            userId,
            startedAt,
          );
        }
        case 'set_brand_voice': {
          const startedAt = Date.now();
          const result = await this.chatToolsService.toolSetBrandVoice(
            workspaceId,
            asToolArgs(args),
          );
          const resultWithTone = result.success ? { ...result, tone: asString(args.tone) } : result;
          return this.withCanonicalReceipt(
            'set_brand_voice',
            workspaceId,
            args,
            resultWithTone,
            userId,
            startedAt,
          );
        }
        case 'set_sales_policy': {
          const startedAt = Date.now();
          const result = await this.chatToolsService.toolSetSalesPolicy(
            workspaceId,
            asToolArgs(args),
            userId,
          );
          return this.withCanonicalReceipt(
            'set_sales_policy',
            workspaceId,
            args,
            result,
            userId,
            startedAt,
          );
        }
        case 'remember_user_info': {
          const startedAt = Date.now();
          const result = await this.chatToolsService.toolRememberUserInfo(
            workspaceId,
            asToolArgs(args),
            userId,
          );
          const resultWithMemory = result.success
            ? { ...result, key: asString(args.key), value: asString(args.value) }
            : result;
          return this.withCanonicalReceipt(
            'remember_user_info',
            workspaceId,
            args,
            resultWithMemory,
            userId,
            startedAt,
          );
        }
        case 'search_web':
          return await runToolSearchWeb(this.planLimits, this.composerService, workspaceId, args);
        case 'create_flow': {
          const startedAt = Date.now();
          const result = await this.chatToolsService.toolCreateFlow(workspaceId, asToolArgs(args));
          return this.withCanonicalReceipt(
            'create_flow',
            workspaceId,
            args,
            result,
            userId,
            startedAt,
          );
        }
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
        // ── wallet/sales tools handled via isWalletSalesTool fast-path above ──
        // ── sales.list handled via isAccountTool fast-path above ──
        case 'toggle_theme':
          return await this.chatToolsService.toolToggleTheme(workspaceId, asToolArgs(args));
        case 'coupon_create':
          if (this.couponService) {
            return this.couponService.create(workspaceId, {
              productId: asString(args.productId),
              code: asString(args.code),
              discountType: asString(args.discountType, 'percentage'),
              discountValue: asNumber(args.discountValue),
            });
          }
          return { success: false, error: 'coupon_service_unavailable' };
        case 'checkout_create':
          if (this.checkoutService) {
            return this.checkoutService.create(workspaceId, {
              productId: asString(args.productId),
              name: asString(args.name) || asString(args.checkoutName, 'Checkout'),
            });
          }
          return { success: false, error: 'checkout_service_unavailable' };
        // ── plans.*, checkouts.*, coupons.* aliases handled via isDottedAliasTool fast-path above ──
        case 'plan_create':
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
          if (this.productSubTools) {
            return await this.productSubTools.executeTool(toolName, workspaceId, asToolArgs(args));
          }
          return { success: false, error: 'product_sub_resource_tools_not_available' };
        // ── generate_pix / generate_boleto handled via isDottedAliasTool fast-path above ──
        // ── sales.create_pix / sales.create_boleto handled via isSalesTool fast-path above ──
        case 'delete_product': {
          const startedAt = Date.now();
          const result = await this.chatToolsService.toolDeleteProduct(
            workspaceId,
            asToolArgs(args),
          );
          return this.withCanonicalReceipt(
            'delete_product',
            workspaceId,
            args,
            result,
            userId,
            startedAt,
          );
        }
        case 'get_settings':
          return await this.chatToolsService.toolGetSettings(workspaceId);
        // ── request_withdrawal handled via isWalletSalesTool fast-path above ──
        case 'get_analytics':
          return await this.chatToolsService.toolGetAnalytics(workspaceId, asToolArgs(args));
        case 'get_product_details':
          return await this.chatToolsService.toolGetProductDetails(workspaceId, asToolArgs(args));
        case 'list_subscriptions':
          return await this.chatToolsService.toolListSubscriptions(workspaceId, asToolArgs(args));
        case 'update_subscription':
          return {
            success: true,
            message: args.action === 'cancel' ? 'Assinatura cancelada.' : 'Assinatura pausada.',
          };
        case 'update_affiliate_config':
          return await this.bizConfigToolsService.toolUpdateAffiliateConfig(
            workspaceId,
            asToolArgs(args),
          );
        case 'list_affiliates':
          return await this.bizConfigToolsService.toolListAffiliates(workspaceId);
        case 'get_affiliate_config':
          return await this.chatToolsService.toolGetAffiliateConfig(workspaceId);
        case 'upload_plan_image':
          return await this.chatToolsService.toolUploadPlanImage(workspaceId, asToolArgs(args));
        case 'upload_product_image': {
          const productArgs = userId ? { ...args, actorId: userId } : args;
          return await this.chatToolsService.toolUploadProductImage(
            workspaceId,
            asToolArgs(productArgs),
          );
        }
        // ── products.upload_image handled via isDottedAliasTool fast-path above ──
        // ── update_personal_data + account.* aliases handled via isAccountTool fast-path above ──
        case 'update_fiscal_data':
          return await this.bizConfigToolsService.toolSaveBusinessInfo(
            workspaceId,
            asToolArgs(args),
          );
        case 'upload_document':
          return await this.bizConfigToolsService.toolUploadDocument(workspaceId, asToolArgs(args));
        // ── CONFIGURE_* family handled via isConfigureTool fast-path above ──
        case 'get_social_channels':
          return await this.bizConfigToolsService.toolGetSocialChannels(workspaceId);
        case 'browse_marketplace':
          return await this.chatToolsService.toolBrowseMarketplace(workspaceId, asToolArgs(args));
        // ── get_nps / get_churn / list_refunds / request_anticipation handled via isWalletSalesTool fast-path above ──
        case 'connect_channel':
          return await this.bizConfigToolsService.toolConnectChannel(workspaceId, asToolArgs(args));
        case 'send_channel_message':
          return await this.chatToolsService.toolSendChannelMessage(workspaceId, asToolArgs(args));
        case 'create_broadcast': {
          const startedAt = Date.now();
          const result = await this.chatToolsService.toolCreateBroadcast(
            workspaceId,
            asToolArgs(args),
          );
          return this.withCanonicalReceipt(
            'create_broadcast',
            workspaceId,
            args,
            result,
            userId,
            startedAt,
          );
        }
        case 'configure_ai_persona': {
          const startedAt = Date.now();
          const result = await this.chatToolsService.toolConfigureAiPersona(
            workspaceId,
            asToolArgs(args),
          );
          return this.withCanonicalReceipt(
            'configure_ai_persona',
            workspaceId,
            args,
            result,
            userId,
            startedAt,
          );
        }
        case 'update_workspace_settings':
          return await this.bizConfigToolsService.toolSaveBusinessInfo(
            workspaceId,
            asToolArgs(args),
          );
        // ── agent_* family handled via isAgentTool fast-path above ──
        case 'create_order':
          return await this.chatToolsService.toolCreateOrder(workspaceId, asToolArgs(args));
        case 'create_payment_link':
          return await this.dispatchCreatePaymentLink(workspaceId, args, userId);
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
        // ── Deps + Coverage + Affected tests (Wave 7 PI-EE) handled via isDepsCoverageTool fast-path above ──
        // ── REPORTS (w25) handled via isReportsTool fast-path above ──
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

  private withCanonicalReceipt(
    capabilityId: string,
    workspaceId: string,
    args: UnknownRecord,
    result: { success: boolean; message?: string; error?: string; [key: string]: unknown },
    userId: string | undefined,
    startedAt: number,
  ): { success: boolean; message?: string; error?: string; [key: string]: unknown } {
    return buildCanonicalReceipt(
      this.capRegistryV2,
      capabilityId,
      workspaceId,
      args,
      result,
      userId,
      startedAt,
    );
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
    const startedAt = Date.now();
    const paymentArgs: {
      amount: number;
      description: string;
      customerName?: string;
    } = {
      amount: asNumber(args.amount),
      description: asString(args.description),
      ...(typeof args.customerName === 'string' ? { customerName: args.customerName } : {}),
    };
    const result = await this.chatToolsService.toolCreatePaymentLink(workspaceId, {
      ...paymentArgs,
      executionPath: 'dispatcher',
    });
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
            details: sanitizeDetails(paymentArgs),
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
    return this.withCanonicalReceipt(
      'create_payment_link',
      workspaceId,
      paymentArgs,
      result,
      userId,
      startedAt,
    );
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
    return runExecuteApprovedApprovalRequest(
      this.prisma,
      this.bizConfigToolsService,
      this.chatToolsService,
      input,
    );
  }
}
