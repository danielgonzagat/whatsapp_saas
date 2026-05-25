import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('ChatService', () => {
  let service: ChatService;
  let mockPrisma: ReturnType<typeof createPartialPrismaMock>;

  beforeEach(async () => {
    mockPrisma = createPartialPrismaMock({
      chatMessage: ['findMany', 'create'],
      chatThread: ['findFirstOrThrow', 'updateMany'],
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMessages', () => {
    const workspaceId = 'ws-1';
    const conversationId = 'conv-1';

    it('returns paginated messages ordered by createdAt desc', async () => {
      const messages = [
        { id: 'm3', role: 'user', content: 'c3', createdAt: new Date('2024-03-01'), userId: 'u1' },
        {
          id: 'm2',
          role: 'assistant',
          content: 'c2',
          createdAt: new Date('2024-02-01'),
          userId: null,
        },
        { id: 'm1', role: 'user', content: 'c1', createdAt: new Date('2024-01-01'), userId: 'u1' },
      ];
      mockPrisma.chatMessage.findMany.mockResolvedValue(messages);

      const result = await service.getMessages(workspaceId, conversationId);

      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { threadId: conversationId, workspaceId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 51,
        select: { id: true, role: true, content: true, createdAt: true, userId: true },
      });
      expect(result.items).toHaveLength(3);
      expect(result.items[0].id).toBe('m1');
      expect(result.items[2].id).toBe('m3');
      expect(result.nextCursor).toBeNull();
    });

    it('returns nextCursor when more pages exist', async () => {
      const messages = Array.from({ length: 51 }, (_, i) => ({
        id: `m${51 - i}`,
        role: 'user',
        content: `msg${51 - i}`,
        createdAt: new Date(2024, 0, 51 - i),
        userId: 'u1',
      }));
      mockPrisma.chatMessage.findMany.mockResolvedValue(messages);

      const result = await service.getMessages(workspaceId, conversationId, undefined, 50);

      expect(result.items).toHaveLength(50);
      expect(result.nextCursor).toBe(messages[49].createdAt.toISOString());
    });

    it('uses cursor for pagination when provided', async () => {
      const cursor = '2024-06-01T00:00:00.000Z';
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);

      await service.getMessages(workspaceId, conversationId, cursor);

      const callArgs = mockPrisma.chatMessage.findMany.mock.calls[0][0] as Record<string, unknown>;
      const where = callArgs['where'] as Record<string, unknown>;
      expect(where['createdAt']).toEqual({ lt: new Date(cursor) });
    });

    it('excludes soft-deleted messages', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);

      await service.getMessages(workspaceId, conversationId);

      const callArgs = mockPrisma.chatMessage.findMany.mock.calls[0][0] as Record<string, unknown>;
      const where = callArgs['where'] as Record<string, unknown>;
      expect(where['deletedAt']).toBeNull();
    });

    it('enforces workspace isolation', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);

      await service.getMessages(workspaceId, conversationId);

      const callArgs = mockPrisma.chatMessage.findMany.mock.calls[0][0] as Record<string, unknown>;
      const where = callArgs['where'] as Record<string, unknown>;
      expect(where['workspaceId']).toBe(workspaceId);
    });

    it('respects custom limit', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);

      await service.getMessages(workspaceId, conversationId, undefined, 10);

      const callArgs = mockPrisma.chatMessage.findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs['take']).toBe(11);
    });
  });

  describe('addMessage', () => {
    const workspaceId = 'ws-1';
    const conversationId = 'conv-1';
    const userId = 'user-1';

    it('creates message and touches thread', async () => {
      mockPrisma.chatThread.findFirstOrThrow.mockResolvedValue({ id: conversationId });
      mockPrisma.chatMessage.create.mockResolvedValue({
        id: 'msg-1',
        role: 'user',
        content: 'hello',
        createdAt: new Date(),
        userId,
      });
      mockPrisma.chatThread.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.addMessage(workspaceId, conversationId, userId, 'user', 'hello');

      expect(mockPrisma.chatThread.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: conversationId, workspaceId },
        select: { id: true },
      });
      expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith({
        data: { threadId: conversationId, workspaceId, userId, role: 'user', content: 'hello' },
        select: { id: true, role: true, content: true, createdAt: true, userId: true },
      });
      const updateArgs = mockPrisma.chatThread.updateMany.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: conversationId, workspaceId });
      expect(updateArgs.data.updatedAt).toBeInstanceOf(Date);
      expect(result.id).toBe('msg-1');
      expect(result.role).toBe('user');
      expect(result.content).toBe('hello');
    });

    it('throws when thread does not belong to workspace', async () => {
      mockPrisma.chatThread.findFirstOrThrow.mockRejectedValue(new Error('Not found'));

      await expect(
        service.addMessage(workspaceId, conversationId, userId, 'user', 'hello'),
      ).rejects.toThrow('Not found');
    });
  });
});
