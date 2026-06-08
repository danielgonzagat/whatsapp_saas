import type { Prisma } from '@prisma/client';
import { estimateChatCostCents, type LLMBudgetService } from './llm-budget.service';
import type { PlanLimitsService } from '../billing/plan-limits.service';
import type { KloelComposerService } from './kloel-composer.service';
import type { KloelConversationStore } from './kloel-conversation-store';
import type { KloelReplyEngineService } from './kloel-reply-engine.service';
import type { KloelStreamEvent } from './kloel-stream-events';
import { createKloelThreadEvent } from './kloel-stream-events';
import type { KloelStreamWriter } from './kloel-stream-writer';
import type { KloelThreadService, StoredProcessingTraceEntry } from './kloel-thread.service';
import { runComposerCapabilityBranch } from './kloel-thinker-think.helpers';

export type ComposerCapability = 'create_image' | 'create_site' | 'search_web' | 'refine_response';

export interface StreamingComposerCapabilityBranchParams {
  composerCapability: ComposerCapability;
  effectiveCompanyContext: string | undefined;
  signal: AbortSignal | undefined;
  composerService: KloelComposerService;
  workspaceId: string | undefined;
  userId: string | undefined;
  message: string;
  mode: string;
  metadata: Prisma.InputJsonValue | undefined;
  clientRequestId: string | undefined;
  thread: { id: string; title: string | null } | null;
  processingTraceEntries: StoredProcessingTraceEntry[];
  safeWrite: (event: KloelStreamEvent) => void;
  streamWriter: KloelStreamWriter;
  replyEngine: KloelReplyEngineService;
  threadService: KloelThreadService;
  conversationStore: KloelConversationStore;
  planLimits: PlanLimitsService;
  llmBudget: LLMBudgetService;
  responseMaxTokens: number;
}

export async function runStreamingComposerCapabilityBranch({
  composerCapability,
  effectiveCompanyContext,
  signal,
  composerService,
  workspaceId,
  userId,
  message,
  mode,
  metadata,
  clientRequestId,
  thread,
  processingTraceEntries,
  safeWrite,
  streamWriter,
  replyEngine,
  threadService,
  conversationStore,
  planLimits,
  llmBudget,
  responseMaxTokens,
}: StreamingComposerCapabilityBranchParams): Promise<void> {
  if (workspaceId) {
    await planLimits.ensureTokenBudget(workspaceId);
    const estimatedCost = estimateChatCostCents({
      inputChars: message.length,
      maxOutputTokens: responseMaxTokens,
    });
    await llmBudget.assertBudget(workspaceId, estimatedCost);
  }

  if (thread?.id) {
    safeWrite(createKloelThreadEvent(thread.id, thread.title));
  }

  const persistedUserMessage = thread?.id
    ? await threadService.persistUserThreadMessage(
        thread.id,
        workspaceId ?? '',
        message,
        threadService.buildThreadMessageMetadata(metadata, {
          clientRequestId,
          mode,
          transport: 'sse',
          requestState: 'accepted',
        }),
      )
    : null;

  await runComposerCapabilityBranch(
    composerCapability,
    effectiveCompanyContext,
    signal,
    composerService,
    {
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
      llmBudget,
    },
  );
}
