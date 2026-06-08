import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import { Prisma } from '@prisma/client';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { LLMBudgetService } from './llm-budget.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelComposerService, type CapabilityExecutionResult } from './kloel-composer.service';
import {
  ERR_IMAGE_API_KEY_MISSING,
  ERR_SITE_API_KEY_MISSING,
} from './kloel-composer.service.helpers';
import { KloelConversationStore } from './kloel-conversation-store';
import {
  createKloelContentEvent,
  createKloelDoneEvent,
  createKloelPublicStreamingLabel,
  createKloelPublicThinkingLabel,
  createKloelStatusEvent,
  createKloelThreadEvent,
  createKloelToolCallEvent,
  createKloelToolResultEvent,
  sanitizeKloelAssistantVisibleText,
  type KloelStreamEvent,
} from './kloel-stream-events';
import { KloelStreamWriter } from './kloel-stream-writer';
import {
  KloelThreadService,
  StoredProcessingTraceEntry,
  StoredResponseVersion,
} from './kloel-thread.service';
import { extractExecutablePreResponseFromAssistantText } from './kloel-thread.helpers';
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
import type { IntentRouterService } from './intent-router/intent-router.service';
import {
  buildReceipt,
  writeOperationReceiptWithAudit,
  type AuditLogSink,
} from './operation-receipt.helpers';

/** Shape returned by detectActionIntent — kept local to avoid coupling to the deeper module. */
export interface DeterministicAction {
  tool: string;
  args: Record<string, unknown>;
  /** True when the matched capability is MUTATION_SENSITIVE and needs confirmation. */
  requiresConfirmation?: boolean;
  /** Required operational inputs the user still has to supply. */
  missingInputs?: string[];
}

/**
 * Classify a message through the deterministic IntentRouter BEFORE the LLM.
 *
 * Returns a {@link DeterministicAction} when the router matched a capability
 * (the organism should ACT, not chat), or `null` when the message is purely
 * conversational and should be verbalized by the LLM. This is the streaming
 * counterpart of the legacy `detectActionIntent` regex detector — wire it into
 * `KloelThinkerService.think` so the authenticated `think()` path no longer
 * sends every message straight to the model.
 */
export function classifyDeterministicIntent(
  intentRouter: IntentRouterService | undefined,
  message: string,
  surface: string,
  permissions: string[] = ['*'],
): DeterministicAction | null {
  if (!intentRouter) {
    return null;
  }
  const { classification, isChat } = intentRouter.classify(message, surface, permissions);
  if (isChat || !classification || !classification.capabilityId) {
    return null;
  }
  return {
    tool: classification.capabilityId,
    args: { ...classification.entities },
    requiresConfirmation: classification.requiresConfirmation === true,
    ...(Array.isArray(classification.missingInputs) && classification.missingInputs.length > 0
      ? { missingInputs: classification.missingInputs }
      : {}),
  };
}

/**
 * Reads the `confirmMutations` opt-in from the per-turn metadata. The frontend
 * confirmation UX sets this to `true` only after the user explicitly confirms a
 * mutation-sensitive action. Anything else (missing / false / non-boolean) keeps
 * the safe block-and-ask default on the LLM tool_call path.
 */
function readConfirmMutations(metadata: Prisma.InputJsonValue | undefined): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  return (metadata as Record<string, unknown>).confirmMutations === true;
}

const KLOEL_TOOL_PLANNING_WORKSPACE_REQUIRED = 'workspaceId is required for Kloel tool planning';
const KLOEL_TOOL_PLANNING_OPENAI_REQUIRED =
  'OpenAI client is required for Kloel tool planning';
const KLOEL_FINAL_ANSWER_NO_TOOL_MARKUP_PROMPT =
  'Passe de resposta final: escreva somente linguagem de produto. Não emita markup de ferramenta, DSML, XML/JSON de chamada de ferramenta, nomes internos de ferramenta, código cru, caminhos de arquivo, linguagens de implementação, contagem de símbolos, IDs técnicos, labels de certificação interna ou blocos de tool call. Traduza raciocínio, ações e observações já executadas para uma pré-resposta executável clara, sem expor detalhes de implementação.';

function withFinalAnswerNoToolMarkupGuard(
  messages: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  return [{ role: 'system', content: KLOEL_FINAL_ANSWER_NO_TOOL_MARKUP_PROMPT }, ...messages];
}

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
  /**
   * LLM cost ledger. When present, the composer-capability branch records the
   * provider spend (`capResult.estimatedTokens`) after a successful call so
   * paid create-image/site/search/refine turns are counted against the
   * workspace budget, matching the normal chat path's `recordSpend`. Optional
   * because branches that never call a paid provider don't need it.
   */
  llmBudget?: LLMBudgetService;
  /**
   * Durable AuditLog sink (DB / `RAC_AuditLog`). When present, every executed
   * tool on the LLM tool_call path persists an OperationReceipt to the database,
   * not only to the local `WORLD_LEDGER.jsonl` trace. Injected from the service.
   */
  audit?: AuditLogSink;
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
  const normalizedText =
    sanitizeKloelAssistantVisibleText(assistantText) || replyEngine.unavailableMessage;
  const extractedPreResponse = extractExecutablePreResponseFromAssistantText(normalizedText);
  const visibleAssistantText = extractedPreResponse.visibleContent;
  const persistedProcessingTrace =
    processingTraceEntries.length > 0
      ? processingTraceEntries
      : extractedPreResponse.processingTrace;
  const persistedProcessingSummary =
    processingTraceEntries.length > 0
      ? threadService.buildProcessingTraceSummary(persistedProcessingTrace)
      : (extractedPreResponse.processingSummary ??
        threadService.buildProcessingTraceSummary(persistedProcessingTrace));
  const completedAt = new Date().toISOString();
  const responseVersions: StoredResponseVersion[] = [
    {
      id: buildResponseVersionId(clientRequestId),
      content: visibleAssistantText,
      createdAt: completedAt,
      source: 'initial',
    },
  ];
  if (workspaceId) {
    await planLimits.trackAiUsage(workspaceId, estimatedTokens).catch(() => {
      /* best-effort: usage/budget tracking must never break the reply */
    });
  }
  // Persist only public-safe reasoning metadata. Provider chain-of-thought text is
  // intentionally blank here; duration can survive reloads without leaking content.
  const lastReasoning = streamWriter.getLastReasoning();
  if (thread?.id && workspaceId) {
    await threadService.persistAssistantThreadMessage(
      thread.id,
      workspaceId,
      visibleAssistantText,
      threadService.buildThreadMessageMetadata(undefined, {
        clientRequestId,
        mode,
        transport: 'sse',
        requestState: 'completed',
        replyToMessageId: persistedUserMessage?.id,
        responseVersions,
        activeResponseVersionIndex: Math.max(responseVersions.length - 1, 0),
        processingTrace: persistedProcessingTrace,
        processingSummary: persistedProcessingSummary,
        reasoningText: lastReasoning.text || undefined,
        reasoningDurationMs: lastReasoning.durationMs ?? undefined,
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
    await conversationStore.saveMessage(workspaceId, 'assistant', visibleAssistantText);
  }
  safeWrite(createKloelDoneEvent());
  streamWriter.close();
}

function buildComposerCapabilityTraceResult(
  composerCapability: 'create_image' | 'create_site' | 'search_web' | 'refine_response',
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const normalizedMetadata = metadata ? { ...metadata } : {};
  const generatedSiteHtml = normalizedMetadata.generatedSiteHtml;
  if (typeof generatedSiteHtml !== 'string') {
    return { ...normalizedMetadata, capability: composerCapability };
  }
  const { generatedSiteHtml: _generatedSiteHtml, ...traceMetadata } = normalizedMetadata;
  return {
    ...traceMetadata,
    capability: composerCapability,
    generatedSiteHtmlBytes: generatedSiteHtml.length,
    generatedSiteHtmlOmitted: true,
  };
}

/**
 * True only for the known missing/incomplete-configuration errors thrown by
 * {@link KloelComposerService.executeComposerCapability} — the absent
 * `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` cases (thrown as `Error` /
 * `NotFoundException` carrying {@link ERR_IMAGE_API_KEY_MISSING} /
 * {@link ERR_SITE_API_KEY_MISSING}). These are the only failures that should be
 * converted into the friendly "configuration not complete" reply. Real provider
 * failures (5xx, timeout, abort, empty/invalid response) carry different
 * messages and must propagate so the stream/client surfaces a real error
 * instead of a fake successful turn.
 */
function isComposerConfigurationError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return message === ERR_IMAGE_API_KEY_MISSING || message === ERR_SITE_API_KEY_MISSING;
}

function buildComposerCapabilityFailureContent(
  composerCapability: 'create_image' | 'create_site' | 'search_web' | 'refine_response',
): string {
  if (composerCapability === 'create_site') {
    return 'A criação de site está conectada, mas a configuração de geração de sites ainda não foi concluída neste ambiente. Finalize a configuração e tente novamente.';
  }
  if (composerCapability === 'create_image') {
    return 'A criação de imagem está conectada, mas a configuração de geração de imagens ainda não foi concluída neste ambiente. Finalize a configuração e tente novamente.';
  }
  if (composerCapability === 'refine_response') {
    return 'A mesa de refinamento está conectada, mas a configuração de IA para refinamento ainda não foi concluída neste ambiente. Finalize a configuração e tente novamente.';
  }
  return 'A busca na web está conectada, mas a configuração de pesquisa ainda não foi concluída neste ambiente. Finalize a configuração e tente novamente.';
}

/** Runs the composer-capability SSE branch (create_image / create_site / search_web / refine_response). */
export async function runComposerCapabilityBranch(
  composerCapability: 'create_image' | 'create_site' | 'search_web' | 'refine_response',
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
    processingTraceEntries,
    safeWrite,
    streamWriter,
    replyEngine,
    threadService,
    conversationStore,
    planLimits,
    llmBudget,
  } = ctx;
  const callId = buildDeterministicCallId(clientRequestId);
  const toolArgs: Record<string, unknown> = {
    capability: composerCapability,
    message,
    ...(workspaceId !== undefined ? { workspaceId } : {}),
    ...(effectiveCompanyContext !== undefined ? { composerContext: effectiveCompanyContext } : {}),
  };
  safeWrite(createKloelStatusEvent('thinking', createKloelPublicThinkingLabel(message)));
  safeWrite(createKloelStatusEvent('tool_calling', `Executando ${composerCapability}.`));
  safeWrite(createKloelToolCallEvent(callId, composerCapability, toolArgs));
  let capResult: CapabilityExecutionResult;
  let capabilityFailed = false;
  try {
    capResult = await composerService.executeComposerCapability({
      capability: composerCapability,
      message,
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
      ...(effectiveCompanyContext !== undefined
        ? { composerContext: effectiveCompanyContext }
        : {}),
      ...(signal !== undefined ? { signal } : {}),
    });
  } catch (error: unknown) {
    // Only known missing/incomplete-configuration errors map to the friendly
    // "configuration not complete" fallback. Real provider failures (5xx,
    // timeout, abort, empty/invalid response) must propagate so the stream/client
    // surfaces a real error instead of a fake successful assistant turn.
    if (!isComposerConfigurationError(error)) {
      throw error;
    }
    const failureContent = buildComposerCapabilityFailureContent(composerCapability);
    capabilityFailed = true;
    capResult = {
      content: failureContent,
      metadata: { capability: composerCapability, capabilityError: true },
      estimatedTokens: 0,
    };
    safeWrite(createKloelStatusEvent('tool_result', `Falha em ${composerCapability}.`));
    safeWrite(
      createKloelToolResultEvent({
        callId,
        tool: composerCapability,
        success: false,
        result: null,
        error: failureContent,
      }),
    );
  }
  const capabilityContent =
    composerCapability === 'refine_response'
      ? (await import('./kloel-composer.service.helpers')).normalizeRefinementMarkdown(
          capResult.content,
        )
      : capResult.content;

  if (!capabilityFailed) {
    safeWrite(createKloelStatusEvent('tool_result', `Resultado de ${composerCapability}.`));
    safeWrite(
      createKloelToolResultEvent({
        callId,
        tool: composerCapability,
        success: true,
        result: buildComposerCapabilityTraceResult(composerCapability, capResult.metadata),
      }),
    );
  }
  safeWrite(createKloelStatusEvent('streaming_token', createKloelPublicStreamingLabel(message)));
  safeWrite(createKloelContentEvent(capabilityContent));
  const persistedProcessingTrace =
    processingTraceEntries.length > 0 ? processingTraceEntries.map((entry) => ({ ...entry })) : [];
  const persistedProcessingSummary =
    persistedProcessingTrace.length > 0
      ? threadService.buildProcessingTraceSummary(persistedProcessingTrace)
      : undefined;
  const processingTraceMetadata =
    persistedProcessingTrace.length > 0
      ? {
          processingTrace: persistedProcessingTrace,
          processingSummary: persistedProcessingSummary,
        }
      : {};
  const doneMetadata = {
    ...(capResult.metadata || {}),
    ...processingTraceMetadata,
  };
  if (thread?.id && workspaceId) {
    await threadService.persistAssistantThreadMessage(
      thread.id,
      workspaceId,
      capabilityContent,
      threadService.buildThreadMessageMetadata(undefined, {
        clientRequestId,
        mode,
        transport: 'sse',
        requestState: 'completed',
        replyToMessageId: persistedUserMessage?.id,
        capability: composerCapability,
        ...(capResult.metadata || {}),
        ...processingTraceMetadata,
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
    await conversationStore.saveMessage(workspaceId, 'assistant', capabilityContent);
  }
  // Usage accounting (mirrors the normal chat path's finalizeSuccessfulReply
  // trackAiUsage + recordSpend). A paid create-image/site/search/refine turn
  // must be counted against the workspace's token + cost ledgers so an
  // over-budget workspace can't keep triggering paid provider calls for free.
  // Skipped on the friendly configuration-error fallback (estimatedTokens 0,
  // no provider call happened). Fire-and-forget — accounting must never wedge
  // the SSE stream, matching the normal path's `.catch(() => {})` semantics.
  if (workspaceId && !capabilityFailed) {
    await planLimits.trackAiUsage(workspaceId, capResult.estimatedTokens ?? 0).catch(() => {/* best-effort: non-blocking tracking */});
    if (llmBudget) {
      llmBudget.recordSpend(workspaceId, capResult.estimatedTokens ?? 0).catch(() => {/* best-effort: non-blocking spend tracking */});
    }
  }
  safeWrite(createKloelDoneEvent(doneMetadata));
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
  const openaiClient = replyEngine.openai;
  if (!openaiClient) {
    const error = new Error();
    error.message = KLOEL_TOOL_PLANNING_OPENAI_REQUIRED;
    throw error;
  }
  safeWrite(createKloelStatusEvent('thinking', createKloelPublicThinkingLabel(message)));
  await planLimits.ensureTokenBudget(workspaceId ?? '');
  const allowedTools =
    requestedAllowedTools === undefined
      ? KLOEL_SAFE_READ_TOOLS
      : KLOEL_SAFE_READ_TOOLS.filter((tool) => {
          const name = 'function' in tool ? tool.function?.name : undefined;
          return typeof name === 'string' && requestedAllowedTools.includes(name);
        });
  const initialResponse = await chatCompletionWithFallback(
    openaiClient,
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
    .catch(() => {/* best-effort: non-blocking */});
  const assistantMsg = initialResponse.choices[0]?.message;
  const assistantText = assistantMsg?.content || '';
  if (assistantMsg?.tool_calls?.length) {
    // MUTATION_SENSITIVE gate: the LLM tool_call is the only action trigger on
    // the authenticated path. A mutation-sensitive tool is blocked unless the
    // turn carries an explicit `confirmMutations` flag (set by the frontend
    // confirmation UX). Default = block-and-ask, never silently mutate.
    const confirmMutations = readConfirmMutations(ctx.metadata);
    const { toolMessages, receipts, usedSearchWeb } =
      await replyEngine.toolRouter.executeAssistantToolCalls({
        assistantMessage: assistantMsg,
        workspaceId: workspaceId ?? '',
        ...(userId !== undefined ? { userId } : {}),
        ...(requestedAllowedTools !== undefined ? { allowedTools: requestedAllowedTools } : {}),
        confirmMutations,
        safeWrite,
        executeLocalTool,
      });
    // Persist a durable receipt to the AuditLog (DB) for every executed tool —
    // not only to WORLD_LEDGER.jsonl. The DB row is the queryable, workspace
    // scoped record of "what action the organism actually performed".
    if (workspaceId) {
      await Promise.all(
        receipts.map((receipt) =>
          writeOperationReceiptWithAudit(
            buildReceipt({
              workspaceId,
              toolName: receipt.name,
              args: receipt.args,
              result: { ...(receipt.result ?? {}), success: receipt.success },
              ...(userId !== undefined ? { userId } : {}),
              channel: 'web',
            }),
            ctx.audit,
          ),
        ),
      );
    }
    const finalTemp = usedSearchWeb ? 0.1 : responseTemperature;
    // The turn already passed budget preflight before the planning model call.
    // Usage tracking can block the next turn without corrupting this stream.
    const finalWriterMessages = await replyEngine.buildChatModelMessages({
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
    });
    const streamedFinal = await streamWriterResponse(
      withFinalAnswerNoToolMarkupGuard(finalWriterMessages),
      finalTemp,
    );
    if (!streamedFinal) {
      return;
    }
    let finalResp = streamedFinal.fullResponse.trim();
    if (!finalResp) {
      finalResp =
        'Fechei a ação, mas a resposta veio vazia. Me chama de novo que eu continuo do ponto certo.';
      // Recoverable (non-terminal) empty-stream: stream the fallback text as a
      // content event so the UI renders it, then let finalizeSuccessfulReply
      // emit the terminal `done`. A `type:'error'` event is reserved for
      // terminal failures (done:true) — the frontend treats it as terminal.
      safeWrite(
        createKloelStatusEvent('streaming_token', createKloelPublicStreamingLabel(message)),
      );
      safeWrite(createKloelContentEvent(finalResp));
    }
    await finalizeSuccessfulReply(finalResp, streamedFinal.estimatedTokens, ctx);
    return;
  }
  // The turn already passed budget preflight before the planning model call.
  // Usage tracking can block the next turn without corrupting this stream.
  const streamedReply = await streamWriterResponse(
    withFinalAnswerNoToolMarkupGuard(messages),
    responseTemperature,
  );
  if (!streamedReply) {
    return;
  }
  let fallbackText = streamedReply.fullResponse.trim();
  if (!fallbackText) {
    fallbackText =
      assistantText ||
      'Eu li o que você mandou, mas a resposta saiu vazia aqui. Manda de novo que eu sigo.';
    // Recoverable (non-terminal) empty-stream: stream the fallback text as a
    // content event so the UI renders it; finalizeSuccessfulReply emits the
    // terminal `done` afterwards. `type:'error'` stays reserved for terminal
    // failures (done:true) since the frontend treats it as terminal.
    safeWrite(createKloelStatusEvent('streaming_token', createKloelPublicStreamingLabel(message)));
    safeWrite(createKloelContentEvent(fallbackText));
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
  const fallbackReply = appendToolResultProof(
    formatToolResult(action.tool, toolResult),
    toolResult,
  );
  let reply = fallbackReply;
  let estimatedTokens = 0;
  if (toolSucceeded && replyEngine.openai && replyEngine.hasOpenAiKey()) {
    try {
      const synthesis = await chatCompletionWithFallback(
        replyEngine.openai,
        {
          model: resolveBackendOpenAIModel('brain'),
          messages: withFinalAnswerNoToolMarkupGuard([
            {
              role: 'system',
              content:
                'Você é o Kloel dentro do chat. Uma ferramenta real já foi executada. Transforme a observação material em uma resposta final de produto: clara, confiante, curta quando o usuário pediu curto, e sem expor nomes internos de ferramenta, código, JSON, IDs técnicos ou cadeia de raciocínio bruta. Se útil, preserve uma prova material em linguagem de usuário. Não invente dado que não esteja na observação.',
            },
            {
              role: 'user',
              content: `Pedido do usuário:\n${message}\n\nObservação material já executada:\n${fallbackReply}\n\nEscreva a resposta final para o usuário.`,
            },
          ]),
          temperature: 0.2,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
          max_tokens: 520,
        },
        resolveBackendOpenAIModel('brain_fallback'),
        { maxRetries: 2, initialDelayMs: 300 },
        {},
      );
      const synthesizedReply = sanitizeKloelAssistantVisibleText(
        synthesis.choices[0]?.message?.content?.trim() || '',
      );
      if (synthesizedReply) {
        reply = synthesizedReply;
        estimatedTokens = synthesis.usage?.total_tokens ?? 520;
      }
    } catch {
      reply = fallbackReply;
      estimatedTokens = 0;
    }
  }
  safeWrite(createKloelContentEvent(reply));
  await finalizeReply(reply, estimatedTokens, branchCtx);
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
