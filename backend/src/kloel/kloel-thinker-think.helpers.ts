import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import { Prisma } from '@prisma/client';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelConversationStore } from './kloel-conversation-store';
import { buildTimestampedRuntimeId } from './kloel-id.util';
import {
  createKloelContentEvent,
  createKloelDoneEvent,
  createKloelErrorEvent,
  createKloelStatusEvent,
  createKloelThreadEvent,
  type KloelStreamEvent,
} from './kloel-stream-events';
import { KloelStreamWriter } from './kloel-stream-writer';
import {
  KloelThreadService,
  StoredProcessingTraceEntry,
  StoredResponseVersion,
} from './kloel-thread.service';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import { KLOEL_CHAT_TOOLS } from './kloel-chat-tools.definition';
import type { LocalToolExecutor } from './kloel-reply-engine.service';

/** Context shared between the two extracted think branches. */
export interface ThinkBranchContext {
  workspaceId: string | undefined;
  userId: string | undefined;
  message: string;
  mode: string;
  metadata: Prisma.InputJsonValue | undefined;
  clientRequestId: string | undefined;
  thread: { id: string; title: string | null } | null;
  persistedUserMessage: { id: string } | null;
  processingTraceEntries: StoredProcessingTraceEntry[];
  safeWrite: (event: KloelStreamEvent) => void;
  streamWriter: KloelStreamWriter;
  replyEngine: KloelReplyEngineService;
  threadService: KloelThreadService;
  conversationStore: KloelConversationStore;
  planLimits: PlanLimitsService;
}

/** Finalizes a successful streaming reply: persist, refresh summary, emit done. */
export async function finalizeSuccessfulReply(
  assistantText: string,
  estimatedTokens: number,
  ctx: ThinkBranchContext,
): Promise<void> {
  const {
    workspaceId,
    message,
    mode,
    clientRequestId,
    thread,
    persistedUserMessage,
    processingTraceEntries,
    safeWrite,
    streamWriter,
    replyEngine,
    threadService,
    conversationStore,
    planLimits,
  } = ctx;
  const normalizedText = assistantText.trim() || replyEngine.unavailableMessage;
  const completedAt = new Date().toISOString();
  const responseVersions: StoredResponseVersion[] = [
    {
      id: clientRequestId ? `resp_${clientRequestId}` : buildTimestampedRuntimeId('resp'),
      content: normalizedText,
      createdAt: completedAt,
      source: 'initial',
    },
  ];
  if (workspaceId) await planLimits.trackAiUsage(workspaceId, estimatedTokens).catch(() => {});
  if (thread?.id && workspaceId) {
    await threadService.persistAssistantThreadMessage(
      thread.id,
      workspaceId,
      normalizedText,
      threadService.buildThreadMessageMetadata(undefined, {
        clientRequestId,
        mode,
        transport: 'sse',
        requestState: 'completed',
        replyToMessageId: persistedUserMessage?.id,
        responseVersions,
        activeResponseVersionIndex: Math.max(responseVersions.length - 1, 0),
        processingTrace: processingTraceEntries,
        processingSummary: threadService.buildProcessingTraceSummary(processingTraceEntries),
      }),
    );
    await threadService.maybeRefreshThreadSummary(thread.id, workspaceId, replyEngine.openai);
    const title = await threadService.maybeGenerateThreadTitle(
      thread.id,
      thread.title,
      message,
      workspaceId,
      replyEngine.openai,
    );
    safeWrite(createKloelThreadEvent(thread.id, title));
  }
  if (workspaceId) {
    await conversationStore.saveMessage(workspaceId, 'user', message);
    await conversationStore.saveMessage(workspaceId, 'assistant', normalizedText);
  }
  safeWrite(createKloelDoneEvent());
  streamWriter.close();
}

/** Runs the composer-capability SSE branch (create_image / create_site / search_web). */
export async function runComposerCapabilityBranch(
  composerCapability: 'create_image' | 'create_site' | 'search_web',
  effectiveCompanyContext: string | undefined,
  signal: AbortSignal | undefined,
  composerService: KloelComposerService,
  ctx: ThinkBranchContext,
): Promise<void> {
  const {
    workspaceId,
    userId: _userId,
    message,
    mode,
    metadata,
    clientRequestId,
    thread,
    persistedUserMessage,
    safeWrite,
    streamWriter,
    replyEngine,
    threadService,
    conversationStore,
  } = ctx;
  safeWrite(createKloelStatusEvent('thinking'));
  const capResult = await composerService.executeComposerCapability({
    capability: composerCapability,
    message,
    workspaceId,
    metadata,
    composerContext: effectiveCompanyContext,
    signal,
  });
  safeWrite(createKloelStatusEvent('streaming_token'));
  safeWrite(createKloelContentEvent(capResult.content));
  if (thread?.id && workspaceId) {
    await threadService.persistAssistantThreadMessage(
      thread.id,
      workspaceId,
      capResult.content,
      threadService.buildThreadMessageMetadata(undefined, {
        clientRequestId,
        mode,
        transport: 'sse',
        requestState: 'completed',
        replyToMessageId: persistedUserMessage?.id,
        capability: composerCapability,
        ...(capResult.metadata || {}),
      }),
    );
    await threadService.maybeRefreshThreadSummary(thread.id, workspaceId, replyEngine.openai);
    const title = await threadService.maybeGenerateThreadTitle(
      thread.id,
      thread.title,
      message,
      workspaceId,
      replyEngine.openai,
    );
    safeWrite(createKloelThreadEvent(thread.id, title));
  }
  if (workspaceId) {
    await conversationStore.saveMessage(workspaceId, 'user', message);
    await conversationStore.saveMessage(workspaceId, 'assistant', capResult.content);
  }
  safeWrite(createKloelDoneEvent());
  streamWriter.close();
}

/** Runs the tool-planning SSE branch (chat mode with tool calls). */
export async function runToolPlanningBranch(
  messages: ChatCompletionMessageParam[],
  systemPrompt: string,
  dynamicContext: string,
  marketingPromptAddendum: string | null,
  summaryMessage: ChatCompletionMessageParam | null,
  responseTemperature: number,
  responseMaxTokens: number,
  executeLocalTool: LocalToolExecutor,
  signal: AbortSignal | undefined,
  streamWriterResponse: (
    msgs: ChatCompletionMessageParam[],
    temp: number,
  ) => Promise<{ fullResponse: string; estimatedTokens: number } | null>,
  ctx: ThinkBranchContext,
): Promise<void> {
  const { workspaceId, userId, message, safeWrite, replyEngine, planLimits } = ctx;
  safeWrite(createKloelStatusEvent('thinking'));
  await planLimits.ensureTokenBudget(workspaceId);
  const initialResponse = await chatCompletionWithFallback(
    replyEngine.openai,
    {
      model: resolveBackendOpenAIModel('brain'),
      messages,
      tools: KLOEL_CHAT_TOOLS,
      tool_choice: 'auto',
      temperature: responseTemperature,
      top_p: 0.95,
      frequency_penalty: 0.3,
      presence_penalty: 0.2,
      max_tokens: responseMaxTokens,
    },
    resolveBackendOpenAIModel('brain_fallback'),
    { maxRetries: 3, initialDelayMs: 500 },
    signal ? { signal } : undefined,
  );
  await planLimits
    .trackAiUsage(workspaceId, initialResponse?.usage?.total_tokens ?? 500)
    .catch(() => {});
  const assistantMsg = initialResponse.choices[0]?.message;
  const assistantText = assistantMsg?.content || '';
  if (assistantMsg?.tool_calls?.length) {
    const { toolMessages, usedSearchWeb } = await replyEngine.toolRouter.executeAssistantToolCalls({
      assistantMessage: assistantMsg,
      workspaceId: workspaceId,
      userId,
      safeWrite,
      executeLocalTool,
    });
    const finalTemp = usedSearchWeb ? 0.1 : responseTemperature;
    await planLimits.ensureTokenBudget(workspaceId);
    const streamedFinal = await streamWriterResponse(
      replyEngine.buildChatModelMessages({
        systemPrompt,
        dynamicContext,
        marketingPromptAddendum,
        summaryMessage,
        recentMessages: [],
        userMessage: message,
        assistantMessage: assistantMsg,
        toolMessages,
      }),
      finalTemp,
    );
    if (!streamedFinal) return;
    let finalResp = streamedFinal.fullResponse.trim();
    if (!finalResp) {
      finalResp =
        'Fechei a ação, mas a resposta veio vazia. Me chama de novo que eu continuo do ponto certo.';
      safeWrite(createKloelErrorEvent({ content: finalResp, error: 'empty_stream', done: false }));
    }
    await finalizeSuccessfulReply(finalResp, streamedFinal.estimatedTokens, ctx);
    return;
  }
  await planLimits.ensureTokenBudget(workspaceId);
  const streamedReply = await streamWriterResponse(messages, responseTemperature);
  if (!streamedReply) return;
  let fallbackText = streamedReply.fullResponse.trim();
  if (!fallbackText) {
    fallbackText =
      assistantText ||
      'Eu li o que você mandou, mas a resposta saiu vazia aqui. Manda de novo que eu sigo.';
    safeWrite(createKloelErrorEvent({ content: fallbackText, error: 'empty_stream', done: false }));
  }
  await finalizeSuccessfulReply(fallbackText, streamedReply.estimatedTokens, ctx);
}
