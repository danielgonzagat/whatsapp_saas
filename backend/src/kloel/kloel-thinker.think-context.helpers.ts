/**
 * Context-resolution helpers extracted from KloelThinkerService.think()
 * to keep the service under 450 LOC.
 *
 * Pure orchestration: resolves workspace, thread, conversation history,
 * expertise level, dynamic runtime context, tool-planning flag, and
 * response parameters before the ABI/tool branches run.
 */

import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import type { KloelThreadService } from './kloel-thread.service';
import type { KloelReplyEngineService } from './kloel-reply-engine.service';
import type { ExpertiseLevel } from './kloel-reply-engine.types';
import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import { LLM_MAX_COMPLETION_TOKENS } from './openai-wrapper'; /** Resolved context returned by {@link resolveThinkContext}. */
export interface ResolvedThinkContext {
  companyName: string;
  userName: string;
  marketingPromptAddendum: string;
  thread: {
    id: string;
    title: string;
    summary: string | null;
    summaryUpdatedAt: Date | null;
  } | null;
  historyState: {
    summary?: string;
    recentMessages: import('./kloel-thread.service').ChatMessage[];
    totalMessages: number;
  };
  expertiseLevel: ExpertiseLevel;
  dynamicContext: string;
  summaryMessage: ChatCompletionMessageParam | null;
  shouldPlanWithTools: boolean;
  responseTemperature: number;
  responseMaxTokens: number;
  clientRequestId: string;
} /**
 * Resolve workspace, thread, conversation history, expertise level,
 * dynamic runtime context, tool-planning flag, and response parameters
 * for the streaming think loop.
 *
 * Extracted from `KloelThinkerService.think()` to keep the service
 * under 450 LOC.
 */
export async function resolveThinkContext(params: {
  prisma: PrismaService;
  wsContextService: KloelWorkspaceContextService;
  threadService: KloelThreadService;
  replyEngine: KloelReplyEngineService;
  workspaceId: string | undefined;
  userId: string | undefined;
  reqUserName: string | undefined;
  conversationId: string | undefined;
  mode: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
  enrichedCompanyContext: string | undefined;
}): Promise<ResolvedThinkContext> {
  const {
    prisma,
    wsContextService,
    threadService,
    replyEngine,
    workspaceId,
    userId,
    reqUserName,
    conversationId,
    mode,
    message,
    metadata,
    enrichedCompanyContext,
  } = params;

  let _context = enrichedCompanyContext || '';
  let companyName = 'sua empresa';
  let userName = 'Usuário';
  const marketingPromptAddendum = await replyEngine.buildMarketingPromptAddendum(
    workspaceId,
    mode,
    message,
  );
  const thread =
    workspaceId && mode === 'chat'
      ? await threadService.resolveThread(workspaceId, conversationId)
      : null;

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
    companyName = 'sua empresa';
    _context = await wsContextService.getWorkspaceContext(workspaceId, userId);
    if (enrichedCompanyContext) {
      _context = [_context, enrichedCompanyContext].filter(Boolean).join('\n\n');
    }
    userName = replyEngine.contextFormatter.sanitizeUserNameForAssistant(
      reqUserName || agent?.name || userName,
    );
  }

  const historyState = thread?.id
    ? await threadService.getThreadConversationState(thread.id, workspaceId)
    : { recentMessages: [], totalMessages: 0 };
  const expertiseLevel = replyEngine.detectExpertiseLevel(message, historyState.recentMessages);
  const dynamicContext = await replyEngine.buildDynamicRuntimeContext({
    ...(workspaceId !== undefined ? { workspaceId } : {}),
    ...(userId !== undefined ? { userId } : {}),
    userName,
    expertiseLevel,
    ...(enrichedCompanyContext !== undefined ? { companyContext: enrichedCompanyContext } : {}),
  });
  const summaryMessage = threadService.buildThreadSummarySystemMessage(historyState.summary);
  const shouldPlanWithTools =
    mode === 'chat' && !!workspaceId && replyEngine.shouldAttemptToolPlanningPass(message);
  // No hardcoded output cap: operator/model decides via the
  // LLM_MAX_COMPLETION_TOKENS env (DeepSeek V4 Pro's real ceiling).
  // Long-form signal kept for telemetry; it no longer halves replies.
  void replyEngine.shouldUseLongFormBudget(message);
  const responseTemperature = 0.7;
  const responseMaxTokens = LLM_MAX_COMPLETION_TOKENS;
  const clientRequestId = threadService.resolveClientRequestId(metadata);

  return {
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
  };
}
