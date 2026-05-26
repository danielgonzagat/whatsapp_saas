import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';
import {
  AgentRuntimeEvidenceStoreService,
  AgentRuntimeSchedulerService,
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
import {
  runBrowseMarketplace,
  runConfigureAfterPay,
  runConfigureExitIntent,
  runConfigureOrderBump,
  runConfigurePixel,
  runConfigureShipping,
  runConfigureSocialProof,
  runConfigureWarranty,
  runCreateOrder,
  runSearchAgentMemoryWithContacts,
  runSendChannelMessage,
  runUploadPlanImage,
  runUploadProductImage,
} from './kloel-chat-tools.additional.helpers';
import {
  runDeleteProduct,
  runListProducts,
  runSaveProduct,
  runToggleAutopilot,
} from './kloel-chat-tools.core.helpers';
import {
  runConfigureAiPersona,
  runCreateBroadcast,
  runGetAnalytics,
  runGetProductAiConfig,
  runGetProductDetails,
  runGetProductPlans,
  runGetProductReviews,
  runGetProductUrls,
  runListSubscriptions,
  runToggleTheme,
  runValidateCoupon,
} from './kloel-chat-tools.product.helpers';
import { runGetAffiliateConfig, runGetSettings } from './kloel-chat-tools.settings.helpers';
import {
  type ToolCreateFlowArgs,
  type ToolDashboardSummaryArgs,
  type ToolDeleteProductArgs,
  type ToolRememberUserInfoArgs,
  type ToolSaveProductArgs,
  type ToolSetBrandVoiceArgs,
  type ToolSetSalesPolicyArgs,
  type ToolToggleAutopilotArgs,
} from './kloel-chat-tools.types';
import { runUpdateProduct } from './kloel-chat-tools.update-product.helper';
import {
  runCreateFlow,
  runCreatePaymentLink,
  runGetDashboardSummary,
  runListFlows,
  runRememberUserInfo,
  runSetBrandVoice,
  runSetSalesPolicy,
} from './kloel-chat-tools.workspace.helpers';

/** Handles product, flow, dashboard, payment, and misc AI chat tools. */
@Injectable()
export class KloelChatToolsService {
  private readonly logger = StructuredLogger.from(KloelChatToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smartPaymentService: SmartPaymentService,
    @Optional() private readonly agentScheduler?: AgentRuntimeSchedulerService,
    @Optional() private readonly agentSessions?: AgentRuntimeSessionStore,
    @Optional() private readonly agentSkills?: AgentRuntimeSkillRegistry,
    @Optional() private readonly agentEvidence?: AgentRuntimeEvidenceStoreService,
  ) {}

  toolSaveProduct(workspaceId: string, args: ToolSaveProductArgs): Promise<ToolResult> {
    return runSaveProduct(this.prisma, workspaceId, args);
  }

  toolListProducts(workspaceId: string): Promise<ToolResult> {
    return runListProducts(this.prisma, workspaceId);
  }

  toolDeleteProduct(workspaceId: string, args: ToolDeleteProductArgs): Promise<ToolResult> {
    return runDeleteProduct(this.prisma, workspaceId, args);
  }

  toolToggleAutopilot(workspaceId: string, args: ToolToggleAutopilotArgs): Promise<ToolResult> {
    return runToggleAutopilot(this.prisma, this.logger, workspaceId, args);
  }

  toolSetBrandVoice(workspaceId: string, args: ToolSetBrandVoiceArgs): Promise<ToolResult> {
    return runSetBrandVoice(this.prisma, workspaceId, args);
  }

  toolSetSalesPolicy(
    workspaceId: string,
    args: ToolSetSalesPolicyArgs,
    userId?: string,
  ): Promise<ToolResult> {
    return runSetSalesPolicy(this.prisma, workspaceId, args, userId);
  }

  toolRememberUserInfo(
    workspaceId: string,
    args: ToolRememberUserInfoArgs,
    userId?: string,
  ): Promise<ToolResult> {
    return runRememberUserInfo(this.prisma, workspaceId, args, userId);
  }

  toolCreateFlow(workspaceId: string, args: ToolCreateFlowArgs): Promise<ToolResult> {
    return runCreateFlow(this.prisma, workspaceId, args);
  }

  toolListFlows(workspaceId: string): Promise<ToolResult> {
    return runListFlows(this.prisma, workspaceId);
  }

  toolGetDashboardSummary(
    workspaceId: string,
    args: ToolDashboardSummaryArgs,
  ): Promise<ToolResult> {
    return runGetDashboardSummary(this.prisma, workspaceId, args);
  }

  toolCreatePaymentLink(
    workspaceId: string,
    args: { amount: number; description: string; customerName?: string },
  ): Promise<ToolResult> {
    return runCreatePaymentLink(
      this.prisma,
      this.smartPaymentService,
      this.logger,
      workspaceId,
      args,
    );
  }

  toolCreateAgentJob(workspaceId: string, args: ToolCreateAgentJobArgs): Promise<ToolResult> {
    return runCreateAgentJob(this.agentScheduler, workspaceId, args);
  }

  toolListAgentJobs(workspaceId: string): Promise<ToolResult> {
    return runListAgentJobs(this.agentScheduler, workspaceId);
  }

  toolSetAgentJobEnabled(
    workspaceId: string,
    args: ToolSetAgentJobEnabledArgs,
  ): Promise<ToolResult> {
    return runSetAgentJobEnabled(this.agentScheduler, workspaceId, args);
  }

  toolSearchAgentMemory(workspaceId: string, args: ToolSearchAgentMemoryArgs): Promise<ToolResult> {
    return runSearchAgentMemory(this.agentSessions, workspaceId, args);
  }

  toolSearchAgentMemoryWithContacts(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    return runSearchAgentMemoryWithContacts(this.prisma, this.agentSessions, workspaceId, args);
  }

  toolSearchAgentSessions(
    workspaceId: string,
    args: ToolSearchAgentSessionsArgs,
  ): Promise<ToolResult> {
    return runSearchAgentSessions(this.agentSessions, workspaceId, args);
  }

  toolGetAgentArtifact(workspaceId: string, args: ToolGetAgentArtifactArgs): Promise<ToolResult> {
    return runGetAgentArtifact(this.prisma, workspaceId, args);
  }

  toolUpsertAgentSkill(workspaceId: string, args: ToolUpsertAgentSkillArgs): Promise<ToolResult> {
    return runUpsertAgentSkill(this.agentSkills, workspaceId, args);
  }

  toolRecordAgentSkillOutcome(
    workspaceId: string,
    args: ToolRecordAgentSkillOutcomeArgs,
  ): Promise<ToolResult> {
    return runRecordAgentSkillOutcome(this.agentSkills, workspaceId, args);
  }

  toolRecordAgentDelegation(
    workspaceId: string,
    args: ToolRecordAgentDelegationArgs,
  ): Promise<ToolResult> {
    return runRecordAgentDelegation(this.agentSessions, workspaceId, args);
  }

  toolRecordAgentEvidence(
    workspaceId: string,
    args: ToolRecordAgentEvidenceArgs,
  ): Promise<ToolResult> {
    return runRecordAgentEvidence(this.agentEvidence, workspaceId, args);
  }

  toolSearchAgentEvidence(
    workspaceId: string,
    args: ToolSearchAgentEvidenceArgs,
  ): Promise<ToolResult> {
    return runSearchAgentEvidence(this.agentEvidence, workspaceId, args);
  }

  toolListAgentEvidence(workspaceId: string, args: ToolListAgentEvidenceArgs): Promise<ToolResult> {
    return runListAgentEvidence(this.agentEvidence, workspaceId, args);
  }

  toolVerifyAgentEvidence(workspaceId: string): Promise<ToolResult> {
    return runVerifyAgentEvidence(this.agentEvidence, workspaceId);
  }

  toolUpdateProduct(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runUpdateProduct(this.prisma, workspaceId, args);
  }

  toolGetProductPlans(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runGetProductPlans(this.prisma, workspaceId, args);
  }

  toolGetProductUrls(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runGetProductUrls(this.prisma, workspaceId, args);
  }

  toolGetProductReviews(workspaceId: string, args: { productId: string }): Promise<ToolResult> {
    return runGetProductReviews(this.prisma, workspaceId, args);
  }

  toolGetProductAiConfig(workspaceId: string, args: { productId: string }): Promise<ToolResult> {
    return runGetProductAiConfig(this.prisma, workspaceId, args);
  }

  toolValidateCoupon(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runValidateCoupon(this.prisma, workspaceId, args as never);
  }

  toolGetAnalytics(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runGetAnalytics(this.prisma, workspaceId, args as never);
  }

  toolCreateBroadcast(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runCreateBroadcast(this.prisma, workspaceId, args as never);
  }

  toolConfigureAiPersona(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runConfigureAiPersona(this.prisma, workspaceId, args);
  }

  toolToggleTheme(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runToggleTheme(this.prisma, workspaceId, args);
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

  toolUploadPlanImage(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runUploadPlanImage(this.prisma, workspaceId, args);
  }

  toolUploadProductImage(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runUploadProductImage(this.prisma, workspaceId, args);
  }

  toolConfigurePixel(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return Promise.resolve(runConfigurePixel(workspaceId, args));
  }

  toolConfigureShipping(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return Promise.resolve(runConfigureShipping(workspaceId, args));
  }

  toolConfigureSocialProof(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    return Promise.resolve(runConfigureSocialProof(workspaceId, args));
  }

  toolConfigureOrderBump(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return Promise.resolve(runConfigureOrderBump(workspaceId, args));
  }

  toolConfigureWarranty(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runConfigureWarranty(this.prisma, workspaceId, args);
  }

  toolConfigureExitIntent(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return Promise.resolve(runConfigureExitIntent(workspaceId, args));
  }

  toolConfigureAfterPay(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return Promise.resolve(runConfigureAfterPay(workspaceId, args));
  }

  toolBrowseMarketplace(workspaceId: string, _args: Record<string, unknown>): Promise<ToolResult> {
    void _args;
    return runBrowseMarketplace(this.prisma, workspaceId);
  }

  toolSendChannelMessage(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return Promise.resolve(runSendChannelMessage(workspaceId, args));
  }

  toolCreateOrder(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runCreateOrder(this.prisma, workspaceId, args);
  }

  toolListSubscriptions(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runListSubscriptions(this.prisma, workspaceId, args);
  }
}
