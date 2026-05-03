import { Injectable, Logger, Optional } from '@nestjs/common';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelContextFormatter } from './kloel-context-formatter';
import { type KloelStreamEvent } from './kloel-stream-events';
import { KloelThreadService } from './kloel-thread.service';
import { KloelToolRouter } from './kloel-tool-router';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { buildKloelResponseEnginePrompt } from './kloel.prompts';
import { MarketingSkillService } from './marketing-skills/marketing-skill.service';
import { UnifiedAgentService } from './unified-agent.service';
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

export type ExpertiseLevel = 'INICIANTE' | 'INTERMEDIÁRIO' | 'AVANÇADO' | 'EXPERT';

export interface ReplyMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LocalToolExecutor = (
  workspaceId: string,
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
) => Promise<{ success: boolean; message?: string; error?: string; [key: string]: unknown }>;

/** Provides reply-building helpers: prompt assembly, expertise detection, context enrichment. */
@Injectable()
export class KloelReplyEngineService {
  private readonly logger = new Logger(KloelReplyEngineService.name);
  readonly openai: OpenAI;
  readonly toolRouter: KloelToolRouter;
  readonly unavailableMessage =
    'Eu fiquei sem acesso ao motor de resposta agora. Me chama de novo em instantes que eu retomo sem te fazer repetir tudo.';

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly threadService: KloelThreadService,
    private readonly wsContextService: KloelWorkspaceContextService,
    private readonly unifiedAgentService: UnifiedAgentService,
    @Optional() private readonly marketingSkillService?: MarketingSkillService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000,
      maxRetries: 0,
    });
    this.toolRouter = new KloelToolRouter(this.logger, unifiedAgentService);
  }

  get contextFormatter(): KloelContextFormatter {
    return this.wsContextService.contextFormatter;
  }

  hasOpenAiKey(): boolean {
    return !!String(process.env.OPENAI_API_KEY || '').trim();
  }

  buildDashboardPrompt(params?: {
    userName?: string | null;
    workspaceName?: string | null;
    expertiseLevel?: ExpertiseLevel;
  }): string {
    return buildKloelResponseEnginePrompt({
      currentDate: new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'full',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date()),
      userName: this.contextFormatter.sanitizeUserNameForAssistant(params?.userName),
      workspaceName: 'Workspace',
      expertiseLevel: params?.expertiseLevel,
    });
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
    if (expertScore >= 3) return 'EXPERT';
    if (expertScore >= 1 || advancedScore >= 5) return 'AVANÇADO';
    if (
      advancedScore >= 2 ||
      String(message || '')
        .trim()
        .split(WHITESPACE_RE).length >= 14
    )
      return 'INTERMEDIÁRIO';
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
    if (!normalized || /ideias?/.test(normalized)) return false;
    return (
      CRIE_CADASTRAR_CADASTRE_RE.test(normalized) && PRODUTO_CAT_A__LOGO_AUT_RE.test(normalized)
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
    if (reason === KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED) return 'client_disconnected';
    return this.unavailableMessage;
  }

  isClientDisconnected(reason: unknown): boolean {
    return reason === KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED;
  }

  buildChatModelMessages(params: {
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
  }): ChatCompletionMessageParam[] {
    const msgs: ChatCompletionMessageParam[] = [
      { role: 'system', content: params.systemPrompt },
      { role: 'system', content: params.dynamicContext },
    ];
    if (params.marketingPromptAddendum)
      msgs.push({ role: 'system', content: params.marketingPromptAddendum });
    if (params.summaryMessage) msgs.push(params.summaryMessage);
    for (const entry of params.recentMessages)
      msgs.push({ role: entry.role as 'user' | 'assistant', content: entry.content });
    msgs.push({ role: 'user', content: params.userMessage });
    if (params.assistantMessage) {
      msgs.push({
        role: 'assistant',
        content:
          typeof params.assistantMessage.content === 'string'
            ? params.assistantMessage.content
            : '',
        tool_calls: Array.isArray(params.assistantMessage.tool_calls)
          ? params.assistantMessage.tool_calls
          : undefined,
      });
    }
    if (params.toolMessages?.length)
      msgs.push(
        ...params.toolMessages.map((m) => ({
          role: 'tool' as const,
          tool_call_id: m.tool_call_id,
          content: m.content,
        })),
      );
    return msgs;
  }

  async buildMarketingPromptAddendum(
    workspaceId: string | undefined,
    mode: string | undefined,
    message: string,
  ): Promise<string | null> {
    if (mode !== 'chat' || !workspaceId || !this.marketingSkillService) return null;
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
    return buildDynamicRuntimeContextHelper({
      ...params,
      prisma: this.prisma,
      wsContextService: this.wsContextService,
      contextFormatter: this.contextFormatter,
    });
  }

  async buildAssistantReply(params: {
    message: string;
    workspaceId?: string;
    userId?: string;
    userName?: string;
    mode?: 'chat' | 'onboarding' | 'sales';
    companyContext?: string;
    conversationState?: { summary?: string; recentMessages: ReplyMessage[]; totalMessages: number };
    onTraceEvent?: (event: KloelStreamEvent) => void;
    executeLocalTool?: LocalToolExecutor;
  }): Promise<string> {
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
      buildChatModelMessages: (p) => this.buildChatModelMessages(p),
      buildDynamicRuntimeContext: (p) => this.buildDynamicRuntimeContext(p),
    });
  }
}
