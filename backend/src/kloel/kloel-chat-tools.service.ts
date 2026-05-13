import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { filterLegacyProducts } from '../common/products/legacy-products.util';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';
import {
  AgentRuntimeSchedulerService,
  AgentRuntimeSessionStore,
  AgentRuntimeSkillRegistry,
  type AgentSkillDefinition,
} from './agent-runtime';

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

function safeAgentRuntimeId(value: unknown, fallback: string): string {
  return safeStr(value, fallback).trim().toLowerCase().replace(NON_SLUG_CHAR_RE, '_').slice(0, 80);
}

/** Generic tool result shape. */
interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
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

interface ToolCreateAgentJobArgs {
  jobId?: string;
  title: string;
  prompt: string;
  everyMinutes?: number;
  runAt?: string;
  toolScope?: string[];
}

interface ToolSearchAgentMemoryArgs {
  query: string;
  limit?: number;
}

interface ToolSearchAgentSessionsArgs {
  query: string;
  limit?: number;
}

interface ToolUpsertAgentSkillArgs {
  id: string;
  title: string;
  summary: string;
  category?: AgentSkillDefinition['category'];
  riskLevel?: AgentSkillDefinition['riskLevel'];
  allowedTools?: string[];
  requiredEvidence?: string[];
  validation?: string[];
  rollback?: string[];
  metrics?: string[];
  body?: string;
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
    if (!this.agentScheduler) {
      return { success: false, error: 'agent_scheduler_unavailable' };
    }
    const title = safeStr(args.title).trim().slice(0, 200);
    const prompt = safeStr(args.prompt).trim().slice(0, 4000);
    if (!title || !prompt) {
      return { success: false, error: 'missing_agent_job_title_or_prompt' };
    }
    const everyMinutes = Number(args.everyMinutes);
    const runAt = args.runAt ? new Date(args.runAt) : undefined;
    const hasValidRunAt = runAt && !Number.isNaN(runAt.getTime());
    const result = await this.agentScheduler.upsertJob({
      workspaceId,
      jobId: safeAgentRuntimeId(args.jobId, title) || 'job',
      title,
      prompt,
      schedule: hasValidRunAt
        ? { kind: 'once', runAt }
        : { kind: 'interval', everyMinutes: Number.isFinite(everyMinutes) ? everyMinutes : 60 },
      toolScope: Array.isArray(args.toolScope)
        ? args.toolScope.filter((tool): tool is string => typeof tool === 'string')
        : [],
    });
    return { success: true, message: 'Job autônomo registrado com governança.', ...result };
  }

  async toolListAgentJobs(workspaceId: string): Promise<ToolResult> {
    if (!this.agentScheduler) {
      return { success: false, error: 'agent_scheduler_unavailable' };
    }
    const jobs = await this.agentScheduler.listJobs(workspaceId);
    return {
      success: true,
      jobs,
      message: jobs.length ? `Jobs autônomos: ${jobs.length}` : 'Nenhum job autônomo registrado.',
    };
  }

  async toolSearchAgentMemory(
    workspaceId: string,
    args: ToolSearchAgentMemoryArgs,
  ): Promise<ToolResult> {
    if (!this.agentSessions) {
      return { success: false, error: 'agent_memory_unavailable' };
    }
    const query = safeStr(args.query).trim();
    if (!query) {
      return { success: false, error: 'missing_agent_memory_query' };
    }
    const result = await this.agentSessions.search(workspaceId, query, args.limit ?? 6);
    return { success: true, ...result };
  }

  async toolSearchAgentSessions(
    workspaceId: string,
    args: ToolSearchAgentSessionsArgs,
  ): Promise<ToolResult> {
    if (!this.agentSessions) {
      return { success: false, error: 'agent_memory_unavailable' };
    }
    const query = safeStr(args.query).trim();
    if (!query) {
      return { success: false, error: 'missing_agent_session_query' };
    }
    const result = await this.agentSessions.searchSessions(workspaceId, query, args.limit ?? 3);
    return { success: true, ...result };
  }

  async toolUpsertAgentSkill(
    workspaceId: string,
    args: ToolUpsertAgentSkillArgs,
  ): Promise<ToolResult> {
    if (!this.agentSkills) {
      return { success: false, error: 'agent_skill_registry_unavailable' };
    }
    const id = safeAgentRuntimeId(args.id, '');
    const title = safeStr(args.title).trim().slice(0, 200);
    const summary = safeStr(args.summary).trim().slice(0, 500);
    if (!id || !title || !summary) {
      return { success: false, error: 'missing_agent_skill_identity' };
    }
    const skill: AgentSkillDefinition = {
      id,
      title,
      summary,
      category: this.agentSkillCategory(args.category),
      riskLevel: this.agentSkillRisk(args.riskLevel),
      allowedTools: this.stringList(args.allowedTools),
      requiredEvidence: this.stringList(args.requiredEvidence),
      validation: this.stringList(args.validation),
      rollback: this.stringList(args.rollback),
      metrics: this.stringList(args.metrics),
      body: safeStr(args.body).trim().slice(0, 4000),
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    const result = await this.agentSkills.upsertSkill(workspaceId, skill);
    return {
      success: result.ok,
      skillId: skill.id,
      version: result.version,
      reasons: result.reasons,
      message: result.ok ? 'Skill procedural registrada.' : 'Skill procedural recusada.',
    };
  }

  private stringList(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  private agentSkillCategory(value: unknown): AgentSkillDefinition['category'] {
    return value === 'commercial' || value === 'operational' || value === 'pulse' || value === 'workspace'
      ? value
      : 'operational';
  }

  private agentSkillRisk(value: unknown): AgentSkillDefinition['riskLevel'] {
    return value === 'safe' || value === 'normal' || value === 'high' || value === 'critical'
      ? value
      : 'normal';
  }
}
