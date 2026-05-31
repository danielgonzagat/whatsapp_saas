import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { type KloelStreamEvent } from './kloel-stream-events';
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
  ) {
    this.logger.log('KloelThreadService initialized');
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

    const messages = await this.prisma.chatMessage.findMany({
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
      typeof this.prisma.chatMessage.count === 'function'
        ? this.prisma.chatMessage.count({ where: { threadId, thread: { workspaceId } } })
        : (async () => {
            const rows = await this.prisma.chatMessage.findMany({
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
    const created = await this.prisma.chatMessage.create({
      data: {
        thread: { connect: { id: threadId } },
        workspaceId,
        role: 'user',
        content: userMessage,
        ...(metadata !== undefined ? { metadata } : {}),
      },
      select: { id: true },
    });
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
    const created = await this.prisma.chatMessage.create({
      data: {
        thread: { connect: { id: threadId } },
        workspaceId,
        role: 'assistant',
        content: assistantMessage,
        ...(metadata !== undefined ? { metadata } : {}),
      },
      select: { id: true },
    });
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
