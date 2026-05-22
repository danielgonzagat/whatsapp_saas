import { Injectable, Logger } from '@nestjs/common';
import type { AdminChatSession } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { adminErrors } from '../common/admin-api-errors';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

export interface CreateSessionInput {
  adminUserId: string;
  workspaceId: string;
  title: string | undefined;
}

export interface ListSessionsInput {
  workspaceId: string;
  cursor: string | undefined;
  take: number | undefined;
}

export interface UpdateSessionInput {
  id: string;
  workspaceId: string;
  title: string | undefined;
}

export interface DeleteSessionInput {
  id: string;
  workspaceId: string;
  adminUserId: string;
}

@Injectable()
export class AdminChatSessionService {
  private readonly logger = new Logger(AdminChatSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {
    this.logger.debug?.(`AdminChatSessionService initialized`);
  }

  async createSession(input: CreateSessionInput): Promise<AdminChatSession> {
    const session = await this.prisma.adminChatSession.create({
      data: {
        adminUserId: input.adminUserId,
        workspaceId: input.workspaceId,
        title: input.title?.trim() || null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    void this.audit.append({
      adminUserId: input.adminUserId,
      action: 'CREATE_ADMIN_CHAT_SESSION',
      entityType: 'AdminChatSession',
      entityId: session.id,
      details: { workspaceId: input.workspaceId, title: input.title },
    });

    return this.getSession(session.id, input.workspaceId);
  }

  async listSessions(
    input: ListSessionsInput,
  ): Promise<{ items: AdminChatSession[]; nextCursor: string | null }> {
    const take = Math.min(MAX_PAGE_SIZE, Math.max(1, input.take ?? DEFAULT_PAGE_SIZE));

    const sessions = await this.prisma.adminChatSession.findMany({
      where: {
        workspaceId: input.workspaceId,
        deletedAt: null,
        ...(input.cursor ? { lastUsedAt: { lt: new Date(input.cursor) } } : {}),
      },
      orderBy: { lastUsedAt: 'desc' },
      take: take + 1,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          where: { role: 'USER' },
        },
      },
    });

    const hasMore = sessions.length > take;
    const items = hasMore ? sessions.slice(0, take) : sessions;

    const lastItem = items.length > 0 ? items[items.length - 1] : null;
    const nextCursor = lastItem ? lastItem.lastUsedAt.toISOString() : null;

    return {
      items,
      nextCursor: hasMore ? nextCursor : null,
    };
  }

  async getSession(id: string, workspaceId: string): Promise<AdminChatSession> {
    const session = await this.prisma.adminChatSession.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) {
      throw adminErrors.sessionNotFound();
    }

    return session;
  }

  async updateSession(input: UpdateSessionInput): Promise<AdminChatSession> {
    const session = await this.prisma.adminChatSession.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId, deletedAt: null },
    });

    if (!session) {
      throw adminErrors.sessionNotFound();
    }

    await this.prisma.adminChatSession.updateMany({
      where: { id: input.id, workspaceId: input.workspaceId },
      data: { title: input.title?.trim() ?? null },
    });

    const updated = await this.prisma.adminChatSession.findFirstOrThrow({
      where: { id: input.id, workspaceId: input.workspaceId, deletedAt: null },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    return updated;
  }

  async softDeleteSession(input: DeleteSessionInput): Promise<void> {
    const session = await this.prisma.adminChatSession.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId, deletedAt: null },
    });

    if (!session) {
      throw adminErrors.sessionNotFound();
    }

    const now = new Date();

    await this.prisma.adminChatSession.updateMany({
      where: { id: input.id, workspaceId: input.workspaceId },
      data: { deletedAt: now },
    });

    void this.audit.append({
      adminUserId: input.adminUserId,
      action: 'DELETE_ADMIN_CHAT_SESSION',
      entityType: 'AdminChatSession',
      entityId: input.id,
      details: { workspaceId: input.workspaceId },
    });
  }
}
