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
import type { ChatMessage, ThinkRequest, ThinkSyncResult } from './kloel-thinker.service';

/** Sync think loop — extracted to keep KloelThinkerService under 400 lines. */
export async function thinkSyncImpl(
  request: ThinkRequest,
  composerCapability: 'create_image' | 'create_site' | 'search_web' | null,
  enrichedCompanyContext: string | undefined,
  effectiveCompanyContext: string | undefined,
  deps: {
    replyEngine: KloelReplyEngineService;
    threadService: KloelThreadService;
    composerService: KloelComposerService;
    conversationStore: KloelConversationStore;
    planLimits: PlanLimitsService;
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
  const { replyEngine, threadService, composerService, conversationStore } = deps;
  if (!replyEngine.hasOpenAiKey() && !process.env.ANTHROPIC_API_KEY) {
    return {
      response:
        'Assistente IA não disponível no momento. Configure OPENAI_API_KEY ou ANTHROPIC_API_KEY para habilitar o Kloel.',
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
          workspaceId,
          metadata,
          composerContext: effectiveCompanyContext,
        })
      : null;
  const assistantMessage =
    capabilityResult?.content ||
    (await replyEngine.buildAssistantReply({
      message,
      workspaceId,
      userId,
      userName: reqUserName,
      mode,
      companyContext: effectiveCompanyContext,
      conversationState: historyState,
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
      await threadService.maybeRefreshThreadSummary(thread.id, workspaceId, replyEngine.openai);
      resolvedTitle = await threadService.maybeGenerateThreadTitle(
        thread.id,
        thread.title,
        message,
        workspaceId,
        replyEngine.openai,
      );
    }
    await conversationStore.saveMessage(workspaceId, 'user', message);
    await conversationStore.saveMessage(workspaceId, 'assistant', assistantMessage);
  }
  return { response: assistantMessage, conversationId: thread?.id, title: resolvedTitle };
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
        update: (args: unknown) => Promise<{
          id: string;
          threadId: string;
          role: string;
          content: string;
          metadata: Prisma.JsonValue | null;
          createdAt: Date;
        }>;
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
  } as unknown as never);
  if (!thread) throw new Error('Conversa não encontrada.');

  const messages = (
    await prisma.chatMessage.findMany({
      where: { threadId: conversationId },
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
    } as unknown as never)
  ).reverse();

  const assistantIndex = messages.findIndex(
    (m) => m.id === assistantMessageId && m.role === 'assistant',
  );
  if (assistantIndex === -1) throw new Error('Mensagem do assistente não encontrada.');

  const sourceUserIndex = [...messages.slice(0, assistantIndex)]
    .map((m, i) => ({ m, i }))
    .reverse()
    .find((e) => e.m.role === 'user')?.i;
  if (sourceUserIndex === undefined)
    throw new Error('Não existe mensagem do usuário para regenerar esta resposta.');

  const sourceUserMessage = messages[sourceUserIndex];
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
    userId,
    userName,
    mode: 'chat',
    conversationState: {
      summary: (thread as { summary?: string | null }).summary ?? undefined,
      recentMessages: historyBeforeUser,
      totalMessages: sourceUserIndex,
    },
    onTraceEvent: (event) =>
      threadService.appendStoredProcessingTraceEntry(regeneratedTraceEntries, event),
  });

  const deletedMessageIds = messages.slice(assistantIndex + 1).map((m) => m.id);
  const currentAssistantMessage = messages[assistantIndex];
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

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.chatMessage.update({
      where: { id: assistantMessageId },
      data: {
        content: regeneratedContent,
        metadata: threadService.buildThreadMessageMetadata(
          currentMetadata as Prisma.InputJsonValue,
          {
            regeneratedAt: new Date().toISOString(),
            regeneratedFromUserMessageId: sourceUserMessage.id,
            responseVersions,
            activeResponseVersionIndex: Math.max(responseVersions.length - 1, 0),
            processingTrace: regeneratedTraceEntries,
            processingSummary: threadService.buildProcessingTraceSummary(regeneratedTraceEntries),
          },
        ),
      },
    } as unknown as never) as unknown as Prisma.PrismaPromise<unknown>,
  ];
  if (deletedMessageIds.length > 0) {
    operations.push(
      prisma.chatMessage.deleteMany({
        where: { id: { in: deletedMessageIds } },
      } as unknown as never) as unknown as Prisma.PrismaPromise<unknown>,
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
      } as unknown as never) as unknown as Prisma.PrismaPromise<unknown>,
    );
  }
  operations.push(threadService.touchThread(conversationId, workspaceId));

  const [updatedMessage] = (await prisma.$transaction(operations as unknown as never)) as Array<{
    id: string;
    threadId: string;
    role: string;
    content: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
  }>;
  await threadService.maybeRefreshThreadSummary(conversationId, workspaceId, replyEngine.openai);
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
