import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import type { StructuredLogger } from '../logging/structured-logger';
import { estimateChatCostCents, type LLMBudgetService } from './llm-budget.service';
import type { PrismaService } from '../prisma/prisma.service';
import { captureTurnMemory, type WireContextServices } from './kloel-thinker.wire-context.helpers';
import { createKloelContentEvent, createKloelStatusEvent } from './kloel-stream-events';
import type { ThinkLoopServices } from './kloel-thinker-think-loop.helpers';
import {
  closeThinkLoopError,
  closeThinkLoopSuccess,
  openThinkLoop,
} from './kloel-thinker-think-loop.helpers';
import {
  finalizeSuccessfulReply,
  persistChatTurnToSpine,
  type ThinkBranchContext,
} from './kloel-thinker-think.helpers';

export interface StandardStreamingReplyBranchParams {
  messages: ChatCompletionMessageParam[];
  responseTemperature: number;
  responseMaxTokens: number;
  streamWriterResponse: (
    messages: ChatCompletionMessageParam[],
    temperature: number,
  ) => Promise<{ fullResponse: string; estimatedTokens: number } | null>;
  branchCtx: ThinkBranchContext;
  prisma: PrismaService;
  logger: StructuredLogger;
  thinkLoopServices: ThinkLoopServices;
  wireContextServices: WireContextServices;
  conversationId: string | undefined;
  userId: string | undefined;
}

export async function runStandardStreamingReplyBranch({
  messages,
  responseTemperature,
  responseMaxTokens,
  streamWriterResponse,
  branchCtx,
  prisma,
  logger,
  thinkLoopServices,
  wireContextServices,
  conversationId,
  userId,
}: StandardStreamingReplyBranchParams): Promise<void> {
  const { workspaceId, message, mode, replyEngine, planLimits } = branchCtx;
  const llmBudget = branchCtx.llmBudget as LLMBudgetService;
  let thinkLoopHandle = null;

  try {
    if (workspaceId) {
      await planLimits.ensureTokenBudget(workspaceId);
      const estimatedCost = estimateChatCostCents({
        inputChars: JSON.stringify(messages).length,
        maxOutputTokens: responseMaxTokens,
      });
      await llmBudget.assertBudget(workspaceId, estimatedCost);
    }

    thinkLoopHandle = openThinkLoop(thinkLoopServices, logger, {
      workspaceId,
      messageLength: message.length,
    });
    branchCtx.safeWrite(createKloelStatusEvent('thinking'));
    const streamedReply = await streamWriterResponse(messages, responseTemperature);
    if (workspaceId && streamedReply) {
      llmBudget.recordSpend(workspaceId, streamedReply.estimatedTokens).catch(() => {});
    }
    if (!streamedReply) {
      closeThinkLoopError(thinkLoopServices, logger, thinkLoopHandle);
      return;
    }

    let fullResponse = streamedReply.fullResponse;
    const replyOutcome: 0 | 1 = fullResponse.trim() ? 1 : 0;
    if (!fullResponse.trim()) {
      fullResponse = replyEngine.unavailableMessage;
      branchCtx.safeWrite(createKloelStatusEvent('streaming_token'));
      branchCtx.safeWrite(createKloelContentEvent(fullResponse));
    }

    await finalizeSuccessfulReply(fullResponse, streamedReply.estimatedTokens, branchCtx);
    closeThinkLoopSuccess(thinkLoopServices, logger, thinkLoopHandle, replyOutcome);
    thinkLoopHandle = null;

    if (workspaceId) {
      persistChatTurnToSpine(prisma, logger, {
        workspaceId,
        message,
        fullResponse,
        mode,
        conversationId,
      });
    }

    if (mode === 'chat') {
      captureTurnMemory(wireContextServices, logger, {
        workspaceId,
        userId,
        message,
        reply: fullResponse,
      });
    }
  } catch (error) {
    closeThinkLoopError(thinkLoopServices, logger, thinkLoopHandle);
    throw error;
  }
}
