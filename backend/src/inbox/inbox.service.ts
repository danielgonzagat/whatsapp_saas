import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import {
  type ConversationOperationalLike,
  buildConversationOperationalState,
} from '../whatsapp/agent-conversation-state.util';
import { InboxGateway } from './inbox.gateway';

/**
 * Maximum number of times getOrCreateConversation will retry after losing
 * a race to the partial unique index. Three attempts is enough to survive
 * the common case (one concurrent inbound) with margin; anything higher
 * suggests a bug or a pathological inbound burst.
 */
const GET_OR_CREATE_CONVERSATION_MAX_ATTEMPTS = 3;

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

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
   * Cria ou recupera uma conversa aberta para um contato.
   *
   * Wave 2 P6-6 / I14 — Conversation Singleton-Open
   *
   * Before the partial unique index landed, two concurrent inbound
   * messages for the same `(workspaceId, contactId, channel)` could
   * both see no existing OPEN conversation in their findFirst() call
   * and both call create(), producing TWO open conversations for the
   * same contact. The fix is the partial unique index plus an upsert-
   * with-retry loop here: the second concurrent create() now fails
   * with P2002 (unique constraint), which we catch and resolve by
   * re-reading the conversation the winning process just created.
   */
  async getOrCreateConversation(
    workspaceId: string,
    contactId: string,
    channel = 'WHATSAPP',
    options?: { initialLastMessageAt?: Date | string | null },
  ) {
    return this.getOrCreateConversationWithClient(
      this.prisma,
      workspaceId,
      contactId,
      channel,
      options,
    );
  }

  /**
   * Transaction-aware variant of `getOrCreateConversation`. Accepts
   * either the top-level PrismaService or a `Prisma.TransactionClient`
   * from inside a `$transaction` callback. `saveMessage` uses this so
   * the "resolve conversation + insert message + update metadata" flow
   * runs atomically and a crash cannot leave the inbox half-updated.
   */
  private async getOrCreateConversationWithClient(
    client: PrismaService | Prisma.TransactionClient,
    workspaceId: string,
    contactId: string,
    channel: string,
    options?: { initialLastMessageAt?: Date | string | null },
  ) {
    const initialLastMessageAt = this.normalizeDate(options?.initialLastMessageAt);

    for (let attempt = 0; attempt < GET_OR_CREATE_CONVERSATION_MAX_ATTEMPTS; attempt++) {
      const existing = await client.conversation.findFirst({
        where: { workspaceId, contactId, channel, status: { not: 'CLOSED' } },
      });
      if (existing) return existing;

      try {
        return await client.conversation.create({
          data: {
            workspaceId,
            contactId,
            status: 'OPEN',
            channel,
            priority: 'MEDIUM',
            ...(initialLastMessageAt ? { lastMessageAt: initialLastMessageAt } : {}),
          },
        });
      } catch (err) {
        // P2002 = unique constraint violation on the partial unique index,
        // which means another concurrent worker just created the open
        // conversation. Re-read on the next loop iteration and return it.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          this.logger.log(
            `getOrCreateConversation lost race on (ws=${workspaceId}, contact=${contactId}, ch=${channel}); retrying`,
          );
          continue;
        }
        throw err;
      }
    }

    throw new Error(
      `getOrCreateConversation: failed to resolve conversation after ${GET_OR_CREATE_CONVERSATION_MAX_ATTEMPTS} attempts`,
    );
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
   * Registra uma nova mensagem (Inbound ou Outbound) e notifica via WebSocket.
   *
   * Wave 2 P6-6 / I15 — Inbound Message Atomicity
   *
   * Before this rewrite, saveMessage performed three separate Prisma
   * calls with no transaction wrapping them:
   *
   *   1. getOrCreateConversation (findFirst + maybe create)
   *   2. message.create()
   *   3. conversation.update(lastMessageAt, unreadCount)
   *
   * A crash between 2 and 3 left the message persisted but the
   * conversation metadata stale — the inbox UI would show the message
   * missing or the unread counter wrong. Under load (crashing workers,
   * DB connection blips) this was observable.
   *
   * I15 requires that persisting a message and updating the
   * conversation's metadata occur in a SINGLE Prisma $transaction.
   * The WebSocket emit and the webhook dispatch happen AFTER the
   * transaction commits — they are at-least-once projections of the
   * committed state, so it is fine for them to run outside the tx
   * (and failures there do not roll back the write). The "outbox"
   * model that would make those projections transactionally durable
   * is tracked as a follow-up.
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

    const { message, updatedConversation } = await this.prisma.$transaction(
      async (tx) => {
        // 1. Resolve the open conversation INSIDE the transaction, using
        //    the partial unique index + P2002-retry loop. A concurrent
        //    worker that wins the create() race forces us to re-read so
        //    we always end up pointing at the current open conversation.
        const conversation = await this.getOrCreateConversationWithClient(
          tx,
          data.workspaceId,
          data.contactId,
          data.channel || 'WHATSAPP',
          { initialLastMessageAt: messageCreatedAt },
        );

        // 2. Insert the message.
        const msg = await tx.message.create({
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

        // 3. Compute and apply the conversation metadata update in the
        //    same transaction so a crash between steps 2 and 3 is
        //    impossible — either both commits happen or neither does.
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
        const conversationUpdate: Prisma.ConversationUpdateInput = {
          lastMessageAt: nextLastMessageAt,
        };
        if (shouldCountAsUnread) {
          conversationUpdate.unreadCount = { increment: 1 };
        } else if (shouldResetUnread) {
          conversationUpdate.unreadCount = { set: 0 };
        }

        const updated = await tx.conversation.update({
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

        return { message: msg, updatedConversation: updated };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    // 4. Post-commit projections (WebSocket + webhook). These happen
    //    OUTSIDE the transaction — at-least-once delivery on top of the
    //    durable write. A crash here does NOT roll back the message.
    if (!data.silent) {
      this.gateway.emitToWorkspace(data.workspaceId, 'message:new', message);
      this.gateway.emitToWorkspace(data.workspaceId, 'conversation:update', {
        ...updatedConversation,
        lastMessageStatus:
          data.direction === 'OUTBOUND' ? message.status || 'SENT' : message.status || null,
      });

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
    // I17 — bounded read: the inbox UI paginates client-side, so a hard
    // server-side cap of 500 is the Wave 2 guardrail. Workspaces with more
    // than 500 active conversations will need cursor pagination (tracked as
    // follow-up work).
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
      take: 500,
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
