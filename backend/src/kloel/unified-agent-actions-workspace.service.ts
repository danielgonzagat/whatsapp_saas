import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import type { ToolArgs } from './unified-agent.service';

type UnknownRecord = Record<string, unknown>;

const WHITESPACE_G_RE = /\s+/g;

/**
 * Handles workspace, product, flow, and AI persona tool actions for the Unified Agent.
 * Analytics are in UnifiedAgentActionsBillingService;
 * funnel generation is in UnifiedAgentActionsCrmService.
 */
@Injectable()
export class UnifiedAgentActionsWorkspaceService {
  private readonly logger = new Logger(UnifiedAgentActionsWorkspaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
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
    const productKey = `product_${Date.now()}_${args.name.toLowerCase().replace(WHITESPACE_G_RE, '_')}`;
    await this.prisma.kloelMemory.create({
      data: {
        workspaceId,
        key: productKey,
        type: 'product',
        category: 'products',
        value: {
          name: args.name,
          price: args.price,
          description: args.description || '',
          category: args.category || 'default',
          imageUrl: args.imageUrl || null,
          paymentLink: args.paymentLink || null,
          active: true,
          createdAt: new Date().toISOString(),
        },
      },
    });
    let dbProductId: string | null = null;
    try {
      const dbProduct = await this.prisma.product.create({
        data: {
          workspaceId,
          name: args.name,
          price: args.price || 0,
          description: args.description || '',
          category: args.category || 'default',
          imageUrl: args.imageUrl || null,
          active: true,
        },
      });
      dbProductId = dbProduct.id;
    } catch (err: unknown) {
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
    const result = await this.prisma.$transaction(
      async (tx) => {
        const product = await tx.kloelMemory.findFirst({
          where: { workspaceId, key: args.productId, type: 'product' },
        });
        if (!product) return { success: false as const, error: 'Produto não encontrado' };
        const currentValue = product.value as Record<string, unknown>;
        const updatedValue = {
          ...currentValue,
          ...(args.name && { name: args.name }),
          ...(args.price !== undefined && { price: args.price }),
          ...(args.description && { description: args.description }),
          ...(args.active !== undefined && { active: args.active }),
          updatedAt: new Date().toISOString(),
        };
        await tx.kloelMemory.updateMany({
          where: { id: product.id, workspaceId },
          data: { value: updatedValue },
        });
        return { success: true as const };
      },
      { isolationLevel: 'ReadCommitted' },
    );
    if (!result.success) return result;
    return { success: true, message: 'Produto atualizado com sucesso' };
  }

  async actionCreateFlow(workspaceId: string, args: ToolArgs) {
    const flowKey = `flow_${Date.now()}_${args.name.toLowerCase().replace(WHITESPACE_G_RE, '_')}`;
    await this.prisma.kloelMemory.create({
      data: {
        workspaceId,
        key: flowKey,
        type: 'flow',
        category: 'automation',
        value: {
          name: args.name,
          trigger: args.trigger,
          triggerValue: args.triggerValue || null,
          steps: args.steps || [],
          active: true,
          createdAt: new Date().toISOString(),
        },
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
    if (args.businessName) updates.name = args.businessName;
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

  async actionCreateBroadcast(workspaceId: string, args: ToolArgs) {
    const broadcastKey = `broadcast_${Date.now()}`;
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
          scheduleAt: args.scheduleAt || null,
          contactCount,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      },
    });
    return {
      success: true,
      broadcastId: broadcastKey,
      contactCount,
      message: `Broadcast "${args.name}" criado para ${contactCount} contatos`,
    };
  }

  async actionConfigureAIPersona(workspaceId: string, args: ToolArgs) {
    const personaData = {
      name: args.name || 'KLOEL',
      personality: args.personality || 'Profissional, amigável e focada em resultados',
      tone: args.tone || 'friendly',
      language: args.language || 'pt-BR',
      useEmojis: args.useEmojis !== undefined ? args.useEmojis : true,
      updatedAt: new Date().toISOString(),
    };
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
    const { enabled, mode = 'full', workingHoursOnly = false } = args;
    const autopilotConfig = {
      enabled,
      mode,
      workingHoursOnly,
      updatedAt: new Date().toISOString(),
      updatedBy: 'kloel-ai',
    };
    await this.updateWorkspaceProviderSettings(workspaceId, (s) => ({
      ...s,
      autopilot: autopilotConfig,
    }));
    return {
      success: true,
      message: `Autopilot ${enabled ? 'ativado' : 'desativado'} no modo ${mode}`,
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
    if (!openai) return { success: false, error: 'OpenAI não configurada' };
    const prompt = `Você é um especialista em automação comercial.\nCrie um fluxo de automação para WhatsApp com base na descrição:\n"${description}"\n\nObjetivo: ${objective}\n\nRetorne APENAS um JSON válido com nós e arestas.\n\nTipos de nós disponíveis: message, wait, condition, aiNode, mediaNode, endNode`;
    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const completion = await chatCompletionWithFallback(
        openai,
        {
          model: primaryBrainModel,
          messages: [
            { role: 'system', content: 'Você gera estruturas de fluxo em JSON.' },
            { role: 'user', content: prompt },
          ],
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
    const { includeMetrics = true, includeConnections = true, includeHealth = true } = args;
    const result: {
      workspaceId: string;
      connections?: unknown;
      metrics?: unknown;
      health?: { status: 'healthy' | 'warning'; lastActivity: string; warnings: string[] };
    } = { workspaceId };

    if (includeConnections) {
      const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      const settings = (workspace?.providerSettings as UnknownRecord) || {};
      const wapiSession = (settings.whatsappApiSession ?? {}) as Record<string, unknown>;
      const autopilotSettings = (settings.autopilot ?? {}) as Record<string, unknown>;
      result.connections = {
        whatsapp: {
          provider: settings.whatsappProvider || 'none',
          status: wapiSession.status || settings.connectionStatus || 'disconnected',
          sessionId: wapiSession.sessionName || settings.sessionId,
        },
        autopilot: {
          enabled: autopilotSettings.enabled === true,
          mode: autopilotSettings.mode || 'off',
        },
      };
    }

    if (includeMetrics) {
      const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      result.metrics = {
        totalContacts: await this.prisma.contact.count({ where: { workspaceId } }),
        totalMessages: await this.prisma.message.count({
          where: { workspaceId, createdAt: { gte: last30Days } },
        }),
        activeFlows: await this.prisma.flow.count({ where: { workspaceId, isActive: true } }),
        products: await this.prisma.product.count({ where: { workspaceId } }),
      };
    }

    if (includeHealth) {
      result.health = { status: 'healthy', lastActivity: new Date().toISOString(), warnings: [] };
      const conn = result.connections as UnknownRecord | undefined;
      const wa = conn ? (conn.whatsapp as UnknownRecord) : undefined;
      if (!wa?.sessionId) {
        result.health.warnings.push('WhatsApp não conectado');
        result.health.status = 'warning';
      }
      const met = result.metrics as { activeFlows?: number } | undefined;
      if (met?.activeFlows === 0) result.health.warnings.push('Nenhum fluxo ativo');
    }
    return { success: true, ...result };
  }
}
