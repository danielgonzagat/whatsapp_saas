import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { LLMBudgetService, estimateChatCostCents } from './llm-budget.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelConversationStore } from './kloel-conversation-store';
import {
  createKloelErrorEvent,
  createKloelStatusEvent,
  createKloelThreadEvent,
  type KloelStreamEvent,
} from './kloel-stream-events';
import { KloelStreamWriter } from './kloel-stream-writer';
import { KloelThreadService, StoredProcessingTraceEntry } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { KLOEL_ONBOARDING_PROMPT, KLOEL_SALES_PROMPT } from './kloel.prompts';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { KloelReplyEngineService, LocalToolExecutor } from './kloel-reply-engine.service';
import { thinkSyncImpl, regenerateThreadAssistantResponseImpl } from './kloel-thinker.helpers';
import {
  finalizeSuccessfulReply,
  runComposerCapabilityBranch,
  runToolPlanningBranch,
  type ThinkBranchContext,
} from './kloel-thinker-think.helpers';

export type { LocalToolExecutor } from './kloel-reply-engine.service';

type ComposerCapability = 'create_image' | 'create_site' | 'search_web';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ThinkRequest {
  message: string;
  workspaceId?: string;
  userId?: string;
  userName?: string;
  conversationId?: string;
  mode?: 'chat' | 'onboarding' | 'sales';
  companyContext?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface ThinkSyncResult {
  response: string;
  conversationId?: string;
  title?: string;
}

/** Orchestrates the Kloel thinking loop — SSE streaming and sync variants. */
@Injectable()
export class KloelThinkerService {
  private readonly logger = new Logger(KloelThinkerService.name);
  private readonly conversationStore: KloelConversationStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly llmBudget: LLMBudgetService,
    private readonly threadService: KloelThreadService,
    private readonly wsContextService: KloelWorkspaceContextService,
    private readonly composerService: KloelComposerService,
    private readonly replyEngine: KloelReplyEngineService,
  ) {
    this.conversationStore = new KloelConversationStore(prisma, this.logger);
  }

  /** Streaming SSE think loop. */
  async think(
    request: ThinkRequest,
    res: Response,
    composerCapability: ComposerCapability | null,
    enrichedCompanyContext: string | undefined,
    effectiveCompanyContext: string | undefined,
    executeLocalTool: LocalToolExecutor,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<void> {
    const {
      message,
      workspaceId,
      userId,
      userName: reqUserName,
      conversationId,
      mode = 'chat',
      metadata,
    } = request;
    const signal = opts?.signal;
    const isAborted = () => !!signal?.aborted;
    const abortReason = () => signal?.reason;
    const isClientDisconnected = () => this.replyEngine.isClientDisconnected(abortReason());
    const streamWriter = new KloelStreamWriter(res, { signal, logger: this.logger });
    const processingTraceEntries: StoredProcessingTraceEntry[] = [];
    const safeWrite = (event: KloelStreamEvent) => {
      this.threadService.appendStoredProcessingTraceEntry(processingTraceEntries, event);
      streamWriter.write(event);
    };
    streamWriter.init();

    try {
      if (!this.replyEngine.hasOpenAiKey() && !process.env.ANTHROPIC_API_KEY) {
        safeWrite(
          createKloelErrorEvent({
            content:
              'Assistente IA não disponível no momento. Configure OPENAI_API_KEY ou ANTHROPIC_API_KEY para habilitar o Kloel.',
            error: 'ai_api_key_missing',
            done: true,
          }),
        );
        streamWriter.close();
        return;
      }
      if (isAborted()) {
        if (!isClientDisconnected()) {
          safeWrite(
            createKloelErrorEvent({
              content: this.replyEngine.buildStreamAbortMessage(abortReason(), opts?.timeoutMs),
              error:
                typeof abortReason() === 'string' ? abortReason() : 'request_aborted_before_start',
              done: true,
            }),
          );
        }
        streamWriter.close();
        return;
      }

      let context = enrichedCompanyContext || '';
      let companyName = 'sua empresa';
      let userName = 'Usuário';
      const marketingPromptAddendum = await this.replyEngine.buildMarketingPromptAddendum(
        workspaceId,
        mode,
        message,
      );
      const thread =
        workspaceId && mode === 'chat'
          ? await this.threadService.resolveThread(workspaceId, conversationId)
          : null;

      if (workspaceId) {
        const [, agent] = await Promise.all([
          this.prisma.workspace.findUnique({ where: { id: workspaceId } }),
          userId
            ? this.prisma.agent.findFirst({
                where: { id: userId, workspaceId },
                select: { name: true },
              })
            : Promise.resolve(null),
        ]);
        companyName = 'sua empresa';
        context = await this.wsContextService.getWorkspaceContext(workspaceId, userId);
        if (enrichedCompanyContext)
          context = [context, enrichedCompanyContext].filter(Boolean).join('\n\n');
        userName = this.replyEngine.contextFormatter.sanitizeUserNameForAssistant(
          reqUserName || agent?.name || userName,
        );
      }

      const historyState = thread?.id
        ? await this.threadService.getThreadConversationState(thread.id, workspaceId)
        : { recentMessages: [], totalMessages: 0 };
      const expertiseLevel = this.replyEngine.detectExpertiseLevel(
        message,
        historyState.recentMessages,
      );
      const dynamicContext = await this.replyEngine.buildDynamicRuntimeContext({
        workspaceId,
        userId,
        userName,
        expertiseLevel,
        companyContext: enrichedCompanyContext,
      });
      const summaryMessage = this.threadService.buildThreadSummarySystemMessage(
        historyState.summary,
      );
      const shouldPlanWithTools =
        mode === 'chat' && !!workspaceId && this.replyEngine.shouldAttemptToolPlanningPass(message);
      const usesLongFormBudget = this.replyEngine.shouldUseLongFormBudget(message);
      const responseTemperature = 0.7;
      const responseMaxTokens = usesLongFormBudget ? 4096 : 2048;
      const clientRequestId = this.threadService.resolveClientRequestId(metadata);

      const systemPrompt =
        mode === 'onboarding'
          ? KLOEL_ONBOARDING_PROMPT
          : mode === 'sales'
            ? KLOEL_SALES_PROMPT(companyName, context)
            : this.replyEngine.buildDashboardPrompt({
                userName,
                workspaceName: companyName,
                expertiseLevel,
              });

      if (thread?.id) safeWrite(createKloelThreadEvent(thread.id, thread.title));

      const persistedUserMessage = thread?.id
        ? await this.threadService.persistUserThreadMessage(
            thread.id,
            workspaceId,
            message,
            this.threadService.buildThreadMessageMetadata(metadata, {
              clientRequestId,
              mode,
              transport: 'sse',
              requestState: 'accepted',
            }),
          )
        : null;

      const branchCtx: ThinkBranchContext = {
        workspaceId,
        userId,
        message,
        mode,
        metadata,
        clientRequestId,
        thread,
        persistedUserMessage,
        processingTraceEntries,
        safeWrite,
        streamWriter,
        replyEngine: this.replyEngine,
        threadService: this.threadService,
        conversationStore: this.conversationStore,
        planLimits: this.planLimits,
      };

      if (mode === 'chat' && composerCapability) {
        await runComposerCapabilityBranch(
          composerCapability,
          effectiveCompanyContext,
          signal,
          this.composerService,
          branchCtx,
        );
        return;
      }

      const messages = this.replyEngine.buildChatModelMessages({
        systemPrompt,
        dynamicContext,
        marketingPromptAddendum,
        summaryMessage,
        recentMessages: historyState.recentMessages,
        userMessage: message,
      });
      const streamWriterResponse = (
        writerMessages: ChatCompletionMessageParam[],
        temperature: number,
      ) =>
        streamWriter.streamModelResponse({
          openai: this.replyEngine.openai,
          writerMessages,
          temperature,
          responseMaxTokens,
        });

      if (mode === 'chat' && workspaceId && shouldPlanWithTools) {
        await runToolPlanningBranch(
          messages,
          systemPrompt,
          dynamicContext,
          marketingPromptAddendum,
          summaryMessage,
          responseTemperature,
          responseMaxTokens,
          executeLocalTool,
          signal,
          streamWriterResponse,
          branchCtx,
        );
        return;
      }

      if (workspaceId) {
        await this.planLimits.ensureTokenBudget(workspaceId);
        const estimatedCost = estimateChatCostCents({
          inputChars: JSON.stringify(messages).length,
          maxOutputTokens: responseMaxTokens,
        });
        await this.llmBudget.assertBudget(workspaceId, estimatedCost);
      }
      safeWrite(createKloelStatusEvent('thinking'));
      const streamedReply = await streamWriterResponse(messages, responseTemperature);
      if (workspaceId && streamedReply) {
        this.llmBudget.recordSpend(workspaceId, streamedReply.estimatedTokens).catch(() => {});
      }
      if (!streamedReply) return;
      let fullResponse = streamedReply.fullResponse;
      if (!fullResponse.trim()) {
        safeWrite(
          createKloelErrorEvent({
            content: this.replyEngine.unavailableMessage,
            error: 'empty_stream',
            done: false,
          }),
        );
        fullResponse = this.replyEngine.unavailableMessage;
      }
      await finalizeSuccessfulReply(fullResponse, streamedReply.estimatedTokens, branchCtx);
    } catch (error: unknown) {
      this.logger.error('Erro no KLOEL Thinker:', error);
      if (!isClientDisconnected()) {
        const code =
          typeof abortReason() === 'string' ? String(abortReason()) : 'Erro ao processar mensagem';
        const content = isAborted()
          ? this.replyEngine.buildStreamAbortMessage(abortReason(), opts?.timeoutMs)
          : this.replyEngine.unavailableMessage;
        safeWrite(createKloelErrorEvent({ content, error: code, done: true }));
      }
      streamWriter.close();
    }
  }

  /** Sync think loop. */
  async thinkSync(
    request: ThinkRequest,
    composerCapability: ComposerCapability | null,
    enrichedCompanyContext: string | undefined,
    effectiveCompanyContext: string | undefined,
    _executeLocalTool?: LocalToolExecutor,
  ): Promise<ThinkSyncResult> {
    try {
      return await thinkSyncImpl(
        request,
        composerCapability,
        enrichedCompanyContext,
        effectiveCompanyContext,
        {
          replyEngine: this.replyEngine,
          threadService: this.threadService,
          composerService: this.composerService,
          conversationStore: this.conversationStore,
          planLimits: this.planLimits,
        },
      );
    } catch (error: unknown) {
      this.logger.error('Erro no KLOEL Thinker Sync:', error);
      throw error;
    }
  }

  /** Regenerate a specific assistant message within a thread. */
  async regenerateThreadAssistantResponse(params: {
    workspaceId: string;
    conversationId: string;
    assistantMessageId: string;
    userId?: string;
    userName?: string;
  }): Promise<{
    id: string;
    threadId: string;
    role: string;
    content: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    deletedMessageIds: string[];
  }> {
    return regenerateThreadAssistantResponseImpl(params, {
      prisma: this.prisma as Parameters<typeof regenerateThreadAssistantResponseImpl>[1]['prisma'],
      replyEngine: this.replyEngine,
      threadService: this.threadService,
    });
  }
}
