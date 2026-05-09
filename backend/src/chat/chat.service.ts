import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async getMessages(
    workspaceId: string,
    conversationId: string,
    cursor?: string,
    limit = 50,
  ): Promise<PaginatedMessages> {
    const where = {
      threadId: conversationId,
      workspaceId,
      deletedAt: null,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    };

    const messages = await this.prisma.chatMessage.findMany({
      where,
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

    const message = await this.prisma.chatMessage.create({
      data: { threadId: conversationId, workspaceId, userId, role, content },
      select: { id: true, role: true, content: true, createdAt: true, userId: true },
    });

    await this.prisma.chatThread.updateMany({
      where: { id: conversationId, workspaceId },
      data: { updatedAt: new Date() },
    });

    return message;
  }
}
