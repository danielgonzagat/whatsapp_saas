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
import { OPERATOR_CAPABILITIES } from './brain-capabilities.const';
import { AbiBuilderService } from './abi/abi-builder.service';
import { BrainCapabilityExecutorService } from './brain-capability-executor.service';
import { validateAbiPayload } from './abi/abi-validator';
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
    @Optional() private readonly capabilityExecutor?: BrainCapabilityExecutorService,
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
      if (!this.replyEngine.hasOpenAiKey() && !process.env.ANTHROPIC_API_KEY) {
        safeWrite(
          createKloelErrorEvent({
            content:
              'Assistente IA não disponível no momento. Configure DEEPSEEK_API_KEY, LLM_API_KEY, OPENAI_API_KEY ou ANTHROPIC_API_KEY para habilitar o Kloel.',
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
      const systemPrompt =
        mode === 'onboarding'
          ? CANONICAL_FALLBACK_SYSTEM_PROMPT
          : mode === 'sales'
            ? CANONICAL_FALLBACK_SYSTEM_PROMPT
            : this.replyEngine.buildDashboardPrompt({
                userName,
                workspaceName: companyName,
                expertiseLevel,
              });

      let finalSystemPrompt = systemPrompt;
      let finalUserMessage = message;

      const useAbi = process.env['KLOEL_THINKER_USE_ABI'] === 'on';
      let abiOutcome = useAbi ? (this.abiBuilder ? 'attempted' : 'no_abiBuilder') : 'flag_off';
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
              // BOUNDED ABI: cap arrays + hard size limit so a long
              // user prompt is NEVER inflated/crashed by the state
              // payload. The ABI goes to SYSTEM (structured state, B2 —
              // not a behavioral instruction); the user message stays
              // EXACTLY the user's input (fixes long-message hang).
              const capArrays = (_k: string, v: unknown): unknown =>
                Array.isArray(v) ? v.slice(0, 8) : v;
              let abiStr = JSON.stringify(abiResult.abi, capArrays);
              // ROOT-CAUSE FIX (runtime-evidenced via KLOEL_ABI_PATH
              // abiLen=6018): the 6000 hard cap blind-sliced the JSON
              // and decapitated memory/episodicRefs/recentSalientEvents
              // (where recallable facts live) → cross-session recall
              // never worked substrate-driven. Arrays are already capped
              // to 8 (capArrays); 24000 fits the full enriched ABI well
              // within DeepSeek V4 Pro's context. Slice stays only as a
              // never-reached last resort.
              const ABI_MAX = 24000;
              if (abiStr.length > ABI_MAX) {
                abiStr = `${abiStr.slice(0, ABI_MAX)}…(state_truncated)`;
              }
              finalSystemPrompt = `${CANONICAL_FALLBACK_SYSTEM}\nstate_payload=${abiStr}`;
              finalUserMessage = message;
              abiOutcome = `success(abiLen=${abiStr.length})`;
            }
          }
        } catch (error: unknown) {
          const msg =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : 'unknown error';
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
        userMessage: finalUserMessage,
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
        void this.prisma.autopilotEvent
          .create({
            data: {
              workspaceId,
              intent: 'kloel_chat_turn',
              action: 'kloel.chat.turn',
              status: 'executed',
              meta: {
                userPreview: message.slice(0, 280),
                replyPreview: fullResponse.slice(0, 280),
                mode,
                conversationId: conversationId ?? null,
              },
            },
          })
          .catch((e: unknown) => {
            this.logger.warn(
              `chat-turn spine persist failed: ${e instanceof Error ? e.message : 'unknown'}`,
            );
          });
      }
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
    _enrichedCompanyContext: string | undefined,
    effectiveCompanyContext: string | undefined,
    _executeLocalTool?: LocalToolExecutor,
  ): Promise<ThinkSyncResult> {
    try {
      // Build ABI state HERE where DI works — before delegating to thinkSyncImpl
      let abiStateJson: string | undefined;
      if (this.abiBuilder && request.workspaceId) {
        try {
          let chatSubstrate: any = undefined;
          if (this.capabilityExecutor) {
            chatSubstrate = await this.capabilityExecutor.buildCognitiveSubstrate(request.workspaceId);
          } else {
            // Direct fallback: query autopilot events ourselves
            const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const rows = await this.prisma.$queryRawUnsafe<any[]>(
              `SELECT intent, action, status, meta, "createdAt" FROM "RAC_AutopilotEvent" WHERE "workspaceId" = $1 AND "createdAt" > $2 ORDER BY "createdAt" ASC LIMIT 500`,
              request.workspaceId, since,
            );
            if (rows && rows.length > 0) {
              const events = rows.map((r: any, i: number) => ({
                eventId: `evt_${new Date(r.createdAt).getTime().toString(36)}_${i.toString(36)}`,
                eventName: `autopilot.${r.intent}.${r.status}`,
                occurredAt: new Date(r.createdAt).toISOString(),
                summary: `chat: ${String((typeof r.meta === 'object' && r.meta ? (r.meta as any).userPreview : '') || '').slice(0, 120)}`,
                valence: 'neutral' as const,
              }));
              chatSubstrate = {
                recentSalientEvents: events.slice(0, 30),
                beliefs: [],
                predictions: { active: [], recentSurprises: [] },
                valence: { recentTrace: [], aggregatedMood: { positive: 0, negative: 0, neutral: 1, ambiguous: 0, windowHours: 24 } },
                workingMemory: [],
                episodicRefs: [],
                consolidatedRefs: [],
                pulseTruth: { noOverclaimStatus: 'PASS', capabilityHealthScore: 0, gates: [], certificationVerdict: { verdict: 'INSUFFICIENT_EVIDENCE', score: 0, measuredAt: new Date().toISOString() }, overclaimRisk: 0 },
                attention: { candidates: [] },
              };
            }
          }
          if (chatSubstrate) {
            const abiResult = await this.abiBuilder.build({
              audience: 'public',
              currentInput: { raw: request.message, channel: 'web', arrivalTimestamp: new Date().toISOString() },
              perceptionSnapshot: { channel: 'web', workspaceId: request.workspaceId },
              cognitiveSubstrate: chatSubstrate,
            });
            if (abiResult.status === 'ok') {
              const validation = validateAbiPayload(abiResult.abi);
              if (validation.status !== 'FAIL') {
                const capped = JSON.stringify(abiResult.abi, (_k: string, v: unknown) =>
                  Array.isArray(v) ? v.slice(0, 8) : v
                );
                abiStateJson = capped.length > 24000 ? capped.slice(0, 24000) + '...(truncated)' : capped;
                this.logger.log(`ABI built: events=${chatSubstrate.recentSalientEvents?.length} beliefs=${chatSubstrate.beliefs?.length}`);
              }
            }
          }
        } catch (e: unknown) {
          this.logger.warn(`ABI build failed in thinkSync: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return await thinkSyncImpl(request, composerCapability, effectiveCompanyContext, {
        replyEngine: this.replyEngine,
        prisma: this.prisma,
        threadService: this.threadService,
        composerService: this.composerService,
        conversationStore: this.conversationStore,
        planLimits: this.planLimits,
        abiStateJson,
        executeLocalTool: _executeLocalTool,
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
