import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { InboxGateway } from './inbox.gateway';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import {
  buildConversationOperationalState,
  type ConversationOperationalLike,
} from '../whatsapp/agent-conversation-state.util';

@Injectable()
export class InboxService {
  constructor(
    private prisma: PrismaService,
    private gateway: InboxGateway,
    private webhookDispatcher: WebhookDispatcherService,
    private moduleRef: ModuleRef,
  ) {}

  async listAgents(workspaceId: string) {
    return this.prisma.agent.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isOnline: true,
      },
      orderBy: [{ isOnline: 'desc' }, { name: 'asc' }],
      take: 100,
    });
  }

  /**
   * Cria ou recupera uma conversa para um contato
   */
  async getOrCreateConversation(
    workspaceId: string,
    contactId: string,
    channel: string = 'WHATSAPP',
    options?: { initialLastMessageAt?: Date | string | null },
  ) {
    const existing = await this.prisma.conversation.findFirst({
      where: { workspaceId, contactId, status: { not: 'CLOSED' } },
    });

    if (existing) return existing;

    const initialLastMessageAt = this.normalizeDate(options?.initialLastMessageAt);

    return this.prisma.conversation.create({
      data: {
        workspaceId,
        contactId,
        status: 'OPEN',
        channel,
        priority: 'MEDIUM',
        ...(initialLastMessageAt ? { lastMessageAt: initialLastMessageAt } : {}),
      },
    });
  }

  /**
   * Helper para salvar mensagem via telefone (resolve contato automaticamente)
   */
  async saveMessageByPhone(data: {
    workspaceId: string;
    phone: string;
    content: string;
    direction: 'INBOUND' | 'OUTBOUND';
    externalId?: string;
    type?: string;
    channel?: string;
    mediaUrl?: string;
    status?: string;
    createdAt?: Date | string | null;
    countAsUnread?: boolean;
    resetUnreadOnOutbound?: boolean;
    silent?: boolean;
  }) {
    // 1. Find or Create Contact
    let contact = await this.prisma.contact.findUnique({
      where: {
        workspaceId_phone: {
          workspaceId: data.workspaceId,
          phone: data.phone,
        },
      },
    });

    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          workspaceId: data.workspaceId,
          phone: data.phone,
          name: null,
        },
      });
    }

    // 2. Save Message
    return this.saveMessage({
      workspaceId: data.workspaceId,
      contactId: contact.id,
      content: data.content,
      direction: data.direction,
      externalId: data.externalId,
      type: data.type,
      channel: data.channel,
      mediaUrl: data.mediaUrl,
      status: data.status,
      createdAt: data.createdAt,
      countAsUnread: data.countAsUnread,
      resetUnreadOnOutbound: data.resetUnreadOnOutbound,
      silent: data.silent,
    });
  }

  /**
   * Registra uma nova mensagem (Inbound ou Outbound) e notifica via WebSocket
   */
  async saveMessage(data: {
    workspaceId: string;
    contactId: string;
    content: string;
    direction: 'INBOUND' | 'OUTBOUND';
    externalId?: string;
    type?: string;
    channel?: string;
    mediaUrl?: string;
    status?: string;
    createdAt?: Date | string | null;
    countAsUnread?: boolean;
    resetUnreadOnOutbound?: boolean;
    silent?: boolean;
  }) {
    const messageCreatedAt = this.normalizeDate(data.createdAt) || new Date();

    // 1. Garante que existe conversa aberta
    const conversation = await this.getOrCreateConversation(
      data.workspaceId,
      data.contactId,
      data.channel || 'WHATSAPP',
      {
        initialLastMessageAt: messageCreatedAt,
      },
    );

    // 2. Salva a mensagem
    const message = await this.prisma.message.create({
      data: {
        workspaceId: data.workspaceId,
        contactId: data.contactId,
        conversationId: conversation.id,
        content: data.content,
        direction: data.direction,
        externalId: data.externalId,
        type: data.type || 'TEXT',
        mediaUrl: data.mediaUrl,
        status: data.status || 'DELIVERED',
        createdAt: messageCreatedAt,
      },
    });

    const shouldCountAsUnread = data.countAsUnread ?? data.direction === 'INBOUND';
    const shouldResetUnread = data.resetUnreadOnOutbound ?? data.direction === 'OUTBOUND';
    const currentLastMessageAt =
      conversation.lastMessageAt instanceof Date
        ? conversation.lastMessageAt
        : this.normalizeDate(conversation.lastMessageAt);
    const nextLastMessageAt =
      currentLastMessageAt && currentLastMessageAt > messageCreatedAt
        ? currentLastMessageAt
        : messageCreatedAt;
    const conversationUpdate: Record<string, unknown> = {
      lastMessageAt: nextLastMessageAt,
    };

    if (shouldCountAsUnread) {
      conversationUpdate.unreadCount = { increment: 1 };
    } else if (shouldResetUnread) {
      conversationUpdate.unreadCount = { set: 0 };
    }

    // 3. Atualiza a conversa (lastMessageAt, unreadCount)
    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: conversationUpdate,
      select: {
        id: true,
        status: true,
        unreadCount: true,
        lastMessageAt: true,
        contact: { select: { id: true, name: true, phone: true } },
      },
    });

    // 4. Emite evento via WebSocket
    if (!data.silent) {
      this.gateway.emitToWorkspace(data.workspaceId, 'message:new', message);
      this.gateway.emitToWorkspace(data.workspaceId, 'conversation:update', {
        ...updatedConversation,
        lastMessageStatus:
          data.direction === 'OUTBOUND' ? message.status || 'SENT' : message.status || null,
      });

      // 5. Dispatch Webhook
      await this.webhookDispatcher.dispatch(data.workspaceId, 'message.received', message);
    }

    return message;
  }

  private normalizeDate(value?: Date | string | null): Date | null {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  async listConversations(workspaceId: string) {
    const convs = await this.prisma.conversation.findMany({
      where: { workspaceId },
      include: {
        contact: true,
        assignedAgent: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, direction: true, errorCode: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return convs.map((c) => ({
      ...buildConversationOperationalState(c as ConversationOperationalLike),
      ...c,
      lastMessageStatus: c.messages?.[0]?.status || null,
      lastMessageErrorCode: c.messages?.[0]?.errorCode || null,
      lastMessageDirection: c.messages?.[0]?.direction || null,
      // Evita enviar payload de mensagens completo na listagem
      messages: undefined,
    }));
  }

  async getMessages(conversationId: string, workspaceId?: string) {
    let convWorkspaceId: string | null = null;
    if (workspaceId) {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (!conv) {
        throw new NotFoundException('Conversação não encontrada');
      }
      if (conv.workspaceId !== workspaceId) {
        throw new ForbiddenException('Acesso negado a esta conversação');
      }
      convWorkspaceId = conv.workspaceId;
    }

    // Marca como lida (zera unread) ao abrir a conversa
    if (convWorkspaceId) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { unreadCount: 0 },
      });
      // Notifica front para refletir unread zero
      this.gateway.emitToWorkspace(convWorkspaceId, 'conversation:update', {
        id: conversationId,
        unreadCount: 0,
      });
    }

    return this.prisma.message.findMany({
      where: { conversationId },
      select: {
        id: true,
        content: true,
        direction: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        contactId: true,
        agentId: true,
        workspaceId: true,
        conversationId: true,
        mediaUrl: true,
        externalId: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  async updateStatus(
    workspaceId: string,
    conversationId: string,
    status: 'OPEN' | 'CLOSED' | 'SNOOZED',
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, workspaceId: true },
    });

    if (!conversation || conversation.workspaceId !== workspaceId) {
      throw new ForbiddenException('Acesso negado a esta conversação');
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status },
      include: { contact: true },
    });
    this.gateway.emitToWorkspace(updated.workspaceId, 'conversation:update', updated);
    return updated;
  }

  async assignAgent(workspaceId: string, conversationId: string, agentId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, workspaceId: true },
    });

    if (!conversation || conversation.workspaceId !== workspaceId) {
      throw new ForbiddenException('Acesso negado a esta conversação');
    }

    if (agentId) {
      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId },
        select: { workspaceId: true },
      });
      if (!agent || agent.workspaceId !== workspaceId) {
        throw new ForbiddenException('Agente não pertence a este workspace');
      }
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        assignedAgentId: agentId || null,
        mode: agentId ? 'HUMAN' : 'AI',
      },
      include: { assignedAgent: true },
    });
    this.gateway.emitToWorkspace(updated.workspaceId, 'conversation:update', updated);
    return updated;
  }

  /**
   * Envia uma resposta humana a uma conversa existente.
   * Salva a mensagem outbound e dispara o envio via WhatsApp.
   */
  async replyToConversation(workspaceId: string, conversationId: string, content: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversação não encontrada');
    }
    if (conversation.workspaceId !== workspaceId) {
      throw new ForbiddenException('Acesso negado a esta conversação');
    }

    const phone = conversation.contact?.phone;
    if (!phone) {
      throw new NotFoundException('Contato sem telefone associado');
    }

    // Send via WhatsApp (lazy-resolve to avoid circular dependency)
    const { WhatsappService } = await import('../whatsapp/whatsapp.service');
    const whatsapp = this.moduleRef.get(WhatsappService, { strict: false });
    // messageLimit: enforced via PlanLimitsService.trackMessageSend
    const result = await whatsapp.sendMessage(workspaceId, phone, content);

    // Direct sends persist the message internally; for queued sends,
    // persist immediately so the inbox reflects the reply right away.
    if ((result as any)?.queued) {
      await this.saveMessage({
        workspaceId,
        contactId: conversation.contactId,
        content,
        direction: 'OUTBOUND',
        channel: conversation.channel || 'WHATSAPP',
        status: 'PENDING',
      });
    }

    return result;
  }
}
