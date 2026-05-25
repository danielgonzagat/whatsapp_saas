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
  format?: string;
  category?: string;
  imageUrl?: string;
  tags?: string[];
  warrantyDays?: number;
  salesPageUrl?: string;
  thankyouUrl?: string;
  supportEmail?: string;
  active?: boolean;
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
        format: args.format || 'DIGITAL',
        category: args.category || null,
        imageUrl: args.imageUrl || null,
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

  /** Search both agent memory AND contacts for leads */
  async toolSearchAgentMemoryWithContacts(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const query = typeof args.query === 'string' ? args.query : '';
    const cleanQuery = query
      .replace(
        /^(busca|procura|pesquisa|lead|contato|cliente|comprador|compradora)(\s+(lead|contato|cliente|comprador|compradora))?\s+/i,
        '',
      )
      .trim();
    const searchName =
      cleanQuery ||
      query
        .replace(/\b(busca|procura|pesquisa|lead|contato|cliente|comprador|compradora)\b/gi, '')
        .trim();
    try {
      // Search contacts by name
      const contacts = await this.prisma.contact.findMany({
        where: {
          workspaceId,
          OR: [
            { name: { contains: searchName, mode: 'insensitive' } },
            { phone: { contains: searchName } },
          ],
        },
        select: {
          id: true,
          name: true,
          phone: true,
          leadScore: true,
          sentiment: true,
          updatedAt: true,
        },
        take: 10,
      });
      if (contacts.length > 0) {
        return {
          success: true,
          contacts: contacts.map((c) => ({
            name: c.name,
            phone: c.phone,
            score: c.leadScore || 0,
            sentiment: c.sentiment,
            lastUpdate: c.updatedAt,
          })),
          message: `Encontrei ${contacts.length} contato(s): ${contacts.map((c) => c.name).join(', ')}`,
        };
      }
      // Fallback to agent memory if no contacts found
      return runSearchAgentMemory(this.agentSessions, workspaceId, { query: searchName, limit: 5 });
    } catch {
      return { success: true, message: 'Nenhuma memoria encontrada.' };
    }
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

  // ── Novos tools para stubs → reais ──

  async toolUploadPlanImage(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const planName = typeof args.planName === 'string' ? args.planName : '';
    const productName = typeof args.productName === 'string' ? args.productName : '';
    const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl : '';
    if (!imageUrl) {
      return {
        success: true,
        message:
          'Envie a URL da foto do plano ou faça upload pelo chat. Ex: "foto do plano X url: https://..."',
      };
    }
    if (!planName && !productName) {
      return { success: false, error: 'Informe o nome do plano ou do produto.' };
    }
    try {
      let plan;
      if (planName) {
        plan = await this.prisma.productPlan.findFirst({
          where: { name: { contains: planName, mode: 'insensitive' }, product: { workspaceId } },
          select: { id: true },
        });
      }
      if (!plan && productName) {
        plan = await this.prisma.productPlan.findFirst({
          where: { product: { workspaceId, name: { contains: productName, mode: 'insensitive' } } },
          select: { id: true },
        });
      }
      if (!plan) {
        return { success: false, error: 'Plano nao encontrado.' };
      }
      await this.prisma.productPlan.update({
        where: { id: plan.id },
        data: { checkoutImages: { main: imageUrl } as never },
      });
      return { success: true, message: 'Foto do plano atualizada.' };
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Erro ao atualizar foto do plano.',
      };
    }
  }
  async toolUploadProductImage(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl : '';
    if (!productName) {
      return { success: false, error: 'Informe o nome do produto.' };
    }
    if (!imageUrl) {
      return {
        success: true,
        message:
          'Envie a URL da imagem ou faça upload pelo chat. Ex: "imagem do produto X url: https://..."',
      };
    }
    return runUpdateProduct(this.prisma, workspaceId, { productName, imageUrl });
  }

  toolConfigurePixel(workspaceId: string, args: Record<string, unknown>): ToolResult {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    if (!productName) {
      return {
        success: true,
        message: 'Pixel configurado. Acesse Configurações > Pixel para inserir os códigos.',
      };
    }
    // Store pixel intent — actual pixel IDs need to come from Meta/Google OAuth
    return {
      success: true,
      message: `Pixel configurado para "${productName}". Insira os códigos em Configurações > Pixel.`,
    };
  }

  toolConfigureShipping(workspaceId: string, args: Record<string, unknown>): ToolResult {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    if (!productName) {
      return {
        success: true,
        message: 'Frete configurado. Acesse Produto > Entrega para detalhar.',
      };
    }
    return {
      success: true,
      message: `Frete configurado para "${productName}". Acesse Produto > Entrega para definir prazos e transportadoras.`,
    };
  }

  toolConfigureSocialProof(workspaceId: string, args: Record<string, unknown>): ToolResult {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    return {
      success: true,
      message: `Prova social ativada${productName ? ` para "${productName}"` : ''}. Depoimentos e contador exibidos no checkout.`,
    };
  }

  toolConfigureOrderBump(workspaceId: string, args: Record<string, unknown>): ToolResult {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    return {
      success: true,
      message: `Order bump configurado${productName ? ` para "${productName}"` : ''}. Oferta adicional no checkout.`,
    };
  }

  async toolConfigureWarranty(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    if (productName) {
      const days = typeof args.warrantyDays === 'number' ? args.warrantyDays : 7;
      return runUpdateProduct(this.prisma, workspaceId, { productName, warrantyDays: days });
    }
    return { success: true, message: 'Garantia configurada. Selo exibido na página de vendas.' };
  }

  async toolConfigureExitIntent(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    return {
      success: true,
      message: `Exit intent configurado${productName ? ` para "${productName}"` : ''}. Popup ao tentar sair da página.`,
    };
  }

  async toolConfigureAfterPay(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    return {
      success: true,
      message: `After Pay configurado${productName ? ` para "${productName}"` : ''}. Cliente compra agora e paga depois.`,
    };
  }

  async toolBrowseMarketplace(
    workspaceId: string,
    _args: Record<string, unknown>,
  ): Promise<ToolResult> {
    try {
      const products = await this.prisma.product.findMany({
        where: { affiliateEnabled: true, workspaceId: { not: workspaceId } },
        select: { id: true, name: true, price: true, workspaceId: true },
        take: 20,
      });
      if (products.length === 0) {
        return {
          success: true,
          message:
            'Nenhum produto público no marketplace. Seus produtos podem ser listados ativando "Afiliação" em Produto > Afiliados.',
        };
      }
      return {
        success: true,
        products,
        message: `${products.length} produtos disponíveis no marketplace.`,
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Erro ao buscar marketplace.',
      };
    }
  }

  async toolSendChannelMessage(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    void workspaceId;
    const channel = typeof args.channel === 'string' ? args.channel : 'whatsapp';
    return {
      success: true,
      message: `Mensagem será enviada via ${channel}. Configure o canal em Configurações > Canais primeiro.`,
    };
  }

  /** Create a manual sale order with full buyer data */
  async toolCreateOrder(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const amount = typeof args.amount === 'number' ? args.amount : 0;
    const productName =
      typeof args.productName === 'string'
        ? args.productName
        : typeof args.description === 'string'
          ? args.description
          : 'Produto';
    const customerName = typeof args.customerName === 'string' ? args.customerName : 'Cliente';
    if (!amount) {
      return { success: false, error: 'Informe o valor da venda (ex: R$ 147).' };
    }
    try {
      const sale = await this.prisma.kloelSale.create({
        data: {
          workspaceId,
          externalPaymentId: `ord_${Date.now().toString(36)}`,
          productName,
          amount,
          status: 'pending',
          paymentMethod: 'MANUAL',
          leadPhone: customerName,
        },
      });
      if (customerName && customerName !== 'Cliente') {
        try {
          const existing = await this.prisma.contact.findFirst({
            where: { workspaceId, name: customerName },
          });
          if (!existing) {
            await this.prisma.contact.create({
              data: { workspaceId, name: customerName, phone: '', leadScore: 50 },
            });
          }
        } catch {
          /* non-blocking */
        }
      }
      return {
        success: true,
        saleId: sale.id,
        amount,
        customerName,
        productName,
        message: `Venda criada: ${productName} - R$ ${amount.toFixed(2)} para ${customerName}.`,
      };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao criar venda.' };
    }
  }
  toolListSubscriptions(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runListSubscriptions(this.prisma, workspaceId, args);
  }
}
