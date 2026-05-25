import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
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
  runBrowseMarketplace,
  runConfigureAfterPay,
  runConfigureExitIntent,
  runConfigureOrderBump,
  runConfigurePixel,
  runConfigureShipping,
  runConfigureSocialProof,
  runConfigureWarranty,
  runCreateOrder,
  runSendChannelMessage,
  runUploadPlanImage,
  runUploadProductImage,
  runSearchAgentMemoryWithContacts,
} from './kloel-chat-tools.additional.helpers';
import {
  centsFromUnknown,
  NON_SLUG_CHAR_RE,
  safeStr,
  type ToolCreateFlowArgs,
  type ToolDashboardSummaryArgs,
  type ToolDeleteProductArgs,
  type ToolRememberUserInfoArgs,
  type ToolSaveProductArgs,
  type ToolSetBrandVoiceArgs,
  type ToolSetSalesPolicyArgs,
  type ToolToggleAutopilotArgs,
} from './kloel-chat-tools.types';
import {
  runDeleteProduct,
  runListProducts,
  runSaveProduct,
  runToggleAutopilot,
} from './kloel-chat-tools.core.helpers';
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
  async toolSaveProduct(workspaceId: string, args: ToolSaveProductArgs): Promise<ToolResult> {
    return runSaveProduct(this.prisma, workspaceId, args);
  }
  async toolListProducts(workspaceId: string): Promise<ToolResult> {
    return runListProducts(this.prisma, workspaceId);
  }
  async toolDeleteProduct(workspaceId: string, args: ToolDeleteProductArgs): Promise<ToolResult> {
    return runDeleteProduct(this.prisma, workspaceId, args);
  }
  async toolToggleAutopilot(
    workspaceId: string,
    args: ToolToggleAutopilotArgs,
  ): Promise<ToolResult> {
    return runToggleAutopilot(this.prisma, this.logger, workspaceId, args);
  }
  async toolSetBrandVoice(workspaceId: string, args: ToolSetBrandVoiceArgs): Promise<ToolResult> {
    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: 'brandVoice' } },
      update: {
        value: { style: args.tone, personality: args.personality || '' },
        category: 'preferences',
        type: 'persona',
        content: `Tom: ${args.tone}. ${args.personality || ''}`.trim(),
        metadata: { tone: args.tone, personality: args.personality || '' },
      },
      create: {
        workspaceId,
        key: 'brandVoice',
        value: { style: args.tone, personality: args.personality || '' },
        category: 'preferences',
        type: 'persona',
        content: `Tom: ${args.tone}. ${args.personality || ''}`.trim(),
        metadata: { tone: args.tone, personality: args.personality || '' },
      },
    });
    return { success: true, message: `Tom de voz definido como "${args.tone}"` };
  }
  async toolSetSalesPolicy(
    workspaceId: string,
    args: ToolSetSalesPolicyArgs,
    userId?: string,
  ): Promise<ToolResult> {
    const aggressiveness = safeStr(args.aggressiveness, 'balanced').trim().slice(0, 40);
    const tone = safeStr(args.tone, '').trim().slice(0, 80);
    const instructions = safeStr(args.instructions, '').trim().slice(0, 1000);
    const appliesTo = safeStr(args.appliesTo, 'all').trim().slice(0, 120);
    if (!aggressiveness && !tone && !instructions) {
      return { success: false, error: 'missing_sales_policy_payload' };
    }
    const policy = {
      aggressiveness: aggressiveness || 'balanced',
      tone: tone || null,
      instructions: instructions || null,
      appliesTo: appliesTo || 'all',
      updatedAt: new Date().toISOString(),
      updatedByUserId: userId || null,
    } satisfies Prisma.InputJsonObject;
    await this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
      const autopilot = (settings.autopilot as Record<string, unknown>) || {};
      await tx.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: {
            ...settings,
            autopilot: {
              ...autopilot,
              salesPolicy: policy,
            },
          },
        },
      });
    });
    return {
      success: true,
      policy,
      message: `Politica comercial atualizada: agressividade ${policy.aggressiveness}.`,
    };
  }
  async toolRememberUserInfo(
    workspaceId: string,
    args: ToolRememberUserInfoArgs,
    userId?: string,
  ): Promise<ToolResult> {
    const normalizedKey = String(args?.key || '')
      .trim()
      .toLowerCase()
      .replace(NON_SLUG_CHAR_RE, '_')
      .slice(0, 80);
    const value = String(args?.value || '').trim();
    if (!normalizedKey || !value) {
      return { success: false, error: 'missing_user_memory_payload' };
    }
    const profileKey = `user_profile:${userId || 'workspace_owner'}`;
    const existing = await this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key: profileKey } },
    });
    const currentValue =
      existing?.value && typeof existing.value === 'object'
        ? (existing.value as Record<string, Prisma.JsonValue>)
        : {};
    const nextValue: Record<string, Prisma.JsonValue> = {
      ...currentValue,
      [normalizedKey]: value,
      updatedAt: new Date().toISOString(),
      userId: userId || null,
    };
    const contentLines = Object.entries(nextValue)
      .filter(([k]) => !['updatedAt', 'userId'].includes(k))
      .map(([k, v]) => k + ': ' + safeStr(v))
      .join('\n');
    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: profileKey } },
      update: {
        value: nextValue,
        category: 'user_preferences',
        type: 'user_profile',
        content: contentLines,
        metadata: {
          ...((existing?.metadata as Record<string, unknown>) || {}),
          userId: userId || null,
          source: 'remember_user_info',
        },
      },
      create: {
        workspaceId,
        key: profileKey,
        value: nextValue,
        category: 'user_preferences',
        type: 'user_profile',
        content: contentLines,
        metadata: { userId: userId || null, source: 'remember_user_info' },
      },
    });
    return { success: true, message: `Memória "${normalizedKey}" salva.` };
  }
  async toolCreateFlow(workspaceId: string, args: ToolCreateFlowArgs): Promise<ToolResult> {
    const nodes = [
      {
        id: 'start',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: { trigger: args.trigger },
      },
      {
        id: 'msg1',
        type: 'message',
        position: { x: 100, y: 200 },
        data: { message: args.actions?.[0] || 'Olá!' },
      },
    ];
    const edges = [{ id: 'e1', source: 'start', target: 'msg1' }];
    const flow = await this.prisma.flow.create({
      data: {
        workspaceId,
        name: args.name,
        description: `Fluxo criado via chat: ${args.trigger}`,
        nodes,
        edges,
        isActive: true,
      },
    });
    return { success: true, flow, message: `Fluxo "${args.name}" criado com sucesso!` };
  }
  async toolListFlows(workspaceId: string): Promise<ToolResult> {
    const flows = await this.prisma.flow.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { executions: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return {
      success: true,
      flows: flows.map((f) => ({
        id: f.id,
        name: f.name,
        active: f.isActive,
        executions: f._count.executions,
      })),
      message: `Você tem ${flows.length} fluxo(s) cadastrado(s).`,
    };
  }
  async toolGetDashboardSummary(
    workspaceId: string,
    args: ToolDashboardSummaryArgs,
  ): Promise<ToolResult> {
    const period = args.period || 'today';
    let dateFilter: Date;
    switch (period) {
      case 'week':
        dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = new Date();
        dateFilter.setHours(0, 0, 0, 0);
    }
    const [contacts, messages, flows, paidOrders, wallet] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
      this.prisma.message.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
      this.prisma.flow.count({ where: { workspaceId, isActive: true } }),
      this.prisma.checkoutOrder.aggregate({
        where: { workspaceId, status: 'PAID', paidAt: { gte: dateFilter } },
        _count: { _all: true },
        _sum: { totalInCents: true },
      }),
      this.prisma.kloelWallet.findUnique({
        where: { workspaceId },
        select: {
          availableBalanceInCents: true,
          pendingBalanceInCents: true,
          blockedBalanceInCents: true,
        },
      }),
    ]);
    const revenueInCents = paidOrders._sum.totalInCents || 0;
    const availableInCents = centsFromUnknown(wallet?.availableBalanceInCents);
    const pendingInCents = centsFromUnknown(wallet?.pendingBalanceInCents);
    const blockedInCents = centsFromUnknown(wallet?.blockedBalanceInCents);
    const totalInCents = availableInCents + pendingInCents + blockedInCents;
    return {
      success: true,
      period,
      stats: {
        newContacts: contacts,
        messages,
        activeFlows: flows,
        paidOrders: paidOrders._count._all,
        revenueInCents,
        revenue: revenueInCents / 100,
        wallet: {
          availableInCents,
          pendingInCents,
          blockedInCents,
          totalInCents,
          available: availableInCents / 100,
          pending: pendingInCents / 100,
          blocked: blockedInCents / 100,
          total: totalInCents / 100,
        },
      },
    };
  }
  async toolCreatePaymentLink(
    workspaceId: string,
    args: { amount: number; description: string; customerName?: string },
  ): Promise<ToolResult> {
    this.logger.log('Payment operation', {
      context: 'KloelChatTools.toolCreatePaymentLink',
      action: 'createSmartPayment',
      amount: Number(args.amount) || 0,
      hasDescription: !!args.description,
    });
    const paymentResult = await this.smartPaymentService.createSmartPayment({
      workspaceId,
      amount: Number(args.amount) || 0,
      productName: args.description,
      customerName: args.customerName || 'Cliente',
      phone: '',
    });
    return { success: true, ...paymentResult };
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
    return runGetAgentArtifact(this.prisma, workspaceId, args);
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
  toolValidateCoupon(_workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runValidateCoupon(this.prisma, _workspaceId, args as never);
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

  async toolUploadPlanImage(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    return runUploadPlanImage(this.prisma, workspaceId, args);
  }
  async toolUploadProductImage(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    return runUploadProductImage(this.prisma, workspaceId, args);
  }

  toolConfigurePixel(workspaceId: string, args: Record<string, unknown>): ToolResult {
    return runConfigurePixel(workspaceId, args);
  }

  toolConfigureShipping(workspaceId: string, args: Record<string, unknown>): ToolResult {
    return runConfigureShipping(workspaceId, args);
  }

  toolConfigureSocialProof(workspaceId: string, args: Record<string, unknown>): ToolResult {
    return runConfigureSocialProof(workspaceId, args);
  }

  toolConfigureOrderBump(workspaceId: string, args: Record<string, unknown>): ToolResult {
    return runConfigureOrderBump(workspaceId, args);
  }

  toolConfigureWarranty(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runConfigureWarranty(this.prisma, workspaceId, args);
  }

  toolConfigureExitIntent(workspaceId: string, args: Record<string, unknown>): ToolResult {
    return runConfigureExitIntent(workspaceId, args);
  }

  toolConfigureAfterPay(workspaceId: string, args: Record<string, unknown>): ToolResult {
    return runConfigureAfterPay(workspaceId, args);
  }

  async toolBrowseMarketplace(
    workspaceId: string,
    _args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void _args;
    return runBrowseMarketplace(this.prisma, workspaceId);
  }

  toolSendChannelMessage(workspaceId: string, args: Record<string, unknown>): ToolResult {
    return runSendChannelMessage(workspaceId, args);
  }

  toolCreateOrder(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runCreateOrder(this.prisma, workspaceId, args);
  }
  toolListSubscriptions(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runListSubscriptions(this.prisma, workspaceId, args);
  }
}
