import { Injectable, Optional } from '@nestjs/common';
import { ProductService } from './product.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';
import {
  AgentRuntimeSchedulerService,
  AgentRuntimeEvidenceStoreService,
  AgentRuntimeSessionStore,
  AgentRuntimeSkillRegistry,
} from './agent-runtime';
import {
  type ToolCreateAgentJobArgs,
  type ToolGetAgentArtifactArgs,
  type ToolSearchAgentMemoryArgs,
  type ToolSearchAgentSessionsArgs,
  type ToolSetAgentJobEnabledArgs,
  runCreateAgentJob,
  runGetAgentArtifact,
  runListAgentJobs,
  runSearchAgentMemory,
  runSearchAgentSessions,
  runSetAgentJobEnabled,
} from './kloel-chat-tools.agent-jobs.helpers';
import {
  type ToolListAgentEvidenceArgs,
  type ToolRecordAgentDelegationArgs,
  type ToolRecordAgentEvidenceArgs,
  type ToolRecordAgentSkillOutcomeArgs,
  type ToolResult,
  type ToolSearchAgentEvidenceArgs,
  type ToolUpsertAgentSkillArgs,
  runListAgentEvidence,
  runRecordAgentDelegation,
  runRecordAgentEvidence,
  runRecordAgentSkillOutcome,
  runSearchAgentEvidence,
  runUpsertAgentSkill,
  runVerifyAgentEvidence,
} from './kloel-chat-tools.agent-runtime.helpers';
import { runUpdateProduct } from './kloel-chat-tools.update-product.helper';
import {
  runGetProductPlans,
  runGetProductUrls,
  runGetProductReviews,
  runGetProductAiConfig,
  runValidateCoupon,
  runGetAnalytics,
  runCreateBroadcast,
  runConfigureAiPersona,
  runToggleTheme,
  runGetProductDetails,
  runListSubscriptions,
} from './kloel-chat-tools.product.helpers';
import { runGetAffiliateConfig, runGetSettings } from './kloel-chat-tools.settings.helpers';
import {
  type ToolToggleAutopilotArgs,
  type ToolSetBrandVoiceArgs,
  type ToolSetSalesPolicyArgs,
  type ToolRememberUserInfoArgs,
  runToggleAutopilot,
  runSetBrandVoice,
  runSetSalesPolicy,
  runRememberUserInfo,
} from './kloel-chat-tools.settings-policy.helpers';
import {
  type ToolSaveProductArgs,
  type ToolDeleteProductArgs,
  runListProducts,
} from './kloel-chat-tools.products.helpers';
import {
  type ToolDashboardSummaryArgs,
  runGetDashboardSummary,
  runCreatePaymentLink,
  runCreateOrder,
} from './kloel-chat-tools.dashboard-payments.helpers';
import {
  runSaveProductViaService,
  runDeleteProductViaService,
  runPublishProductViaService,
  runUploadProductImage,
} from './kloel-chat-tools.product-write.helpers';
import {
  runBrowseMarketplace,
  runListFlows,
  runSearchAgentMemoryWithContacts,
} from './kloel-chat-tools.flows-marketplace.helpers';
import {
  buildBlockedConfigurationTool,
  buildCreateFlowBlocker,
  buildSendChannelMessageBlocker,
  buildUploadPlanImageBlocker,
  centsFromUnknown as centsFromUnknownImpl,
  coerceAnalyticsArgs,
  coerceCouponArgs,
  coerceWarrantyArgs,
} from './kloel-chat-tools.service.helpers';
import { MemoryService } from './memory.service';
import { MindMemoryItemService } from './mind/aliases/mind-memory-item.service';

interface ToolCreateFlowArgs {
  name: string;
  trigger: string;
  actions?: string[];
}
/** Coerces unknown wallet balance values (bigint | number) into integer cents.
 *  Returns 0 for non-numeric/missing values. Exported so peer kloel services
 *  (crm/executor/...) consume the same coercion without local copies.
 *  Implementation lives in `kloel-chat-tools.service.helpers.ts`; re-exported
 *  here to preserve the historic import path. */
export const centsFromUnknown = centsFromUnknownImpl;
/** Handles product, flow, dashboard, payment, and misc AI chat tools. */
@Injectable()
export class KloelChatToolsService {
  constructor(
    private readonly productService: ProductService,
    private readonly prisma: PrismaService,
    private readonly smartPaymentService: SmartPaymentService,
    @Optional() private readonly memoryService?: MemoryService,
    @Optional() private readonly agentScheduler?: AgentRuntimeSchedulerService,
    @Optional() private readonly agentSessions?: AgentRuntimeSessionStore,
    @Optional() private readonly agentSkills?: AgentRuntimeSkillRegistry,
    @Optional() private readonly agentEvidence?: AgentRuntimeEvidenceStoreService,
    @Optional() private readonly mindMemory?: MindMemoryItemService,
  ) {}

  /** Canonical Brain → Mind memory delegate (raw-Prisma fallback). */
  private get mindMemoryItems(): PrismaService['kloelMemory'] {
    return this.mindMemory?.items ?? this.prisma.kloelMemory;
  }

  get hasAgentScheduler(): boolean {
    return !!this.agentScheduler;
  }

  toolSaveProduct(workspaceId: string, args: ToolSaveProductArgs): Promise<ToolResult> {
    return runSaveProductViaService(this.productService, workspaceId, args);
  }
  toolListProducts(workspaceId: string): Promise<ToolResult> {
    return runListProducts(this.prisma, workspaceId);
  }

  async toolDeleteProduct(workspaceId: string, args: ToolDeleteProductArgs): Promise<ToolResult> {
    return runDeleteProductViaService(this.prisma, this.productService, workspaceId, args);
  }
  async toolToggleAutopilot(
    workspaceId: string,
    args: ToolToggleAutopilotArgs,
  ): Promise<ToolResult> {
    return runToggleAutopilot(this.prisma, workspaceId, args);
  }
  async toolSetBrandVoice(workspaceId: string, args: ToolSetBrandVoiceArgs): Promise<ToolResult> {
    return runSetBrandVoice(this.memoryService, workspaceId, args);
  }
  async toolSetSalesPolicy(
    workspaceId: string,
    args: ToolSetSalesPolicyArgs,
    userId?: string,
  ): Promise<ToolResult> {
    return runSetSalesPolicy(this.prisma, workspaceId, args, userId);
  }
  async toolRememberUserInfo(
    workspaceId: string,
    args: ToolRememberUserInfoArgs,
    userId?: string,
  ): Promise<ToolResult> {
    return runRememberUserInfo(this.memoryService, workspaceId, args, userId);
  }
  toolCreateFlow(workspaceId: string, args: ToolCreateFlowArgs): Promise<ToolResult> {
    void workspaceId;
    void args;
    return Promise.resolve(buildCreateFlowBlocker());
  }
  async toolListFlows(workspaceId: string): Promise<ToolResult> {
    return runListFlows(this.prisma, workspaceId);
  }
  async toolGetDashboardSummary(
    workspaceId: string,
    args: ToolDashboardSummaryArgs,
  ): Promise<ToolResult> {
    return runGetDashboardSummary(this.prisma, workspaceId, args);
  }
  async toolCreatePaymentLink(
    workspaceId: string,
    args: {
      amount: number;
      description: string;
      customerName?: string;
      executionPath?: 'dispatcher';
    },
  ): Promise<ToolResult> {
    return runCreatePaymentLink(this.prisma, this.smartPaymentService, workspaceId, args);
  }
  async toolCreateAgentJob(workspaceId: string, args: ToolCreateAgentJobArgs): Promise<ToolResult> {
    return runCreateAgentJob(this.agentScheduler, workspaceId, args);
  }
  async toolListAgentJobs(workspaceId: string): Promise<ToolResult> {
    return runListAgentJobs(this.agentScheduler, workspaceId);
  }
  async toolSetAgentJobEnabled(
    workspaceId: string,
    args: ToolSetAgentJobEnabledArgs,
  ): Promise<ToolResult> {
    return runSetAgentJobEnabled(this.agentScheduler, workspaceId, args);
  }
  async toolSearchAgentMemory(
    workspaceId: string,
    args: ToolSearchAgentMemoryArgs,
  ): Promise<ToolResult> {
    return runSearchAgentMemory(this.agentSessions, workspaceId, args);
  }

  /** Search both agent memory AND contacts for leads */
  async toolSearchAgentMemoryWithContacts(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    return runSearchAgentMemoryWithContacts(this.prisma, this.agentSessions, workspaceId, args);
  }
  async toolSearchAgentSessions(
    workspaceId: string,
    args: ToolSearchAgentSessionsArgs,
  ): Promise<ToolResult> {
    return runSearchAgentSessions(this.agentSessions, workspaceId, args);
  }
  async toolGetAgentArtifact(
    workspaceId: string,
    args: ToolGetAgentArtifactArgs,
  ): Promise<ToolResult> {
    return runGetAgentArtifact(this.prisma, workspaceId, args, this.mindMemoryItems);
  }
  async toolUpsertAgentSkill(
    workspaceId: string,
    args: ToolUpsertAgentSkillArgs,
  ): Promise<ToolResult> {
    return runUpsertAgentSkill(this.agentSkills, workspaceId, args);
  }
  async toolRecordAgentSkillOutcome(
    workspaceId: string,
    args: ToolRecordAgentSkillOutcomeArgs,
  ): Promise<ToolResult> {
    return runRecordAgentSkillOutcome(this.agentSkills, workspaceId, args);
  }
  async toolRecordAgentDelegation(
    workspaceId: string,
    args: ToolRecordAgentDelegationArgs,
  ): Promise<ToolResult> {
    return runRecordAgentDelegation(this.agentSessions, workspaceId, args);
  }
  async toolRecordAgentEvidence(
    workspaceId: string,
    args: ToolRecordAgentEvidenceArgs,
  ): Promise<ToolResult> {
    return runRecordAgentEvidence(this.agentEvidence, workspaceId, args);
  }
  async toolSearchAgentEvidence(
    workspaceId: string,
    args: ToolSearchAgentEvidenceArgs,
  ): Promise<ToolResult> {
    return runSearchAgentEvidence(this.agentEvidence, workspaceId, args);
  }
  async toolListAgentEvidence(
    workspaceId: string,
    args: ToolListAgentEvidenceArgs,
  ): Promise<ToolResult> {
    return runListAgentEvidence(this.agentEvidence, workspaceId, args);
  }
  async toolVerifyAgentEvidence(workspaceId: string): Promise<ToolResult> {
    return runVerifyAgentEvidence(this.agentEvidence, workspaceId);
  }
  // === PRODUCT MANAGEMENT TOOL DELEGATORS ===

  toolUpdateProduct(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runUpdateProduct(this.prisma, this.productService, workspaceId, args);
  }

  async toolPublishProduct(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    return runPublishProductViaService(this.prisma, this.productService, workspaceId, args);
  }
  toolGetProductPlans(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runGetProductPlans(this.prisma, workspaceId, args);
  }
  toolGetProductUrls(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runGetProductUrls(this.prisma, workspaceId, args);
  }
  toolGetProductReviews(
    workspaceId: string,
    args: { productId?: string; productName?: string },
  ): Promise<ToolResult> {
    return runGetProductReviews(this.prisma, workspaceId, args);
  }
  toolGetProductAiConfig(workspaceId: string, args: { productId: string }): Promise<ToolResult> {
    return runGetProductAiConfig(this.prisma, workspaceId, args);
  }
  toolValidateCoupon(_workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runValidateCoupon(this.prisma, _workspaceId, coerceCouponArgs(args));
  }
  toolGetAnalytics(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runGetAnalytics(this.prisma, workspaceId, coerceAnalyticsArgs(args));
  }
  toolCreateBroadcast(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runCreateBroadcast(workspaceId, args);
  }
  toolConfigureAiPersona(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runConfigureAiPersona(workspaceId, args);
  }
  toolToggleTheme(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runToggleTheme(this.memoryService, workspaceId, args);
  }
  toolGetAffiliateConfig(workspaceId: string): Promise<ToolResult> {
    return runGetAffiliateConfig(this.prisma, workspaceId);
  }
  toolGetSettings(workspaceId: string): Promise<ToolResult> {
    return runGetSettings(this.prisma, workspaceId);
  }
  toolGetProductDetails(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runGetProductDetails(this.prisma, workspaceId, args);
  }

  // ── Novos tools para stubs → reais ──

  async toolUploadPlanImage(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    return Promise.resolve(buildUploadPlanImageBlocker(args));
  }
  async toolUploadProductImage(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    return runUploadProductImage(this.prisma, this.productService, workspaceId, args);
  }

  private blockedConfigurationTool(
    toolName: string,
    error: string,
    requiredPath: string,
  ): Promise<ToolResult> {
    return Promise.resolve(buildBlockedConfigurationTool(toolName, error, requiredPath));
  }

  async toolConfigurePixel(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    void args;
    return this.blockedConfigurationTool(
      'toolConfigurePixel',
      'pixel_configuration_service_required',
      'PixelService.configure ou CheckoutCatalogService.createPixel',
    );
  }

  async toolConfigureShipping(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    void args;
    return this.blockedConfigurationTool(
      'toolConfigureShipping',
      'shipping_configuration_service_required',
      'ShippingService.configure',
    );
  }

  async toolConfigureSocialProof(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    void args;
    return this.blockedConfigurationTool(
      'toolConfigureSocialProof',
      'checkout_social_proof_service_required',
      'CheckoutService.update',
    );
  }

  async toolConfigureOrderBump(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    void args;
    return this.blockedConfigurationTool(
      'toolConfigureOrderBump',
      'checkout_order_bump_service_required',
      'CheckoutService.update',
    );
  }

  async toolConfigureWarranty(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const coerced = coerceWarrantyArgs(args);
    if (coerced) {
      return runUpdateProduct(this.prisma, this.productService, workspaceId, {
        productName: coerced.productName,
        warrantyDays: coerced.warrantyDays,
      });
    }
    return this.blockedConfigurationTool(
      'toolConfigureWarranty',
      'product_reference_required',
      'ProductService.update com produto identificado',
    );
  }

  async toolConfigureExitIntent(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    void args;
    return this.blockedConfigurationTool(
      'toolConfigureExitIntent',
      'checkout_exit_intent_service_required',
      'CheckoutService.update',
    );
  }

  async toolConfigureAfterPay(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    void args;
    return this.blockedConfigurationTool(
      'toolConfigureAfterPay',
      'checkout_after_pay_service_required',
      'CheckoutService.update',
    );
  }

  async toolBrowseMarketplace(
    workspaceId: string,
    _args: Record<string, unknown>,
  ): Promise<ToolResult> {
    return runBrowseMarketplace(this.prisma, workspaceId);
  }

  toolSendChannelMessage(
    _workspaceId: string,
    _args: Record<string, unknown>,
  ): Promise<ToolResult> {
    return Promise.resolve(buildSendChannelMessageBlocker());
  }

  /** Create a manual sale order with full buyer data */
  toolCreateOrder(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runCreateOrder(this.prisma, workspaceId, args);
  }
  toolListSubscriptions(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runListSubscriptions(this.prisma, workspaceId, args);
  }
}
