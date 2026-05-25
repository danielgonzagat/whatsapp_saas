import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminSupportService } from './admin-support.service';
import { createPartialPrismaMock } from '../../../test/helpers/prisma.mock';

describe('AdminSupportService', () => {
  let service: AdminSupportService;

  const actorId = 'admin_1';
  const conversationId = 'conv_1';

  const mockTxMessageCreate = jest.fn<Promise<unknown>, unknown[]>();
  const mockTxConversationUpdateMany = jest.fn<Promise<unknown>, unknown[]>();
  const mockTxAuditLogCreate = jest.fn<Promise<unknown>, unknown[]>();

  const mockTx = {
    message: { create: mockTxMessageCreate },
    conversation: { updateMany: mockTxConversationUpdateMany },
    adminAuditLog: { create: mockTxAuditLogCreate },
  };

  const prismaMock = createPartialPrismaMock({
    conversation: ['findMany', 'findFirst', 'findUnique'],
  });
  const mockConversationFindMany = prismaMock.conversation.findMany;
  const mockConversationFindFirst = prismaMock.conversation.findFirst;
  const mockConversationFindUnique = prismaMock.conversation.findUnique;
  const mockPrismaTransaction = prismaMock.$transaction;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConversationFindMany.mockResolvedValue([]);
    mockConversationFindFirst.mockResolvedValue(null);
    mockConversationFindUnique.mockResolvedValue(null);
    mockTxMessageCreate.mockResolvedValue({ id: 'msg_1' });
    mockTxConversationUpdateMany.mockResolvedValue({ count: 1 });
    mockTxAuditLogCreate.mockResolvedValue({ id: 'log_1' });

    mockPrismaTransaction.mockImplementation(async (cbOrArray: unknown) => {
      if (typeof cbOrArray === 'function') {
        return (cbOrArray as (tx: unknown) => unknown)(mockTx);
      }
      return [];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminSupportService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(AdminSupportService);
  });

  describe('overview', () => {
    const convRow = {
      id: 'conv_1',
      status: 'OPEN',
      priority: 'NORMAL',
      channel: 'WHATSAPP',
      mode: 'BOT',
      unreadCount: 0,
      lastMessageAt: new Date('2025-01-01'),
      createdAt: new Date('2025-01-01'),
      workspace: { id: 'ws_1', name: 'WS' },
      contact: { id: 'c1', name: 'Contact', email: 'c@test.com', phone: null },
    };

    it('returns conversation items without search', async () => {
      mockConversationFindMany.mockResolvedValueOnce([convRow]);

      const result = await service.overview();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].conversationId).toBe('conv_1');
      expect(result.items[0].workspaceName).toBe('WS');
      expect(result.total).toBe(1);
    });

    it('applies search filter', async () => {
      mockConversationFindMany.mockResolvedValueOnce([]);

      await service.overview('test');

      expect(mockConversationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { workspace: { name: { contains: 'test', mode: 'insensitive' } } },
            ]),
          }),
        }),
      );
    });
  });

  describe('detail', () => {
    const convDetail = {
      id: 'conv_1',
      status: 'OPEN',
      priority: 'NORMAL',
      channel: 'WHATSAPP',
      mode: 'BOT',
      unreadCount: 0,
      createdAt: new Date('2025-01-01'),
      lastMessageAt: new Date('2025-01-01'),
      workspace: { id: 'ws_1', name: 'WS' },
      contact: { id: 'c1', name: 'Contact', email: 'c@test.com', phone: null },
      messages: [
        {
          id: 'msg_1',
          direction: 'INBOUND',
          type: 'TEXT',
          content: 'Hello',
          createdAt: new Date('2025-01-01'),
          agent: null,
        },
      ],
    };

    it('returns conversation with messages and macros', async () => {
      mockConversationFindFirst.mockResolvedValueOnce(convDetail);

      const result = await service.detail('conv_1');

      expect(result.ticket.conversationId).toBe('conv_1');
      expect(result.messages).toHaveLength(1);
      expect(result.macros).toHaveLength(3);
      expect(result.macros[0]).toHaveProperty('key', 'first-response');
      expect(result.messages[0]).toHaveProperty('content', 'Hello');
    });

    it('throws when conversation not found', async () => {
      mockConversationFindFirst.mockResolvedValueOnce(null);

      await expect(service.detail('unknown')).rejects.toThrow(/n.o encontrado/i);
    });
  });

  describe('updateStatus', () => {
    const conversation = {
      id: 'conv_1',
      status: 'OPEN',
      workspaceId: 'ws_1',
    };

    beforeEach(() => {
      mockConversationFindUnique.mockResolvedValue(conversation);
    });

    it('updates conversation status with audit', async () => {
      await service.updateStatus('conv_1', 'CLOSED', actorId);

      expect(mockTxConversationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv_1', workspaceId: 'ws_1' },
          data: { status: 'CLOSED' },
        }),
      );
      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminUserId: actorId,
            action: 'admin.support.status_updated',
            entityType: 'Conversation',
            entityId: 'conv_1',
            details: expect.objectContaining({
              previousStatus: 'OPEN',
              nextStatus: 'CLOSED',
            }),
          }),
        }),
      );
    });

    it('throws when conversation not found', async () => {
      mockConversationFindUnique.mockResolvedValueOnce(null);

      await expect(service.updateStatus('unknown', 'CLOSED', actorId)).rejects.toThrow(
        /n.o encontrado/i,
      );
    });
  });

  describe('reply', () => {
    const conversation = {
      id: 'conv_1',
      workspaceId: 'ws_1',
      contactId: 'c1',
    };

    beforeEach(() => {
      mockConversationFindUnique.mockResolvedValue(conversation);
    });

    it('creates OUTBOUND NOTE message + updates conversation + writes audit', async () => {
      await service.reply('conv_1', actorId, 'Support reply');

      expect(mockTxMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: 'OUTBOUND',
            type: 'NOTE',
            content: 'Support reply',
            status: 'SENT',
          }),
        }),
      );
      expect(mockTxConversationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv_1', workspaceId: 'ws_1' },
          data: expect.objectContaining({ unreadCount: 0 }),
        }),
      );
      expect(mockTxAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            adminUserId: actorId,
            action: 'admin.support.replied',
            entityType: 'Conversation',
            entityId: 'conv_1',
          }),
        }),
      );
    });

    it('throws when conversation not found', async () => {
      mockConversationFindUnique.mockResolvedValueOnce(null);

      await expect(service.reply('unknown', actorId, 'test')).rejects.toThrow(/n.o encontrado/i);
    });
  });
});
