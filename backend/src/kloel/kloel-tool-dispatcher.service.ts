import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { runToolSearchWeb } from './kloel-tool-dispatcher.search-web.helpers';
import { OpsAlertService } from '../observability/ops-alert.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import { KloelDomainServiceResolver } from './domain-service-resolver.service';
import { MindCapabilityExecutor } from './mind/coordination/mind-capability-executor.service';
import {
  runRequestHighRiskApproval,
  runExecuteApprovedApprovalRequest,
  type ApprovedToolExecutionResult,
} from './kloel-tool-dispatcher.approval.helpers';
import { buildCanonicalReceipt } from './kloel-tool-dispatcher.receipt.helpers';
import { runCreatePaymentLink } from './kloel-tool-dispatcher.create-payment-link.helpers';
import { SmartPaymentService } from './smart-payment.service';
import {
  runFastPathDispatch,
  checkMindGuard,
  type FastPathServices,
} from './kloel-tool-dispatcher.fast-path.helpers';

import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { KloelCodeToolsService } from './kloel-code-tools.service';
import { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import type { KloelProductSubResourceToolsService } from './kloel-product-sub-resource-tools.service';
import type { CouponService } from './coupon.service';
import type { KloelChatCheckoutTool } from './kloel-chat-checkout.tool';
import type { KloelWalletSalesToolsService } from './kloel-wallet-sales-tools.service';
import type { SalesService } from '../sales/sales.service';
import type { AccountService } from './account.service';
import type { SelfHealthService } from './self-awareness/self-health.service';
import type { SelfGapsService } from './self-awareness/self-gaps.service';
import type { DepsCoverageService } from './self-awareness/deps-coverage.service';
import type { MindCapabilityRegistry } from './mind/coordination/mind-capability-registry.service';
import type { MindGuardsService } from './mind/policy/mind-guards.service';
import type { ReportService } from './report.service';
import type { ChannelTransportRegistry } from './channel-transport.registry';
import type { RiskGateService } from './risk-class/risk-gate.service';

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
    @Optional() private readonly workspaceService?: WorkspaceService,
    @Optional() private readonly reportService?: ReportService,

    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly selfHealth?: SelfHealthService,
    @Optional() private readonly selfGaps?: SelfGapsService,
    @Optional() private readonly depsCoverage?: DepsCoverageService,
    @Optional() private readonly capRegistryV2?: CapabilityRegistryV2Service,
    @Optional() private readonly mindCapabilityRegistry?: MindCapabilityRegistry,
    @Optional() private readonly smartPaymentService?: SmartPaymentService,
    @Optional() private readonly transports?: ChannelTransportRegistry,
    @Optional() private readonly riskGate?: RiskGateService,
    @Optional() private readonly mindCapabilityExecutor?: MindCapabilityExecutor,
    @Optional() private readonly mindGuards?: MindGuardsService,
    @Optional() private readonly domainServiceResolver?: KloelDomainServiceResolver,
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

    const guardBlock = await this.checkMindGuard(workspaceId, toolName);
    if (guardBlock) {
      return guardBlock;
    }

    let result: ToolResult;
    try {
      const fastPathResult = await this.runFastPathDispatch(workspaceId, toolName, args, userId);
      if (fastPathResult !== null) {
        result = fastPathResult;
      } else {
        result = await this.runDirectDispatch(workspaceId, toolName, args, userId);
        // PI-K30: fallback to generic domain-service resolver for ungated capabilities
        if (
          !result.success &&
          typeof result.error === 'string' &&
          result.error.startsWith('Ferramenta desconhecida')
        ) {
          const resolverResult = await this.domainServiceResolver?.tryExecute(
            toolName,
            workspaceId,
            args,
          );
          if (resolverResult !== null && resolverResult !== undefined) {
            result = resolverResult;
          }
        }
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
      result = { success: false, error: msg };
    }

    // fire-and-forget: record execution as mind-tracked capability event
    try {
      this.mindCapabilityExecutor?.recordExecution(
        workspaceId,
        toolName,
        args,
        result,
        result.success,
      );
    } catch (err: unknown) {
      this.logger.warn('kloel_capability_executor_skipped', err);
    }

    return result;
  }

  /**
   * Check MindGuardsService for MUTATION_SENSITIVE tools before dispatch.
   * Returns a block result if the guard vetoes execution; null otherwise.
   */
  private async checkMindGuard(workspaceId: string, toolName: string): Promise<ToolResult | null> {
    return checkMindGuard(
      { mindGuards: this.mindGuards, capRegistryV2: this.capRegistryV2, logger: this.logger },
      workspaceId,
      toolName,
    );
  }

  /**
   * Walk the `is*Tool` fast-path checks in declaration order. Each handler
   * returns `null` when the tool name is not part of its domain; the first
   * non-null result wins.
   */
  private runFastPathDispatch(
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId: string | undefined,
  ): Promise<ToolResult | null> {
    return runFastPathDispatch(this.fastPathServices(), workspaceId, toolName, args, userId);
  }

  private fastPathServices(): FastPathServices {
    return {
      whatsappToolsService: this.whatsappToolsService,
      codeToolsService: this.codeToolsService,
      codeAnalysisService: this.codeAnalysisService,
      auditService: this.auditService,
      chatToolsService: this.chatToolsService,
      bizConfigToolsService: this.bizConfigToolsService,
      prisma: this.prisma,
      selfGaps: this.selfGaps,
      selfHealth: this.selfHealth,
      capRegistryV2: this.capRegistryV2,
      mindCapabilityRegistry: this.mindCapabilityRegistry,
      salesService: this.salesService,
      accountService: this.accountService,
      walletSalesTools: this.walletSalesTools,
      reportService: this.reportService,
      depsCoverage: this.depsCoverage,
      couponService: this.couponService,
      checkoutService: this.checkoutService,
      productSubTools: this.productSubTools,
      transports: this.transports,
      riskGate: this.riskGate,
      executeTool: (ws, name, a, u) => this.executeTool(ws, name, a, u),
      applyReceipt: (cap, ws, a, r, u, s) => this.withCanonicalReceipt(cap, ws, a, r, u, s),
    };
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
      case 'toggle_theme':
      case 'ui.theme': {
        const theme = args?.theme as string;
        if (theme !== 'light' && theme !== 'dark') {
          return { success: false, error: 'invalid_theme' };
        }
        if (!this.workspaceService) {
          return { success: false, error: 'workspace_service_unavailable' };
        }
        const res = await this.workspaceService.updateThemePreference(workspaceId, theme);
        return { success: true, theme: res.theme };
      }
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
