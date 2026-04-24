import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { KloelComposerService } from './kloel-composer.service';
import { KloelConversationStore } from './kloel-conversation-store';
import { buildTimestampedRuntimeId } from './kloel-id.util';
import {
  createKloelContentEvent,
  createKloelDoneEvent,
  createKloelErrorEvent,
  createKloelStatusEvent,
  createKloelThreadEvent,
  type KloelStreamEvent,
} from './kloel-stream-events';
import { KloelStreamWriter } from './kloel-stream-writer';
import {
  KloelThreadService,
  StoredProcessingTraceEntry,
  StoredResponseVersion,
} from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { KLOEL_ONBOARDING_PROMPT, KLOEL_SALES_PROMPT } from './kloel.prompts';
import { chatCompletionWithFallback } from './openai-wrapper';
import { KLOEL_CHAT_TOOLS } from './kloel-chat-tools.definition';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { KloelReplyEngineService, LocalToolExecutor } from './kloel-reply-engine.service';

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

      let systemPrompt: string;
      switch (mode) {
        case 'onboarding':
          systemPrompt = KLOEL_ONBOARDING_PROMPT;
          break;
        case 'sales':
          systemPrompt = KLOEL_SALES_PROMPT(companyName, context);
          break;
        default:
          systemPrompt = this.replyEngine.buildDashboardPrompt({
            userName,
            workspaceName: companyName,
            expertiseLevel,
          });
      }

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

      if (mode === 'chat' && composerCapability) {
        safeWrite(createKloelStatusEvent('thinking'));
        const capResult = await this.composerService.executeComposerCapability({
          capability: composerCapability,
          message,
          workspaceId,
          metadata,
          composerContext: effectiveCompanyContext,
          signal,
        });
        safeWrite(createKloelStatusEvent('streaming_token'));
        safeWrite(createKloelContentEvent(capResult.content));
        if (thread?.id && workspaceId) {
          await this.threadService.persistAssistantThreadMessage(
            thread.id,
            workspaceId,
            capResult.content,
            this.threadService.buildThreadMessageMetadata(undefined, {
              clientRequestId,
              mode,
              transport: 'sse',
              requestState: 'completed',
              replyToMessageId: persistedUserMessage?.id,
              capability: composerCapability,
              ...(capResult.metadata || {}),
            }),
          );
          await this.threadService.maybeRefreshThreadSummary(
            thread.id,
            workspaceId,
            this.replyEngine.openai,
          );
          const title = await this.threadService.maybeGenerateThreadTitle(
            thread.id,
            thread.title,
            message,
            workspaceId,
            this.replyEngine.openai,
          );
          safeWrite(createKloelThreadEvent(thread.id, title));
        }
        if (workspaceId) {
          await this.conversationStore.saveMessage(workspaceId, 'user', message);
          await this.conversationStore.saveMessage(workspaceId, 'assistant', capResult.content);
        }
        safeWrite(createKloelDoneEvent());
        streamWriter.close();
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

      const finalizeSuccessfulReply = async (assistantText: string, estimatedTokens: number) => {
        const normalizedText = assistantText.trim() || this.replyEngine.unavailableMessage;
        const completedAt = new Date().toISOString();
        const responseVersions: StoredResponseVersion[] = [
          {
            id: clientRequestId ? `resp_${clientRequestId}` : buildTimestampedRuntimeId('resp'),
            content: normalizedText,
            createdAt: completedAt,
            source: 'initial',
          },
        ];
        if (workspaceId)
          await this.planLimits.trackAiUsage(workspaceId, estimatedTokens).catch(() => {});
        if (thread?.id && workspaceId) {
          await this.threadService.persistAssistantThreadMessage(
            thread.id,
            workspaceId,
            normalizedText,
            this.threadService.buildThreadMessageMetadata(undefined, {
              clientRequestId,
              mode,
              transport: 'sse',
              requestState: 'completed',
              replyToMessageId: persistedUserMessage?.id,
              responseVersions,
              activeResponseVersionIndex: Math.max(responseVersions.length - 1, 0),
              processingTrace: processingTraceEntries,
              processingSummary:
                this.threadService.buildProcessingTraceSummary(processingTraceEntries),
            }),
          );
          await this.threadService.maybeRefreshThreadSummary(
            thread.id,
            workspaceId,
            this.replyEngine.openai,
          );
          const title = await this.threadService.maybeGenerateThreadTitle(
            thread.id,
            thread.title,
            message,
            workspaceId,
            this.replyEngine.openai,
          );
          safeWrite(createKloelThreadEvent(thread.id, title));
        }
        if (workspaceId) {
          await this.conversationStore.saveMessage(workspaceId, 'user', message);
          await this.conversationStore.saveMessage(workspaceId, 'assistant', normalizedText);
        }
        safeWrite(createKloelDoneEvent());
        streamWriter.close();
      };

      if (mode === 'chat' && workspaceId && shouldPlanWithTools) {
        safeWrite(createKloelStatusEvent('thinking'));
        await this.planLimits.ensureTokenBudget(workspaceId);
        const initialResponse = await chatCompletionWithFallback(
          this.replyEngine.openai,
          {
            model: resolveBackendOpenAIModel('brain'),
            messages,
            tools: KLOEL_CHAT_TOOLS,
            tool_choice: 'auto',
            temperature: responseTemperature,
            top_p: 0.95,
            frequency_penalty: 0.3,
            presence_penalty: 0.2,
            max_tokens: responseMaxTokens,
          },
          resolveBackendOpenAIModel('brain_fallback'),
          { maxRetries: 3, initialDelayMs: 500 },
          signal ? { signal } : undefined,
        );
        await this.planLimits
          .trackAiUsage(workspaceId, initialResponse?.usage?.total_tokens ?? 500)
          .catch(() => {});
        const assistantMsg = initialResponse.choices[0]?.message;
        const assistantText = assistantMsg?.content || '';
        if (assistantMsg?.tool_calls?.length) {
          const { toolMessages, usedSearchWeb } =
            await this.replyEngine.toolRouter.executeAssistantToolCalls({
              assistantMessage: assistantMsg,
              workspaceId,
              userId,
              safeWrite,
              executeLocalTool,
            });
          const finalTemp = usedSearchWeb ? 0.1 : responseTemperature;
          if (workspaceId) await this.planLimits.ensureTokenBudget(workspaceId);
          const streamedFinal = await streamWriterResponse(
            this.replyEngine.buildChatModelMessages({
              systemPrompt,
              dynamicContext,
              marketingPromptAddendum,
              summaryMessage,
              recentMessages: historyState.recentMessages,
              userMessage: message,
              assistantMessage: assistantMsg,
              toolMessages,
            }),
            finalTemp,
          );
          if (!streamedFinal) return;
          let finalResp = streamedFinal.fullResponse.trim();
          if (!finalResp) {
            finalResp =
              'Fechei a ação, mas a resposta veio vazia. Me chama de novo que eu continuo do ponto certo.';
            safeWrite(
              createKloelErrorEvent({ content: finalResp, error: 'empty_stream', done: false }),
            );
          }
          await finalizeSuccessfulReply(finalResp, streamedFinal.estimatedTokens);
          return;
        }
        await this.planLimits.ensureTokenBudget(workspaceId);
        const streamedReply = await streamWriterResponse(messages, responseTemperature);
        if (!streamedReply) return;
        let fallbackText = streamedReply.fullResponse.trim();
        if (!fallbackText) {
          fallbackText =
            assistantText ||
            'Eu li o que você mandou, mas a resposta saiu vazia aqui. Manda de novo que eu sigo.';
          safeWrite(
            createKloelErrorEvent({ content: fallbackText, error: 'empty_stream', done: false }),
          );
        }
        await finalizeSuccessfulReply(fallbackText, streamedReply.estimatedTokens);
        return;
      }

      if (workspaceId) await this.planLimits.ensureTokenBudget(workspaceId);
      safeWrite(createKloelStatusEvent('thinking'));
      const streamedReply = await streamWriterResponse(messages, responseTemperature);
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
      await finalizeSuccessfulReply(fullResponse, streamedReply.estimatedTokens);
    } catch (error) {
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
    const {
      message,
      workspaceId,
      userId,
      userName: reqUserName,
      conversationId,
      mode = 'chat',
      metadata,
    } = request;
    try {
      if (!this.replyEngine.hasOpenAiKey() && !process.env.ANTHROPIC_API_KEY) {
        return {
          response:
            'Assistente IA não disponível no momento. Configure OPENAI_API_KEY ou ANTHROPIC_API_KEY para habilitar o Kloel.',
        };
      }
      const thread =
        workspaceId && mode === 'chat'
          ? await this.threadService.resolveThread(workspaceId, conversationId)
          : null;
      const historyState = thread?.id
        ? await this.threadService.getThreadConversationState(thread.id, workspaceId)
        : { recentMessages: [], totalMessages: 0 };
      const capabilityResult =
        mode === 'chat' && composerCapability
          ? await this.composerService.executeComposerCapability({
              capability: composerCapability,
              message,
              workspaceId,
              metadata,
              composerContext: effectiveCompanyContext,
            })
          : null;
      const assistantMessage =
        capabilityResult?.content ||
        (await this.replyEngine.buildAssistantReply({
          message,
          workspaceId,
          userId,
          userName: reqUserName,
          mode,
          companyContext: effectiveCompanyContext,
          conversationState: historyState,
        }));

      let resolvedTitle = thread?.title;
      if (workspaceId) {
        if (thread?.id) {
          const clientRequestId = this.threadService.resolveClientRequestId(metadata);
          const persistedUserMessage = await this.threadService.persistUserThreadMessage(
            thread.id,
            workspaceId,
            message,
            this.threadService.buildThreadMessageMetadata(metadata, {
              clientRequestId,
              mode,
              transport: 'sync',
              requestState: 'accepted',
            }),
          );
          const completedAt = new Date().toISOString();
          const responseVersions: StoredResponseVersion[] = [
            {
              id: clientRequestId ? `resp_${clientRequestId}` : buildTimestampedRuntimeId('resp'),
              content: assistantMessage,
              createdAt: completedAt,
              source: 'initial',
            },
          ];
          await this.threadService.persistAssistantThreadMessage(
            thread.id,
            workspaceId,
            assistantMessage,
            this.threadService.buildThreadMessageMetadata(undefined, {
              clientRequestId,
              mode,
              transport: 'sync',
              requestState: 'completed',
              replyToMessageId: persistedUserMessage?.id,
              responseVersions,
              activeResponseVersionIndex: 0,
              capability: composerCapability,
              ...(capabilityResult?.metadata || {}),
            }),
          );
          await this.threadService.maybeRefreshThreadSummary(
            thread.id,
            workspaceId,
            this.replyEngine.openai,
          );
          resolvedTitle = await this.threadService.maybeGenerateThreadTitle(
            thread.id,
            thread.title,
            message,
            workspaceId,
            this.replyEngine.openai,
          );
        }
        await this.conversationStore.saveMessage(workspaceId, 'user', message);
        await this.conversationStore.saveMessage(workspaceId, 'assistant', assistantMessage);
      }
      return { response: assistantMessage, conversationId: thread?.id, title: resolvedTitle };
    } catch (error) {
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
    const { workspaceId, conversationId, assistantMessageId, userId, userName } = params;
    const thread = await this.prisma.chatThread.findFirst({
      where: { id: conversationId, workspaceId },
      select: { id: true, summary: true },
    });
    if (!thread) throw new Error('Conversa não encontrada.');

    const messages = (
      await this.prisma.chatMessage.findMany({
        where: { threadId: conversationId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true,
          threadId: true,
          role: true,
          content: true,
          metadata: true,
          createdAt: true,
        },
      })
    ).reverse();
    const assistantIndex = messages.findIndex(
      (m) => m.id === assistantMessageId && m.role === 'assistant',
    );
    if (assistantIndex === -1) throw new Error('Mensagem do assistente não encontrada.');

    const sourceUserIndex = [...messages.slice(0, assistantIndex)]
      .map((m, i) => ({ m, i }))
      .reverse()
      .find((e) => e.m.role === 'user')?.i;
    if (sourceUserIndex === undefined)
      throw new Error('Não existe mensagem do usuário para regenerar esta resposta.');

    const sourceUserMessage = messages[sourceUserIndex];
    const historyBeforeUser = messages
      .slice(Math.max(0, sourceUserIndex - 20), sourceUserIndex)
      .filter((m) => String(m.content || '').trim().length > 0)
      .map(
        (m): ChatMessage => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        }),
      );

    const regeneratedTraceEntries: StoredProcessingTraceEntry[] = [];
    const regeneratedContent = await this.replyEngine.buildAssistantReply({
      message: sourceUserMessage.content,
      workspaceId,
      userId,
      userName,
      mode: 'chat',
      conversationState: {
        summary: thread.summary ?? undefined,
        recentMessages: historyBeforeUser,
        totalMessages: sourceUserIndex,
      },
      onTraceEvent: (event) =>
        this.threadService.appendStoredProcessingTraceEntry(regeneratedTraceEntries, event),
    });

    const deletedMessageIds = messages.slice(assistantIndex + 1).map((m) => m.id);
    const currentAssistantMessage = messages[assistantIndex];
    const currentMetadata = this.threadService.normalizeThreadMessageMetadataRecord(
      currentAssistantMessage.metadata,
    );
    const versionCreatedAt = new Date().toISOString();
    const responseVersions = [
      ...this.threadService.buildStoredResponseVersions(
        currentAssistantMessage.metadata,
        currentAssistantMessage.content,
        currentAssistantMessage.id,
      ),
      {
        id: buildTimestampedRuntimeId('regen'),
        content: regeneratedContent,
        createdAt: versionCreatedAt,
        source: 'regenerated',
      } satisfies StoredResponseVersion,
    ];

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.chatMessage.update({
        where: { id: assistantMessageId },
        data: {
          content: regeneratedContent,
          metadata: this.threadService.buildThreadMessageMetadata(
            currentMetadata as Prisma.InputJsonValue,
            {
              regeneratedAt: new Date().toISOString(),
              regeneratedFromUserMessageId: sourceUserMessage.id,
              responseVersions,
              activeResponseVersionIndex: Math.max(responseVersions.length - 1, 0),
              processingTrace: regeneratedTraceEntries,
              processingSummary:
                this.threadService.buildProcessingTraceSummary(regeneratedTraceEntries),
            },
          ),
        },
      }),
    ];
    if (deletedMessageIds.length > 0) {
      operations.push(
        this.prisma.chatMessage.deleteMany({ where: { id: { in: deletedMessageIds } } }),
        this.prisma.auditLog.create({
          data: {
            workspaceId,
            action: 'USER_DATA_DELETED',
            resource: 'ChatMessage',
            resourceId: assistantMessageId,
            details: {
              source: 'kloel_regenerate_assistant_response',
              conversationId,
              deletedMessageIds,
            },
          },
        }),
      );
    }
    operations.push(this.threadService.touchThread(conversationId, workspaceId));

    const [updatedMessage] = await this.prisma.$transaction(
      operations as [
        ReturnType<typeof this.prisma.chatMessage.update>,
        ...Prisma.PrismaPromise<unknown>[],
      ],
    );
    await this.threadService.maybeRefreshThreadSummary(
      conversationId,
      workspaceId,
      this.replyEngine.openai,
    );
    return {
      id: updatedMessage.id,
      threadId: updatedMessage.threadId,
      role: updatedMessage.role,
      content: updatedMessage.content,
      metadata: updatedMessage.metadata,
      createdAt: updatedMessage.createdAt,
      deletedMessageIds,
    };
  }
}
