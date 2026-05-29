import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import OpenAI from 'openai';
import { createTextLlmClient, hasTextLlmApiKey, resolveTextLlmProvider } from '../lib/llm-provider';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelContextFormatter } from './kloel-context-formatter';
import { type KloelStreamEvent } from './kloel-stream-events';
import { KloelThreadService } from './kloel-thread.service';
import { KloelToolRouter } from './kloel-tool-router';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { CANONICAL_FALLBACK_SYSTEM_PROMPT } from './kloel.prompts';
import { MarketingSkillService } from './marketing-skills/marketing-skill.service';
import { MindService } from './mind.service';
import { AttentionService } from './mind/attention.service';
import { ValenceAggregatorService } from './mind/valence-aggregator.service';
import { ValenceTaggerService } from './mind/valence-tagger.service';
import { MindBeliefService } from './mind/inference/mind-belief.service';
import { MindConceptService } from './mind/memory/mind-concepts.service';
import { SelfHealthService } from './self-awareness/self-health.service';
import { SelfGapsService } from './self-awareness/self-gaps.service';
import { RiskClassService } from './risk-class/risk-class.service';
import { SpineEmitterService } from './spine/spine-emitter.service';
import { UnifiedAgentService } from './unified-agent.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import {
  KLOEL_STREAM_ABORT_REASON_TIMEOUT,
  KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED,
  buildDynamicRuntimeContextHelper,
  buildAssistantReplyImpl,
} from './kloel-reply-engine.helpers';
import {
  detectExpertiseLevel,
  shouldUseLongFormBudget,
  shouldAttemptToolPlanningPass,
} from './kloel-reply-engine.expertise.helpers';
import { buildInternalKloelRuntimeContext } from './kloel-reply-engine.runtime-context.helpers';
import { buildChatModelMessagesPayload } from './kloel-reply-engine.build-messages.helpers';
import { DecisionOutcomeService } from './decision-outcome.service';
import { MindSurpriseService } from './mind/inference/mind-surprise.service';
import { MindPredictionService } from './mind/mind-prediction.service';
import { MindVerbalizerService } from './mind/synthetic/mind-verbalizer.service';
import { MindAutonomyCoordinator } from './mind/coordination/mind-autonomy-coordinator.service';
import { MindBanditService } from './mind/policy/mind-bandit.service';
import { MindCaseMemoryService } from './mind/memory/mind-case-memory.service';
import { MindGlobalPriorService } from './mind/memory/mind-global-prior.service';
import { MindPerceptionService } from './mind/perception/mind-perception.service';
import { AgentAssistService } from './mind/knowledge/agent-assist.service';
import { MindWorkspaceStateService } from './mind/memory/mind-workspace-state.service';
import { VectorService } from './mind/knowledge/vector.service';
import { randomUUID } from 'crypto';
import {
  buildChatOutcomeKey,
  recordChatReplyDecision,
  closeChatReplyOutcome,
} from './kloel-reply-engine.decision-outcome.helpers';
import {
  applyReplyEngineDegradedPath,
  applyReplyEnginePostReply,
} from './kloel-reply-engine.degraded-path.helper';
import { buildKloelAbiCognitiveState } from './kloel-reply-engine.cognitive-state.helpers';
import { MindEventProcessorService } from './mind/runtime/mind-event-processor.service';

type ChatCompletionMessageParam = OpenAI.Chat.ChatCompletionMessageParam;

export type { ExpertiseLevel, ReplyMessage, LocalToolExecutor } from './kloel-reply-engine.types';
import type { ExpertiseLevel, ReplyMessage, LocalToolExecutor } from './kloel-reply-engine.types';

/** Provides reply-building helpers: prompt assembly, expertise detection, context enrichment. */
@Injectable()
export class KloelReplyEngineService {
  private readonly logger = StructuredLogger.from(KloelReplyEngineService.name);
  readonly openai: OpenAI | null;
  readonly toolRouter: KloelToolRouter;
  readonly unavailableMessage =
    'Eu fiquei sem acesso ao motor de resposta agora. Me chama de novo em instantes que eu retomo sem te fazer repetir tudo.';

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly threadService: KloelThreadService,
    private readonly wsContextService: KloelWorkspaceContextService,
    @Inject(forwardRef(() => UnifiedAgentService))
    private readonly unifiedAgentService: UnifiedAgentService,
    @Optional() private readonly marketingSkillService?: MarketingSkillService,
    @Optional() private readonly mindService?: MindService,
    @Optional() private readonly abiBuilder?: AbiBuilderService,
    @Optional() private readonly attentionService?: AttentionService,
    @Optional() private readonly valenceAggregatorService?: ValenceAggregatorService,
    @Optional() private readonly mindBeliefService?: MindBeliefService,
    @Optional() private readonly mindConceptService?: MindConceptService,
    @Optional() private readonly spine?: SpineEmitterService,
    @Optional() private readonly selfHealthService?: SelfHealthService,
    @Optional() private readonly selfGapsService?: SelfGapsService,
    @Optional() private readonly decisionOutcomeService?: DecisionOutcomeService,
    @Optional() private readonly riskClassService?: RiskClassService,
    @Optional() private readonly mindSurpriseService?: MindSurpriseService,
    @Optional() private readonly mindPredictionService?: MindPredictionService,
    @Optional() private readonly mindVerbalizerService?: MindVerbalizerService,
    @Optional() private readonly mindAutonomyCoordinator?: MindAutonomyCoordinator,
    @Optional() private readonly mindBanditService?: MindBanditService,
    @Optional() private readonly mindCaseMemoryService?: MindCaseMemoryService,
    @Optional() private readonly mindGlobalPriorService?: MindGlobalPriorService,
    @Optional() private readonly agentAssistService?: AgentAssistService,
    @Optional() private readonly mindPerceptionService?: MindPerceptionService,
    @Optional() private readonly mindWorkspaceStateService?: MindWorkspaceStateService,
    @Optional() private readonly vectorService?: VectorService,
    @Optional() private readonly valenceTagger?: ValenceTaggerService,
    @Optional() private readonly mindEventProcessorService?: MindEventProcessorService,
  ) {
    this.openai = createTextLlmClient(undefined, { timeout: 60_000, maxRetries: 0 });
    this.toolRouter = new KloelToolRouter(
      this.logger,
      this.unifiedAgentService,
      async (workspaceId, key, content) => {
        await this.prisma.kloelMemory.upsert({
          where: { workspaceId_key: { workspaceId, key } },
          update: { content, value: {}, category: 'tool_artifact', updatedAt: new Date() },
          create: { workspaceId, key, value: {}, content, category: 'tool_artifact' },
        });
      },
    );
  }

  get contextFormatter(): KloelContextFormatter {
    return this.wsContextService.contextFormatter;
  }

  hasOpenAiKey(): boolean {
    return hasTextLlmApiKey();
  }

  buildDashboardPrompt(params?: {
    userName?: string | null;
    workspaceName?: string | null;
    expertiseLevel?: ExpertiseLevel;
  }): string {
    void params;
    return CANONICAL_FALLBACK_SYSTEM_PROMPT;
  }

  detectExpertiseLevel(message: string, history: ReplyMessage[] = []): ExpertiseLevel {
    return detectExpertiseLevel(message, history);
  }

  shouldUseLongFormBudget(message: string): boolean {
    return shouldUseLongFormBudget(message);
  }

  shouldAttemptToolPlanningPass(message: string): boolean {
    return shouldAttemptToolPlanningPass(message);
  }

  buildStreamAbortMessage(reason: unknown, timeoutMs?: number): string {
    if (reason === KLOEL_STREAM_ABORT_REASON_TIMEOUT) {
      const secs =
        typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
          ? Math.max(1, Math.round(timeoutMs / 1000))
          : null;
      return secs
        ? `A resposta demorou mais de ${secs}s e eu interrompi a tentativa para não travar sua conversa. Sua mensagem foi preservada. Tente dividir o pedido em partes ou enviar de novo.`
        : 'A resposta demorou demais e eu interrompi a tentativa para não travar sua conversa. Sua mensagem foi preservada. Tente novamente.';
    }
    if (reason === KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED) {
      return 'client_disconnected';
    }
    this.logger.warn('kloel_motor_unavailable', {
      reason: 'stream_aborted_unknown',
      abortReason: String(reason).slice(0, 200),
    });
    return this.unavailableMessage;
  }

  isClientDisconnected(reason: unknown): boolean {
    return reason === KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED;
  }

  async buildChatModelMessages(params: {
    systemPrompt: string;
    dynamicContext: string;
    marketingPromptAddendum?: string | null;
    summaryMessage?: ChatCompletionMessageParam | null;
    recentMessages: ReplyMessage[];
    userMessage: string;
    assistantMessage?: {
      content?: string | null;
      tool_calls?: OpenAI.Chat.ChatCompletionAssistantMessageParam['tool_calls'];
    };
    toolMessages?: Array<{ role?: 'tool'; tool_call_id: string; name: string; content: string }>;
    prebuiltCognitiveState?: Record<string, unknown>;
    workspaceId?: string | null;
  }): Promise<ChatCompletionMessageParam[]> {
    const currentInput = {
      raw: params.userMessage,
      channel: 'web',
      arrivalTimestamp: new Date().toISOString(),
    };
    void params.systemPrompt;

    const cognitiveStateParams: {
      workspaceId?: string | null;
      userMessage: string;
      prebuiltCognitiveState?: Record<string, unknown>;
    } = {
      workspaceId: params.workspaceId ?? null,
      userMessage: params.userMessage,
    };
    if (params.prebuiltCognitiveState !== undefined) {
      cognitiveStateParams.prebuiltCognitiveState = params.prebuiltCognitiveState;
    }
    const cognitiveStateDeps = {
      prisma: this.prisma,
      logger: this.logger,
      services: {
        attentionService: this.attentionService,
        valenceAggregatorService: this.valenceAggregatorService,
        mindBeliefService: this.mindBeliefService,
        mindConceptService: this.mindConceptService,
        mindPredictionService: this.mindPredictionService,
        selfHealthService: this.selfHealthService,
        selfGapsService: this.selfGapsService,
        riskClassService: this.riskClassService,
        mindVerbalizerService: this.mindVerbalizerService,
        mindAutonomyCoordinator: this.mindAutonomyCoordinator,
        mindBanditService: this.mindBanditService,
        mindCaseMemoryService: this.mindCaseMemoryService,
        mindGlobalPriorService: this.mindGlobalPriorService,
        mindPerceptionService: this.mindPerceptionService,
        agentAssistService: this.agentAssistService,
        vectorService: this.vectorService,
      },
      ...(this.abiBuilder !== undefined ? { abiBuilder: this.abiBuilder } : {}),
    };
    const cognitiveState = await buildKloelAbiCognitiveState(
      cognitiveStateDeps,
      cognitiveStateParams,
      currentInput,
    );

    const msgs = buildChatModelMessagesPayload({
      dynamicContext: params.dynamicContext,
      marketingPromptAddendum: params.marketingPromptAddendum,
      summaryMessage: params.summaryMessage,
      recentMessages: params.recentMessages,
      cognitiveState,
      currentInput,
      assistantMessage: params.assistantMessage,
      toolMessages: params.toolMessages,
    });
    this._lastCognitiveState = cognitiveState;
    return msgs;
  }

  /** Expose the most recent cognitive state for surprise-computation linkage (PI-K12-C). */
  private _lastCognitiveState?: Record<string, unknown>;

  async buildMarketingPromptAddendum(
    workspaceId: string | undefined,
    mode: string | undefined,
    message: string,
  ): Promise<string | null> {
    if (mode !== 'chat' || !workspaceId || !this.marketingSkillService) {
      return null;
    }
    try {
      return (
        (await this.marketingSkillService.buildPacket(workspaceId, message))?.promptAddendum || null
      );
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      this.logger.warn(`Falha ao montar contexto de marketing: ${msg}`);
      return null;
    }
  }

  async buildDynamicRuntimeContext(params: {
    workspaceId?: string;
    userId?: string;
    userName?: string;
    expertiseLevel: ExpertiseLevel;
    companyContext?: string;
  }): Promise<string> {
    const baseContext = await buildDynamicRuntimeContextHelper({
      ...params,
      prisma: this.prisma,
      wsContextService: this.wsContextService,
      contextFormatter: this.contextFormatter,
    });
    const kloelRuntimeContext = await buildInternalKloelRuntimeContext({
      workspaceId: params.workspaceId,
      expertiseLevel: params.expertiseLevel,
      mindService: this.mindService,
      logger: this.logger,
    });
    return kloelRuntimeContext ? `${baseContext}\n\n${kloelRuntimeContext}` : baseContext;
  }

  async buildAssistantReply(params: {
    message: string;
    workspaceId?: string;
    userId?: string;
    userName?: string;
    mode?: 'chat' | 'onboarding' | 'sales';
    companyContext?: string;
    allowedTools?: string[];
    conversationState?: { summary?: string; recentMessages: ReplyMessage[]; totalMessages: number };
    onTraceEvent?: (event: KloelStreamEvent) => void;
    executeLocalTool?: LocalToolExecutor;
    abiStateJson?: string;
    prebuiltCognitiveState?: Record<string, unknown>;
  }): Promise<string> {
    // PI-k8: record decision outcome at start of every chat reply
    const outcomeKey = buildChatOutcomeKey(params.workspaceId);
    if (outcomeKey && params.workspaceId) {
      recordChatReplyDecision(this.decisionOutcomeService, this.logger, {
        workspaceId: params.workspaceId,
        outcomeKey,
        surface: 'dashboard',
        messageLength: params.message.length,
      });
    }

    // PI-K16-B: tick lease coordination – prevent concurrent reply storms
    let tickLeaseOwner: string | undefined;
    if (params.workspaceId && this.mindWorkspaceStateService) {
      tickLeaseOwner = `chat-reply-${randomUUID()}`;
      const acquired = await this.mindWorkspaceStateService.tryAcquireTickLease(
        params.workspaceId,
        tickLeaseOwner,
        5000,
      );
      if (!acquired) {
        tickLeaseOwner = undefined;
        this.logger.warn('kloel_chat_tick_lease_unavailable', {
          workspaceId: params.workspaceId,
        });
      }
    }

    try {
      if (!this.openai) {
        this.logger.error('kloel_motor_unavailable', {
          reason: 'no_llm_client',
          resolvedProvider: resolveTextLlmProvider() ?? null,
          hasOpenAiKey: hasTextLlmApiKey(),
          hasAnthropicFallback: !!process.env.ANTHROPIC_API_KEY,
        });
        applyReplyEngineDegradedPath(
          {
            decisionOutcomeService: this.decisionOutcomeService,
            mindBeliefService: this.mindBeliefService,
            mindSurpriseService: this.mindSurpriseService,
            mindEventProcessorService: this.mindEventProcessorService,
            valenceTagger: this.valenceTagger,
            logger: this.logger,
            _lastCognitiveState: this._lastCognitiveState,
          },
          params.workspaceId,
          outcomeKey,
          'chat.degraded.no_llm_client',
        );
        return this.unavailableMessage;
      }
      let assistantMessage: string;
      try {
        assistantMessage = await buildAssistantReplyImpl(params, {
          openai: this.openai,
          prisma: this.prisma,
          planLimits: this.planLimits,
          threadService: this.threadService,
          wsContextService: this.wsContextService,
          contextFormatter: this.contextFormatter,
          toolRouter: this.toolRouter,
          unavailableMessage: this.unavailableMessage,
          hasOpenAiKey: () => this.hasOpenAiKey(),
          buildDashboardPrompt: (p) => this.buildDashboardPrompt(p),
          detectExpertiseLevel: (m, h) => this.detectExpertiseLevel(m, h),
          shouldUseLongFormBudget: (m) => this.shouldUseLongFormBudget(m),
          buildMarketingPromptAddendum: (wid, mode, msg) =>
            this.buildMarketingPromptAddendum(wid, mode, msg),
          buildChatModelMessages: async (p) => this.buildChatModelMessages(p),
          buildDynamicRuntimeContext: (p) => this.buildDynamicRuntimeContext(p),
          ...(this.spine !== undefined ? { spine: this.spine } : {}),
          ...(params.abiStateJson !== undefined ? { abiStateJson: params.abiStateJson } : {}),
        });
        closeChatReplyOutcome(this.decisionOutcomeService, this.logger, {
          outcomeKey,
          outcomeName: 'chat.replied',
          wonVsBaseline: true,
        });
      } catch (error: unknown) {
        closeChatReplyOutcome(this.decisionOutcomeService, this.logger, {
          outcomeKey,
          outcomeName: 'chat.error',
          wonVsBaseline: false,
        });
        throw error;
      }
      if (params.workspaceId) {
        const replyOutcome: 0 | 1 = assistantMessage.length > 0 ? 1 : 0;
        applyReplyEnginePostReply(
          {
            decisionOutcomeService: this.decisionOutcomeService,
            mindBeliefService: this.mindBeliefService,
            mindSurpriseService: this.mindSurpriseService,
            mindEventProcessorService: this.mindEventProcessorService,
            valenceTagger: this.valenceTagger,
            logger: this.logger,
            _lastCognitiveState: this._lastCognitiveState,
          },
          params.workspaceId,
          replyOutcome,
        );
      }
      return assistantMessage;
    } finally {
      if (tickLeaseOwner && params.workspaceId && this.mindWorkspaceStateService) {
        await this.mindWorkspaceStateService.releaseTickLease(params.workspaceId, tickLeaseOwner);
      }
    }
  }
}
