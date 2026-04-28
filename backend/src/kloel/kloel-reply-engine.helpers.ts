import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { KloelContextFormatter } from './kloel-context-formatter';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelToolRouter } from './kloel-tool-router';
import { createKloelStatusEvent, type KloelStreamEvent } from './kloel-stream-events';
import {
  KLOEL_ONBOARDING_PROMPT,
  KLOEL_SALES_PROMPT,
  buildKloelResponseEnginePrompt,
} from './kloel.prompts';
import { chatCompletionWithFallback } from './openai-wrapper';
import { KLOEL_CHAT_TOOLS } from './kloel-chat-tools.definition';
import type { ExpertiseLevel, LocalToolExecutor, ReplyMessage } from './kloel-reply-engine.service';

export const KLOEL_STREAM_ABORT_REASON_TIMEOUT = 'request_timeout';
export const KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED = 'client_disconnected';

export const WHITESPACE_RE = /\s+/;
export const RELAT_O__RIO_DOCUMENTO_RE =
  /(relat[oó]rio|documento|guia completo|an[aá]lise completa|plano completo|estrat[eé]gia completa|2000|2\.000|sum[aá]rio executivo|diagn[oó]stico)/i;
export const CRIE_CADASTRAR_CADASTRE_RE =
  /(crie|cadastrar|cadastre|salve|liste|mostre|remova|delete|apague|ative|desative|ligue|desligue|conecte|conectar|envie|mande|sincronize|pesquise|busque|procure|pesquisar|buscar|abrir|feche|fechar|atualize|consultar|consulte|verifique|verificar|quero|preciso|gere|fa[cç]a|fazer|traga|me d[eê]|o que est[aá]|quais s[aã]o|qual [ée]|tem|existem)/i;
export const PRODUTO_CAT_A__LOGO_AUT_RE =
  /(produto|cat[aá]logo|autopilot|marca|voz|brand voice|fluxo|flow|dashboard|painel|whatsapp|contato|contatos|chat|chats|mensagem|mensagens|backlog|hist[oó]rico|presen[cç]a|presence|link de pagamento|pagamento|payment|web|internet|google|site|landing|homepage|copy|email|campanha|campanhas|checkout|carrinho|afiliad|seo|not[ií]cia|noticias|hoje|status)/i;

type UnknownRecord = Record<string, unknown>;

/** Builds the dynamic runtime context string for the reply engine. */
export async function buildDynamicRuntimeContextHelper(params: {
  workspaceId?: string;
  userId?: string;
  userName?: string;
  expertiseLevel: ExpertiseLevel;
  companyContext?: string;
  prisma: PrismaService;
  wsContextService: KloelWorkspaceContextService;
  contextFormatter: KloelContextFormatter;
}): Promise<string> {
  const {
    workspaceId,
    userId,
    userName,
    expertiseLevel,
    companyContext,
    prisma,
    wsContextService,
    contextFormatter,
  } = params;

  const baseContext = workspaceId
    ? await wsContextService.getWorkspaceContext(workspaceId, userId)
    : '';

  if (!workspaceId) {
    return [
      '<user_context>',
      `Nível de expertise detectado: ${expertiseLevel}`,
      companyContext ? `Contexto adicional: ${companyContext}` : null,
      baseContext ? `Contexto conhecido:\n${baseContext}` : null,
      '</user_context>',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const countThreads =
    typeof prisma.chatThread.count === 'function'
      ? prisma.chatThread.count({ where: { workspaceId } })
      : (async () => {
          const t = await prisma.chatThread.findFirst({
            where: { workspaceId },
            select: { id: true },
          });
          return t ? 1 : 0;
        })();

  const [workspace, agent, threadCount] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        providerSettings: true,
        customDomain: true,
        branding: true,
        stripeCustomerId: true,
        updatedAt: true,
      },
    }),
    userId
      ? prisma.agent.findFirst({
          where: { id: userId, workspaceId },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            provider: true,
            avatarUrl: true,
            publicName: true,
            bio: true,
            website: true,
            instagram: true,
            role: true,
            displayRole: true,
            isOnline: true,
            emailVerified: true,
            kycStatus: true,
            kycSubmittedAt: true,
            kycApprovedAt: true,
            kycRejectedReason: true,
            permissions: true,
            persona: { select: { name: true, role: true } },
          },
        })
      : Promise.resolve(null),
    countThreads,
  ]);

  const providerSettings =
    workspace?.providerSettings && typeof workspace.providerSettings === 'object'
      ? (workspace.providerSettings as UnknownRecord)
      : {};
  const autopilotSettings =
    providerSettings.autopilot && typeof providerSettings.autopilot === 'object'
      ? (providerSettings.autopilot as UnknownRecord)
      : {};
  const whatsappConnected =
    providerSettings.whatsappConnected === true ||
    (providerSettings.whatsapp as UnknownRecord | null)?.connected === true ||
    (providerSettings.connection as UnknownRecord | null)?.status === 'connected' ||
    providerSettings.status === 'connected';
  const resolvedUserName = contextFormatter.sanitizeUserNameForAssistant(
    userName || agent?.name || 'Usuário',
  );

  return [
    '<user_context>',
    `Nome do usuário: ${resolvedUserName}`,
    `Email do usuário: ${agent?.email || 'não informado'}`,
    `Workspace: Workspace`,
    `Nível de expertise detectado: ${expertiseLevel}`,
    `WhatsApp conectado: ${whatsappConnected ? 'Sim' : 'Não'}`,
    `Autopilot ativo: ${autopilotSettings.enabled === true ? 'Sim' : 'Não'}`,
    `Conversas registradas: ${threadCount}`,
    contextFormatter.buildAgentProfileContext(agent as UnknownRecord | null | undefined),
    `Quando fizer sentido, trate o usuário pelo primeiro nome "${resolvedUserName}" de forma natural ao longo da conversa.`,
    companyContext ? `Contexto adicional enviado pelo frontend:\n${companyContext}` : null,
    baseContext ? `Base de contexto do workspace:\n${baseContext}` : null,
    '</user_context>',
  ]
    .filter(Boolean)
    .join('\n');
}

type ChatCompletionMessageParam = OpenAI.Chat.ChatCompletionMessageParam;

/** Deps injected into buildAssistantReplyImpl to avoid circular DI. */
export interface BuildAssistantReplyDeps {
  openai: OpenAI;
  prisma: PrismaService;
  planLimits: PlanLimitsService;
  threadService: KloelThreadService;
  wsContextService: KloelWorkspaceContextService;
  contextFormatter: KloelContextFormatter;
  toolRouter: KloelToolRouter;
  unavailableMessage: string;
  hasOpenAiKey: () => boolean;
  buildDashboardPrompt: (params?: {
    userName?: string | null;
    workspaceName?: string | null;
    expertiseLevel?: ExpertiseLevel;
  }) => string;
  detectExpertiseLevel: (message: string, history?: ReplyMessage[]) => ExpertiseLevel;
  shouldUseLongFormBudget: (message: string) => boolean;
  buildMarketingPromptAddendum: (
    workspaceId: string | undefined,
    mode: string | undefined,
    message: string,
  ) => Promise<string | null>;
  buildChatModelMessages: (params: {
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
  }) => ChatCompletionMessageParam[];
  buildDynamicRuntimeContext: (params: {
    workspaceId?: string;
    userId?: string;
    userName?: string;
    expertiseLevel: ExpertiseLevel;
    companyContext?: string;
  }) => Promise<string>;
}

/** buildAssistantReply extracted to keep KloelReplyEngineService ≤ 400 lines. */
export async function buildAssistantReplyImpl(
  params: {
    message: string;
    workspaceId?: string;
    userId?: string;
    userName?: string;
    mode?: 'chat' | 'onboarding' | 'sales';
    companyContext?: string;
    conversationState?: { summary?: string; recentMessages: ReplyMessage[]; totalMessages: number };
    onTraceEvent?: (event: KloelStreamEvent) => void;
    executeLocalTool?: LocalToolExecutor;
  },
  deps: BuildAssistantReplyDeps,
): Promise<string> {
  const {
    message,
    workspaceId,
    userId,
    userName: reqUserName,
    mode = 'chat',
    companyContext,
    conversationState,
    onTraceEvent,
    executeLocalTool,
  } = params;
  const { openai, prisma, planLimits, threadService, wsContextService, toolRouter } = deps;

  if (!deps.hasOpenAiKey() && !process.env.ANTHROPIC_API_KEY) return deps.unavailableMessage;

  const companyName = 'sua empresa';
  let userName = 'Usuário';
  if (workspaceId) {
    const [, agent] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId } }),
      userId
        ? prisma.agent.findFirst({
            where: { id: userId, workspaceId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);
    userName = deps.contextFormatter.sanitizeUserNameForAssistant(
      reqUserName || agent?.name || userName,
    );
  }

  const historyState = conversationState || { recentMessages: [], totalMessages: 0 };
  const expertiseLevel = deps.detectExpertiseLevel(message, historyState.recentMessages);
  const dynamicContext = await deps.buildDynamicRuntimeContext({
    workspaceId,
    userId,
    userName,
    expertiseLevel,
    companyContext,
  });
  const summaryMessage = threadService.buildThreadSummarySystemMessage(historyState.summary);
  const marketingPromptAddendum = await deps.buildMarketingPromptAddendum(
    workspaceId,
    mode,
    message,
  );
  const responseMaxTokens = deps.shouldUseLongFormBudget(message) ? 4096 : 2048;
  const responseTemperature = 0.7;

  let systemPrompt: string;
  switch (mode) {
    case 'onboarding':
      systemPrompt = KLOEL_ONBOARDING_PROMPT;
      break;
    case 'sales':
      systemPrompt = KLOEL_SALES_PROMPT(
        companyName,
        await wsContextService.getWorkspaceContext(workspaceId || '', userId),
      );
      break;
    default:
      systemPrompt = deps.buildDashboardPrompt({
        userName,
        workspaceName: companyName,
        expertiseLevel,
      });
  }

  const messages = deps.buildChatModelMessages({
    systemPrompt,
    dynamicContext,
    marketingPromptAddendum,
    summaryMessage,
    recentMessages: historyState.recentMessages,
    userMessage: message,
  });
  onTraceEvent?.(createKloelStatusEvent('thinking'));
  if (workspaceId) await planLimits.ensureTokenBudget(workspaceId);

  const isChatMode = mode === 'chat';
  const response = await chatCompletionWithFallback(
    openai,
    {
      model: resolveBackendOpenAIModel(isChatMode ? 'brain' : 'writer'),
      messages,
      tools: isChatMode ? KLOEL_CHAT_TOOLS : undefined,
      tool_choice: isChatMode ? 'auto' : undefined,
      temperature: responseTemperature,
      top_p: 0.95,
      frequency_penalty: 0.3,
      presence_penalty: 0.2,
      max_tokens: responseMaxTokens,
    },
    resolveBackendOpenAIModel(isChatMode ? 'brain_fallback' : 'writer_fallback'),
  );
  if (workspaceId)
    await planLimits
      .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 500)
      .catch(() => {});

  const initialMsg = response.choices[0]?.message;
  let assistantMessage = initialMsg?.content || deps.unavailableMessage;

  if (mode === 'chat' && initialMsg?.tool_calls?.length && workspaceId && executeLocalTool) {
    onTraceEvent?.(createKloelStatusEvent('thinking'));
    const { toolMessages, usedSearchWeb } = await toolRouter.executeAssistantToolCalls({
      assistantMessage: initialMsg,
      workspaceId,
      userId,
      safeWrite: onTraceEvent,
      executeLocalTool,
    });
    onTraceEvent?.(createKloelStatusEvent('tool_result'));
    await planLimits.ensureTokenBudget(workspaceId);
    const finalResponse = await chatCompletionWithFallback(
      openai,
      {
        model: resolveBackendOpenAIModel('writer'),
        messages: deps.buildChatModelMessages({
          systemPrompt,
          dynamicContext,
          marketingPromptAddendum,
          summaryMessage,
          recentMessages: historyState.recentMessages,
          userMessage: message,
          assistantMessage: initialMsg,
          toolMessages,
        }),
        temperature: usedSearchWeb ? 0.1 : responseTemperature,
        top_p: 0.95,
        frequency_penalty: 0.3,
        presence_penalty: 0.2,
        max_tokens: responseMaxTokens,
      },
      resolveBackendOpenAIModel('writer_fallback'),
    );
    await planLimits
      .trackAiUsage(workspaceId, finalResponse?.usage?.total_tokens ?? 500)
      .catch(() => {});
    assistantMessage = finalResponse.choices[0]?.message?.content || assistantMessage;
  }

  onTraceEvent?.(createKloelStatusEvent('streaming_token'));
  return assistantMessage;
}

/** Builds the dashboard system prompt (helper for use outside the service). */
export function buildKloelDashboardPrompt(params: {
  currentDate: string;
  userName?: string | null;
  workspaceName?: string | null;
  expertiseLevel?: ExpertiseLevel;
}): string {
  return buildKloelResponseEnginePrompt(params);
}
