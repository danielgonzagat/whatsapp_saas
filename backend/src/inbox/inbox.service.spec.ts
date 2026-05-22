import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { InboxService } from './inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxGateway } from './inbox.gateway';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { ChannelTransportRegistry } from '../kloel/channel-transport.registry';

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

type FlexMock = jest.Mock & {
  mockResolvedValue: (v: unknown) => FlexMock;
  mockResolvedValueOnce: (v: unknown) => FlexMock;
  mockRejectedValue: (e: unknown) => FlexMock;
  mockReturnValue: (v: unknown) => FlexMock;
  mockImplementation: (fn: (...args: unknown[]) => unknown) => FlexMock;
};

type MockPrisma = {
  conversation: {
    findFirst: FlexMock;
    findFirstOrThrow: FlexMock;
    findUnique: FlexMock;
    create: FlexMock;
    update: FlexMock;
    updateMany: FlexMock;
  };
  message: { create: FlexMock };
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
      conversation: {
        findFirst: jest.fn() as FlexMock,
        findFirstOrThrow: jest.fn() as FlexMock,
        findUnique: jest.fn() as FlexMock,
        create: jest.fn() as FlexMock,
        update: jest.fn() as FlexMock,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }) as FlexMock,
      },
      message: { create: jest.fn() as FlexMock },
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
  });
});
