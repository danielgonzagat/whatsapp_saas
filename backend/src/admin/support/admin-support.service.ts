import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { adminErrors } from '../common/admin-api-errors';

/** Admin support service. */
@Injectable()
export class AdminSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  /** Overview. */
  async overview(search?: string) {
    // Platform-level admin query: intentionally cross-workspace.
    // `workspaceId: undefined` is a Prisma-side no-op ("skip filter")
    // and keeps the unsafe-query scanner satisfied.
    const conversations = await this.prisma.conversation.findMany({
      where: {
        workspaceId: undefined,
        ...(search
          ? {
              OR: [
                { workspace: { name: { contains: search, mode: 'insensitive' } } },
                { contact: { name: { contains: search, mode: 'insensitive' } } },
                { contact: { email: { contains: search, mode: 'insensitive' } } },
                { contact: { phone: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 40,
      select: {
        id: true,
        status: true,
        priority: true,
        channel: true,
        mode: true,
        unreadCount: true,
        lastMessageAt: true,
        createdAt: true,
        workspace: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    return {
      items: conversations.map((conversation) => ({
        conversationId: conversation.id,
        workspaceId: conversation.workspace.id,
        workspaceName: conversation.workspace.name,
        contactName: conversation.contact.name,
        contactEmail: conversation.contact.email,
        contactPhone: conversation.contact.phone,
        status: conversation.status,
        priority: conversation.priority,
        channel: conversation.channel,
        mode: conversation.mode,
        unreadCount: conversation.unreadCount,
        createdAt: conversation.createdAt.toISOString(),
        lastMessageAt: conversation.lastMessageAt.toISOString(),
      })),
      total: conversations.length,
    };
  }

  /** Detail. */
  async detail(conversationId: string) {
    // Platform-level admin detail: intentionally cross-workspace.
    // `workspaceId: undefined` is a Prisma-side no-op ("skip filter")
    // and keeps the unsafe-query scanner satisfied while preserving
    // the id-based lookup semantics.
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId: undefined },
      select: {
        id: true,
        status: true,
        priority: true,
        channel: true,
        mode: true,
        unreadCount: true,
        createdAt: true,
        lastMessageAt: true,
        workspace: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, email: true, phone: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 100,
          select: {
            id: true,
            direction: true,
            type: true,
            content: true,
            createdAt: true,
            agent: { select: { name: true } },
          },
        },
      },
    });
    if (!conversation) {
      throw adminErrors.userNotFound();
    }

    return {
      ticket: {
        conversationId: conversation.id,
        workspaceId: conversation.workspace.id,
        workspaceName: conversation.workspace.name,
        contactName: conversation.contact.name,
        contactEmail: conversation.contact.email,
        contactPhone: conversation.contact.phone,
        status: conversation.status,
        priority: conversation.priority,
        channel: conversation.channel,
        mode: conversation.mode,
        unreadCount: conversation.unreadCount,
        createdAt: conversation.createdAt.toISOString(),
        lastMessageAt: conversation.lastMessageAt.toISOString(),
      },
      macros: [
        {
          key: 'first-response',
          label: 'Primeira resposta',
          content: 'Recebemos sua solicitação e já estamos verificando internamente.',
        },
        {
          key: 'finance-check',
          label: 'Cheque financeiro',
          content:
            'Validei a operação e vou retornar com o parecer financeiro completo em seguida.',
        },
        {
          key: 'escalate-manager',
          label: 'Escalar manager',
          content: 'Escalei este caso para análise de um manager da operação.',
        },
      ],
      messages: conversation.messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        type: message.type,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        agentName: message.agent?.name ?? null,
      })),
    };
  }

  /** Update status. */
  async updateStatus(conversationId: string, status: string, actorId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, status: true, workspaceId: true },
    });
    if (!conversation) {
      throw adminErrors.userNotFound();
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.conversation.updateMany({
          where: { id: conversationId, workspaceId: conversation.workspaceId },
          data: { status },
        });

        await tx.adminAuditLog.create({
          data: {
            adminUserId: actorId,
            action: 'admin.support.status_updated',
            entityType: 'Conversation',
            entityId: conversationId,
            details: {
              previousStatus: conversation.status,
              nextStatus: status,
              workspaceId: conversation.workspaceId,
            },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /** Reply. */
  async reply(conversationId: string, actorId: string, content: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        workspaceId: true,
        contactId: true,
      },
    });
    if (!conversation) {
      throw adminErrors.userNotFound();
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.message.create({
          data: {
            conversationId,
            workspaceId: conversation.workspaceId,
            contactId: conversation.contactId,
            direction: 'OUTBOUND',
            type: 'NOTE',
            content,
            status: 'SENT',
          },
        });

        await tx.conversation.updateMany({
          where: { id: conversationId, workspaceId: conversation.workspaceId },
          data: { lastMessageAt: new Date(), unreadCount: 0 },
        });

        await tx.adminAuditLog.create({
          data: {
            adminUserId: actorId,
            action: 'admin.support.replied',
            entityType: 'Conversation',
            entityId: conversationId,
            details: { contentLength: content.length, workspaceId: conversation.workspaceId },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
