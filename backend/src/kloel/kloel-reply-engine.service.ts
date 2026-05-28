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
import { UnifiedAgentService } from './unified-agent.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { validateAbiPayload } from './abi/abi-validator';
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
    let cognitiveState: Record<string, unknown> = {
      abiStatus: this.abiBuilder ? 'unavailable_or_invalid' : 'builder_not_injected',
      audience: 'public',
      perceptionSnapshot: { channel: 'web' },
    };

    // Mind signals — wire attention + valence into cognitiveState (PI-k3)
    if (this.attentionService && this.valenceAggregatorService && params.workspaceId) {
      try {
        // No in-process event cache reachable from this injection scope.
        // MindEventSpine has no synchronous recent-events getter.
        cognitiveState.mindSignals = { status: 'no_event_source' };
      } catch (error: unknown) {
        this.logger.warn('kloel_mind_signal_skipped', {
          reason: error instanceof Error ? error.message : 'unknown error',
        });
      }
    } else {
      cognitiveState.mindSignals = { status: 'no_services' };
    }

    // Mind beliefs — wire MindBeliefService top active beliefs (PI-k4)
    if (this.mindBeliefService && params.workspaceId) {
      try {
        const beliefs = await Promise.race([
          this.mindBeliefService.getActiveBeliefs(params.workspaceId),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('kloel_mind_belief_timeout')), 100),
          ),
        ]);
        const mindSignals = (cognitiveState.mindSignals ?? {}) as Record<string, unknown>;
        mindSignals.beliefs = beliefs.map((b) => ({
          subject: b.subject,
          predicate: b.predicate,
          mean: b.mean,
          confidence: 1 / (1 + b.variance),
        }));
        cognitiveState.mindSignals = mindSignals;
      } catch (error: unknown) {
        this.logger.warn('kloel_mind_belief_skipped', {
          reason: error instanceof Error ? error.message : 'unknown error',
        });
      }
    }

    if (this.abiBuilder) {
      if (params.prebuiltCognitiveState) {
        cognitiveState = params.prebuiltCognitiveState;
      } else {
        try {
          const abiResult = await this.abiBuilder.build({
            audience: 'public',
            currentInput,
            perceptionSnapshot: {
              channel: 'web',
            },
          });

          if (abiResult.status !== 'ok') {
            this.logger.warn(
              `ABI build failed: ${abiResult.reason}, using structured reply fallback`,
              {
                tag: 'kloel_abi_degraded',
                builder_present: true,
                build_status: abiResult.status,
                validation_issues: [] as string[],
                exception_message: null,
                workspaceId: params.workspaceId ?? null,
              },
            );
          } else {
            const validation = validateAbiPayload(abiResult.abi);

            if (validation.status === 'FAIL') {
              this.logger.warn(
                `ABI validation failed: ${JSON.stringify(validation.issues)}, using structured reply fallback`,
                {
                  tag: 'kloel_abi_degraded',
                  builder_present: true,
                  build_status: 'ok',
                  validation_issues: validation.issues
                    .slice(0, 3)
                    .map((i) => `${i.code}: ${i.message}`),
                  exception_message: null,
                  workspaceId: params.workspaceId ?? null,
                },
              );
            } else {
              cognitiveState = { ...abiResult.abi };
            }
          }
        } catch (error: unknown) {
          const msg =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : 'unknown error';
          this.logger.warn(`ABI build exception: ${msg}, using structured reply fallback`, {
            tag: 'kloel_abi_degraded',
            builder_present: true,
            build_status: null,
            validation_issues: [] as string[],
            exception_message: msg,
            workspaceId: params.workspaceId ?? null,
          });
        }
      }
    }

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
    return msgs;
  }

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
    if (!this.openai) {
      this.logger.error('kloel_motor_unavailable', {
        reason: 'no_llm_client',
        resolvedProvider: resolveTextLlmProvider() ?? null,
        hasOpenAiKey: hasTextLlmApiKey(),
        hasAnthropicFallback: !!process.env.ANTHROPIC_API_KEY,
      });
      return this.unavailableMessage;
    }
    return buildAssistantReplyImpl(params, {
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
      ...(params.abiStateJson !== undefined ? { abiStateJson: params.abiStateJson } : {}),
    });
  }
}
