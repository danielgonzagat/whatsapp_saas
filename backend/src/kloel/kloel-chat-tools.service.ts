import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { filterLegacyProducts } from '../common/products/legacy-products.util';
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
const NON_SLUG_CHAR_RE = /[^a-z0-9_:-]+/g;
function safeStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}
interface ToolSaveProductArgs {
  name: string;
  price: number;
  description?: string;
}
interface ToolDeleteProductArgs {
  productId?: string;
  productName?: string;
}
interface ToolToggleAutopilotArgs {
  enabled: boolean;
}
interface ToolSetBrandVoiceArgs {
  tone: string;
  personality?: string;
}
interface ToolSetSalesPolicyArgs {
  aggressiveness?: string;
  tone?: string;
  instructions?: string;
  appliesTo?: string;
}
interface ToolRememberUserInfoArgs {
  key: string;
  value: string;
}
interface ToolCreateFlowArgs {
  name: string;
  trigger: string;
  actions?: string[];
}
interface ToolDashboardSummaryArgs {
  period?: 'today' | 'week' | 'month';
}
function centsFromUnknown(value: unknown): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return 0;
}
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
    const product = await this.prisma.product.create({
      data: {
        workspaceId,
        name: args.name,
        price: args.price,
        description: args.description || '',
        active: true,
      },
    });
    return { success: true, product, message: `Produto "${args.name}" cadastrado com sucesso!` };
  }
  async toolListProducts(workspaceId: string): Promise<ToolResult> {
    const products = filterLegacyProducts(
      await this.prisma.product.findMany({
        where: { workspaceId, active: true },
        select: { id: true, name: true, price: true, description: true, status: true },
        orderBy: { name: 'asc' },
        take: 100,
      }),
    );
    if (products.length === 0) {
      return { success: true, message: 'Nenhum produto cadastrado ainda.' };
    }
    const list = products.map((p) => `- ${p.name}: R$ ${p.price}`).join('\n');
    return { success: true, products, message: `Aqui estão seus produtos:\n\n${list}` };
  }
  async toolDeleteProduct(workspaceId: string, args: ToolDeleteProductArgs): Promise<ToolResult> {
    const { productId, productName } = args;
    const where: Prisma.ProductWhereInput = { workspaceId };
    if (productId) {
      where.id = productId;
    } else if (productName) {
      where.name = { contains: productName, mode: 'insensitive' };
    }
    const product = await this.prisma.product.findFirst({ where: { ...where, workspaceId } });
    if (!product) {
      return { success: false, error: 'Produto não encontrado.' };
    }
    await this.prisma.$transaction(
      [
        this.prisma.product.updateMany({
          where: { id: product.id, workspaceId },
          data: { active: false },
        }),
        this.prisma.auditLog.create({
          data: {
            workspaceId,
            action: 'USER_DATA_DELETED',
            resource: 'Product',
            resourceId: product.id,
            details: {
              source: 'kloel_tool_delete_product',
              softDelete: true,
              productName: product.name,
            },
          },
        }),
      ],
      { isolationLevel: 'ReadCommitted' },
    );
    return { success: true, message: `Produto "${product.name}" removido com sucesso.` };
  }
  async toolToggleAutopilot(
    workspaceId: string,
    args: ToolToggleAutopilotArgs,
  ): Promise<ToolResult> {
    const settingsSnapshot = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const currentSettings = (settingsSnapshot?.providerSettings as Record<string, unknown>) || {};
    this.logger.log('Autopilot decision', {
      context: 'KloelChatTools.toolToggleAutopilot',
      decision: args.enabled ? 'enable' : 'disable',
      billingSuspended: currentSettings.billingSuspended === true,
    });
    if (args.enabled && currentSettings.billingSuspended === true) {
      return {
        success: false,
        enabled: false,
        error: 'Autopilot suspenso: regularize cobrança para ativar.',
      };
    }
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const settings = (workspace?.providerSettings as Record<string, unknown>) || {};
      const newSettings = {
        ...settings,
        autopilot: {
          ...((settings.autopilot as Record<string, unknown>) || {}),
          enabled: args.enabled,
        },
        autopilotEnabled: args.enabled,
      };
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { providerSettings: newSettings },
      });
      return {
        success: true,
        enabled: args.enabled,
        message: args.enabled ? 'Autopilot ativado.' : 'Autopilot desativado.',
      };
    });
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

  // === PRODUCT MANAGEMENT TOOLS ===

  async toolUpdateProduct(
    workspaceId: string,
    args: {
      productId: string;
      name?: string;
      price?: number;
      description?: string;
      active?: boolean;
      imageUrl?: string;
      category?: string;
      format?: string;
      tags?: string[];
      warrantyDays?: number;
      salesPageUrl?: string;
      thankyouUrl?: string;
      thankyouPixUrl?: string;
      thankyouBoletoUrl?: string;
      reclameAquiUrl?: string;
      supportEmail?: string;
      affiliateEnabled?: boolean;
      commissionPercent?: number;
    },
  ): Promise<ToolResult> {
    const { productId, ...fields } = args;
    if (!productId) {
      return { success: false, error: 'productId_required' };
    }
    const updateData: Record<string, unknown> = {};
    if (fields.name !== undefined) {
      updateData.name = fields.name;
    }
    if (fields.price !== undefined) {
      updateData.price = fields.price;
    }
    if (fields.description !== undefined) {
      updateData.description = fields.description;
    }
    if (fields.active !== undefined) {
      updateData.active = fields.active;
    }
    if (fields.imageUrl !== undefined) {
      updateData.imageUrl = fields.imageUrl;
    }
    if (fields.category !== undefined) {
      updateData.category = fields.category;
    }
    if (fields.format !== undefined) {
      updateData.format = fields.format;
    }
    if (fields.tags !== undefined) {
      updateData.tags = fields.tags;
    }
    if (fields.warrantyDays !== undefined) {
      updateData.warrantyDays = fields.warrantyDays;
    }
    if (fields.salesPageUrl !== undefined) {
      updateData.salesPageUrl = fields.salesPageUrl;
    }
    if (fields.thankyouUrl !== undefined) {
      updateData.thankyouUrl = fields.thankyouUrl;
    }
    if (fields.thankyouPixUrl !== undefined) {
      updateData.thankyouPixUrl = fields.thankyouPixUrl;
    }
    if (fields.thankyouBoletoUrl !== undefined) {
      updateData.thankyouBoletoUrl = fields.thankyouBoletoUrl;
    }
    if (fields.reclameAquiUrl !== undefined) {
      updateData.reclameAquiUrl = fields.reclameAquiUrl;
    }
    if (fields.supportEmail !== undefined) {
      updateData.supportEmail = fields.supportEmail;
    }
    if (fields.affiliateEnabled !== undefined) {
      updateData.affiliateEnabled = fields.affiliateEnabled;
    }
    if (fields.commissionPercent !== undefined) {
      updateData.commissionPercent = fields.commissionPercent;
    }
    if (Object.keys(updateData).length === 0) {
      return { success: false, error: 'no_fields_to_update' };
    }
    const product = await this.prisma.product
      .update({
        where: { id: productId, workspaceId },
        data: updateData,
      })
      .catch(() => null);
    if (!product) {
      return { success: false, error: 'product_not_found' };
    }
    return {
      success: true,
      product: { id: product.id, name: product.name, price: product.price },
      message: `Produto "${product.name}" atualizado.`,
    };
  }

  async toolGetProductPlans(workspaceId: string, args: { productId: string }): Promise<ToolResult> {
    if (!args.productId) {
      return { success: false, error: 'productId_required' };
    }
    const product = await this.prisma.product.findFirst({
      where: { id: args.productId, workspaceId },
      select: { id: true, name: true, price: true },
    });
    if (!product) {
      return { success: false, error: 'product_not_found' };
    }
    const plans = await this.prisma.productPlan.findMany({
      where: { productId: args.productId },
      select: {
        id: true,
        name: true,
        price: true,
        itemsPerPlan: true,
        maxInstallments: true,
        active: true,
      },
      orderBy: { price: 'asc' },
    });
    return {
      success: true,
      product: { id: product.id, name: product.name, price: product.price },
      plans,
      count: plans.length,
    };
  }

  async toolGetProductUrls(workspaceId: string, args: { productId: string }): Promise<ToolResult> {
    if (!args.productId) {
      return { success: false, error: 'productId_required' };
    }
    const product = await this.prisma.product.findFirst({
      where: { id: args.productId, workspaceId },
      select: {
        id: true,
        name: true,
        salesPageUrl: true,
        thankyouUrl: true,
        thankyouPixUrl: true,
        thankyouBoletoUrl: true,
        reclameAquiUrl: true,
        supportEmail: true,
        slug: true,
      },
    });
    if (!product) {
      return { success: false, error: 'product_not_found' };
    }
    return {
      success: true,
      product: { id: product.id, name: product.name },
      urls: {
        salesPageUrl: product.salesPageUrl,
        thankyouUrl: product.thankyouUrl,
        thankyouPixUrl: product.thankyouPixUrl,
        thankyouBoletoUrl: product.thankyouBoletoUrl,
        reclameAquiUrl: product.reclameAquiUrl,
        supportEmail: product.supportEmail,
        slug: product.slug,
      },
    };
  }

  async toolGetProductReviews(
    workspaceId: string,
    args: { productId: string },
  ): Promise<ToolResult> {
    if (!args.productId) {
      return { success: false, error: 'productId_required' };
    }
    const product = await this.prisma.product.findFirst({
      where: { id: args.productId, workspaceId },
      select: { id: true, name: true },
    });
    if (!product) {
      return { success: false, error: 'product_not_found' };
    }
    const reviews = await this.prisma.productReview.findMany({
      where: { productId: args.productId },
      select: {
        id: true,
        rating: true,
        comment: true,
        authorName: true,
        createdAt: true,
        verified: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      success: true,
      product: { id: product.id, name: product.name },
      reviews,
      count: reviews.length,
    };
  }

  async toolGetProductAiConfig(
    workspaceId: string,
    args: { productId: string },
  ): Promise<ToolResult> {
    if (!args.productId) {
      return { success: false, error: 'productId_required' };
    }
    const product = await this.prisma.product.findFirst({
      where: { id: args.productId, workspaceId },
      select: { id: true, name: true, aiConfig: true },
    });
    if (!product) {
      return { success: false, error: 'product_not_found' };
    }
    return {
      success: true,
      product: { id: product.id, name: product.name },
      aiConfig: product.aiConfig || null,
    };
  }

  async toolValidateCoupon(
    _workspaceId: string,
    args: { productId: string; code: string },
  ): Promise<ToolResult> {
    if (!args.productId || !args.code) {
      return { success: false, error: 'productId_and_code_required' };
    }
    const coupon = await this.prisma.productCoupon.findFirst({
      where: { productId: args.productId, code: args.code, active: true },
    });
    if (!coupon) {
      return { success: false, error: 'coupon_not_found_or_inactive', valid: false };
    }
    const now = new Date();
    if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
      return {
        success: true,
        valid: false,
        reason: 'expired',
        coupon: { code: coupon.code, discount: coupon.discountValue },
      };
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return {
        success: true,
        valid: false,
        reason: 'max_uses_reached',
        coupon: { code: coupon.code },
      };
    }
    return {
      success: true,
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountValue: coupon.discountValue,
        type: coupon.discountType,
      },
    };
  }

  async toolGetAnalytics(
    workspaceId: string,
    args: { metric: string; period?: string },
  ): Promise<ToolResult> {
    const period = args.period || 'month';
    const now = new Date();
    let since: Date;
    if (period === 'today') {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      since = new Date(now.getTime() - 7 * 86400000);
    } else {
      since = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const [contactCount, _orderCount, orders] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceId } }),
      this.prisma.checkoutOrder.count({ where: { workspaceId, createdAt: { gte: since } } }),
      this.prisma.checkoutOrder.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: { totalInCents: true, status: true },
      }),
    ]);
    const totalRevenue = orders.reduce((sum: number, o) => sum + o.totalInCents, 0);
    const paidOrders = orders.filter((o) => o.status === 'PAID' || o.status === 'DELIVERED').length;
    return {
      success: true,
      period,
      metrics: {
        totalContacts: contactCount,
        ordersInPeriod: orders.length,
        paidOrders,
        totalRevenueCents: totalRevenue,
        conversionRate:
          contactCount > 0 ? ((paidOrders / contactCount) * 100).toFixed(1) + '%' : '0%',
      },
    };
  }

  async toolCreateBroadcast(
    workspaceId: string,
    args: { name: string; message: string; targetTags?: string[]; scheduleAt?: string },
  ): Promise<ToolResult> {
    if (!args.name || !args.message) {
      return { success: false, error: 'name_and_message_required' };
    }
    const campaign = await this.prisma.campaign.create({
      data: {
        workspaceId,
        name: args.name,
        messageTemplate: args.message,
        filters: args.targetTags?.length ? { tags: args.targetTags } : undefined,
        scheduledAt: args.scheduleAt ? new Date(args.scheduleAt) : undefined,
        status: 'DRAFT',
      },
    });
    return {
      success: true,
      campaign: { id: campaign.id, name: campaign.name, status: campaign.status },
      message: `Campanha "${args.name}" criada.`,
    };
  }

  async toolConfigureAiPersona(
    workspaceId: string,
    args: {
      name?: string;
      personality?: string;
      tone?: string;
      language?: string;
      useEmojis?: boolean;
    },
  ): Promise<ToolResult> {
    const persona = {
      name: args.name || 'KLOEL',
      personality: args.personality || '',
      tone: args.tone || 'professional',
      language: args.language || 'pt-BR',
      useEmojis: args.useEmojis ?? true,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: 'aiPersona' } },
      update: {
        value: persona,
        category: 'preferences',
        type: 'persona',
        content: `Persona: ${persona.name}, Tom: ${persona.tone}`,
        metadata: persona,
      },
      create: {
        workspaceId,
        key: 'aiPersona',
        value: persona,
        category: 'preferences',
        type: 'persona',
        content: `Persona: ${persona.name}, Tom: ${persona.tone}`,
        metadata: persona,
      },
    });
    return { success: true, persona, message: `Persona IA "${persona.name}" configurada.` };
  }
}
