import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { KLOEL_SAFE_READ_TOOLS } from './kloel-chat-tools.definition';
import type { LocalToolExecutor } from './kloel-reply-engine.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import {
  createKloelContentEvent,
  createKloelPublicStreamingLabel,
  createKloelPublicThinkingLabel,
  createKloelStatusEvent,
} from './kloel-stream-events';
import { buildReceipt, writeOperationReceiptWithAudit } from './operation-receipt.helpers';
import {
  finalizeSuccessfulReply,
  withFinalAnswerNoToolMarkupGuard,
  type FinalizeReplyFn,
  type ThinkBranchContext,
} from './kloel-thinker-think.helpers';

const KLOEL_TOOL_PLANNING_WORKSPACE_REQUIRED = 'workspaceId is required for Kloel tool planning';
const KLOEL_TOOL_PLANNING_OPENAI_REQUIRED = 'OpenAI client is required for Kloel tool planning';

function readConfirmMutations(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  return (metadata as Record<string, unknown>).confirmMutations === true;
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
  finalizeReply: FinalizeReplyFn = finalizeSuccessfulReply,
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
    .catch((error: unknown) => {
      void error;
    });
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
    await finalizeReply(finalResp, streamedFinal.estimatedTokens, ctx);
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
  await finalizeReply(fallbackText, streamedReply.estimatedTokens, ctx);
}
