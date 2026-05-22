import { Injectable, Optional } from '@nestjs/common';
import {
  runListFollowups,
  runListPersonas,
  runCreatePersona,
  runListIntegrations,
  runCreateIntegration,
} from './kloel.service.lists.helpers';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelConversationStore } from './kloel-conversation-store';
import { KloelLeadBrainService } from './kloel-lead-brain.service';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelThinkerService, ThinkRequest, ThinkSyncResult } from './kloel-thinker.service';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { AgentRuntimeContextService } from './agent-runtime';
import { detectActionIntent } from './guest-chat.action-intent.helpers';
import { formatToolResult } from './guest-chat.action-intent.helpers';

type ComposerCapability = 'create_image' | 'create_site' | 'search_web';
import type { UnknownRecord } from '../common/types';

interface ComposerAttachmentMetadata {
  id?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  kind?: 'image' | 'document' | 'audio';
  url?: string | null;
}

interface ComposerLinkedProductMetadata {
  id?: string;
  source?: 'owned' | 'affiliate';
  name?: string;
  status?: 'published' | 'draft' | 'affiliate';
  productId?: string | null;
  affiliateProductId?: string | null;
}

interface ComposerMetadata {
  capability?: ComposerCapability | null;
  attachments?: ComposerAttachmentMetadata[];
  linkedProduct?: ComposerLinkedProductMetadata | null;
}

/** Followup list item shape. */
export interface FollowupListItem {
  id: string;
  key: string;
  phone?: unknown;
  contactId?: unknown;
  message: unknown;
  scheduledFor?: unknown;
  delayMinutes?: unknown;
  status: unknown;
  createdAt: Date;
  executedAt?: unknown;
}

/** Kloel main service — thin orchestrator over focused sub-services. */
@Injectable()
export class KloelService {
  private readonly logger = StructuredLogger.from(KloelService.name);
  private readonly conversationStore: KloelConversationStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly threadService: KloelThreadService,
    private readonly wsContextService: KloelWorkspaceContextService,
    private readonly leadBrainService: KloelLeadBrainService,
    private readonly thinkerService: KloelThinkerService,
    private readonly replyEngineService: KloelReplyEngineService,
    private readonly toolDispatcher: KloelToolDispatcherService,
    @Optional() private readonly agentRuntime?: AgentRuntimeContextService,
  ) {
    this.conversationStore = new KloelConversationStore(prisma, this.logger);
  }

  // ── Context helpers ──

  private extractComposerMetadata(
    metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null,
  ): ComposerMetadata {
    const normalized = this.threadService.normalizeThreadMessageMetadataRecord(metadata);
    const capability =
      normalized.capability === 'create_image' ||
      normalized.capability === 'create_site' ||
      normalized.capability === 'search_web'
        ? normalized.capability
        : null;
    const attachments = Array.isArray(normalized.attachments)
      ? (normalized.attachments as ComposerAttachmentMetadata[])
      : [];
    const linkedProduct =
      normalized.linkedProduct &&
      typeof normalized.linkedProduct === 'object' &&
      !Array.isArray(normalized.linkedProduct)
        ? (normalized.linkedProduct as ComposerLinkedProductMetadata)
        : null;
    return { capability, attachments, linkedProduct };
  }

  private inferImplicitComposerCapability(
    message: string,
    mode: ThinkRequest['mode'],
  ): ComposerCapability | null {
    if (mode !== 'chat') {
      return null;
    }
    const normalized = String(message || '')
      .trim()
      .toLowerCase();
    if (!normalized) {
      return null;
    }
    const wantsSite = [
      'landing',
      'landing page',
      'pagina de vendas',
      'página de vendas',
      'pagina de captura',
      'página de captura',
      'homepage',
      'home page',
      'site',
    ].some((t) => normalized.includes(t));
    const wantsCreation = [
      'crie',
      'criar',
      'gere',
      'gerar',
      'monte',
      'montar',
      'faça',
      'faca',
      'fazer',
      'construa',
      'construir',
      'desenvolva',
      'desenvolver',
      'quero criar',
      'preciso criar',
    ].some((t) => normalized.includes(t));
    if (wantsSite && wantsCreation) {
      return 'create_site';
    }
    return null;
  }

  private resolveComposerCapability(
    message: string,
    mode: ThinkRequest['mode'],
    explicitCapability?: ComposerCapability | null,
  ): ComposerCapability | null {
    return explicitCapability || this.inferImplicitComposerCapability(message, mode);
  }

  private async buildComposerContext(params: {
    workspaceId?: string;
    metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null;
    companyContext?: string;
  }): Promise<string | undefined> {
    const { workspaceId, metadata, companyContext } = params;
    const composerMetadata = this.extractComposerMetadata(metadata);
    const blocks: string[] = [];
    if (companyContext) {
      blocks.push(companyContext);
    }
    const attachmentBlock = this.buildAttachmentPromptContext(composerMetadata.attachments);
    if (attachmentBlock) {
      blocks.push(attachmentBlock);
    }
    if (workspaceId && composerMetadata.linkedProduct) {
      const linkedProductBlock = await this.wsContextService.buildLinkedProductPromptContext(
        workspaceId,
        composerMetadata.linkedProduct,
      );
      if (linkedProductBlock) {
        blocks.push(linkedProductBlock);
      }
    }
    return blocks.length > 0 ? blocks.join('\n\n') : undefined;
  }

  private buildAttachmentPromptContext(
    attachments: ComposerAttachmentMetadata[] | null | undefined,
  ): string | null {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return null;
    }
    const lines = attachments
      .slice(0, 10)
      .map((a, i) => {
        const parts = [
          `ANEXO ${i + 1}: ${String(a.name || 'arquivo').trim() || 'arquivo'}`,
          a.kind ? `tipo ${a.kind}` : null,
          a.mimeType ? `mime ${a.mimeType}` : null,
          Number.isFinite(Number(a.size)) ? `tamanho ${Number(a.size)} bytes` : null,
          a.url ? `url ${a.url}` : null,
        ].filter(Boolean);
        return `- ${parts.join(' | ')}`;
      })
      .filter(Boolean);
    if (lines.length === 0) {
      return null;
    }
    return ['ANEXOS VINCULADOS AO PROMPT:', ...lines].join('\n');
  }

  // ── Tool executor (dispatches to sub-services) ──

  private async executeTool(
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId?: string,
  ): Promise<{ success: boolean; message?: string; error?: string; [key: string]: unknown }> {
    return this.toolDispatcher.executeTool(workspaceId, toolName, args, userId);
  }

  private buildScopedToolExecutor(allowedTools?: string[]): typeof this.executeTool {
    if (allowedTools === undefined) {
      return this.executeTool.bind(this);
    }
    return async (workspaceId, toolName, args, userId) => {
      if (!allowedTools.includes(toolName)) {
        return { success: false, error: 'tool_not_allowed', toolName, allowedTools };
      }
      return this.executeTool(workspaceId, toolName, args, userId);
    };
  }

  // ── Public API ──

  /** Streaming SSE think. */
  async think(
    request: ThinkRequest,
    res: Response,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<void> {
    const { message, workspaceId, mode = 'chat', metadata, companyContext } = request;
    const composerMetadata = this.extractComposerMetadata(metadata);
    const composerCapability = this.resolveComposerCapability(
      message,
      mode,
      composerMetadata.capability,
    );
    const enrichedCompanyContext = await this.buildComposerContext({
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
      ...(companyContext !== undefined ? { companyContext } : {}),
    });
    const marketingAddendum = await this.replyEngineService.buildMarketingPromptAddendum(
      workspaceId,
      mode,
      message,
    );
    const runtimeAddendum = await this.buildAgentRuntimePromptBlock({
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      message,
      mode,
      ...(request.userId !== undefined ? { userId: request.userId } : {}),
      ...(request.conversationId !== undefined ? { conversationId: request.conversationId } : {}),
    });
    const effectiveCompanyContext =
      [enrichedCompanyContext, marketingAddendum, runtimeAddendum].filter(Boolean).join('\n\n') ||
      undefined;
    if (workspaceId) {
      await this.agentRuntime?.recordTurnOutcome({
        workspaceId,
        channel: `dashboard:${mode}`,
        userMessage: message,
        ...(request.userId !== undefined ? { userId: request.userId } : {}),
        ...(request.conversationId !== undefined ? { threadId: request.conversationId } : {}),
      });
    }
    return this.thinkerService.think(
      request,
      res,
      composerCapability,
      enrichedCompanyContext,
      effectiveCompanyContext,
      this.buildScopedToolExecutor(request.allowedTools),
      opts,
    );
  }

  /** Sync think. */
  async thinkSync(request: ThinkRequest): Promise<ThinkSyncResult> {
    const { message, workspaceId, mode = 'chat', metadata, companyContext } = request;
    const composerMetadata = this.extractComposerMetadata(metadata);
    // ── DETERMINISTIC ACTION ROUTER ──
    // When the user requests a real action, execute the tool MANDATORILY
    // rather than relying on the LLM to probabilistically decide to use tools.
    if (workspaceId) {
      const action = detectActionIntent(message);
      if (action) {
        this.logger.log(`Deterministic: tool=${action.tool} workspace=${workspaceId}`);
        try {
          const result = await this.toolDispatcher.executeTool(
            workspaceId,
            action.tool,
            action.args,
            request.userId,
          );
          const reply = formatToolResult(action.tool, result);
          // Persist to conversation store and spine
          void this.conversationStore.saveMessage(workspaceId, 'user', message);
          void this.conversationStore.saveMessage(workspaceId, 'assistant', reply);
          // Persist to spine as autopilot event
          void this.prisma.autopilotEvent
            .create({
              data: {
                workspaceId,
                intent: action.tool,
                action: `kloel.${action.tool}`,
                status: 'executed',
                meta: {
                  userPreview: message.slice(0, 280),
                  replyPreview: reply.slice(0, 280),
                  mode,
                  deterministic: true,
                },
              },
            })
            .catch(() => {});
          return { response: reply };
        } catch (err: unknown) {
          this.logger.warn(
            `Deterministic failed: ${err instanceof Error ? err.message : 'unknown'}, falling back to LLM`,
          );
          // Fall through to normal LLM path
        }
      }
    }

    const composerCapability = this.resolveComposerCapability(
      message,
      mode,
      composerMetadata.capability,
    );
    const enrichedCompanyContext = await this.buildComposerContext({
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
      ...(companyContext !== undefined ? { companyContext } : {}),
    });
    const marketingAddendum = await this.replyEngineService.buildMarketingPromptAddendum(
      workspaceId,
      mode,
      message,
    );
    const runtimeAddendum = await this.buildAgentRuntimePromptBlock({
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      message,
      mode,
      ...(request.userId !== undefined ? { userId: request.userId } : {}),
      ...(request.conversationId !== undefined ? { conversationId: request.conversationId } : {}),
    });
    const effectiveCompanyContext =
      [enrichedCompanyContext, marketingAddendum, runtimeAddendum].filter(Boolean).join('\n\n') ||
      undefined;
    const result = await this.thinkerService.thinkSync(
      request,
      composerCapability,
      enrichedCompanyContext,
      effectiveCompanyContext,
      this.buildScopedToolExecutor(request.allowedTools),
    );
    if (workspaceId) {
      await this.agentRuntime?.recordTurnOutcome({
        workspaceId,
        channel: `dashboard:${mode}`,
        userMessage: message,
        assistantMessage: result.response,
        ...(request.userId !== undefined ? { userId: request.userId } : {}),
        ...((result.conversationId ?? request.conversationId)
          ? { threadId: result.conversationId ?? request.conversationId }
          : {}),
      });
    }
    return result;
  }

  /** Regenerate assistant message. */
  async regenerateThreadAssistantResponse(params: {
    workspaceId: string;
    conversationId: string;
    assistantMessageId: string;
    userId?: string;
    userName?: string;
  }) {
    return this.thinkerService.regenerateThreadAssistantResponse(params);
  }

  /** Get message history. */
  async getHistory(
    workspaceId: string,
  ): Promise<{ id: string; role: string; content: string; timestamp: Date }[]> {
    if (!workspaceId) {
      return [];
    }
    try {
      const messages = await this.prisma.kloelMessage.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: { id: true, role: true, content: true, createdAt: true },
      });
      return messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.createdAt,
      }));
    } catch (_error: unknown) {
      return [];
    }
  }

  /** Save memory. */
  async saveMemory(
    workspaceId: string,
    type: string,
    content: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.conversationStore.saveMemory(workspaceId, type, content, metadata);
  }

  /** Process PDF. */
  async processPdf(workspaceId: string, pdfContent: string): Promise<string> {
    try {
      const extractionPrompt = `Analise o seguinte conteúdo de um PDF e extraia:\n1. Lista de produtos com preços\n2. Benefícios principais\n3. Diferenciais da empresa\n4. Políticas importantes (troca, garantia, frete)\n5. Tom de voz/estilo de comunicação\n\nRetorne em formato estruturado.\n\nCONTEÚDO:\n${pdfContent}`;
      await this.planLimits.ensureTokenBudget(workspaceId);
      const analysis = await this.replyEngineService.buildAssistantReply({
        message: extractionPrompt,
        workspaceId,
        mode: 'onboarding',
      });
      await this.saveMemory(workspaceId, 'pdf_analysis', analysis, { source: 'pdf' });
      return analysis;
    } catch (error: unknown) {
      this.logger.error('Erro ao processar PDF:', error);
      throw error;
    }
  }

  /** Process WhatsApp message. */
  async processWhatsAppMessage(
    workspaceId: string,
    senderPhone: string,
    message: string,
  ): Promise<string> {
    return this.leadBrainService.processWhatsAppMessage(
      workspaceId,
      senderPhone,
      message,
      (wsId, uid) => this.wsContextService.getWorkspaceContext(wsId, uid),
    );
  }

  /** Process WhatsApp message with payment. */
  async processWhatsAppMessageWithPayment(
    workspaceId: string,
    senderPhone: string,
    message: string,
  ): Promise<{ response: string; paymentLink?: string; pixQrCode?: string }> {
    return this.leadBrainService.processWhatsAppMessageWithPayment(
      workspaceId,
      senderPhone,
      message,
      (wsId, uid) => this.wsContextService.getWorkspaceContext(wsId, uid),
    );
  }

  /** Generate payment for a lead. */
  async generatePaymentForLead(
    workspaceId: string,
    leadId: string,
    phone: string,
    productName: string,
    amount: number,
    conversation: string,
  ) {
    return this.leadBrainService.generatePaymentForLead(
      workspaceId,
      leadId,
      phone,
      productName,
      amount,
      conversation,
    );
  }

  /** List follow-ups. */

  async listFollowups(workspaceId: string, contactId?: string) {
    return runListFollowups(this.prisma, workspaceId, contactId);
  }

  async listPersonas(workspaceId: string) {
    return runListPersonas(this.prisma, workspaceId);
  }

  createPersona(
    workspaceId: string,
    data: {
      name: string;
      role?: string;
      basePrompt?: string;
      description?: string;
      systemPrompt?: string;
      temperature?: number;
    },
  ) {
    return runCreatePersona(this.prisma, workspaceId, data);
  }

  async listIntegrations(workspaceId: string) {
    return runListIntegrations(this.prisma, workspaceId);
  }

  async createIntegration(
    workspaceId: string,
    data: { type: string; name: string; credentials: Prisma.InputJsonValue },
  ) {
    return runCreateIntegration(this.prisma, workspaceId, data);
  }

  private async buildAgentRuntimePromptBlock(params: {
    workspaceId?: string;
    userId?: string;
    conversationId?: string;
    message: string;
    mode: ThinkRequest['mode'];
  }): Promise<string | undefined> {
    if (!this.agentRuntime || !params.workspaceId) {
      return undefined;
    }
    const context = await this.agentRuntime.buildContext({
      workspaceId: params.workspaceId,
      channel: `dashboard:${params.mode ?? 'chat'}`,
      message: params.message,
      ...(params.userId !== undefined ? { userId: params.userId } : {}),
      ...(params.conversationId !== undefined ? { threadId: params.conversationId } : {}),
    });
    return context.systemPromptBlock;
  }
}
