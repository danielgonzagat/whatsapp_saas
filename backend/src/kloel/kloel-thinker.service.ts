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
  type KloelStreamEvent,
} from './kloel-stream-events';
import { KloelStreamWriter } from './kloel-stream-writer';
import { KloelThreadService, StoredProcessingTraceEntry } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { CANONICAL_FALLBACK_SYSTEM_PROMPT } from './kloel.prompts';
import { LLM_MAX_COMPLETION_TOKENS } from './openai-wrapper';
import { OPERATOR_CAPABILITIES } from './mind/coordination/mind-capabilities.const';
import { AbiBuilderService } from './abi/abi-builder.service';
import { MindCapabilityExecutor } from './mind/coordination';
import { validateAbiPayload } from './abi/abi-validator';
import { computeHandoffConfidence, HANDOFF_THRESHOLD } from './handoff-confidence.helper';
import { emitCognitionAlias } from './event-taxonomy.canonical-aliases';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { detectActionIntent } from './guest-chat.action-intent.helpers';
import { KloelReplyEngineService, LocalToolExecutor } from './kloel-reply-engine.service';
import { thinkSyncImpl, regenerateThreadAssistantResponseImpl } from './kloel-thinker.helpers';
import {
  buildBoundedAbiPayload,
  buildHandoffEscalationLog,
  extractAbiBuildExceptionMessage,
  initialAbiOutcomeLabel,
  readHandoffGateFlags,
  shouldEscalateForHandoff,
} from './kloel-thinker.abi.helpers';
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

const CANONICAL_FALLBACK_SYSTEM =
  'cognitive_state_boundary=distributed; verbalization_source=state_payload; fact_boundary=state_payload';

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
        if (enrichedCompanyContext) {
          context = [context, enrichedCompanyContext].filter(Boolean).join('\n\n');
        }
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
        ...(workspaceId !== undefined ? { workspaceId } : {}),
        ...(userId !== undefined ? { userId } : {}),
        userName,
        expertiseLevel,
        ...(enrichedCompanyContext !== undefined ? { companyContext: enrichedCompanyContext } : {}),
      });
      const summaryMessage = this.threadService.buildThreadSummarySystemMessage(
        historyState.summary,
      );
      const shouldPlanWithTools =
        mode === 'chat' && !!workspaceId && this.replyEngine.shouldAttemptToolPlanningPass(message);
      // No hardcoded output cap: operator/model decides via the
      // LLM_MAX_COMPLETION_TOKENS env (DeepSeek V4 Pro's real ceiling).
      // Long-form signal kept for telemetry; it no longer halves replies.
      void this.replyEngine.shouldUseLongFormBudget(message);
      const responseTemperature = 0.7;
      const responseMaxTokens = LLM_MAX_COMPLETION_TOKENS;
      const clientRequestId = this.threadService.resolveClientRequestId(metadata);

      void context;
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

      let finalSystemPrompt = systemPrompt;
      let finalUserMessage = message;
      let prebuiltCognitiveState: Record<string, unknown> | undefined;

      const useAbi = process.env['KLOEL_THINKER_USE_ABI'] !== 'off';
      let abiOutcome = initialAbiOutcomeLabel({ useAbi, hasAbiBuilder: !!this.abiBuilder });
      let substrateBuilt = false;
      if (useAbi && this.abiBuilder) {
        try {
          // Close the read-back loop: feed the REAL persisted cognitive
          // substrate (memory/beliefs/predictions/valence/pulseTruth from
          // the spine via #363) into the CONVERSATIONAL ABI — previously
          // only inspect_self got it, so the chat had no cross-session
          // memory. Safe: whole block is try/caught with legacy fallback.
          const chatSubstrate =
            workspaceId && this.capabilityExecutor
              ? await this.capabilityExecutor.buildCognitiveSubstrate(workspaceId)
              : undefined;
          substrateBuilt = !!chatSubstrate;
          const abiResult = await this.abiBuilder.build({
            audience: 'public',
            currentInput: {
              raw: message,
              channel: 'web',
              arrivalTimestamp: new Date().toISOString(),
            },
            perceptionSnapshot: {
              channel: 'web',
              ...(workspaceId ? { workspaceId } : {}),
            },
            // Real capability registry so the chat ABI is not hollow
            // (was the cause of Kloel reporting "ABI inteiramente vazio").
            capabilityIds: [...OPERATOR_CAPABILITIES],
            ...(chatSubstrate ? { cognitiveSubstrate: chatSubstrate } : {}),
          });

          if (abiResult.status !== 'ok') {
            abiOutcome = `build_failed:${abiResult.reason}`;
            this.logger.warn(
              `ABI build failed: ${abiResult.reason}, falling back to legacy thinker prompt`,
            );
          } else {
            const validation = validateAbiPayload(abiResult.abi);

            if (validation.status === 'FAIL') {
              abiOutcome = `validation_failed:${JSON.stringify(validation.issues).slice(0, 240)}`;
              this.logger.warn(
                `ABI validation failed: ${JSON.stringify(validation.issues)}, falling back to legacy thinker prompt`,
              );
            } else {
              prebuiltCognitiveState = { ...abiResult.abi };
              // BOUNDED ABI: cap arrays + hard size limit so a long
              // user prompt is NEVER inflated/crashed by the state
              // payload. The ABI goes to SYSTEM (structured state, B2 —
              // not a behavioral instruction); the user message stays
              // EXACTLY the user's input (fixes long-message hang).
              // Bounding constants/logic live in `kloel-thinker.abi.helpers.ts`.
              const { boundedAbi, abiStrLen } = buildBoundedAbiPayload(
                abiResult.abi as unknown as Record<string, unknown>,
              );
              prebuiltCognitiveState = boundedAbi;
              finalSystemPrompt = CANONICAL_FALLBACK_SYSTEM;
              finalUserMessage = message;
              abiOutcome = `success(abiLen=${abiStrLen})`;

              // Wave 10 Phase 2: handoff-confidence collection (flag-gated,
              // observe-only). Gate defaults OFF — no escalation, no
              // blocking, just a structured log for telemetry baselining.
              const handoffFlags = readHandoffGateFlags();
              if (handoffFlags.observe) {
                const snapshot = computeHandoffConfidence(
                  abiResult.abi.beliefs,
                  abiResult.abi.pulseTruth,
                );
                // Dual-emit: `kloel.handoff.confidence` is the legacy event
                // name; `cognition.handoff.confidence` is the canonical name
                // per docs/architecture/EVENT_TAXONOMY_MIGRATION.md. Both fire
                // until the 4-week grace window closes.
                emitCognitionAlias(
                  (_eventName, payload) => {
                    this.logger.log('Handoff confidence snapshot', payload);
                  },
                  'kloel.handoff.confidence',
                  { context: 'kloel.handoff.confidence', ...snapshot },
                );

                if (shouldEscalateForHandoff(snapshot, handoffFlags)) {
                  const escalationLog = buildHandoffEscalationLog({
                    snapshot,
                    workspaceId,
                    threshold: HANDOFF_THRESHOLD,
                  });
                  // Dual-emit: legacy `kloel.handoff.confidence.blocking` +
                  // canonical `cognition.handoff.confidence.blocking`.
                  emitCognitionAlias(
                    (_eventName, payload) => {
                      this.logger.warn('Handoff confidence gate: escalation to human', payload);
                    },
                    'kloel.handoff.confidence.blocking',
                    escalationLog,
                  );
                  safeWrite(
                    createKloelErrorEvent({
                      content:
                        'Estou analisando sua mensagem com mais cuidado. ' +
                        'Um atendente humano vai revisar e responder em breve.',
                      error: 'confidence_gate_escalation',
                      done: true,
                    }),
                  );
                  streamWriter.close();
                  return;
                }
              }
            }
          }
        } catch (error: unknown) {
          const msg = extractAbiBuildExceptionMessage(error);
          abiOutcome = `exception:${msg}`;
          this.logger.warn(`ABI build exception: ${msg}, falling back to legacy thinker prompt`);
        }
      }
      // RUNTIME TRUTH: greppable, severity=log so it is never filtered.
      // Tells us definitively whether the chat actually uses the
      // cognitive substrate or silently falls back to the legacy prompt.
      this.logger.log(
        `KLOEL_ABI_PATH useAbi=${useAbi} substrateBuilt=${substrateBuilt} outcome=${abiOutcome}`,
      );

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
      if (!isClientDisconnected()) {
        const code = resolveThinkErrorCode(abortReason(), 'Erro ao processar mensagem');
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
