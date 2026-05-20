import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { buildTimestampedRuntimeId } from './kloel-id.util';
import { KloelComposerService } from './kloel-composer.service';
import { KloelConversationStore } from './kloel-conversation-store';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import {
  KloelThreadService,
  StoredProcessingTraceEntry,
  StoredResponseVersion,
} from './kloel-thread.service';
import type { ChatMessage, ThinkRequest, ThinkSyncResult } from './kloel-thinker.types';
import { type PrismaService } from '../prisma/prisma.service';
import { type AbiBuilderService } from './abi/abi-builder.service';
import { type BrainCapabilityExecutorService } from './brain-capability-executor.service';
import { validateAbiPayload } from './abi/abi-validator';

const ERR_THREAD_NOT_FOUND = 'Conversa não encontrada.';
const ERR_ASSISTANT_MSG_NOT_FOUND = 'Mensagem do assistente não encontrada.';
const ERR_NO_USER_MSG_TO_REGENERATE =
  'Não existe mensagem do usuário para regenerar esta resposta.';

function buildRegenerationError(message: string) {
  const error = new Error();
  error.message = message;
  return error;
}

/** Sync think loop — extracted to keep KloelThinkerService under 400 lines. */
export async function thinkSyncImpl(
  request: ThinkRequest,
  composerCapability: 'create_image' | 'create_site' | 'search_web' | null,
  effectiveCompanyContext: string | undefined,
  deps: {
    replyEngine: KloelReplyEngineService;
    prisma: PrismaService;
    threadService: KloelThreadService;
    composerService: KloelComposerService;
    conversationStore: KloelConversationStore;
    planLimits: PlanLimitsService;    abiBuilder?: AbiBuilderService;
    capabilityExecutor?: BrainCapabilityExecutorService;
  },
): Promise<ThinkSyncResult> {
  const {
    message,
    workspaceId,
    userId,
    userName: reqUserName,
    conversationId,
    mode = 'chat',
    metadata,
  } = request;
  const { replyEngine, prisma, threadService, composerService, conversationStore } = deps;
  if (!replyEngine.hasOpenAiKey() && !process.env.ANTHROPIC_API_KEY) {
    return {
      response:
        'Assistente IA não disponível no momento. Configure DEEPSEEK_API_KEY, LLM_API_KEY, OPENAI_API_KEY ou ANTHROPIC_API_KEY para habilitar o Kloel.',
    };
  }
  const thread =
    workspaceId && mode === 'chat'
      ? await threadService.resolveThread(workspaceId, conversationId)
      : null;
  const historyState = thread?.id
    ? await threadService.getThreadConversationState(thread.id, workspaceId)
    : { recentMessages: [], totalMessages: 0 };
  const capabilityResult =
    mode === 'chat' && composerCapability
      ? await composerService.executeComposerCapability({
          capability: composerCapability,
          message,
          ...(workspaceId !== undefined ? { workspaceId } : {}),
          ...(metadata !== undefined ? { metadata } : {}),
          ...(effectiveCompanyContext !== undefined
            ? { composerContext: effectiveCompanyContext }
            : {}),
        })
      : null;

  // Build ABI state if feature flag is on and deps are available
  let abiStateJson: string | undefined;
  const { abiBuilder, capabilityExecutor } = deps;
  const useAbi = process.env['KLOEL_THINKER_USE_ABI'] === 'on';
  if (useAbi && abiBuilder && capabilityExecutor && workspaceId) {
    try {
      const chatSubstrate = await capabilityExecutor.buildCognitiveSubstrate(workspaceId);
      const abiResult = await abiBuilder.build({
        audience: 'public',
        currentInput: { raw: message, channel: 'web', arrivalTimestamp: new Date().toISOString() },
        perceptionSnapshot: { channel: 'web', ...(workspaceId ? { workspaceId } : {}) },
        ...(chatSubstrate ? { cognitiveSubstrate: chatSubstrate } : {}),
      });
      if (abiResult.status === 'ok') {
        const validation = validateAbiPayload(abiResult.abi);
        if (validation.status !== 'FAIL') {
          const capped = JSON.stringify(abiResult.abi, (_k: string, v: unknown) =>
            Array.isArray(v) ? v.slice(0, 8) : v
          );
          abiStateJson = capped.length > 24000 ? capped.slice(0, 24000) + '...(truncated)' : capped;
        }
      }
    } catch {
      // ABI build failed — use legacy prompt
    }
  }
  const assistantMessage =
    capabilityResult?.content ||
    (await replyEngine.buildAssistantReply({
      message,
      ...(workspaceId ? { workspaceId } : {}),
      ...(userId ? { userId } : {}),
      ...(reqUserName ? { userName: reqUserName } : {}),
      mode,
      ...(effectiveCompanyContext !== undefined ? { companyContext: effectiveCompanyContext } : {}),
      ...(request.allowedTools !== undefined ? { allowedTools: request.allowedTools } : {}),
      conversationState: historyState,      ...(abiStateJson !== undefined ? { abiStateJson } : {}),
    }));

  let resolvedTitle = thread?.title;
  if (workspaceId) {
    if (thread?.id) {
      const clientRequestId = threadService.resolveClientRequestId(metadata);
      const persistedUserMessage = await threadService.persistUserThreadMessage(
        thread.id,
        workspaceId,
        message,
        threadService.buildThreadMessageMetadata(metadata, {
          clientRequestId,
          mode,
          transport: 'sync',
          requestState: 'accepted',
        }),
      );
      const completedAt = new Date().toISOString();
      const responseVersions: StoredResponseVersion[] = [
        {
          id: clientRequestId ? `resp_${clientRequestId}` : buildTimestampedRuntimeId('resp'),
          content: assistantMessage,
          createdAt: completedAt,
          source: 'initial',
        },
      ];
      await threadService.persistAssistantThreadMessage(
        thread.id,
        workspaceId,
        assistantMessage,
        threadService.buildThreadMessageMetadata(undefined, {
          clientRequestId,
          mode,
          transport: 'sync',
          requestState: 'completed',
          replyToMessageId: persistedUserMessage?.id,
          responseVersions,
          activeResponseVersionIndex: 0,
          capability: composerCapability,
          ...(capabilityResult?.metadata || {}),
        }),
      );
      await threadService.maybeRefreshThreadSummary(
        thread.id,
        workspaceId,
        replyEngine.openai ?? undefined,
      );
      resolvedTitle = await threadService.maybeGenerateThreadTitle(
        thread.id,
        thread.title,
        message,
        workspaceId,
        replyEngine.openai ?? undefined,
      );
    }
    await conversationStore.saveMessage(workspaceId, 'user', message);
    await conversationStore.saveMessage(workspaceId, 'assistant', assistantMessage);
    // Persist this conversational turn to the cognitive spine so it
    // becomes CROSS-SESSION memory (MindPerceptionService reads
    // autopilotEvent → working/episodic/consolidated/beliefs → ABI).
    void prisma.autopilotEvent
      .create({
        data: {
          workspaceId,
          intent: 'kloel_chat_turn',
          action: 'kloel.chat.turn',
          status: 'executed',
          meta: {
            userPreview: message.slice(0, 280),
            replyPreview: assistantMessage.slice(0, 280),
            mode,
            conversationId: conversationId ?? null,
          },
        },
      })
      .catch(() => {
        // fire-and-forget — never blocks the reply
      });
  }
  const convId = thread?.id;
  const title = resolvedTitle;
  return {
    response: assistantMessage,
    ...(convId ? { conversationId: convId } : {}),
    ...(title ? { title } : {}),
  };
}

/** Regenerate assistant response — extracted to keep KloelThinkerService under 400 lines. */
export async function regenerateThreadAssistantResponseImpl(
  params: {
    workspaceId: string;
    conversationId: string;
    assistantMessageId: string;
    userId?: string;
    userName?: string;
  },
  deps: {
    prisma: {
      chatThread: {
        findFirst: (args: unknown) => Promise<{ id: string; summary: string | null } | null>;
      };
      chatMessage: {
        findFirst: (args: unknown) => Promise<{
          id: string;
          threadId: string;
          role: string;
          content: string;
          metadata: Prisma.JsonValue | null;
          createdAt: Date;
        } | null>;
        findMany: (args: unknown) => Promise<
          Array<{
            id: string;
            threadId: string;
            role: string;
            content: string;
            metadata: Prisma.JsonValue | null;
            createdAt: Date;
          }>
        >;
        updateMany: (args: unknown) => Promise<unknown>;
        deleteMany: (args: unknown) => Promise<unknown>;
      };
      auditLog: { create: (args: unknown) => Promise<unknown> };
      $transaction: (ops: unknown) => Promise<unknown[]>;
    };
    replyEngine: KloelReplyEngineService;
    threadService: KloelThreadService;
  },
): Promise<{
  id: string;
  threadId: string;
  role: string;
  content: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  deletedMessageIds: string[];
}> {
  const { workspaceId, conversationId, assistantMessageId, userId, userName } = params;
  const { prisma, replyEngine, threadService } = deps;

  const thread = await prisma.chatThread.findFirst({
    where: { id: conversationId, workspaceId },
    select: { id: true, summary: true },
  });
  if (!thread) {
    throw buildRegenerationError(ERR_THREAD_NOT_FOUND);
  }

  const messages = (
    await prisma.chatMessage.findMany({
      where: { threadId: conversationId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        threadId: true,
        role: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
    })
  ).reverse();

  const assistantIndex = messages.findIndex(
    (m) => m.id === assistantMessageId && m.role === 'assistant',
  );
  if (assistantIndex === -1) {
    throw buildRegenerationError(ERR_ASSISTANT_MSG_NOT_FOUND);
  }

  const sourceUserIndex = [...messages.slice(0, assistantIndex)]
    .map((m, i) => ({ m, i }))
    .reverse()
    .find((e) => e.m.role === 'user')?.i;
  if (sourceUserIndex === undefined) {
    throw buildRegenerationError(ERR_NO_USER_MSG_TO_REGENERATE);
  }

  const sourceUserMessage = messages[sourceUserIndex];
  if (!sourceUserMessage) {
    throw buildRegenerationError(ERR_NO_USER_MSG_TO_REGENERATE);
  }
  const historyBeforeUser = messages
    .slice(Math.max(0, sourceUserIndex - 20), sourceUserIndex)
    .filter((m) => String(m.content || '').trim().length > 0)
    .map(
      (m): ChatMessage => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }),
    );

  const regeneratedTraceEntries: StoredProcessingTraceEntry[] = [];
  const regeneratedContent = await replyEngine.buildAssistantReply({
    message: sourceUserMessage.content,
    workspaceId,
    ...(userId ? { userId } : {}),
    ...(userName ? { userName } : {}),
    mode: 'chat',
    conversationState: {
      ...(typeof (thread as { summary?: string | null }).summary === 'string'
        ? { summary: (thread as { summary?: string | null }).summary as string }
        : {}),
      recentMessages: historyBeforeUser,
      totalMessages: sourceUserIndex,
    },
    onTraceEvent: (event) =>
      threadService.appendStoredProcessingTraceEntry(regeneratedTraceEntries, event),
  });

  const deletedMessageIds = messages.slice(assistantIndex + 1).map((m) => m.id);
  const currentAssistantMessage = messages[assistantIndex];
  if (!currentAssistantMessage) {
    throw buildRegenerationError(ERR_ASSISTANT_MSG_NOT_FOUND);
  }
  const currentMetadata = threadService.normalizeThreadMessageMetadataRecord(
    currentAssistantMessage.metadata,
  );
  const versionCreatedAt = new Date().toISOString();
  const responseVersions = [
    ...threadService.buildStoredResponseVersions(
      currentAssistantMessage.metadata,
      currentAssistantMessage.content,
      currentAssistantMessage.id,
    ),
    {
      id: buildTimestampedRuntimeId('regen'),
      content: regeneratedContent,
      createdAt: versionCreatedAt,
      source: 'regenerated',
    } satisfies StoredResponseVersion,
  ];

  const updatedMetadata = threadService.buildThreadMessageMetadata(
    currentMetadata as Prisma.InputJsonValue,
    {
      regeneratedAt: new Date().toISOString(),
      regeneratedFromUserMessageId: sourceUserMessage.id,
      responseVersions,
      activeResponseVersionIndex: Math.max(responseVersions.length - 1, 0),
      processingTrace: regeneratedTraceEntries,
      processingSummary: threadService.buildProcessingTraceSummary(regeneratedTraceEntries),
    },
  );

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.chatMessage.updateMany({
      where: { id: assistantMessageId, workspaceId },
      data: {
        content: regeneratedContent,
        metadata: (updatedMetadata ?? null) as Prisma.JsonValue | null,
      },
    }) as Prisma.PrismaPromise<unknown>,
  ];
  if (deletedMessageIds.length > 0) {
    operations.push(
      prisma.chatMessage.deleteMany({
        where: { id: { in: deletedMessageIds }, workspaceId },
      }) as Prisma.PrismaPromise<unknown>,
      prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'USER_DATA_DELETED',
          resource: 'ChatMessage',
          resourceId: assistantMessageId,
          details: {
            source: 'kloel_regenerate_assistant_response',
            conversationId,
            deletedMessageIds,
          },
        },
      }) as Prisma.PrismaPromise<unknown>,
    );
  }
  operations.push(threadService.touchThread(conversationId, workspaceId));

  await prisma.$transaction(operations);
  const updatedMessage = await prisma.chatMessage.findFirst({
    where: { id: assistantMessageId, workspaceId },
    select: {
      id: true,
      threadId: true,
      role: true,
      content: true,
      metadata: true,
      createdAt: true,
    },
  });
  if (!updatedMessage) {
    throw buildRegenerationError(ERR_ASSISTANT_MSG_NOT_FOUND);
  }
  await threadService.maybeRefreshThreadSummary(
    conversationId,
    workspaceId,
    replyEngine.openai ?? undefined,
  );
  return {
    id: updatedMessage.id,
    threadId: updatedMessage.threadId,
    role: updatedMessage.role,
    content: updatedMessage.content,
    metadata: updatedMessage.metadata,
    createdAt: updatedMessage.createdAt,
    deletedMessageIds,
  };
}
