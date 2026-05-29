import { Injectable, Inject, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { LLMBudgetService, estimateChatCostCents } from './llm-budget.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelConversationStore } from './kloel-conversation-store';
import { KLOEL_LLM_E2E_GUARD, KloelLLME2EGuard } from './kloel-llm-e2e-guard';
import {
  createKloelErrorEvent,
  createKloelStatusEvent,
  createKloelThreadEvent,
  type KloelStreamEvent, createKloelContentEvent } from './kloel-stream-events';
import { KloelStreamWriter } from './kloel-stream-writer';
import { KloelThreadService, StoredProcessingTraceEntry } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { CANONICAL_FALLBACK_SYSTEM_PROMPT } from './kloel.prompts';
import { AbiBuilderService } from './abi/abi-builder.service';
import { MindCapabilityExecutor } from './mind/coordination';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { detectActionIntent } from './guest-chat.action-intent.helpers';
import { KloelReplyEngineService, LocalToolExecutor } from './kloel-reply-engine.service';
import { thinkSyncImpl, regenerateThreadAssistantResponseImpl } from './kloel-thinker.helpers';
import { runAbiEnrichmentBranch } from './kloel-thinker.abi.helpers';
import { resolveThinkContext } from './kloel-thinker.think-context.helpers';
import { StateBuilderService } from './state/state-builder.service';
import { summarizeConversationState } from './state/conversation-state.helpers';
import {
  AI_KEY_MISSING_MESSAGE,
  isAiProviderConfigured,
  resolveThinkErrorCode,
  resolveThinkerSystemPrompt,
} from './kloel-thinker.substrate.helpers';
import {
  finalizeSuccessfulReply,
  persistChatTurnToSpine,
  runComposerCapabilityBranch,
  runDeterministicActionBranch,
  runToolPlanningBranch,
  type ThinkBranchContext,
} from './kloel-thinker-think.helpers';

export type { LocalToolExecutor } from './kloel-reply-engine.service';

type ComposerCapability = 'create_image' | 'create_site' | 'search_web';

export type { ChatMessage, ThinkRequest, ThinkSyncResult } from './kloel-thinker.types';
import type { ThinkRequest, ThinkSyncResult } from './kloel-thinker.types';

/** Orchestrates the Kloel thinking loop — SSE streaming and sync variants. */
@Injectable()
export class KloelThinkerService {
  private readonly logger = StructuredLogger.from(KloelThinkerService.name);
  private readonly conversationStore: KloelConversationStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly llmBudget: LLMBudgetService,
    private readonly threadService: KloelThreadService,
    private readonly wsContextService: KloelWorkspaceContextService,
    private readonly composerService: KloelComposerService,
    private readonly replyEngine: KloelReplyEngineService,
    @Inject(KLOEL_LLM_E2E_GUARD) private readonly llmE2EGuard: KloelLLME2EGuard,
    private readonly stateBuilder: StateBuilderService,
    @Optional() private readonly abiBuilder?: AbiBuilderService,
    @Optional() private readonly capabilityExecutor?: MindCapabilityExecutor,
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
      allowedTools,
    } = request;
    const signal = opts?.signal;
    const isAborted = () => !!signal?.aborted;
    const abortReason = () => signal?.reason;
    const isClientDisconnected = () => this.replyEngine.isClientDisconnected(abortReason());
    const streamWriter = new KloelStreamWriter(res, {
      ...(signal !== undefined ? { signal } : {}),
      logger: this.logger,
      llmE2EGuard: this.llmE2EGuard,
    });
    const processingTraceEntries: StoredProcessingTraceEntry[] = [];
    const safeWrite = (event: KloelStreamEvent) => {
      this.threadService.appendStoredProcessingTraceEntry(processingTraceEntries, event);
      streamWriter.write(event);
    };
    streamWriter.init();
    const thinkStartedAt = Date.now();
    let thinkErrorCode: string | null = null;

    try {
      const deterministicWorkspaceId =
        mode === 'chat' && typeof workspaceId === 'string' && workspaceId.length > 0
          ? workspaceId
          : undefined;
      const deterministicAction = deterministicWorkspaceId ? detectActionIntent(message) : null;
      if (deterministicAction && deterministicWorkspaceId) {
        await runDeterministicActionBranch(
          deterministicAction,
          executeLocalTool,
          {
            workspaceId: deterministicWorkspaceId,
            userId,
            message,
            mode,
            metadata,
            conversationId,
            processingTraceEntries,
            safeWrite,
            streamWriter,
            threadService: this.threadService,
            replyEngine: this.replyEngine,
            conversationStore: this.conversationStore,
            planLimits: this.planLimits,
          },
          finalizeSuccessfulReply,
        );
        return;
      }

      if (!isAiProviderConfigured({ hasOpenAiKey: this.replyEngine.hasOpenAiKey() })) {
        safeWrite(
          createKloelErrorEvent({
            content: AI_KEY_MISSING_MESSAGE,
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

      const {
        companyName,
        userName,
        marketingPromptAddendum,
        thread,
        historyState,
        expertiseLevel,
        dynamicContext,
        summaryMessage,
        shouldPlanWithTools,
        responseTemperature,
        responseMaxTokens,
        clientRequestId,
      } = await resolveThinkContext({
        prisma: this.prisma,
        wsContextService: this.wsContextService,
        threadService: this.threadService,
        replyEngine: this.replyEngine,
        workspaceId,
        userId,
        reqUserName,
        conversationId,
        mode,
        message,
        metadata,
        enrichedCompanyContext,
      });

      // Y-4 / X §2.6/3.4: assemble the REAL per-turn ConversationState
      // from production sources. The LLM verbalizes this State; it does
      // not invent it. Logged structured for diagnosis (no UX surface,
      // no other-lane mutation).
      const conversationState = await this.stateBuilder.build({
        workspaceId,
        userId,
        conversationId,
        workspaceContext: enrichedCompanyContext,
        surface: mode,
        ...(allowedTools !== undefined ? { permissions: allowedTools } : {}),
      });
      const conversationStateSummary = summarizeConversationState(conversationState);
      if (conversationStateSummary) {
        this.logger.debug('ConversationState assembled', {
          workspaceId,
          hasActor: !!conversationState.actor,
          hasContact: !!conversationState.contact,
          recentEvents: conversationState.recentEvents.length,
          shortTermTurns: conversationState.memory.shortTerm.length,
          capabilities: conversationState.capabilities.length,
          missingSources: conversationState.missingSources,
        });
      }

      const systemPrompt = resolveThinkerSystemPrompt({
        mode,
        canonicalFallbackPrompt: CANONICAL_FALLBACK_SYSTEM_PROMPT,
        buildDashboardPrompt: () =>
          this.replyEngine.buildDashboardPrompt({
            userName,
            workspaceName: companyName,
            expertiseLevel,
          }),
      });

      const abiResult = await runAbiEnrichmentBranch({
        abiBuilder: this.abiBuilder,
        capabilityExecutor: this.capabilityExecutor,
        workspaceId,
        message,
        defaultSystemPrompt: systemPrompt,
        logger: this.logger,
        safeWrite,
        streamWriter,
      });
      if (abiResult.handled) {
        return;
      }
      const finalSystemPrompt = abiResult.finalSystemPrompt;
      const finalUserMessage = abiResult.finalUserMessage;
      const prebuiltCognitiveState = abiResult.prebuiltCognitiveState;

      if (thread?.id) {
        safeWrite(createKloelThreadEvent(thread.id, thread.title));
      }

      const persistedUserMessage = thread?.id
        ? await this.threadService.persistUserThreadMessage(
            thread.id,
            workspaceId ?? '',
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

      const messages = await this.replyEngine.buildChatModelMessages({
        systemPrompt: finalSystemPrompt,
        dynamicContext,
        marketingPromptAddendum,
        summaryMessage,
        recentMessages: historyState.recentMessages,
        ...(prebuiltCognitiveState !== undefined ? { prebuiltCognitiveState } : {}),
        userMessage: finalUserMessage,
        workspaceId,
      });
      const streamWriterResponse = (
        writerMessages: ChatCompletionMessageParam[],
        temperature: number,
      ) =>
        streamWriter.streamModelResponse({
          openai: this.replyEngine.openai!,
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
          allowedTools,
          signal,
          streamWriterResponse,
          branchCtx,
          prebuiltCognitiveState,
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
      if (!streamedReply) {
        return;
      }
      let fullResponse = streamedReply.fullResponse;
      if (!fullResponse.trim()) {
        // Recoverable (non-terminal) empty-stream: stream the fallback text as
        // a content event so the UI renders it, then let
        // finalizeSuccessfulReply emit the terminal `done`. `type:'error'` is
        // reserved for terminal failures (done:true) — the frontend treats any
        // error event as terminal and stops reading the stream.
        fullResponse = this.replyEngine.unavailableMessage;
        safeWrite(createKloelStatusEvent('streaming_token'));
        safeWrite(createKloelContentEvent(fullResponse));
      }
      await finalizeSuccessfulReply(fullResponse, streamedReply.estimatedTokens, branchCtx);
      // Persist this conversational turn to the cognitive spine so it
      // becomes CROSS-SESSION memory (MindPerceptionService reads
      // autopilotEvent → working/episodic/consolidated/beliefs → ABI).
      // B4: memory is a structural effect of the operation, not an LLM
      // decision. Fire-and-forget — never blocks or fails the reply.
      if (workspaceId) {
        persistChatTurnToSpine(this.prisma, this.logger, {
          workspaceId,
          message,
          fullResponse,
          mode,
          conversationId,
        });
      }
    } catch (error: unknown) {
      this.logger.error('Erro no KLOEL Thinker:', error);
      thinkErrorCode = resolveThinkErrorCode(abortReason(), 'think_unhandled_error');
      try {
        if (!isClientDisconnected()) {
          const code = resolveThinkErrorCode(abortReason(), 'Erro ao processar mensagem');
          const content = isAborted()
            ? this.replyEngine.buildStreamAbortMessage(abortReason(), opts?.timeoutMs)
            : this.replyEngine.unavailableMessage;
          safeWrite(createKloelErrorEvent({ content, error: code, done: true }));
        }
      } catch (writeError: unknown) {
        // Never let terminal-error reporting itself wedge the stream; the
        // finally block below still guarantees a terminal `done` + res.end().
        this.logger.error('Falha ao emitir evento de erro terminal do Thinker:', writeError);
      }
    } finally {
      // Terminal-event guarantee for EVERY exit path of think() — success,
      // early return, tool-error, LLM-error, timeout, or a throw inside the
      // catch above. close() is idempotent and synthesizes a terminal `done`
      // if none was emitted, so the frontend's isReplyInFlight flag is always
      // released and the chat never silently dies ("Perdi acesso ao motor de
      // conversa"). Branches that already emitted done+close are unaffected.
      streamWriter.close();
      // Structured observability for the SSE chat lifecycle. errorCode is null on
      // success; durationMs and the abort/disconnect flags let us diagnose
      // stream-wedge incidents in Railway without leaking message content/secrets.
      this.logger.log('kloel_think_stream_closed', {
        tag: 'kloel_think_stream_closed',
        ...(workspaceId !== undefined ? { workspaceId } : {}),
        ...(conversationId !== undefined ? { conversationId } : {}),
        mode,
        durationMs: Date.now() - thinkStartedAt,
        aborted: isAborted(),
        clientDisconnected: isClientDisconnected(),
        errorCode: thinkErrorCode,
      });
    }
  }

  /** Sync think loop. */
  async thinkSync(
    request: ThinkRequest,
    composerCapability: ComposerCapability | null,
    _enrichedCompanyContext: string | undefined,
    effectiveCompanyContext: string | undefined,
    _executeLocalTool?: LocalToolExecutor,
  ): Promise<ThinkSyncResult> {
    try {
      return await thinkSyncImpl(request, composerCapability, effectiveCompanyContext, {
        replyEngine: this.replyEngine,
        prisma: this.prisma,
        threadService: this.threadService,
        composerService: this.composerService,
        conversationStore: this.conversationStore,
        planLimits: this.planLimits,
        ...(this.abiBuilder !== undefined ? { abiBuilder: this.abiBuilder } : {}),
        ...(this.capabilityExecutor !== undefined
          ? { capabilityExecutor: this.capabilityExecutor }
          : {}),
        ...(_executeLocalTool !== undefined ? { executeLocalTool: _executeLocalTool } : {}),
      });
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
