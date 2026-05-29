import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import { Prisma } from '@prisma/client';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelConversationStore } from './kloel-conversation-store';
import {
  createKloelContentEvent,
  createKloelDoneEvent,
  createKloelErrorEvent,
  createKloelStatusEvent,
  createKloelThreadEvent,
  createKloelToolCallEvent,
  createKloelToolResultEvent,
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
import { KLOEL_SAFE_READ_TOOLS } from './kloel-chat-tools.definition';
import type { LocalToolExecutor } from './kloel-reply-engine.service';
import { appendToolResultProof, formatToolResult } from './guest-chat.action-intent.helpers';
import {
  buildDeterministicCallId,
  buildResponseVersionId,
} from './kloel-thinker.substrate.helpers';
import { emitCognitionAlias } from './event-taxonomy.canonical-aliases';

/** Shape returned by detectActionIntent — kept local to avoid coupling to the deeper module. */
export interface DeterministicAction {
  tool: string;
  args: Record<string, unknown>;
}

const KLOEL_TOOL_PLANNING_WORKSPACE_REQUIRED = 'workspaceId is required for Kloel tool planning';

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
      id: buildResponseVersionId(clientRequestId),
      content: normalizedText,
      createdAt: completedAt,
      source: 'initial',
    },
  ];
  if (workspaceId) {
    await planLimits.trackAiUsage(workspaceId, estimatedTokens).catch(() => {});
  }
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
    await threadService.maybeRefreshThreadSummary(
      thread.id,
      workspaceId,
      replyEngine.openai ?? undefined,
    );
    const title = await threadService.maybeGenerateThreadTitle(
      thread.id,
      thread.title ?? '',
      message,
      workspaceId,
      replyEngine.openai ?? undefined,
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
    ...(workspaceId !== undefined ? { workspaceId } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    ...(effectiveCompanyContext !== undefined ? { composerContext: effectiveCompanyContext } : {}),
    ...(signal !== undefined ? { signal } : {}),
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
    await threadService.maybeRefreshThreadSummary(
      thread.id,
      workspaceId,
      replyEngine.openai ?? undefined,
    );
    const title = await threadService.maybeGenerateThreadTitle(
      thread.id,
      thread.title ?? '',
      message,
      workspaceId,
      replyEngine.openai ?? undefined,
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
  requestedAllowedTools: string[] | undefined,
  signal: AbortSignal | undefined,
  streamWriterResponse: (
    msgs: ChatCompletionMessageParam[],
    temp: number,
  ) => Promise<{ fullResponse: string; estimatedTokens: number } | null>,
  ctx: ThinkBranchContext,
  prebuiltCognitiveState?: Record<string, unknown>,
): Promise<void> {
  const { workspaceId, userId, message, safeWrite, replyEngine, planLimits } = ctx;
  if (!workspaceId) {
    const error = new Error();
    error.message = KLOEL_TOOL_PLANNING_WORKSPACE_REQUIRED;
    throw error;
  }
  safeWrite(createKloelStatusEvent('thinking'));
  await planLimits.ensureTokenBudget(workspaceId ?? '');
  const allowedTools =
    requestedAllowedTools === undefined
      ? KLOEL_SAFE_READ_TOOLS
      : KLOEL_SAFE_READ_TOOLS.filter((tool) => {
          const name = 'function' in tool ? tool.function?.name : undefined;
          return typeof name === 'string' && requestedAllowedTools.includes(name);
        });
  const initialResponse = await chatCompletionWithFallback(
    replyEngine.openai!,
    {
      model: resolveBackendOpenAIModel('brain'),
      messages,
      tools: allowedTools,
      tool_choice: allowedTools.length > 0 ? 'auto' : 'none',
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
    .trackAiUsage(workspaceId ?? '', initialResponse?.usage?.total_tokens ?? 500)
    .catch(() => {});
  const assistantMsg = initialResponse.choices[0]?.message;
  const assistantText = assistantMsg?.content || '';
  if (assistantMsg?.tool_calls?.length) {
    const { toolMessages, usedSearchWeb } = await replyEngine.toolRouter.executeAssistantToolCalls({
      assistantMessage: assistantMsg,
      workspaceId: workspaceId ?? '',
      ...(userId !== undefined ? { userId } : {}),
      ...(requestedAllowedTools !== undefined ? { allowedTools: requestedAllowedTools } : {}),
      safeWrite,
      executeLocalTool,
    });
    const finalTemp = usedSearchWeb ? 0.1 : responseTemperature;
    await planLimits.ensureTokenBudget(workspaceId ?? '');
    const streamedFinal = await streamWriterResponse(
      await replyEngine.buildChatModelMessages({
        systemPrompt,
        dynamicContext,
        marketingPromptAddendum,
        summaryMessage,
        recentMessages: [],
        ...(prebuiltCognitiveState !== undefined ? { prebuiltCognitiveState } : {}),
        userMessage: message,
        assistantMessage: assistantMsg,
        toolMessages,
        workspaceId,
      }),
      finalTemp,
    );
    if (!streamedFinal) {
      return;
    }
    let finalResp = streamedFinal.fullResponse.trim();
    if (!finalResp) {
      finalResp =
        'Fechei a ação, mas a resposta veio vazia. Me chama de novo que eu continuo do ponto certo.';
      safeWrite(createKloelErrorEvent({ content: finalResp, error: 'empty_stream', done: false }));
    }
    await finalizeSuccessfulReply(finalResp, streamedFinal.estimatedTokens, ctx);
    return;
  }
  await planLimits.ensureTokenBudget(workspaceId ?? '');
  const streamedReply = await streamWriterResponse(messages, responseTemperature);
  if (!streamedReply) {
    return;
  }
  let fallbackText = streamedReply.fullResponse.trim();
  if (!fallbackText) {
    fallbackText =
      assistantText ||
      'Eu li o que você mandou, mas a resposta saiu vazia aqui. Manda de novo que eu sigo.';
    safeWrite(createKloelErrorEvent({ content: fallbackText, error: 'empty_stream', done: false }));
  }
  await finalizeSuccessfulReply(fallbackText, streamedReply.estimatedTokens, ctx);
}

/** Context required to drive the deterministic-action SSE branch (no LLM). */
export interface DeterministicActionBranchContext {
  workspaceId: string;
  userId: string | undefined;
  message: string;
  mode: string;
  metadata: Prisma.InputJsonValue | undefined;
  conversationId: string | undefined;
  processingTraceEntries: StoredProcessingTraceEntry[];
  safeWrite: (event: KloelStreamEvent) => void;
  streamWriter: KloelStreamWriter;
  threadService: KloelThreadService;
  replyEngine: KloelReplyEngineService;
  conversationStore: KloelConversationStore;
  planLimits: PlanLimitsService;
}

/** Type alias for finalizeSuccessfulReply — kept narrow so the helper stays unit-testable. */
export type FinalizeReplyFn = typeof finalizeSuccessfulReply;

/**
 * Runs the deterministic-action SSE branch: persist thread message, invoke the
 * local tool, emit tool_call / tool_result / content events, finalize the reply.
 * Extracted from KloelThinkerService.think to keep the orchestrator slim.
 *
 * `finalizeReply` is injected so tests can mock `finalizeSuccessfulReply` at the
 * service-import boundary (jest.mock of this module overrides the exported binding,
 * but not the in-module reference, so the service forwards the mocked binding).
 */
export async function runDeterministicActionBranch(
  action: DeterministicAction,
  executeLocalTool: LocalToolExecutor,
  ctx: DeterministicActionBranchContext,
  finalizeReply: FinalizeReplyFn = finalizeSuccessfulReply,
): Promise<void> {
  const {
    workspaceId,
    userId,
    message,
    mode,
    metadata,
    conversationId,
    processingTraceEntries,
    safeWrite,
    streamWriter,
    threadService,
    replyEngine,
    conversationStore,
    planLimits,
  } = ctx;
  const clientRequestId = threadService.resolveClientRequestId(metadata);
  const thread = await threadService.resolveThread(workspaceId, conversationId);
  if (thread?.id) {
    safeWrite(createKloelThreadEvent(thread.id, thread.title));
  }
  const persistedUserMessage = thread?.id
    ? await threadService.persistUserThreadMessage(
        thread.id,
        workspaceId,
        message,
        threadService.buildThreadMessageMetadata(metadata, {
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
    replyEngine,
    threadService,
    conversationStore,
    planLimits,
  };
  const callId = buildDeterministicCallId(clientRequestId);
  safeWrite(createKloelStatusEvent('tool_calling', `Executando ${action.tool}.`));
  safeWrite(createKloelToolCallEvent(callId, action.tool, action.args));
  let toolResult: unknown;
  try {
    toolResult = await executeLocalTool(workspaceId, action.tool, action.args, userId);
  } catch (error: unknown) {
    toolResult = {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'tool_execution_failed',
    };
  }
  const toolResultRecord =
    toolResult !== null && typeof toolResult === 'object' && !Array.isArray(toolResult)
      ? (toolResult as Record<string, unknown>)
      : {};
  const toolSucceeded = toolResultRecord.success !== false;
  const toolError =
    typeof toolResultRecord.error === 'string'
      ? toolResultRecord.error
      : toolSucceeded
        ? undefined
        : 'tool_execution_failed';
  safeWrite(createKloelStatusEvent('tool_result', `Resultado de ${action.tool}.`));
  safeWrite(
    createKloelToolResultEvent({
      callId,
      tool: action.tool,
      success: toolSucceeded,
      result: toolResult,
      ...(toolError !== undefined ? { error: toolError } : {}),
    }),
  );
  const reply = appendToolResultProof(formatToolResult(action.tool, toolResult), toolResult);
  safeWrite(createKloelContentEvent(reply));
  await finalizeReply(reply, 0, branchCtx);
}

/** Minimal logger surface used by spine persistence (avoids a hard dep on Nest). */
interface SpineWarnLogger {
  warn(message: string): void;
}

/**
 * Persists a conversational chat turn to the cognitive spine (autopilotEvent)
 * so cross-session memory is fed. Fire-and-forget — never blocks the reply.
 * Extracted from KloelThinkerService.think.
 */
export function persistChatTurnToSpine(
  prisma: PrismaService,
  logger: SpineWarnLogger,
  params: {
    workspaceId: string;
    message: string;
    fullResponse: string;
    mode: string;
    conversationId: string | undefined;
  },
): void {
  const { workspaceId, message, fullResponse, mode, conversationId } = params;
  // Dual-emit: legacy `kloel.chat.turn` + canonical `cognition.chat.turn`
  // per docs/architecture/EVENT_TAXONOMY_MIGRATION.md. Both rows are
  // persisted so cognitive readers can be migrated independently.
  const chatTurnMeta: Prisma.InputJsonValue = {
    userPreview: message.slice(0, 280),
    replyPreview: fullResponse.slice(0, 280),
    mode,
    conversationId: conversationId ?? null,
  };
  emitCognitionAlias(
    (eventName) => {
      void prisma.autopilotEvent
        .create({
          data: {
            workspaceId,
            intent: 'kloel_chat_turn',
            action: eventName,
            status: 'executed',
            meta: chatTurnMeta,
          },
        })
        .catch((e: unknown) => {
          logger.warn(
            `chat-turn spine persist failed (${eventName}): ${e instanceof Error ? e.message : 'unknown'}`,
          );
        });
    },
    'kloel.chat.turn',
    { workspaceId },
  );
}
