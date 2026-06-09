import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import { Prisma } from '@prisma/client';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { LLMBudgetService } from './llm-budget.service';
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
import {
  extractExecutablePreResponseFromAssistantText,
  formatTraceToolLabel,
} from './kloel-thread.helpers';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import type { LocalToolExecutor } from './kloel-reply-engine.service';
import { appendToolResultProof, formatToolResult } from './guest-chat.action-intent.helpers';
import {
  buildDeterministicCallId,
  buildResponseVersionId,
} from './kloel-thinker.substrate.helpers';
import { type AuditLogSink } from './operation-receipt.helpers';

export interface DeterministicAction {
  tool: string;
  args: Record<string, unknown>;
  requiresConfirmation?: boolean;
  missingInputs?: string[];
}

const KLOEL_FINAL_ANSWER_NO_TOOL_MARKUP_PROMPT =
  'Passe de resposta final: escreva linguagem de produto. Não emita markup de ferramenta, DSML, XML/JSON de chamada de ferramenta, payloads privados, código cru, caminhos de arquivo, linguagens de implementação, contagem de símbolos, IDs técnicos, labels de certificação interna ou blocos de tool call. Nomes públicos de ferramentas e capacidades podem aparecer quando forem prova material do trace. Traduza raciocínio, ações e observações já executadas para uma pré-resposta executável clara, sem expor segredos ou detalhes privados de implementação.';

export function withFinalAnswerNoToolMarkupGuard(
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
    await planLimits.trackAiUsage(workspaceId, estimatedTokens).catch((error: unknown) => {
      void error;
    });
  }
  // Persist the real reasoning the model produced this turn (text + duration) so it
  // survives reloads and renders in the reasoning panel. The writer accumulated the
  // streamed reasoning_content; getLastReasoning() now carries the actual text.
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
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
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
  safeWrite(
    createKloelStatusEvent(
      'tool_calling',
      `Executando ${formatTraceToolLabel(composerCapability)}.`,
    ),
  );
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
    safeWrite(
      createKloelStatusEvent(
        'tool_result',
        `Falha em ${formatTraceToolLabel(composerCapability)}.`,
      ),
    );
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
    safeWrite(
      createKloelStatusEvent(
        'tool_result',
        `Resultado de ${formatTraceToolLabel(composerCapability)}.`,
      ),
    );
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
    await planLimits
      .trackAiUsage(workspaceId, capResult.estimatedTokens ?? 0)
      .catch((error: unknown) => {
        void error;
      });
    if (llmBudget) {
      llmBudget.recordSpend(workspaceId, capResult.estimatedTokens ?? 0).catch((error: unknown) => {
        void error;
      });
    }
  }
  safeWrite(createKloelDoneEvent(doneMetadata));
  streamWriter.close();
}

export { runToolPlanningBranch } from './kloel-thinker-tool-planning.branch';

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
  safeWrite(
    createKloelStatusEvent('tool_calling', `Executando ${formatTraceToolLabel(action.tool)}.`),
  );
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
  safeWrite(
    createKloelStatusEvent('tool_result', `Resultado de ${formatTraceToolLabel(action.tool)}.`),
  );
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
                'Você é o Kloel dentro do chat. Uma ferramenta real já foi executada. Transforme a observação material em uma resposta final de produto: clara, confiante, curta quando o usuário pediu curto, preservando raciocínio bruto/provider reasoning quando ele estiver presente como evento público real do trace. Não exponha payload privado, código, JSON bruto, IDs técnicos, credenciais ou segredos. O nome público da ferramenta pode aparecer se ajudar a provar a execução. Se útil, preserve uma prova material em linguagem de usuário. Não invente dado que não esteja na observação.',
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

export { persistChatTurnToSpine } from './kloel-thinker-spine.helpers';
