import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { adminErrors } from '../common/admin-api-errors';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

export interface CreateSessionInput {
  adminUserId: string;
  workspaceId: string;
  title?: string;
}

export interface ListSessionsInput {
  workspaceId: string;
  cursor?: string;
  take?: number;
}

export interface UpdateSessionInput {
  id: string;
  workspaceId: string;
  title?: string;
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
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async createSession(input: CreateSessionInput) {
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

    return session;
  }

  async listSessions(input: ListSessionsInput) {
    const take = Math.min(MAX_PAGE_SIZE, Math.max(1, input.take ?? DEFAULT_PAGE_SIZE));

    const where: Record<string, unknown> = {
      workspaceId: input.workspaceId,
      deletedAt: null,
    };

    if (input.cursor) {
      where['lastUsedAt'] = { lt: new Date(input.cursor) };
    }

    const sessions = await this.prisma.adminChatSession.findMany({
      where,
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

    const nextCursor = items.length > 0 ? items[items.length - 1].lastUsedAt.toISOString() : null;

    return {
      items,
      nextCursor: hasMore ? nextCursor : null,
    };
  }

  async getSession(id: string, workspaceId: string) {
    const session = await this.prisma.adminChatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) {
      throw adminErrors.sessionNotFound();
    }

    if (session.workspaceId !== workspaceId) {
      throw adminErrors.forbidden();
    }

    if (session.deletedAt) {
      throw adminErrors.sessionNotFound();
    }

    return session;
  }

  async updateSession(input: UpdateSessionInput) {
    const session = await this.prisma.adminChatSession.findUnique({
      where: { id: input.id },
    });

    if (!session || session.deletedAt) {
      throw adminErrors.sessionNotFound();
    }

    if (session.workspaceId !== input.workspaceId) {
      throw adminErrors.forbidden();
    }

    const updated = await this.prisma.adminChatSession.update({
      where: { id: input.id },
      data: { title: input.title?.trim() ?? null },
    });

    return updated;
  }

  async softDeleteSession(input: DeleteSessionInput) {
    const session = await this.prisma.adminChatSession.findUnique({
      where: { id: input.id },
    });

    if (!session || session.deletedAt) {
      throw adminErrors.sessionNotFound();
    }

    if (session.workspaceId !== input.workspaceId) {
      throw adminErrors.forbidden();
    }

    const now = new Date();

    await this.prisma.adminChatSession.update({
      where: { id: input.id },
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
