import { Injectable, Inject, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { LLMBudgetService } from './llm-budget.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelConversationStore } from './kloel-conversation-store';
import { KLOEL_LLM_E2E_GUARD, KloelLLME2EGuard } from './kloel-llm-e2e-guard';
import {
  createKloelErrorEvent,
  createKloelPublicStreamingLabel,
  createKloelPublicThinkingLabel,
  createKloelThreadEvent,
  type KloelStreamEvent,
} from './kloel-stream-events';
import { KloelStreamWriter } from './kloel-stream-writer';
import { KloelThreadService, StoredProcessingTraceEntry } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { CANONICAL_FALLBACK_SYSTEM_PROMPT } from './kloel.prompts';
import { AbiBuilderService } from './abi/abi-builder.service';
import { MindCapabilityExecutor } from './mind/coordination';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { detectActionIntent } from './guest-chat.action-intent.helpers';
import { isMutationSensitiveTool } from './operation-receipt.helpers';
import { KloelMemoryEngineService } from './kloel-memory-engine.service';
import { KloelReplyEngineService, LocalToolExecutor } from './kloel-reply-engine.service';
import { thinkSyncImpl, regenerateThreadAssistantResponseImpl } from './kloel-thinker.helpers';
import { runAbiEnrichmentBranch } from './kloel-thinker.abi.helpers';
import { resolveThinkContext } from './kloel-thinker.think-context.helpers';
import {
  appendWireContext,
  buildWireContextBlock,
  type WireContextServices,
} from './kloel-thinker.wire-context.helpers';
import { MemoryService } from './mind/memory/memory.service';
import { ManifestInjectionBuilderService } from './manifest/manifest-injection.builder';
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
  runDeterministicActionBranch,
  runToolPlanningBranch,
  type ThinkBranchContext,
} from './kloel-thinker-think.helpers';
import { type ThinkLoopServices } from './kloel-thinker-think-loop.helpers';
import { DecisionOutcomeService } from './decision-outcome.service';
import { MindBeliefService } from './mind/inference/mind-belief.service';
import { MindSurpriseService } from './mind/inference/mind-surprise.service';
import { MindEventProcessorService } from './mind/runtime/mind-event-processor.service';
import { MindGlobalPriorService } from './mind/memory/mind-global-prior.service';
import { MindPredictorService } from './mind/inference/mind-predictor.service';
import { ValenceTaggerService } from './mind/valence-tagger.service';
import { MindChatMessageService } from './mind/aliases/mind-chat-message.service';
import { extractComposerMetadata } from './kloel.service.composer.helpers';
import {
  runStreamingComposerCapabilityBranch,
  type ComposerCapability,
} from './kloel-thinker-streaming-composer.branch';
import { runStandardStreamingReplyBranch } from './kloel-thinker-standard-streaming.branch';

export type { LocalToolExecutor } from './kloel-reply-engine.service';

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
    // P0-C: optional cognition services for the streaming-path learning loop.
    // SAME services the reply engine injects — reused, not re-implemented. All
    // @Optional() so flag-off (and DI contexts that don't provide them) resolve
    // to undefined and the reused fire-and-forget helpers short-circuit.
    @Optional() private readonly decisionOutcomeService?: DecisionOutcomeService,
    @Optional() private readonly mindBeliefService?: MindBeliefService,
    @Optional() private readonly mindSurpriseService?: MindSurpriseService,
    @Optional() private readonly mindEventProcessorService?: MindEventProcessorService,
    @Optional() private readonly mindGlobalPriorService?: MindGlobalPriorService,
    @Optional() private readonly mindPredictorService?: MindPredictorService,
    @Optional() private readonly valenceTagger?: ValenceTaggerService,
    @Optional() private readonly memoryEngine?: KloelMemoryEngineService,
    @Optional() private readonly mindChatMessage?: MindChatMessageService,
    // wire-context: per-user typed MEMORY graph + CAPABILITY MANIFEST injection.
    // Both @Optional() — flag-off / DI contexts that don't provide them resolve
    // to undefined and the wire-context helpers degrade to an empty block, so the
    // critical path is byte-identical to legacy when they are absent.
    @Optional() private readonly memoryGraph?: MemoryService,
    @Optional() private readonly manifestInjection?: ManifestInjectionBuilderService,
  ) {
    this.conversationStore = new KloelConversationStore(prisma, this.logger);
  }

  /** Bundle the optional wire-context services for the per-turn injection helpers. */
  private get wireContextServices(): WireContextServices {
    return {
      ...(this.memoryGraph !== undefined ? { memoryService: this.memoryGraph } : {}),
      ...(this.manifestInjection !== undefined
        ? { manifestInjection: this.manifestInjection }
        : {}),
    };
  }

  /**
   * Canonical Mind surface for the SEPARATE RAC_ChatMessage table. Returns the
   * SAME delegate legacy code used (`prisma.chatMessage`) when the alias service
   * is not provided — byte-identical, documented fallback idiom.
   */
  private get chatMessageItems() {
    return this.mindChatMessage?.items ?? this.prisma.chatMessage;
  }

  /** Bundle the optional cognition services for the think-loop helpers. */
  private get thinkLoopServices(): ThinkLoopServices {
    return {
      decisionOutcomeService: this.decisionOutcomeService,
      mindBeliefService: this.mindBeliefService,
      mindSurpriseService: this.mindSurpriseService,
      mindEventProcessorService: this.mindEventProcessorService,
      mindGlobalPriorService: this.mindGlobalPriorService,
      mindPredictorService: this.mindPredictorService,
      valenceTagger: this.valenceTagger,
    };
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
    // Per-user memory (Mem0 brain): learn durable facts/preferences from this
    // turn's user message, fire-and-forget so it never adds latency to the reply
    // and never breaks the turn. Recalled on later turns by the context builder.
    if (mode === 'chat' && workspaceId && userId) {
      void this.memoryEngine?.remember(workspaceId, userId, message);
    }
    const signal = opts?.signal;
    const isAborted = () => !!signal?.aborted;
    const abortReason = (): unknown => signal?.reason;
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
      const composerMetadata = extractComposerMetadata(metadata);
      const hasExplicitComposerContext =
        !!composerCapability ||
        !!composerMetadata.linkedProduct ||
        (composerMetadata.attachments?.length ?? 0) > 0;
      const detectedAction =
        deterministicWorkspaceId && !hasExplicitComposerContext
          ? detectActionIntent(message)
          : null;
      // MUTATION_SENSITIVE gate: the deterministic regex path bypasses the LLM
      // tool-router's confirmation block, so never auto-execute a confirmation-
      // sensitive tool (e.g. request_anticipation/request_withdrawal — money moves)
      // from this path. Fall through to the LLM path, which enforces confirmation.
      const deterministicAction =
        detectedAction && isMutationSensitiveTool(detectedAction.tool) ? null : detectedAction;
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
      const openaiClient = this.replyEngine.openai;
      if (!openaiClient) {
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
                typeof abortReason() === 'string'
                  ? (abortReason() as string)
                  : 'request_aborted_before_start',
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
        dynamicContext: baseDynamicContext,
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

      // wire-context: assemble the per-user MEMORY block + CAPABILITY MANIFEST
      // block and append them to the HIDDEN runtime context the model carries
      // (the same `dynamicContext` JSON channel — never the user-visible answer).
      // Fully guarded: an empty block (no memories, no provided service, or any
      // throw) leaves `dynamicContext` byte-identical to legacy. Skipped on the
      // composer path, which returns before the model-message build.
      const wireContextBlock =
        mode === 'chat' && !composerCapability
          ? await buildWireContextBlock(this.wireContextServices, this.logger, {
              workspaceId,
              userId,
              message,
              surface: mode,
              permissions: allowedTools,
            })
          : { text: '', internalNames: [] };
      const dynamicContext = appendWireContext(baseDynamicContext, wireContextBlock);

      if (mode === 'chat' && composerCapability) {
        await runStreamingComposerCapabilityBranch({
          composerCapability,
          effectiveCompanyContext,
          signal,
          composerService: this.composerService,
          workspaceId,
          userId,
          message,
          mode,
          metadata,
          clientRequestId,
          thread,
          processingTraceEntries,
          safeWrite,
          streamWriter,
          replyEngine: this.replyEngine,
          threadService: this.threadService,
          conversationStore: this.conversationStore,
          planLimits: this.planLimits,
          llmBudget: this.llmBudget,
          responseMaxTokens,
        });
        return;
      }

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
        llmBudget: this.llmBudget,
      };

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
      const publicThinkingLabel = createKloelPublicThinkingLabel(finalUserMessage);
      const publicStreamingLabel = createKloelPublicStreamingLabel(finalUserMessage);
      const streamWriterResponse = (
        writerMessages: ChatCompletionMessageParam[],
        temperature: number,
      ) =>
        streamWriter.streamModelResponse({
          openai: openaiClient,
          writerMessages,
          temperature,
          responseMaxTokens,
          thinkingLabel: publicThinkingLabel,
          streamingLabel: publicStreamingLabel,
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

      await runStandardStreamingReplyBranch({
        messages,
        responseTemperature,
        responseMaxTokens,
        streamWriterResponse,
        branchCtx,
        prisma: this.prisma,
        logger: this.logger,
        thinkLoopServices: this.thinkLoopServices,
        wireContextServices: this.wireContextServices,
        conversationId,
        userId,
      });
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
      // Per-user memory: learn durable facts/preferences from this turn on the
      // sync path too (mirrors the streaming think() path). Fire-and-forget so it
      // never adds latency to or breaks the reply.
      if (request.mode === 'chat' && request.workspaceId && request.userId) {
        void this.memoryEngine?.remember(request.workspaceId, request.userId, request.message);
      }
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
        // Capability-turn observability (KLOEL_CAPABILITY_TURN_LEARN): pass the
        // SAME @Optional DecisionOutcomeService the streaming loop uses so a
        // capability-driven sync turn can be recorded as a `capability_reply`
        // decision. Undefined when not provided → the gated helper short-circuits
        // and the reply path is byte-identical.
        ...(this.decisionOutcomeService !== undefined
          ? { decisionOutcomeService: this.decisionOutcomeService }
          : {}),
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
      prisma: this.prisma,
      chatMessageItems: this.chatMessageItems,
      replyEngine: this.replyEngine,
      threadService: this.threadService,
    });
  }
}
