import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MindChatMessageService } from './mind/aliases/mind-chat-message.service';
import { isMindMessageDualWriteEnabled } from './mind/aliases/mindmessage-dualwrite.flag';
import { type KloelStreamEvent } from './kloel-stream-events';
import { normalizeRefinementMarkdown } from './kloel-composer.service.helpers';
import { KloelThreadSummaryService } from './kloel-thread-summary.service';
import OpenAI from 'openai';
import {
  appendStoredProcessingTraceEntry,
  buildProcessingTraceSummary,
  buildStoredProcessingTraceEntry,
  buildStoredResponseVersions,
  buildThreadMessageMetadata,
  buildThreadSummarySystemMessage,
  formatTraceToolLabel,
  normalizeThreadMessageMetadataRecord,
  resolveClientRequestId,
  type StoredProcessingTraceEntry,
  type StoredResponseVersion,
} from './kloel-thread.helpers';

import type { ChatMessage } from './kloel-thinker.types';
export type { ChatMessage };
export type { StoredProcessingTraceEntry, StoredResponseVersion };

export interface ThreadConversationState {
  summary?: string;
  recentMessages: ChatMessage[];
  totalMessages: number;
}

/** Manages chat thread persistence, conversation state. Summary/title logic delegated to KloelThreadSummaryService. */
@Injectable()
export class KloelThreadService {
  private readonly logger = StructuredLogger.from(KloelThreadService.name);
  readonly recentThreadMessageLimit = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly summaryService: KloelThreadSummaryService,
    @Optional() private readonly mindChatMessage?: MindChatMessageService,
  ) {
    this.logger.log('KloelThreadService initialized');
  }

  /** Canonical Brain → Mind chat-message delegate (raw-Prisma fallback). */
  private get chatMessageItems() {
    return this.mindChatMessage?.items ?? this.prisma.chatMessage;
  }

  /**
   * ADDITIVE, flag-gated, best-effort dual-write of a thread message to the
   * canonical `RAC_MindMessage` table (currently writer-less). Behind
   * `KLOEL_MINDMESSAGE_DUALWRITE` (default OFF). Any failure here is swallowed
   * with a warn-log so it can NEVER break the legacy `RAC_ChatMessage` write
   * that the caller already performed. No read path depends on this.
   * `source: 'thread'` is the unified-table discriminator recording which
   * legacy surface the row came from.
   *
   * Field-gap check mirrors the merged dashboard dual-write: `workspaceId`,
   * `role`, and `content` are all required by `RAC_MindMessage`; if any is
   * missing/empty the dual-write is skipped (the legacy write is unaffected).
   */
  private async dualWriteThreadMindMessage(
    workspaceId: string,
    role: string,
    content: string,
  ): Promise<void> {
    if (!isMindMessageDualWriteEnabled()) {
      return;
    }
    if (!workspaceId || !role || !content) {
      return;
    }
    try {
      await this.prisma.mindMessage.create({
        data: { workspaceId, source: 'thread', role, content },
      });
    } catch (error) {
      this.logger.warn(
        `MindMessage dual-write failed (workspaceId=${workspaceId}, role=${role}, ` +
          `source=thread); legacy ChatMessage write succeeded and is unaffected: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  async resolveThread(
    workspaceId: string,
    conversationId?: string,
  ): Promise<{
    id: string;
    title: string;
    summary: string | null;
    summaryUpdatedAt: Date | null;
  } | null> {
    if (!workspaceId) {
      return null;
    }

    if (conversationId) {
      const existing = await this.prisma.chatThread.findFirst({
        where: { id: conversationId, workspaceId },
        select: { id: true, title: true, summary: true, summaryUpdatedAt: true },
      });
      if (existing) {
        return existing;
      }
    }

    return this.prisma.chatThread.create({
      data: { workspaceId, title: 'Nova conversa' },
      select: { id: true, title: true, summary: true, summaryUpdatedAt: true },
    });
  }

  async getThreadConversationHistory(
    threadId: string,
    workspaceId?: string,
    limit = this.recentThreadMessageLimit,
  ): Promise<ChatMessage[]> {
    if (!threadId) {
      return [];
    }

    const messages = await this.chatMessageItems.findMany({
      where: workspaceId ? { threadId, thread: { workspaceId } } : { threadId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { role: true, content: true },
    });

    return messages.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
  }

  async getThreadConversationState(
    threadId?: string | null,
    workspaceId?: string | null,
  ): Promise<ThreadConversationState> {
    if (!threadId || !workspaceId) {
      return { recentMessages: [], totalMessages: 0 };
    }

    const findThread = this.prisma.chatThread.findFirst({
      where: { id: threadId, workspaceId },
      select: { summary: true, summaryUpdatedAt: true },
    });

    const countMessages =
      typeof this.chatMessageItems.count === 'function'
        ? this.chatMessageItems.count({ where: { threadId, thread: { workspaceId } } })
        : (async () => {
            const rows = await this.chatMessageItems.findMany({
              where: { threadId, thread: { workspaceId } },
              take: 10_000,
              select: { id: true },
            });
            return rows.length;
          })();

    const [thread, totalMessages, recentMessages] = await Promise.all([
      findThread,
      countMessages,
      this.getThreadConversationHistory(threadId, workspaceId, this.recentThreadMessageLimit),
    ]);

    return {
      ...(thread?.summary && String(thread.summary).trim().length > 0
        ? { summary: String(thread.summary) }
        : {}),
      recentMessages,
      totalMessages,
    };
  }

  normalizeThreadMessageMetadataRecord(
    metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null,
  ): Record<string, unknown> {
    return normalizeThreadMessageMetadataRecord(metadata);
  }

  buildThreadMessageMetadata(
    baseMetadata?: Prisma.InputJsonValue,
    extraFields?: Record<string, unknown>,
  ): Prisma.InputJsonValue | undefined {
    return buildThreadMessageMetadata(baseMetadata, extraFields);
  }

  touchThread(threadId: string, workspaceId: string) {
    return this.prisma.chatThread.updateMany({
      where: { id: threadId, workspaceId },
      data: { updatedAt: new Date() },
    });
  }

  async persistUserThreadMessage(
    threadId: string,
    workspaceId: string,
    userMessage: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<{ id: string } | null> {
    if (!threadId) {
      return null;
    }
    const created = await this.chatMessageItems.create({
      data: {
        thread: { connect: { id: threadId } },
        workspaceId,
        role: 'user',
        content: userMessage,
        ...(metadata !== undefined ? { metadata } : {}),
      },
      select: { id: true },
    });
    await this.dualWriteThreadMindMessage(workspaceId, 'user', userMessage);
    await this.touchThread(threadId, workspaceId);
    return created;
  }

  async persistAssistantThreadMessage(
    threadId: string,
    workspaceId: string,
    assistantMessage: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<{ id: string } | null> {
    if (!threadId) {
      return null;
    }
    const persistedAssistantMessage =
      this.normalizeThreadMessageMetadataRecord(metadata).capability === 'refine_response'
        ? normalizeRefinementMarkdown(assistantMessage)
        : assistantMessage;
    const created = await this.chatMessageItems.create({
      data: {
        thread: { connect: { id: threadId } },
        workspaceId,
        role: 'assistant',
        content: persistedAssistantMessage,
        ...(metadata !== undefined ? { metadata } : {}),
      },
      select: { id: true },
    });
    await this.dualWriteThreadMindMessage(workspaceId, 'assistant', persistedAssistantMessage);
    await this.touchThread(threadId, workspaceId);
    return created;
  }

  buildStoredResponseVersions(
    metadata: Prisma.InputJsonValue | Prisma.JsonValue | null | undefined,
    fallbackContent?: string,
    fallbackVersionId?: string,
  ): StoredResponseVersion[] {
    return buildStoredResponseVersions(metadata, fallbackContent, fallbackVersionId);
  }

  buildStoredProcessingTraceEntry(event: KloelStreamEvent): StoredProcessingTraceEntry | null {
    return buildStoredProcessingTraceEntry(event);
  }

  appendStoredProcessingTraceEntry(entries: StoredProcessingTraceEntry[], event: KloelStreamEvent) {
    appendStoredProcessingTraceEntry(entries, event);
  }

  buildProcessingTraceSummary(entries: StoredProcessingTraceEntry[]): string | undefined {
    return buildProcessingTraceSummary(entries);
  }

  formatTraceToolLabel(toolName?: string | null): string {
    return formatTraceToolLabel(toolName);
  }

  buildThreadSummarySystemMessage(
    summary?: string,
  ): import('openai/resources/chat').ChatCompletionMessageParam | null {
    return buildThreadSummarySystemMessage(summary);
  }

  resolveClientRequestId(metadata?: Prisma.InputJsonValue): string | undefined {
    return resolveClientRequestId(metadata);
  }

  // ── Delegation to KloelThreadSummaryService ──

  async maybeGenerateThreadTitle(
    threadId: string,
    currentTitle: string,
    firstUserMessage: string,
    workspaceId: string,
    openai?: OpenAI,
  ): Promise<string> {
    return this.summaryService.maybeGenerateThreadTitle(
      threadId,
      currentTitle,
      firstUserMessage,
      workspaceId,
      openai,
    );
  }

  async maybeRefreshThreadSummary(
    threadId?: string | null,
    workspaceId?: string,
    openai?: OpenAI,
  ): Promise<void> {
    return this.summaryService.maybeRefreshThreadSummary(threadId, workspaceId, openai);
  }
}
