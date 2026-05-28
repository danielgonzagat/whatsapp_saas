import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import type { ToolArgs } from './unified-agent.types';
import { OpsAlertService } from '../observability/ops-alert.service';
import { actionGetWorkspaceStatus as actionGetWorkspaceStatusFn } from './unified-agent-actions-workspace.helpers';
import { MindGuardContextBuilderService } from './mind/policy/mind-guard-context-builder.service';
import { MindGuardsService } from './mind/policy/mind-guards.service';
import type { MindActionContext } from './mind/policy/mind-code-native.types';
import { MindService } from './mind.service';

import type { UnknownRecord } from '../common/types';
import {
  broadcastDecisionSource,
  buildAIPersonaData,
  buildAutopilotConfig,
  buildFlowMemoryKey,
  buildFlowMemoryValue,
  buildProductMemoryKey,
  buildProductMemoryUpdate,
  buildProductMemoryValue,
  defaultBroadcastWindowWhenMindUnavailable,
  defaultChannelChoiceWhenMindUnavailable,
  resolveBroadcastChannels,
  resolveBroadcastScheduleAt,
  resolvePredecidedBroadcastWindow,
  resolvePredecidedChannelChoice,
} from './unified-agent-actions-workspace.helpers';
type MemoryValue = Record<string, unknown>;

function isDeterministicPipeline(context?: UnknownRecord): boolean {
  return context?.deterministicPipeline === true;
}

function readRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;
}

/**
 * Handles workspace, product, flow, and AI persona tool actions for the Unified Agent.
 * Analytics are in UnifiedAgentActionsBillingService;
 * funnel generation is in UnifiedAgentActionsCrmService.
 */
@Injectable()
export class UnifiedAgentActionsWorkspaceService {
  private readonly logger = StructuredLogger.from(UnifiedAgentActionsWorkspaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly mind?: MindService,
    @Optional() private readonly guardContextBuilder?: MindGuardContextBuilderService,
    @Optional() private readonly guards?: MindGuardsService,
  ) {}

  // ───────── helpers ─────────

  str(v: unknown, fb = ''): string {
    return typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : fb;
  }

  private async updateWorkspaceProviderSettings(
    workspaceId: string,
    buildNextSettings: (currentSettings: UnknownRecord) => UnknownRecord,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const workspace = await tx.workspace.findUnique({
          where: { id: workspaceId },
          select: { providerSettings: true },
        });
        const current = (workspace?.providerSettings ?? {}) as UnknownRecord;
        await tx.workspace.update({
          where: { id: workspaceId },
          data: {
            providerSettings: buildNextSettings(current) as Prisma.InputJsonValue,
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  // ───────── product actions ─────────

  async actionCreateProduct(workspaceId: string, args: ToolArgs) {
    const existingDb = await this.prisma.product.findFirst({
      where: {
        workspaceId,
        ...(args.name !== undefined ? { name: args.name } : {}),
        active: true,
      },
      select: { id: true, name: true, price: true },
    });
    if (existingDb) {
      return {
        success: true,
        productId: existingDb.id,
        message: `Produto "${args.name}" já existe (R$ ${existingDb.price}).`,
        deduplicated: true,
      };
    }

    const existingMem = await this.prisma.kloelMemory.findFirst({
      where: { workspaceId, type: 'product' },
      orderBy: { createdAt: 'desc' },
      select: { key: true, value: true },
    });
    if (
      existingMem?.value &&
      typeof existingMem.value === 'object' &&
      (existingMem.value as MemoryValue).name === args.name
    ) {
      return {
        success: true,
        productId: existingMem.key,
        message: `Produto "${args.name}" já existe em memória.`,
        deduplicated: true,
      };
    }

    const productKey = buildProductMemoryKey(args);
    await this.prisma.kloelMemory.create({
      data: {
        workspaceId,
        key: productKey,
        type: 'product',
        category: 'products',
        value: buildProductMemoryValue(args),
      },
    });
    let dbProductId: string | null = null;
    try {
      const dbProduct = await this.prisma.product.create({
        data: {
          workspaceId,
          name: this.str(args.name),
          price: args.price || 0,
          description: args.description || '',
          category: args.category || 'default',
          imageUrl: args.imageUrl || null,
          active: true,
        },
      });
      dbProductId = dbProduct.id;
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(err, 'UnifiedAgentActionsWorkspaceService.create');
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
      this.logger.warn(`Produto "${args.name}" salvo apenas em memória: ${msg}`);
    }
    return {
      success: true,
      productId: dbProductId || productKey,
      message: `Produto "${args.name}" criado com sucesso por R$ ${args.price}`,
    };
  }

  async actionUpdateProduct(workspaceId: string, args: ToolArgs) {
    if (!args.productId) {
      return { success: false, error: 'Product ID is required' };
    }
    const productId = args.productId;
    const result = await this.prisma.$transaction(
      async (tx) => {
        const product = await tx.kloelMemory.findFirst({
          where: { workspaceId, key: productId, type: 'product' },
        });
        if (!product) {
          return { success: false as const, error: 'Produto não encontrado' };
        }
        const currentValue = product.value as MemoryValue;
        const updatedValue = buildProductMemoryUpdate(currentValue, args);
        await tx.kloelMemory.updateMany({
          where: { id: product.id, workspaceId },
          data: { value: updatedValue },
        });
        return { success: true as const };
      },
      { isolationLevel: 'ReadCommitted' },
    );
    if (!result.success) {
      return result;
    }
    return { success: true, message: 'Produto atualizado com sucesso' };
  }

  async actionCreateFlow(workspaceId: string, args: ToolArgs) {
    if (!args.name) {
      return { success: false, error: 'Flow name is required' };
    }
    const flowKey = buildFlowMemoryKey(args);
    await this.prisma.kloelMemory.create({
      data: {
        workspaceId,
        key: flowKey,
        type: 'flow',
        category: 'automation',
        value: buildFlowMemoryValue(args),
      },
    });
    return {
      success: true,
      flowId: flowKey,
      message: `Fluxo "${args.name}" criado com gatilho "${args.trigger}"`,
    };
  }

  async actionUpdateWorkspaceSettings(workspaceId: string, args: ToolArgs) {
    const updates: UnknownRecord = {};
    if (args.businessName) {
      updates.name = args.businessName;
    }
    if (Object.keys(updates).length > 0) {
      await this.prisma.workspace.update({ where: { id: workspaceId }, data: updates });
    }
    if (args.businessHours) {
      await this.prisma.kloelMemory.upsert({
        where: { workspaceId_key: { workspaceId, key: 'businessHours' } },
        create: { workspaceId, key: 'businessHours', type: 'settings', value: args.businessHours },
        update: { value: args.businessHours },
      });
    }
    if (args.autoReplyEnabled !== undefined) {
      await this.prisma.kloelMemory.upsert({
        where: { workspaceId_key: { workspaceId, key: 'autoReply' } },
        create: {
          workspaceId,
          key: 'autoReply',
          type: 'settings',
          value: {
            enabled: args.autoReplyEnabled,
            message: args.autoReplyMessage || 'Olá! Responderemos em breve.',
          },
        },
        update: { value: { enabled: args.autoReplyEnabled, message: args.autoReplyMessage } },
      });
    }
    return { success: true, message: 'Configurações atualizadas com sucesso' };
  }

  async actionCreateBroadcast(workspaceId: string, args: ToolArgs, context?: UnknownRecord) {
    const broadcastKey = `broadcast_${Date.now()}`;
    const segment = this.str(args.stage, 'general');
    const availableChannels = resolveBroadcastChannels(args);
    const predecided = isDeterministicPipeline(context);
    const predecidedChannelChoice = readRecord(args.channelChoice);
    const predecidedBroadcastWindow = readRecord(args.broadcastWindow);
    const channelChoice = predecided
      ? resolvePredecidedChannelChoice(predecidedChannelChoice, availableChannels)
      : this.mind
        ? await this.mind.resolveChannelChoice(
            workspaceId,
            availableChannels,
            segment,
            new Date().getHours(),
            'broadcast',
          )
        : defaultChannelChoiceWhenMindUnavailable(availableChannels);
    const broadcastWindow = predecided
      ? resolvePredecidedBroadcastWindow(predecidedBroadcastWindow, args.scheduleAt)
      : this.mind
        ? await this.mind.resolveBroadcastWindow(workspaceId, channelChoice.channel, segment)
        : defaultBroadcastWindowWhenMindUnavailable(args.scheduleAt);
    const scheduleAt = args.scheduleAt || resolveBroadcastScheduleAt(broadcastWindow.window);
    const broadcastContext = await this.buildBroadcastGuardContext(workspaceId, {
      campaignActive: true,
      campaignBudgetExhausted: false,
      channel: channelChoice.channel,
      segment,
      withinComplianceWindow: false,
    });
    const guard = await this.guards?.evaluate({
      workspaceId,
      decisionType: 'broadcast_window',
      action: 'schedule_broadcast',
      context: broadcastContext,
    });
    if (guard && !guard.allowed) {
      return {
        success: false,
        blocked: true,
        error: guard.reason,
        guardName: guard.guardName,
        mind: { channelChoice, broadcastWindow },
      };
    }
    let contactCount = 0;
    if (args.targetTags && args.targetTags.length > 0) {
      contactCount = await this.prisma.contact.count({
        where: { workspaceId, tags: { some: { name: { in: args.targetTags } } } },
      });
    } else {
      contactCount = await this.prisma.contact.count({ where: { workspaceId } });
    }
    await this.prisma.kloelMemory.create({
      data: {
        workspaceId,
        key: broadcastKey,
        type: 'broadcast',
        category: 'campaign',
        value: {
          name: args.name,
          message: args.message,
          targetTags: args.targetTags || [],
          scheduleAt,
          contactCount,
          status: 'pending',
          channel: channelChoice.channel,
          mind: { channelChoice, broadcastWindow },
          source: broadcastDecisionSource(predecided),
          decisionTraceId: args.decisionTraceId || null,
          inboundCorrelationId: args.inboundCorrelationId || null,
          createdAt: new Date().toISOString(),
        },
      },
    });
    return {
      success: true,
      broadcastId: broadcastKey,
      contactCount,
      channel: channelChoice.channel,
      scheduleAt,
      mind: { channelChoice, broadcastWindow },
      source: broadcastDecisionSource(predecided),
      message: `Broadcast "${args.name}" criado para ${contactCount} contatos`,
    };
  }

  private async buildBroadcastGuardContext(
    workspaceId: string,
    context: MindActionContext,
  ): Promise<MindActionContext> {
    return (await this.guardContextBuilder?.buildForBroadcast(workspaceId, context)) ?? context;
  }

  async actionConfigureAIPersona(workspaceId: string, args: ToolArgs) {
    const personaData = buildAIPersonaData(args);
    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: 'aiPersona' } },
      create: {
        workspaceId,
        key: 'aiPersona',
        type: 'settings',
        category: 'ai',
        value: personaData,
      },
      update: { value: personaData },
    });
    return {
      success: true,
      message: `Persona da IA configurada: ${personaData.name} com tom ${personaData.tone}`,
    };
  }

  async actionToggleAutopilot(workspaceId: string, args: ToolArgs) {
    const autopilotConfig = buildAutopilotConfig(args);
    await this.updateWorkspaceProviderSettings(workspaceId, (s) => ({
      ...s,
      autopilot: autopilotConfig,
    }));
    return {
      success: true,
      message: `Autopilot ${autopilotConfig.enabled ? 'ativado' : 'desativado'} no modo ${autopilotConfig.mode}`,
      config: autopilotConfig,
    };
  }

  async actionCreateFlowFromDescription(
    workspaceId: string,
    args: ToolArgs,
    openai: OpenAI | null,
    primaryBrainModel: string,
    fallbackBrainModel: string,
  ) {
    const { description, objective, autoActivate = false } = args;
    if (!openai) {
      return { success: false, error: 'OpenAI não configurada' };
    }
    const prompt = `Descrição: "${description}"
Objetivo: "${objective}"
Tipos de nós disponíveis: message, wait, condition, aiNode, mediaNode, endNode`;
    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const completion = await chatCompletionWithFallback(
        openai,
        {
          model: primaryBrainModel,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        },
        fallbackBrainModel,
      );
      await this.planLimits
        .trackAiUsage(workspaceId, completion?.usage?.total_tokens ?? 500)
        .catch(() => {});
      const flowData = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const flow = await this.prisma.flow.create({
        data: {
          name: flowData.name || `Fluxo: ${objective}`,
          workspaceId,
          nodes: flowData.nodes || [],
          edges: flowData.edges || [],
          triggerType: 'MANUAL',
          triggerCondition: '',
          isActive: autoActivate,
        },
      });
      return {
        success: true,
        flowId: flow.id,
        flowName: flow.name,
        message: `Fluxo "${flow.name}" criado! ${autoActivate ? 'Já está ativo.' : 'Ative quando quiser.'}`,
        nodes: flowData.nodes?.length || 0,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'UnifiedAgentActionsWorkspaceService.create');
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao criar fluxo: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionScheduleCampaign(workspaceId: string, args: ToolArgs) {
    const { campaignId, scheduleAt } = args;
    const scheduledDate = new Date(scheduleAt || Date.now());
    if (campaignId) {
      await this.prisma.campaign.updateMany({
        where: { id: campaignId, workspaceId },
        data: { scheduledAt: scheduledDate, status: 'SCHEDULED' },
      });
      return {
        success: true,
        message: `Campanha agendada para ${scheduledDate.toLocaleString('pt-BR')}`,
        scheduledAt: scheduledDate.toISOString(),
      };
    }
    return { success: false, error: 'ID da campanha necessário para agendar' };
  }

  async actionGetWorkspaceStatus(workspaceId: string, args: ToolArgs) {
    return actionGetWorkspaceStatusFn({
      workspaceId,
      args,
      prisma: this.prisma,
    });
  }
}
