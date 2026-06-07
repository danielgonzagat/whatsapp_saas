import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MindChatMessageService } from '../kloel/mind/aliases/mind-chat-message.service';
import { mirrorMindMessage } from '../kloel/mind/aliases/mindmessage-dualwrite.mirror';

export interface ChatMessageResult {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  userId: string | null;
}

export interface PaginatedMessages {
  items: ChatMessageResult[];
  nextCursor: string | null;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mindChatMessage?: MindChatMessageService,
  ) {
    this.logger.log('ChatService initialized');
  }

  /** Canonical Brain → Mind chat-message delegate (raw-Prisma fallback). */
  private get chatMessageItems() {
    return this.mindChatMessage?.items ?? this.prisma.chatMessage;
  }

  async getMessages(
    workspaceId: string,
    conversationId: string,
    cursor?: string,
    limit = 50,
  ): Promise<PaginatedMessages> {
    const messages = await this.chatMessageItems.findMany({
      where: {
        threadId: conversationId,
        workspaceId,
        deletedAt: null,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: { id: true, role: true, content: true, createdAt: true, userId: true },
    });

    const hasNextPage = messages.length > limit;
    const items = hasNextPage ? messages.slice(0, limit) : messages;
    const lastItem = items.length > 0 ? items[items.length - 1] : undefined;
    const nextCursor = hasNextPage && lastItem ? lastItem.createdAt.toISOString() : null;

    return { items: items.reverse(), nextCursor };
  }

  async addMessage(
    workspaceId: string,
    conversationId: string,
    userId: string,
    role: string,
    content: string,
  ) {
    await this.prisma.chatThread.findFirstOrThrow({
      where: { id: conversationId, workspaceId },
      select: { id: true },
    });

    const message = await this.chatMessageItems.create({
      data: { threadId: conversationId, workspaceId, userId, role, content },
      select: { id: true, role: true, content: true, createdAt: true, userId: true },
    });

    // ADDITIVE, flag-gated, best-effort dual-write to the canonical
    // `RAC_MindMessage` table (currently writer-less). Behind
    // `KLOEL_MINDMESSAGE_DUALWRITE` (default OFF). Any failure here is swallowed
    // with a warn-log so it can NEVER break the legacy ChatMessage write above.
    // No read path depends on this. `source: 'dashboard'` is the unified-table
    // discriminator recording which legacy surface the row came from.
    await mirrorMindMessage(
      this.prisma,
      { workspaceId, source: 'dashboard', role, content },
      (error) =>
        this.logger.warn(
          `MindMessage dual-write failed (workspaceId=${workspaceId}, ` +
            `conversationId=${conversationId}); legacy ChatMessage write succeeded ` +
            `and is unaffected: ${error instanceof Error ? error.message : String(error)}`,
        ),
    );

    await this.prisma.chatThread.updateMany({
      where: { id: conversationId, workspaceId },
      data: { updatedAt: new Date() },
    });

    return message;
  }
}
