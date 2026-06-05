import { KloelConversationStore } from './kloel-conversation-store';
import type { PrismaService } from '../prisma/prisma.service';
import type { MindMessageService } from './mind/aliases/mind-message.service';

/**
 * Brain → Mind delegation contract for KloelConversationStore (Claude-K66).
 *
 * KloelConversationStore is the legacy plain-class conversation surface used
 * by KloelService.getConversationHistory + saveMessage. K66 wires the MindMessageService
 * wrapper through it so that, when injected, persistence + reads go through
 * the canonical Mind surface instead of bare `prisma.kloelMessage.*`. When
 * not injected, the legacy direct-prisma path is preserved unchanged.
 */
describe('KloelConversationStore — Brain→Mind delegation (Claude-K66)', () => {
  const logger = { warn: jest.fn(), error: jest.fn() };

  beforeEach(() => {
    logger.warn.mockReset();
    logger.error.mockReset();
  });

  describe('getConversationHistory', () => {
    it('delegates to MindMessageService.getHistory when injected and projects to {role, content}', async () => {
      const findMany = jest.fn();
      const getHistory = jest.fn().mockResolvedValue([
        { id: 'm1', role: 'user', content: 'olá', timestamp: new Date() },
        { id: 'm2', role: 'assistant', content: 'oi!', timestamp: new Date() },
      ]);
      const prisma = { kloelMessage: { findMany } } as unknown as PrismaService;
      const mindMessage = { getHistory } as unknown as MindMessageService;
      const store = new KloelConversationStore(prisma, logger, undefined, mindMessage);

      const out = await store.getConversationHistory('ws-1');
      expect(getHistory).toHaveBeenCalledWith('ws-1', 20);
      expect(findMany).not.toHaveBeenCalled();
      expect(out).toEqual([
        { role: 'user', content: 'olá' },
        { role: 'assistant', content: 'oi!' },
      ]);
    });

    it('falls back to direct prisma.kloelMessage.findMany when mindMessage is absent', async () => {
      const findMany = jest.fn().mockResolvedValue([{ role: 'user', content: 'legacy' }]);
      const prisma = { kloelMessage: { findMany } } as unknown as PrismaService;
      const store = new KloelConversationStore(prisma, logger);

      const out = await store.getConversationHistory('ws-2');
      expect(findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-2' },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { role: true, content: true },
      });
      expect(out).toEqual([{ role: 'user', content: 'legacy' }]);
    });

    it('returns [] when workspaceId is absent (no DB hit, no wrapper hit)', async () => {
      const findMany = jest.fn();
      const getHistory = jest.fn();
      const prisma = { kloelMessage: { findMany } } as unknown as PrismaService;
      const mindMessage = { getHistory } as unknown as MindMessageService;
      const store = new KloelConversationStore(prisma, logger, undefined, mindMessage);

      const out = await store.getConversationHistory();
      expect(out).toEqual([]);
      expect(getHistory).not.toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
    });

    it('resolves the raw-fallback message delegate to MindMessageService.items (canonical surface) when injected', () => {
      // The raw projection/create paths read `this.mindMessageItems`, which
      // routes through the canonical `mindMessage.items` delegate when the Mind
      // wrapper is present — NOT bare `this.prisma.kloelMessage`. `.items`
      // returns the SAME underlying `kloelMessage` delegate, so the routed read
      // is byte-identical to the legacy direct access.
      const canonicalItems = { findMany: jest.fn(), create: jest.fn() };
      const prismaItems = { findMany: jest.fn(), create: jest.fn() };
      const prisma = { kloelMessage: prismaItems } as unknown as PrismaService;
      const mindMessage = { items: canonicalItems } as unknown as MindMessageService;
      const store = new KloelConversationStore(prisma, logger, undefined, mindMessage);

      expect((store as unknown as { mindMessageItems: unknown }).mindMessageItems).toBe(
        canonicalItems,
      );
    });

    it('falls back to bare prisma.kloelMessage delegate when the Mind wrapper is absent (byte-identical)', () => {
      const prismaItems = { findMany: jest.fn(), create: jest.fn() };
      const prisma = { kloelMessage: prismaItems } as unknown as PrismaService;
      const store = new KloelConversationStore(prisma, logger);

      expect((store as unknown as { mindMessageItems: unknown }).mindMessageItems).toBe(
        prismaItems,
      );
    });
  });

  describe('saveMessage', () => {
    it('delegates to MindMessageService.appendToConversation when injected', async () => {
      const create = jest.fn();
      const appendToConversation = jest.fn().mockResolvedValue({ id: 'm-new' });
      const prisma = { kloelMessage: { create } } as unknown as PrismaService;
      const mindMessage = { appendToConversation } as unknown as MindMessageService;
      const store = new KloelConversationStore(prisma, logger, undefined, mindMessage);

      await store.saveMessage('ws-3', 'user', 'mensagem');
      expect(appendToConversation).toHaveBeenCalledWith('ws-3', 'user', 'mensagem');
      expect(create).not.toHaveBeenCalled();
    });

    it('falls back to direct prisma.kloelMessage.create when mindMessage is absent', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'm-legacy' });
      const prisma = { kloelMessage: { create } } as unknown as PrismaService;
      const store = new KloelConversationStore(prisma, logger);

      await store.saveMessage('ws-4', 'assistant', 'reply');
      expect(create).toHaveBeenCalledWith({
        data: { workspaceId: 'ws-4', role: 'assistant', content: 'reply' },
      });
    });

    it('swallows persistence errors via logger.warn (non-critical contract preserved)', async () => {
      const create = jest.fn();
      const appendToConversation = jest.fn().mockRejectedValue(new Error('db down'));
      const prisma = { kloelMessage: { create } } as unknown as PrismaService;
      const mindMessage = { appendToConversation } as unknown as MindMessageService;
      const store = new KloelConversationStore(prisma, logger, undefined, mindMessage);

      await expect(store.saveMessage('ws-5', 'user', 'oops')).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Erro ao salvar mensagem:',
        expect.objectContaining({ message: 'db down' }),
      );
    });
  });
});
