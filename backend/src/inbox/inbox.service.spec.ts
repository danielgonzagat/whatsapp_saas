import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { InboxService } from './inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxGateway } from './inbox.gateway';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { ChannelTransportRegistry } from '../kloel/channel-transport.registry';
import { type FlexMock } from '../../test/helpers/prisma.mock';

/**
 * P6-6 (I14 + I15) coverage for the inbox service.
 *
 * I14 — Conversation Singleton-Open: `getOrCreateConversation` survives a
 * concurrent race by catching P2002 from the partial unique index and
 * re-reading the conversation the winner just created.
 *
 * I15 — Inbound Message Atomicity: `saveMessage` runs message insert and
 * conversation metadata update inside a single `$transaction`. The mocks
 * here verify that the `$transaction` callback is invoked with a single
 * `tx` object and that all three Prisma calls (findFirst, message.create,
 * conversation.update) happen against the SAME client.
 */
type MockPrisma = {
  agent: {
    findMany: FlexMock;
    findFirst: FlexMock;
  };
  contact: {
    findUnique: FlexMock;
    create: FlexMock;
  };
  conversation: {
    findMany: FlexMock;
    findFirst: FlexMock;
    findFirstOrThrow: FlexMock;
    findMany: FlexMock;
    findUnique: FlexMock;
    create: FlexMock;
    update: FlexMock;
    updateMany: FlexMock;
  };
  contact: { findUnique: FlexMock; create: FlexMock };
  agent: { findMany: FlexMock; findFirst: FlexMock };
  message: { create: FlexMock; findMany: FlexMock };
  mindMessage: { create: FlexMock };
  $transaction: FlexMock;
};

type MockGateway = { emitToWorkspace: jest.Mock };

type MockDispatcher = { dispatch: jest.Mock };

/** Shape returned by `saveMessage` — mirrors the Prisma Message model fields. */
interface SaveMessageResult {
  id: string;
  status: string;
  contactId: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  externalId: string | null;
  direction: string;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  errorCode: string | null;
  conversationId: string | null;
  agentId: string | null;
}

const messageStub: SaveMessageResult = {
  id: 'msg-1',
  status: 'DELIVERED',
  contactId: 'contact-1',
  workspaceId: 'ws-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  externalId: null,
  direction: 'OUTBOUND',
  type: 'TEXT',
  content: null,
  mediaUrl: null,
  errorCode: null,
  conversationId: null,
  agentId: null,
};

type TxOverrides = Partial<{
  findFirst: jest.Mock;
  create: jest.Mock;
  messageCreate: jest.Mock;
  conversationUpdate: jest.Mock;
}>;

interface TxClientMock {
  conversation: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findFirstOrThrow: jest.Mock;
  };
  message: { create: jest.Mock };
}

/** Payload received by `message.create` inside `saveMessage`. */
interface MessageCreateArgs {
  data: Record<string, unknown>;
}

/** Payload received by `conversation.updateMany` inside `saveMessage`. */
interface ConversationUpdateArgs {
  data: Record<string, unknown>;
  where: Record<string, unknown>;
}

function buildTxClient(overrides: TxOverrides = {}): TxClientMock {
  return {
    conversation: {
      findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
      create:
        overrides.create ??
        jest.fn().mockResolvedValue({
          id: 'conv-1',
          workspaceId: 'ws-1',
          contactId: 'contact-1',
          channel: 'WHATSAPP',
          status: 'OPEN',
          lastMessageAt: new Date('2026-04-08T00:00:00Z'),
          unreadCount: 0,
        }),
      update:
        overrides.conversationUpdate ??
        jest.fn().mockResolvedValue({
          id: 'conv-1',
          status: 'OPEN',
          unreadCount: 1,
          lastMessageAt: new Date(),
          contact: { id: 'contact-1', name: null, phone: '5511999999999' },
        }),
      updateMany: overrides.conversationUpdate ?? jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: 'conv-1',
        status: 'OPEN',
        unreadCount: 1,
        lastMessageAt: new Date(),
        contact: { id: 'contact-1', name: null, phone: '5511999999999' },
      }),
    },
    message: {
      create:
        overrides.messageCreate ??
        jest.fn().mockResolvedValue({
          id: 'msg-1',
          conversationId: 'conv-1',
          workspaceId: 'ws-1',
          contactId: 'contact-1',
          content: 'hi',
          direction: 'INBOUND',
          status: 'DELIVERED',
        }),
    },
  };
}

describe('InboxService', () => {
  let service: InboxService;
  let prisma: MockPrisma;
  let gateway: MockGateway;
  let dispatcher: MockDispatcher;
  let channelTransports: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      agent: {
        findMany: jest.fn() as FlexMock,
        findFirst: jest.fn() as FlexMock,
      },
      contact: {
        findUnique: jest.fn() as FlexMock,
        create: jest.fn() as FlexMock,
      },
      conversation: {
        findMany: jest.fn() as FlexMock,
        findFirst: jest.fn() as FlexMock,
        findFirstOrThrow: jest.fn() as FlexMock,
        findMany: jest.fn() as FlexMock,
        findUnique: jest.fn() as FlexMock,
        create: jest.fn() as FlexMock,
        update: jest.fn() as FlexMock,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }) as FlexMock,
      },
      contact: {
        findUnique: jest.fn() as FlexMock,
        create: jest.fn() as FlexMock,
      },
      agent: {
        findMany: jest.fn() as FlexMock,
        findFirst: jest.fn() as FlexMock,
      },
      message: { create: jest.fn() as FlexMock, findMany: jest.fn() as FlexMock },
      mindMessage: { create: jest.fn().mockResolvedValue({ id: 'mind-1' }) as FlexMock },
      $transaction: jest.fn() as FlexMock,
    };
    gateway = { emitToWorkspace: jest.fn() };
    dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
    channelTransports = { send: jest.fn().mockResolvedValue({ success: true }) };

    const testingModule: TestingModule = await Test.createTestingModule({
      providers: [
        InboxService,
        { provide: PrismaService, useValue: prisma },
        { provide: InboxGateway, useValue: gateway },
        { provide: WebhookDispatcherService, useValue: dispatcher },
        { provide: ChannelTransportRegistry, useValue: channelTransports },
      ],
    }).compile();

    service = testingModule.get(InboxService);
  });

  describe('getOrCreateConversation (I14 — Conversation Singleton-Open)', () => {
    it('returns the existing OPEN conversation if one already exists', async () => {
      const existing = {
        id: 'conv-existing',
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        channel: 'WHATSAPP',
        status: 'OPEN',
        lastMessageAt: new Date(),
        unreadCount: 3,
      };
      prisma.conversation.findFirst.mockResolvedValue(existing);

      const result = await service.getOrCreateConversation('ws-1', 'contact-1', 'WHATSAPP');

      expect(result).toBe(existing);
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('creates a new conversation when none exists', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      const created = {
        id: 'conv-new',
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        channel: 'WHATSAPP',
        status: 'OPEN',
      };
      prisma.conversation.create.mockResolvedValue(created);

      const result = await service.getOrCreateConversation('ws-1', 'contact-1', 'WHATSAPP');

      expect(result).toBe(created);
      expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    });

    it('catches P2002 on a lost race and re-reads the winning conversation (I14)', async () => {
      const winner = {
        id: 'conv-winner',
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        channel: 'WHATSAPP',
        status: 'OPEN',
      };
      // First pass: findFirst sees nothing, create() races and loses.
      // Second pass: findFirst sees the winning conversation.
      prisma.conversation.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (workspaceId, contactId, channel)',
        { code: 'P2002', clientVersion: 'test' },
      );
      prisma.conversation.create.mockRejectedValueOnce(p2002);

      const result = await service.getOrCreateConversation('ws-1', 'contact-1', 'WHATSAPP');

      expect(result).toBe(winner);
      expect(prisma.conversation.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    });

    it('rethrows non-P2002 Prisma errors instead of masking them', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      const p2003 = new Prisma.PrismaClientKnownRequestError('fk error', {
        code: 'P2003',
        clientVersion: 'test',
      });
      prisma.conversation.create.mockRejectedValue(p2003);

      await expect(
        service.getOrCreateConversation('ws-1', 'contact-1', 'WHATSAPP'),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });

    it('throws after exhausting retries on sustained P2002', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.conversation.create.mockRejectedValue(p2002);

      await expect(
        service.getOrCreateConversation('ws-1', 'contact-1', 'WHATSAPP'),
      ).rejects.toThrow(/failed to resolve conversation/);
    });
  });

  describe('saveMessageByPhone', () => {
    it('uses an existing contact and forwards optional message fields', async () => {
      const createdAt = new Date('2026-04-08T12:00:00Z');
      prisma.contact.findUnique.mockResolvedValue({ id: 'contact-existing' });
      const saveMessageSpy = jest.spyOn(service, 'saveMessage').mockResolvedValue(messageStub);

      await service.saveMessageByPhone({
        workspaceId: 'ws-1',
        phone: '5511999999999',
        content: 'hi',
        direction: 'INBOUND',
        externalId: 'wamid-1',
        type: 'IMAGE',
        channel: 'WHATSAPP',
        mediaUrl: 'https://cdn.example/image.png',
        status: 'DELIVERED',
        createdAt,
        countAsUnread: false,
        resetUnreadOnOutbound: true,
        silent: true,
      });

      expect(prisma.contact.create).not.toHaveBeenCalled();
      expect(saveMessageSpy).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: 'contact-existing',
        content: 'hi',
        direction: 'INBOUND',
        externalId: 'wamid-1',
        type: 'IMAGE',
        channel: 'WHATSAPP',
        mediaUrl: 'https://cdn.example/image.png',
        status: 'DELIVERED',
        createdAt,
        countAsUnread: false,
        resetUnreadOnOutbound: true,
        silent: true,
      });
    });

    it('creates a contact for a new phone and omits undefined options', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'contact-new' });
      const saveMessageSpy = jest.spyOn(service, 'saveMessage').mockResolvedValue(messageStub);

      await service.saveMessageByPhone({
        workspaceId: 'ws-1',
        phone: '5511888888888',
        content: 'new lead',
        direction: 'OUTBOUND',
      });

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: { workspaceId: 'ws-1', phone: '5511888888888', name: null },
      });
      expect(saveMessageSpy).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: 'contact-new',
        content: 'new lead',
        direction: 'OUTBOUND',
      });
    });
  });

  describe('saveMessage (I15 — Inbound Message Atomicity)', () => {
    it('runs findFirst + message.create + conversation.update inside ONE $transaction', async () => {
      const tx = buildTxClient();
      prisma.$transaction.mockImplementation(
        async (cb: (tx: TxClientMock) => Promise<unknown>, _opts: unknown) => {
          return cb(tx);
        },
      );

      await service.saveMessage({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        content: 'hi',
        direction: 'INBOUND',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.conversation.findFirst).toHaveBeenCalled();
      expect(tx.message.create).toHaveBeenCalled();
      expect(tx.conversation.updateMany).toHaveBeenCalled();
      // CRITICAL: no Prisma calls should happen OUTSIDE the transaction
      // for the DB-write portion of saveMessage.
      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('emits a WebSocket event and dispatches a webhook AFTER the transaction commits', async () => {
      const commitOrder: string[] = [];
      const tx = buildTxClient({
        messageCreate: jest.fn(async (args: MessageCreateArgs) => {
          commitOrder.push('message.create');
          return { id: 'msg-1', ...args.data };
        }),
        conversationUpdate: jest.fn(async (args: ConversationUpdateArgs) => {
          commitOrder.push('conversation.update');
          return {
            id: 'conv-1',
            status: 'OPEN',
            unreadCount: 1,
            lastMessageAt: new Date(),
            contact: { id: 'contact-1', name: null, phone: '55' },
            ...args.data,
          };
        }),
      });
      prisma.$transaction.mockImplementation(async (cb: (tx: TxClientMock) => Promise<unknown>) => {
        const result = await cb(tx);
        commitOrder.push('tx.commit');
        return result;
      });
      gateway.emitToWorkspace.mockImplementation(() => commitOrder.push('ws.emit'));
      dispatcher.dispatch.mockImplementation(() =>
        Promise.resolve().then(() => commitOrder.push('webhook.dispatch')),
      );

      await service.saveMessage({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        content: 'hi',
        direction: 'INBOUND',
      });

      // message.create and conversation.update happen inside the tx.
      const msgIdx = commitOrder.indexOf('message.create');
      const updateIdx = commitOrder.indexOf('conversation.update');
      const commitIdx = commitOrder.indexOf('tx.commit');
      const emitIdx = commitOrder.indexOf('ws.emit');

      expect(msgIdx).toBeGreaterThan(-1);
      expect(updateIdx).toBeGreaterThan(-1);
      expect(commitIdx).toBeGreaterThan(msgIdx);
      expect(commitIdx).toBeGreaterThan(updateIdx);
      // At-least-once projections happen AFTER commit.
      expect(emitIdx).toBeGreaterThan(commitIdx);
    });

    it('does NOT emit a WebSocket event when the transaction throws', async () => {
      const tx = buildTxClient({
        messageCreate: jest.fn().mockRejectedValue(new Error('db failed')),
      });
      prisma.$transaction.mockImplementation(async (cb: (tx: TxClientMock) => Promise<unknown>) =>
        cb(tx),
      );

      await expect(
        service.saveMessage({
          workspaceId: 'ws-1',
          contactId: 'contact-1',
          content: 'hi',
          direction: 'INBOUND',
        }),
      ).rejects.toThrow('db failed');

      expect(gateway.emitToWorkspace).not.toHaveBeenCalled();
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('respects silent: true (no websocket, no webhook)', async () => {
      const tx = buildTxClient();
      prisma.$transaction.mockImplementation(async (cb: (tx: TxClientMock) => Promise<unknown>) =>
        cb(tx),
      );

      await service.saveMessage({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        content: 'hi',
        direction: 'OUTBOUND',
        silent: true,
      });

      expect(gateway.emitToWorkspace).not.toHaveBeenCalled();
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('listAgents', () => {
    it('lists agents scoped to the workspace with stable ordering', async () => {
      prisma.agent.findMany.mockResolvedValue([]);

      await service.listAgents('ws-1');

      expect(prisma.agent.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
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
    });
  });

  describe('saveMessageByPhone', () => {
    it('reuses an existing contact and forwards optional message fields', async () => {
      prisma.contact.findUnique.mockResolvedValue({ id: 'contact-1' });
      const saveMessageSpy = jest.spyOn(service, 'saveMessage').mockResolvedValue(messageStub);
      const createdAt = '2026-01-01T00:00:00.000Z';

      await service.saveMessageByPhone({
        workspaceId: 'ws-1',
        phone: '5511999999999',
        content: 'com anexo',
        direction: 'INBOUND',
        externalId: 'wamid-1',
        type: 'IMAGE',
        channel: 'INSTAGRAM',
        mediaUrl: 'https://cdn.example/image.jpg',
        status: 'READ',
        createdAt,
        countAsUnread: false,
        resetUnreadOnOutbound: true,
        silent: true,
      });

      expect(prisma.contact.findUnique).toHaveBeenCalledWith({
        where: {
          workspaceId_phone: {
            workspaceId: 'ws-1',
            phone: '5511999999999',
          },
        },
      });
      expect(prisma.contact.create).not.toHaveBeenCalled();
      expect(saveMessageSpy).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        content: 'com anexo',
        direction: 'INBOUND',
        externalId: 'wamid-1',
        type: 'IMAGE',
        channel: 'INSTAGRAM',
        mediaUrl: 'https://cdn.example/image.jpg',
        status: 'READ',
        createdAt,
        countAsUnread: false,
        resetUnreadOnOutbound: true,
        silent: true,
      });
    });

    it('creates the contact when the phone has not been seen before', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'contact-new' });
      const saveMessageSpy = jest.spyOn(service, 'saveMessage').mockResolvedValue(messageStub);

      await service.saveMessageByPhone({
        workspaceId: 'ws-1',
        phone: '5511888888888',
        content: 'novo contato',
        direction: 'OUTBOUND',
      });

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-1',
          phone: '5511888888888',
          name: null,
        },
      });
      expect(saveMessageSpy).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: 'contact-new',
        content: 'novo contato',
        direction: 'OUTBOUND',
      });
    });
  });

  describe('listConversations', () => {
    it('maps latest message status fields and strips the nested messages payload', async () => {
      const lastMessageAt = new Date('2026-04-08T12:00:00.000Z');
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          workspaceId: 'ws-1',
          contactId: 'contact-1',
          status: 'OPEN',
          mode: 'AI',
          assignedAgentId: null,
          unreadCount: 2,
          lastMessageAt,
          contact: { id: 'contact-1', phone: '5511999999999', name: null },
          assignedAgent: null,
          messages: [
            {
              id: 'msg-1',
              direction: 'INBOUND',
              status: 'FAILED',
              errorCode: 'WA_500',
              createdAt: lastMessageAt,
            },
          ],
        },
        {
          id: 'conv-2',
          workspaceId: 'ws-1',
          contactId: 'contact-2',
          status: 'CLOSED',
          mode: 'HUMAN',
          assignedAgentId: 'agent-1',
          unreadCount: 0,
          lastMessageAt: null,
          contact: { id: 'contact-2', phone: '5511777777777', name: 'Cliente' },
          assignedAgent: { id: 'agent-1' },
          messages: [],
        },
      ]);

      const result = await service.listConversations('ws-1');

      expect(prisma.conversation.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
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
      expect(result[0]).toMatchObject({
        lastMessageStatus: 'FAILED',
        lastMessageErrorCode: 'WA_500',
        lastMessageDirection: 'INBOUND',
        pending: true,
        pendingMessages: 2,
      });
      expect(result[0].messages).toBeUndefined();
      expect(result[1]).toMatchObject({
        lastMessageStatus: null,
        lastMessageErrorCode: null,
        lastMessageDirection: null,
        blockedReason: 'conversation_closed',
      });
    });
  });

  describe('getMessages', () => {
    it('rejects workspace mismatches before reading messages', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.getMessages('conv-1', 'ws-1')).rejects.toThrow(
        'Conversação não encontrada',
      );

      expect(prisma.message.findMany).not.toHaveBeenCalled();
      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('clears unread state and emits an update when workspace is supplied', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', workspaceId: 'ws-1' });
      prisma.message.findMany.mockResolvedValue([{ id: 'msg-1', content: 'oi' }]);

      const result = await service.getMessages('conv-1', 'ws-1');

      expect(result).toEqual([{ id: 'msg-1', content: 'oi' }]);
      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', workspaceId: 'ws-1' },
        data: { unreadCount: 0 },
      });
      expect(gateway.emitToWorkspace).toHaveBeenCalledWith('ws-1', 'conversation:update', {
        id: 'conv-1',
        unreadCount: 0,
      });
      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1' },
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
    });

    it('can read messages without mutating unread state when workspace is omitted', async () => {
      prisma.message.findMany.mockResolvedValue([]);

      await service.getMessages('conv-1');

      expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
      expect(gateway.emitToWorkspace).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('rejects updates to conversations outside the workspace', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus('ws-1', 'conv-1', 'CLOSED')).rejects.toThrow(
        'Acesso negado a esta conversação',
      );

      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('updates the scoped conversation and emits the refreshed payload', async () => {
      const updated = { id: 'conv-1', workspaceId: 'ws-1', status: 'CLOSED', contact: null };
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', workspaceId: 'ws-1' });
      prisma.conversation.findFirstOrThrow.mockResolvedValue(updated);

      const result = await service.updateStatus('ws-1', 'conv-1', 'CLOSED');

      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', workspaceId: 'ws-1' },
        data: { status: 'CLOSED' },
      });
      expect(gateway.emitToWorkspace).toHaveBeenCalledWith('ws-1', 'conversation:update', updated);
      expect(result).toBe(updated);
    });
  });

  describe('assignAgent', () => {
    it('rejects assignment when the conversation is outside the workspace', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.assignAgent('ws-1', 'conv-1', 'agent-1')).rejects.toThrow(
        'Acesso negado a esta conversação',
      );
    });

    it('rejects agents from another workspace', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', workspaceId: 'ws-1' });
      prisma.agent.findFirst.mockResolvedValue(null);

      await expect(service.assignAgent('ws-1', 'conv-1', 'agent-1')).rejects.toThrow(
        'Agente não pertence a este workspace',
      );

      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('assigns a workspace agent and moves the conversation to human mode', async () => {
      const updated = { id: 'conv-1', workspaceId: 'ws-1', assignedAgentId: 'agent-1' };
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', workspaceId: 'ws-1' });
      prisma.agent.findFirst.mockResolvedValue({ workspaceId: 'ws-1' });
      prisma.conversation.findFirstOrThrow.mockResolvedValue(updated);

      const result = await service.assignAgent('ws-1', 'conv-1', 'agent-1');

      expect(prisma.agent.findFirst).toHaveBeenCalledWith({
        where: { id: 'agent-1', workspaceId: 'ws-1' },
        select: { workspaceId: true },
      });
      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', workspaceId: 'ws-1' },
        data: { assignedAgentId: 'agent-1', mode: 'HUMAN' },
      });
      expect(gateway.emitToWorkspace).toHaveBeenCalledWith('ws-1', 'conversation:update', updated);
      expect(result).toBe(updated);
    });

    it('clears assignment and returns the conversation to AI mode', async () => {
      const updated = { id: 'conv-1', workspaceId: 'ws-1', assignedAgentId: null };
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', workspaceId: 'ws-1' });
      prisma.conversation.findFirstOrThrow.mockResolvedValue(updated);

      await service.assignAgent('ws-1', 'conv-1', '');

      expect(prisma.agent.findFirst).not.toHaveBeenCalled();
      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', workspaceId: 'ws-1' },
        data: { assignedAgentId: null, mode: 'AI' },
      });
    });
  });

  describe('replyToConversation', () => {
    it('persists outbound reply after the channel transport accepts the send', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        channel: 'WHATSAPP',
        contact: { phone: '5511999999999' },
      });
      channelTransports.send.mockResolvedValue({ success: true, messageId: 'wamid-1' });
      const saveMessageSpy = jest.spyOn(service, 'saveMessage').mockResolvedValue(messageStub);

      await service.replyToConversation('ws-1', 'conv-1', 'oi');

      expect(channelTransports.send).toHaveBeenCalledWith('ws-1', {
        workspaceId: 'ws-1',
        channel: 'whatsapp',
        recipientId: '5511999999999',
        content: 'oi',
      });
      expect(saveMessageSpy).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        content: 'oi',
        direction: 'OUTBOUND',
        channel: 'WHATSAPP',
        status: 'PENDING',
      });
    });

    it('persists a pending outbound message when WhatsApp confirms queueing', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        channel: 'WHATSAPP',
        contact: { phone: '5511999999999' },
      });
      channelTransports.send.mockResolvedValue({ success: true, messageId: 'job-1' });
      const saveMessageSpy = jest.spyOn(service, 'saveMessage').mockResolvedValue(messageStub);

      await service.replyToConversation('ws-1', 'conv-1', 'oi');

      expect(saveMessageSpy).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        content: 'oi',
        direction: 'OUTBOUND',
        channel: 'WHATSAPP',
        status: 'PENDING',
      });
    });

    it('throws when the conversation cannot be found in the workspace', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.replyToConversation('ws-1', 'conv-1', 'oi')).rejects.toThrow(
        'Conversação não encontrada',
      );

      expect(channelTransports.send).not.toHaveBeenCalled();
    });

    it('throws when the contact has no phone number', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        channel: 'WHATSAPP',
        contact: { phone: null },
      });

      await expect(service.replyToConversation('ws-1', 'conv-1', 'oi')).rejects.toThrow(
        'Contato sem telefone associado',
      );

      expect(channelTransports.send).not.toHaveBeenCalled();
    });

    it('surfaces transport blocks without persisting a reply', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        channel: null,
        contact: { phone: '5511999999999' },
      });
      channelTransports.send.mockResolvedValue({ success: false, blockedReason: 'policy_block' });
      const saveMessageSpy = jest.spyOn(service, 'saveMessage').mockResolvedValue(messageStub);

      await expect(service.replyToConversation('ws-1', 'conv-1', 'oi')).rejects.toThrow(
        'policy_block',
      );

      expect(saveMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe('MindMessage dual-write (additive, flag-gated)', () => {
    const FLAG = 'KLOEL_MINDMESSAGE_DUALWRITE';
    let prevFlag: string | undefined;

    beforeEach(() => {
      prevFlag = process.env[FLAG];
      const tx = buildTxClient();
      prisma.$transaction.mockImplementation(async (cb: (tx: TxClientMock) => Promise<unknown>) =>
        cb(tx),
      );
    });

    afterEach(() => {
      if (prevFlag === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = prevFlag;
      }
    });

    it('does NOT write to prisma.mindMessage when the flag is OFF', async () => {
      delete process.env[FLAG];

      await service.saveMessage({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        content: 'hi',
        direction: 'INBOUND',
      });

      expect(prisma.mindMessage.create).not.toHaveBeenCalled();
    });

    it('dual-writes to prisma.mindMessage with source=channel and role=user for INBOUND when the flag is ON', async () => {
      process.env[FLAG] = 'true';

      await service.saveMessage({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        content: 'hi there',
        direction: 'INBOUND',
      });

      expect(prisma.mindMessage.create).toHaveBeenCalledTimes(1);
      expect(prisma.mindMessage.create).toHaveBeenCalledWith({
        data: { workspaceId: 'ws-1', source: 'channel', role: 'user', content: 'hi there' },
      });
    });

    it('maps OUTBOUND direction to role=assistant when the flag is ON', async () => {
      process.env[FLAG] = 'true';

      await service.saveMessage({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        content: 'reply',
        direction: 'OUTBOUND',
        silent: true,
      });

      expect(prisma.mindMessage.create).toHaveBeenCalledWith({
        data: { workspaceId: 'ws-1', source: 'channel', role: 'assistant', content: 'reply' },
      });
    });

    it('never breaks the legacy write when the dual-write throws (flag ON)', async () => {
      process.env[FLAG] = 'true';
      prisma.mindMessage.create.mockRejectedValueOnce(new Error('mind boom'));

      const result = await service.saveMessage({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        content: 'hi',
        direction: 'INBOUND',
      });

      // Legacy write succeeded and is returned despite the dual-write failure.
      expect(result).toBeDefined();
      expect(prisma.mindMessage.create).toHaveBeenCalledTimes(1);
    });
  });
});
