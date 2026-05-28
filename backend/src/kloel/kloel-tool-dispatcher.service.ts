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
import {
  runRequestHighRiskApproval,
  runExecuteApprovedApprovalRequest,
  type ApprovedToolExecutionResult,
} from './kloel-tool-dispatcher.approval.helpers';
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
import {
  dispatchBizConfigTool,
  isBizConfigTool,
} from './kloel-tool-dispatcher.biz-config.handlers';
import {
  dispatchProductCatalogTool,
  isProductCatalogTool,
} from './kloel-tool-dispatcher.product-catalog.handlers';
import {
  dispatchWorkspaceInfoTool,
  isWorkspaceInfoTool,
} from './kloel-tool-dispatcher.workspace-info.handlers';
import {
  dispatchWorkspaceActionTool,
  isWorkspaceActionTool,
} from './kloel-tool-dispatcher.workspace-actions.handlers';
import { dispatchChannelTool, isChannelTool } from './kloel-tool-dispatcher.channel.handlers';
import { runCreatePaymentLink } from './kloel-tool-dispatcher.create-payment-link.helpers';
import { SmartPaymentService } from './smart-payment.service';
import { ChannelTransportRegistry } from './channel-transport.registry';
import { RiskGateService } from './risk-class/risk-gate.service';

import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
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
    @Optional() private readonly smartPaymentService?: SmartPaymentService,
    @Optional() private readonly transports?: ChannelTransportRegistry,
    @Optional() private readonly riskGate?: RiskGateService,
  ) {}

  /** Execute a named tool, delegating to the appropriate sub-service. */
  async executeTool(
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId?: string,
  ): Promise<ToolResult> {
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
      const fastPathResult = await this.runFastPathDispatch(workspaceId, toolName, args, userId);
      if (fastPathResult !== null) {
        return fastPathResult;
      }
      return await this.runDirectDispatch(workspaceId, toolName, args, userId);
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
   * Walk the `is*Tool` fast-path checks in declaration order. Each handler
   * returns `null` when the tool name is not part of its domain; the first
   * non-null result wins.
   */
  private async runFastPathDispatch(
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId: string | undefined,
  ): Promise<ToolResult | null> {
    if (isWhatsAppTool(toolName)) {
      const result = await dispatchWhatsAppTool(
        this.whatsappToolsService,
        workspaceId,
        toolName,
        args,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isCodeTool(toolName)) {
      const result = await dispatchCodeTool(
        this.codeToolsService,
        this.codeAnalysisService,
        toolName,
        args,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isSelfTool(toolName)) {
      const result = await dispatchSelfTool(
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
      if (result !== null) {
        return result;
      }
    }
    if (isConfigureTool(toolName)) {
      const result = await dispatchConfigureTool(
        this.chatToolsService,
        this.capRegistryV2,
        workspaceId,
        toolName,
        args,
        userId,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isSalesTool(toolName)) {
      const result = await dispatchSalesTool(
        {
          salesService: this.salesService,
          capRegistryV2: this.capRegistryV2,
          userId,
        },
        workspaceId,
        toolName,
        args,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isAgentTool(toolName)) {
      const result = await dispatchAgentTool(this.chatToolsService, workspaceId, toolName, args);
      if (result !== null) {
        return result;
      }
    }
    if (isAccountTool(toolName)) {
      const result = await dispatchAccountTool(
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
      if (result !== null) {
        return result;
      }
    }
    if (isDottedAliasTool(toolName)) {
      const result = await dispatchDottedAliasTool(
        {
          capRegistryV2: this.capRegistryV2,
          executeTool: (ws, name, a, u) => this.executeTool(ws, name, a, u),
          userId,
        },
        workspaceId,
        toolName,
        args,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isReportsTool(toolName)) {
      const result = await dispatchReportsTool(
        { reportService: this.reportService },
        workspaceId,
        toolName,
        args,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isDepsCoverageTool(toolName)) {
      const result = await dispatchDepsCoverageTool(
        { depsCoverage: this.depsCoverage },
        toolName,
        args,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isWalletSalesTool(toolName)) {
      const result = await dispatchWalletSalesTool(
        { walletSalesTools: this.walletSalesTools },
        workspaceId,
        toolName,
        args,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isBizConfigTool(toolName)) {
      const result = await dispatchBizConfigTool(
        { bizConfigToolsService: this.bizConfigToolsService },
        workspaceId,
        toolName,
        args,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isProductCatalogTool(toolName)) {
      const result = await dispatchProductCatalogTool(
        {
          chatToolsService: this.chatToolsService,
          couponService: this.couponService,
          checkoutService: this.checkoutService,
          productSubTools: this.productSubTools,
        },
        workspaceId,
        toolName,
        args,
        userId,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isWorkspaceInfoTool(toolName)) {
      const result = await dispatchWorkspaceInfoTool(
        { chatToolsService: this.chatToolsService },
        workspaceId,
        toolName,
        args,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isWorkspaceActionTool(toolName)) {
      const result = await dispatchWorkspaceActionTool(
        {
          chatToolsService: this.chatToolsService,
          applyReceipt: (cap, ws, a, r, u, started) =>
            this.withCanonicalReceipt(cap, ws, a, r, u, started),
          userId,
        },
        workspaceId,
        toolName,
        args,
      );
      if (result !== null) {
        return result;
      }
    }
    if (isChannelTool(toolName)) {
      if (!this.transports || !this.riskGate) {
        return { success: false, error: 'channel_dispatch_unavailable' };
      }
      const result = await dispatchChannelTool(
        { transports: this.transports, riskGate: this.riskGate },
        workspaceId,
        toolName,
        args,
      );
      if (result !== null) {
        return result;
      }
    }
    return null;
  }

  /** Handle the small set of tools that remain on the dispatcher directly. */
  private async runDirectDispatch(
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId: string | undefined,
  ): Promise<ToolResult> {
    const asToolArgs = <T>(value: UnknownRecord): T => value as T;
    switch (toolName) {
      case 'publish_product':
      case 'products.review_and_publish':
        return await this.requestHighRiskApproval(workspaceId, toolName, args, userId);
      case 'search_web':
        if (!this.composerService?.searchWeb) {
          return { success: false, error: 'search_unavailable' };
        }
        return await runToolSearchWeb(this.planLimits, this.composerService, workspaceId, args);
      case 'delete_product': {
        const startedAt = Date.now();
        const result = await this.chatToolsService.toolDeleteProduct(workspaceId, asToolArgs(args));
        return this.withCanonicalReceipt(
          'delete_product',
          workspaceId,
          args,
          result,
          userId,
          startedAt,
        );
      }
      case 'create_payment_link':
        return await this.dispatchCreatePaymentLink(workspaceId, args, userId);
      case 'create_campaign':
        return await this.requestHighRiskApproval(workspaceId, toolName, args, userId);
      case 'change_plan':
        return await this.requestHighRiskApproval(workspaceId, toolName, args, userId);
      default:
        return { success: false, error: `Ferramenta desconhecida: ${toolName}` };
    }
  }

  private withCanonicalReceipt(
    capabilityId: string,
    workspaceId: string,
    args: UnknownRecord,
    result: ToolResult,
    userId: string | undefined,
    startedAt: number,
  ): ToolResult {
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
  ): Promise<ToolResult> {
    if (!this.smartPaymentService) {
      return { success: false, error: 'smart_payment_unavailable' };
    }
    return runCreatePaymentLink(
      {
        prisma: this.prisma,
        auditService: this.auditService,
        chatToolsService: this.chatToolsService,
        opsAlert: this.opsAlert,
        logger: { warn: (message) => this.logger.warn(message) },
        applyReceipt: (cap, ws, a, r, u, started) =>
          this.withCanonicalReceipt(cap, ws, a, r, u, started),
      },
      workspaceId,
      args,
      userId,
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
