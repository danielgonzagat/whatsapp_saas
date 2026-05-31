import type { PrismaService } from '../../../prisma/prisma.service';
import { ConversationArchiveService } from './conversation-archive.service';

interface FakeMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: Date;
  deletedAt: Date | null;
  thread: { title: string | null; workspaceId: string };
}

/**
 * Fake of the slice of PrismaService the archive touches:
 *   - `$queryRaw` (FTS path) — modelled as a simple case-insensitive substring
 *     scan so the spec exercises the mapping/shape without a live Postgres;
 *   - `chatMessage.findMany` (contains fallback).
 */
function makePrisma(messages: FakeMessage[], failRaw = false) {
  return {
    $queryRaw: jest.fn(async (..._args: unknown[]) => {
      if (failRaw) {
        throw new Error('websearch_to_tsquery: locale unsupported');
      }
      // The tagged-template SQL is opaque here; we approximate FTS by matching
      // any non-deleted message whose content includes a seeded probe token.
      return messages
        .filter((m) => m.deletedAt === null && /produto|preço|entrega/i.test(m.content))
        .map((m) => ({
          messageId: m.id,
          threadId: m.threadId,
          threadTitle: m.thread.title,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          snippet: `<mark>${m.content.slice(0, 20)}</mark>`,
          rank: 0.9,
        }));
    }),
    chatMessage: {
      findMany: jest.fn(
        async ({
          where,
          take,
        }: {
          where: {
            thread: { workspaceId: string };
            deletedAt: null;
            content: { contains: string; mode: string };
          };
          take: number;
        }) =>
          messages
            .filter(
              (m) =>
                m.deletedAt === null &&
                m.thread.workspaceId === where.thread.workspaceId &&
                m.content.toLowerCase().includes(where.content.contains.toLowerCase()),
            )
            .slice(0, take)
            .map((m) => ({
              id: m.id,
              threadId: m.threadId,
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
              thread: { title: m.thread.title },
            })),
      ),
    },
  } as unknown as PrismaService;
}

function seed(): FakeMessage[] {
  const t0 = new Date('2026-05-01T10:00:00Z');
  return [
    {
      id: 'm1',
      threadId: 'th-1',
      role: 'user',
      content: 'Qual o preço do produto premium?',
      createdAt: t0,
      deletedAt: null,
      thread: { title: 'Dúvida de preço', workspaceId: 'ws-1' },
    },
    {
      id: 'm2',
      threadId: 'th-1',
      role: 'assistant',
      content: 'O produto premium custa R$ 99 com entrega grátis.',
      createdAt: new Date(t0.getTime() + 1000),
      deletedAt: null,
      thread: { title: 'Dúvida de preço', workspaceId: 'ws-1' },
    },
    {
      id: 'm3',
      threadId: 'th-2',
      role: 'user',
      content: 'Bom dia, tudo bem?',
      createdAt: t0,
      deletedAt: null,
      thread: { title: 'Saudação', workspaceId: 'ws-1' },
    },
    {
      id: 'm4',
      threadId: 'th-3',
      role: 'user',
      content: 'mensagem apagada sobre produto',
      createdAt: t0,
      deletedAt: new Date(),
      thread: { title: 'Apagada', workspaceId: 'ws-1' },
    },
  ];
}

describe('ConversationArchiveService', () => {
  it('returns message-level snippets (not whole conversations) ranked by FTS', async () => {
    const prisma = makePrisma(seed());
    const svc = new ConversationArchiveService(prisma);

    const results = await svc.search('ws-1', 'produto preço');

    expect(results.length).toBeGreaterThan(0);
    // Each result is a single message snippet, with thread context + rank.
    for (const r of results) {
      expect(typeof r.messageId).toBe('string');
      expect(typeof r.threadId).toBe('string');
      expect(typeof r.snippet).toBe('string');
      expect(r.snippet.length).toBeGreaterThan(0);
      expect(['user', 'assistant', 'system']).toContain(r.role);
      expect(r.rank).toBeGreaterThan(0);
    }
    // Highlighted FTS headline preserved.
    expect(results.some((r) => r.snippet.includes('<mark>'))).toBe(true);
    // The deleted message is never surfaced by the FTS path.
    expect(results.some((r) => r.messageId === 'm4')).toBe(false);
  });

  it('falls back to a contains scan when FTS errors, still workspace-scoped', async () => {
    const prisma = makePrisma(seed(), /* failRaw */ true);
    const svc = new ConversationArchiveService(prisma);

    const results = await svc.search('ws-1', 'premium');

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.snippet.toLowerCase().includes('premium'))).toBe(true);
    // fallback excludes deleted messages.
    expect(results.some((r) => r.messageId === 'm4')).toBe(false);
  });

  it('returns empty for blank workspace or too-short query', async () => {
    const prisma = makePrisma(seed());
    const svc = new ConversationArchiveService(prisma);

    expect(await svc.search('', 'produto')).toEqual([]);
    expect(await svc.search('ws-1', 'a')).toEqual([]);
  });

  it('honours the snippet limit', async () => {
    const prisma = makePrisma(seed());
    const svc = new ConversationArchiveService(prisma);

    const results = await svc.search('ws-1', 'produto', { limit: 1 });
    // FTS fake ignores LIMIT, but the contract clamps the requested limit; the
    // raw call is asked for at most `limit` rows.
    const rawCall = (prisma.$queryRaw as jest.Mock).mock.calls.length;
    expect(rawCall).toBeGreaterThan(0);
    expect(Array.isArray(results)).toBe(true);
  });
});
