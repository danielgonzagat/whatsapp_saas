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
import { MindBeliefService } from './mind/inference/mind-belief.service';
import { MindConceptService } from './mind/memory/mind-concepts.service';
import { SelfHealthService } from './self-awareness/self-health.service';
import { SelfGapsService } from './self-awareness/self-gaps.service';
import { RiskClassService } from './risk-class/risk-class.service';
import { SpineEmitterService } from './spine/spine-emitter.service';
import { UnifiedAgentService } from './unified-agent.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import {
  WHITESPACE_RE,
  RELAT_O__RIO_DOCUMENTO_RE,
  CRIE_CADASTRAR_CADASTRE_RE,
  PRODUTO_CAT_A__LOGO_AUT_RE,
  KLOEL_STREAM_ABORT_REASON_TIMEOUT,
  KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED,
  buildDynamicRuntimeContextHelper,
  buildAssistantReplyImpl,
} from './kloel-reply-engine.helpers';
import { DecisionOutcomeService } from './decision-outcome.service';
import { MindSurpriseService } from './mind/inference/mind-surprise.service';
import { MindPredictionService } from './mind/mind-prediction.service';
import { MindVerbalizerService } from './mind/synthetic/mind-verbalizer.service';
import { MindAutonomyCoordinator } from './mind/coordination/mind-autonomy-coordinator.service';
import { MindBanditService } from './mind/policy/mind-bandit.service';
import { MindCaseMemoryService } from './mind/memory/mind-case-memory.service';
import { MindGlobalPriorService } from './mind/memory/mind-global-prior.service';
import { MindPerceptionService } from './mind/perception/mind-perception.service';
import {
  buildChatOutcomeKey,
  recordChatReplyDecision,
  closeChatReplyOutcome,
  observeRepliedToUserBelief,
  computeChatSurprise as computeChatSurpriseHelper,
} from './kloel-reply-engine.decision-outcome.helpers';
import { buildKloelAbiCognitiveState } from './kloel-reply-engine.cognitive-state.helpers';

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
    @Optional() private readonly mindPerceptionService?: MindPerceptionService,
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
    const combined = [message, ...history.slice(-6).map((e) => e.content || '')]
      .join(' ')
      .toLowerCase();
    const expertSignals = [
      'latência',
      'backpressure',
      'idempot',
      'throughput',
      'benchmark',
      'trade-off',
      'event-driven',
      'sse',
      'webhook',
      'prisma',
      'postgres',
      'fallback',
      'observabilidade',
    ];
    const advancedSignals = [
      'api',
      'integra',
      'crm',
      'automa',
      'segmenta',
      'conversão',
      'cta',
      'pipeline',
      'copilot',
      'autopilot',
      'checkout',
      'upsell',
    ];
    const expertScore = expertSignals.filter((s) => combined.includes(s)).length;
    const advancedScore = advancedSignals.filter((s) => combined.includes(s)).length;
    if (expertScore >= 3) {
      return 'EXPERT';
    }
    if (expertScore >= 1 || advancedScore >= 5) {
      return 'AVANÇADO';
    }
    if (
      advancedScore >= 2 ||
      String(message || '')
        .trim()
        .split(WHITESPACE_RE).length >= 14
    ) {
      return 'INTERMEDIÁRIO';
    }
    return 'INICIANTE';
  }

  shouldUseLongFormBudget(message: string): boolean {
    return RELAT_O__RIO_DOCUMENTO_RE.test(
      String(message || '')
        .trim()
        .toLowerCase(),
    );
  }

  shouldAttemptToolPlanningPass(message: string): boolean {
    const normalized = String(message || '')
      .trim()
      .toLowerCase();
    if (!normalized || /ideias?/.test(normalized)) {
      return false;
    }
    if (
      CRIE_CADASTRAR_CADASTRE_RE.test(normalized) &&
      PRODUTO_CAT_A__LOGO_AUT_RE.test(normalized)
    ) {
      return true;
    }
    return /\b(liste|listar|mostre|mostrar|busque|buscar|pesquise|pesquisar|procure|procurar|consulte|consultar|verifique|verificar|analise|analisar|resuma|resumo|status|dashboard|produtos?|leads?|contatos?|conversas?|whatsapp|mensagens?|evid[eê]ncias?|mem[oó]ria|sess(ões|oes)|jobs?|billing|cobran[çc]a|faturamento|receita|vendas?|pagamentos?)\b/i.test(
      normalized,
    );
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
    const cognitiveStateDeps: Parameters<typeof buildKloelAbiCognitiveState>[0] = {
      prisma: this.prisma,
      logger: this.logger,
      services: {
        ...(this.attentionService !== undefined ? { attentionService: this.attentionService } : {}),
        ...(this.valenceAggregatorService !== undefined
          ? { valenceAggregatorService: this.valenceAggregatorService }
          : {}),
        ...(this.mindBeliefService !== undefined
          ? { mindBeliefService: this.mindBeliefService }
          : {}),
        ...(this.mindConceptService !== undefined
          ? { mindConceptService: this.mindConceptService }
          : {}),
        ...(this.selfHealthService !== undefined
          ? { selfHealthService: this.selfHealthService }
          : {}),
        ...(this.selfGapsService !== undefined ? { selfGapsService: this.selfGapsService } : {}),
        ...(this.riskClassService !== undefined ? { riskClassService: this.riskClassService } : {}),
        ...(this.mindPredictionService !== undefined
          ? { mindPredictionService: this.mindPredictionService }
          : {}),
        ...(this.mindVerbalizerService !== undefined
          ? { mindVerbalizerService: this.mindVerbalizerService }
          : {}),
        ...(this.mindAutonomyCoordinator !== undefined
          ? { mindAutonomyCoordinator: this.mindAutonomyCoordinator }
          : {}),
        ...(this.mindBanditService !== undefined
          ? { mindBanditService: this.mindBanditService }
          : {}),
        ...(this.mindCaseMemoryService !== undefined
          ? { mindCaseMemoryService: this.mindCaseMemoryService }
          : {}),
        ...(this.mindGlobalPriorService !== undefined
          ? { mindGlobalPriorService: this.mindGlobalPriorService }
          : {}),
        ...(this.mindPerceptionService !== undefined
          ? { mindPerceptionService: this.mindPerceptionService }
          : {}),
      },
    };
    if (this.abiBuilder !== undefined) {
      cognitiveStateDeps.abiBuilder = this.abiBuilder;
    }
    const cognitiveState = await buildKloelAbiCognitiveState(
      cognitiveStateDeps,
      cognitiveStateParams,
      currentInput,
    );

    const msgs: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: JSON.stringify({
          runtimeContext: {
            dynamicContext: params.dynamicContext,
            marketingContext: params.marketingPromptAddendum ?? null,
          },
        }),
      },
    ];
    if (params.summaryMessage) {
      msgs.push({
        role: 'user',
        content: JSON.stringify({
          conversationSummary:
            typeof params.summaryMessage.content === 'string' ? params.summaryMessage.content : '',
        }),
      });
    }
    for (const entry of params.recentMessages) {
      msgs.push({ role: entry.role as 'user' | 'assistant', content: entry.content });
    }
    msgs.push({
      role: 'user',
      content: JSON.stringify({
        cognitiveState,
        currentInput,
      }),
    });
    if (params.assistantMessage) {
      const toolCalls = Array.isArray(params.assistantMessage.tool_calls)
        ? params.assistantMessage.tool_calls
        : undefined;
      msgs.push({
        role: 'assistant',
        content:
          typeof params.assistantMessage.content === 'string'
            ? params.assistantMessage.content
            : '',
        ...(toolCalls !== undefined ? { tool_calls: toolCalls } : {}),
      });
    }
    if (params.toolMessages?.length) {
      msgs.push(
        ...params.toolMessages.map((m) => ({
          role: 'tool' as const,
          tool_call_id: m.tool_call_id,
          content: m.content,
        })),
      );
    }
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
    const kloelRuntimeContext = await this.buildInternalKloelRuntimeContext(params);
    return kloelRuntimeContext ? `${baseContext}\n\n${kloelRuntimeContext}` : baseContext;
  }

  private async buildInternalKloelRuntimeContext(params: {
    workspaceId?: string;
    expertiseLevel: ExpertiseLevel;
  }): Promise<string | null> {
    if (!params.workspaceId || !this.mindService) {
      return null;
    }

    try {
      const channel = 'kloel_chat';
      const segment = params.expertiseLevel.toLowerCase();
      const [tone, aggressiveness, format, objection] = await Promise.all([
        this.mindService.resolveTone(params.workspaceId, channel, 0.5, 0.5, segment),
        this.mindService.resolveAggressiveness(
          params.workspaceId,
          'official_kloel_chat',
          0.5,
          0.5,
          1,
        ),
        this.mindService.resolveMessageFormat(params.workspaceId, channel, segment, ['text']),
        this.mindService.resolveObjectionResponse(params.workspaceId, channel, segment, 'unknown'),
      ]);

      return [
        'Contexto operacional interno do Kloel:',
        `- Tom recomendado: ${tone.tone}.`,
        `- Intensidade comercial recomendada: ${aggressiveness.aggressiveness}.`,
        `- Formato recomendado nesta superfície: ${format.format === 'text' ? 'texto claro' : format.format}.`,
        `- Estratégia comercial recomendada: ${objection.strategy}.`,
        '- Use essas diretrizes apenas como ajuste interno da resposta oficial do Kloel.',
        '- Nunca apresente outro agente, outro chat, outro motor ou outra voz ao usuário.',
      ].join('\n');
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      this.logger.warn(`Falha ao montar contexto operacional interno do Kloel: ${msg}`);
      return null;
    }
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

    if (!this.openai) {
      this.logger.error('kloel_motor_unavailable', {
        reason: 'no_llm_client',
        resolvedProvider: resolveTextLlmProvider() ?? null,
        hasOpenAiKey: hasTextLlmApiKey(),
        hasAnthropicFallback: !!process.env.ANTHROPIC_API_KEY,
      });
      if (params.workspaceId) {
        observeRepliedToUserBelief(this.mindBeliefService, this.logger, {
          workspaceId: params.workspaceId,
          surface: 'dashboard',
          observed: 0,
        });
        void computeChatSurpriseHelper(
          this.mindSurpriseService,
          this.mindBeliefService,
          this.logger,
          {
            workspaceId: params.workspaceId,
            observed: 0,
            surface: 'dashboard',
            degraded: true,
          },
          this._lastCognitiveState?.mindSignals as Record<string, unknown> | undefined,
        );
      }
      closeChatReplyOutcome(this.decisionOutcomeService, this.logger, {
        outcomeKey,
        outcomeName: 'chat.degraded.no_llm_client',
        wonVsBaseline: false,
      });
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
      observeRepliedToUserBelief(this.mindBeliefService, this.logger, {
        workspaceId: params.workspaceId,
        surface: 'dashboard',
        observed: replyOutcome,
      });
      void computeChatSurpriseHelper(
        this.mindSurpriseService,
        this.mindBeliefService,
        this.logger,
        {
          workspaceId: params.workspaceId,
          observed: replyOutcome,
          surface: 'dashboard',
          degraded: replyOutcome === 0,
        },
        this._lastCognitiveState?.mindSignals as Record<string, unknown> | undefined,
      );
    }
    return assistantMessage;
  }
}
