/**
 * Coverage-floor raise for InboxService — the lowest jest floor in the repo
 * (30/30/30/30). The existing inbox.service.spec covers getOrCreateConversation,
 * saveMessage and replyToConversation; this complementary spec exercises the
 * remaining read + mutation surface (listAgents, listConversations, getMessages,
 * updateStatus, assignAgent), asserting workspace isolation and the explicit
 * domain errors (NotFound / Forbidden) the controllers depend on.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxGateway } from './inbox.gateway';
import { WebhookDispatcherService } from '../webhooks/webhook-dispatcher.service';
import { ChannelTransportRegistry } from '../kloel/channel-transport.registry';

type Mock = jest.Mock;

interface MockPrisma {
  agent: { findMany: Mock; findFirst: Mock };
  conversation: {
    findFirst: Mock;
    findFirstOrThrow: Mock;
    findMany: Mock;
    updateMany: Mock;
  };
  message: { findMany: Mock };
}

describe('InboxService — coverage floor (read + mutation surface)', () => {
  let service: InboxService;
  let prisma: MockPrisma;
  let gateway: { emitToWorkspace: jest.Mock };

  beforeEach(async () => {
    prisma = {
      agent: { findMany: jest.fn(), findFirst: jest.fn() },
      conversation: {
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      message: { findMany: jest.fn() },
    };
    gateway = { emitToWorkspace: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        InboxService,
        { provide: PrismaService, useValue: prisma },
        { provide: InboxGateway, useValue: gateway },
        { provide: WebhookDispatcherService, useValue: { dispatch: jest.fn() } },
        { provide: ChannelTransportRegistry, useValue: { send: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(InboxService);
  });

  describe('listAgents', () => {
    it('queries agents scoped to the workspace, online-first', async () => {
      prisma.agent.findMany.mockResolvedValue([{ id: 'a1', name: 'Ana', isOnline: true }]);

      const result = await service.listAgents('ws-1');

      expect(result).toEqual([{ id: 'a1', name: 'Ana', isOnline: true }]);
      expect(prisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
          orderBy: [{ isOnline: 'desc' }, { name: 'asc' }],
          take: 100,
        }),
      );
    });
  });

  describe('listConversations', () => {
    it('projects last-message status and strips the full message payload', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          workspaceId: 'ws-1',
          status: 'OPEN',
          lastMessageAt: new Date(),
          unreadCount: 2,
          contact: { id: 'c1', name: 'Bia', phone: '55' },
          assignedAgent: null,
          messages: [{ status: 'DELIVERED', direction: 'INBOUND', errorCode: null }],
        },
      ]);

      const result = await service.listConversations('ws-1');

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-1' }, take: 500 }),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'conv-1',
        lastMessageStatus: 'DELIVERED',
        lastMessageDirection: 'INBOUND',
        lastMessageErrorCode: null,
      });
      // The heavy messages array is dropped from the listing payload.
      expect(result[0].messages).toBeUndefined();
    });

    it('null-coalesces last-message fields when a conversation has no messages', async () => {
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-empty',
          workspaceId: 'ws-1',
          status: 'OPEN',
          lastMessageAt: new Date(),
          unreadCount: 0,
          contact: { id: 'c2', name: null, phone: '55' },
          assignedAgent: null,
          messages: [],
        },
      ]);

      const result = await service.listConversations('ws-1');

      expect(result[0].lastMessageStatus).toBeNull();
      expect(result[0].lastMessageDirection).toBeNull();
    });
  });

  describe('getMessages', () => {
    it('without a workspaceId returns messages without an ownership check', async () => {
      prisma.message.findMany.mockResolvedValue([{ id: 'm1', content: 'hi' }]);

      const result = await service.getMessages('conv-1');

      expect(result).toEqual([{ id: 'm1', content: 'hi' }]);
      expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    });

    it('with a workspaceId verifies ownership, zeroes unread and emits a read event', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', workspaceId: 'ws-1' });
      prisma.message.findMany.mockResolvedValue([{ id: 'm1' }]);

      await service.getMessages('conv-1', 'ws-1');

      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', workspaceId: 'ws-1' },
        data: { unreadCount: 0 },
      });
      expect(gateway.emitToWorkspace).toHaveBeenCalledWith('ws-1', 'conversation:update', {
        id: 'conv-1',
        unreadCount: 0,
      });
    });

    it('throws NotFound when the conversation does not belong to the workspace', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.getMessages('conv-x', 'ws-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('updates status and emits a conversation update when the workspace owns it', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', workspaceId: 'ws-1' });
      const updated = { id: 'conv-1', workspaceId: 'ws-1', status: 'CLOSED', contact: {} };
      prisma.conversation.findFirstOrThrow.mockResolvedValue(updated);

      const result = await service.updateStatus('ws-1', 'conv-1', 'CLOSED');

      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', workspaceId: 'ws-1' },
        data: { status: 'CLOSED' },
      });
      expect(result).toBe(updated);
      expect(gateway.emitToWorkspace).toHaveBeenCalledWith('ws-1', 'conversation:update', updated);
    });

    it('throws Forbidden when the conversation is not in the workspace', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus('ws-1', 'conv-x', 'OPEN')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('assignAgent', () => {
    it('assigns an agent that belongs to the workspace and flips mode to HUMAN', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', workspaceId: 'ws-1' });
      prisma.agent.findFirst.mockResolvedValue({ workspaceId: 'ws-1' });
      const updated = { id: 'conv-1', workspaceId: 'ws-1', assignedAgent: { id: 'ag-1' } };
      prisma.conversation.findFirstOrThrow.mockResolvedValue(updated);

      const result = await service.assignAgent('ws-1', 'conv-1', 'ag-1');

      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', workspaceId: 'ws-1' },
        data: { assignedAgentId: 'ag-1', mode: 'HUMAN' },
      });
      expect(result).toBe(updated);
    });

    it('unassigns (empty agentId) and flips mode back to AI without an agent lookup', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', workspaceId: 'ws-1' });
      prisma.conversation.findFirstOrThrow.mockResolvedValue({ id: 'conv-1', workspaceId: 'ws-1' });

      await service.assignAgent('ws-1', 'conv-1', '');

      expect(prisma.agent.findFirst).not.toHaveBeenCalled();
      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: 'conv-1', workspaceId: 'ws-1' },
        data: { assignedAgentId: null, mode: 'AI' },
      });
    });

    it('throws Forbidden when the conversation is not in the workspace', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.assignAgent('ws-1', 'conv-x', 'ag-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws Forbidden when the agent belongs to a different workspace', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', workspaceId: 'ws-1' });
      prisma.agent.findFirst.mockResolvedValue(null);

      await expect(service.assignAgent('ws-1', 'conv-1', 'ag-other')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    });
  });
});
