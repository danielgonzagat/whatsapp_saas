import { InboxService } from './inbox.service';
import {
  createInboxTestContext,
  messageStub,
  type MockGateway,
  type MockPrisma,
} from './inbox.service.spec.fixtures';

/**
 * Read-path and conversation-management coverage for the inbox service
 * (listAgents, saveMessageByPhone, listConversations, getMessages,
 * updateStatus, assignAgent). Split from `inbox.service.spec.ts` to honor
 * the architecture size guardrail; the shared harness lives in
 * `inbox.service.spec.fixtures.ts`.
 */
describe('InboxService', () => {
  let service: InboxService;
  let prisma: MockPrisma;
  let gateway: MockGateway;

  beforeEach(async () => {
    ({ service, prisma, gateway } = await createInboxTestContext());
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
      expect(result[0]?.messages).toBeUndefined();
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
});
