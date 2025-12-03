import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InboxGateway } from './inbox.gateway';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';

@Injectable()
export class InboxService {
  constructor(
    private prisma: PrismaService,
    private gateway: InboxGateway,
    private webhookDispatcher: WebhookDispatcherService,
  ) {}

  /**
   * Cria ou recupera uma conversa para um contato
   */
  async getOrCreateConversation(
    workspaceId: string,
    contactId: string,
    channel: string = 'WHATSAPP',
  ) {
    const existing = await this.prisma.conversation.findFirst({
      where: { workspaceId, contactId, status: { not: 'CLOSED' } },
    });

    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        workspaceId,
        contactId,
        status: 'OPEN',
        channel,
        priority: 'MEDIUM',
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
          name: data.phone, // Default name
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
  }) {
    // 1. Garante que existe conversa aberta
    const conversation = await this.getOrCreateConversation(
      data.workspaceId,
      data.contactId,
      data.channel || 'WHATSAPP',
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
        status: 'DELIVERED',
      },
    });

    // 3. Atualiza a conversa (lastMessageAt, unreadCount)
    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        unreadCount:
          data.direction === 'INBOUND' ? { increment: 1 } : { set: 0 }, // Reseta se responder
      },
      select: {
        id: true,
        status: true,
        unreadCount: true,
        lastMessageAt: true,
        contact: { select: { id: true, name: true, phone: true } },
      },
    });

    // 4. Emite evento via WebSocket
    this.gateway.emitToWorkspace(data.workspaceId, 'message:new', message);
    this.gateway.emitToWorkspace(data.workspaceId, 'conversation:update', {
      ...updatedConversation,
      lastMessageStatus:
        data.direction === 'OUTBOUND' ? message.status || 'SENT' : message.status || null,
    });

    // 5. Dispatch Webhook
    await this.webhookDispatcher.dispatch(
      data.workspaceId,
      'message.received',
      message,
    );

    return message;
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
      ...c,
      lastMessageStatus: c.messages?.[0]?.status || null,
      lastMessageErrorCode: c.messages?.[0]?.errorCode || null,
      // Evita enviar payload de mensagens completo na listagem
      messages: undefined,
    })) as any;
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
      orderBy: { createdAt: 'asc' },
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
    this.gateway.emitToWorkspace(
      updated.workspaceId,
      'conversation:update',
      updated,
    );
    return updated;
  }

  async assignAgent(
    workspaceId: string,
    conversationId: string,
    agentId: string,
  ) {
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
      data: { assignedAgentId: agentId },
      include: { assignedAgent: true },
    });
    this.gateway.emitToWorkspace(
      updated.workspaceId,
      'conversation:update',
      updated,
    );
    return updated;
  }
}
