import { Prisma } from '@prisma/client';
import { InboxService } from './inbox.service';
import {
  buildTxClient,
  createInboxTestContext,
  messageStub,
  type ConversationUpdateArgs,
  type MessageCreateArgs,
  type MockChannelTransports,
  type MockDispatcher,
  type MockGateway,
  type MockPrisma,
  type TxClientMock,
} from './inbox.service.spec.fixtures';

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
 *
 * Shared harness: `inbox.service.spec.fixtures.ts`. Read-path and
 * conversation-management describes live in
 * `inbox.service.operations.spec.ts` (architecture size guardrail).
 */
describe('InboxService', () => {
  let service: InboxService;
  let prisma: MockPrisma;
  let gateway: MockGateway;
  let dispatcher: MockDispatcher;
  let channelTransports: MockChannelTransports;

  beforeEach(async () => {
    ({ service, prisma, gateway, dispatcher, channelTransports } = await createInboxTestContext());
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
