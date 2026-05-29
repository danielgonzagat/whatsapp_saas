import type { PrismaService } from '../../../prisma/prisma.service';
import type { MindCaseMemoryService } from './mind-case-memory.service';
import { EpisodeService } from './episode.service';

interface FakeThread {
  id: string;
  title: string | null;
  summary: string | null;
  workspaceId: string;
}

interface FakeMsg {
  threadId: string;
  role: string;
  content: string;
  createdAt: Date;
  deletedAt: Date | null;
}

interface RecordedCase {
  workspaceId: string;
  subject: string;
  caseType: string;
  text: string;
  action: string;
  features: Record<string, unknown>;
  occurredAt?: Date;
}

function makeHarness(threads: FakeThread[], messages: FakeMsg[]) {
  const cases: RecordedCase[] = [];

  const prisma = {
    chatThread: {
      findMany: jest.fn(async ({ where, take }: { where: { workspaceId: string }; take: number }) =>
        threads
          .filter((t) => t.workspaceId === where.workspaceId)
          .slice(0, take)
          .map((t) => ({ id: t.id, title: t.title, summary: t.summary })),
      ),
    },
    chatMessage: {
      findMany: jest.fn(async ({ where }: { where: { threadId: string } }) =>
        messages
          .filter((m) => m.threadId === where.threadId && m.deletedAt === null)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
      ),
    },
    mindCase: {
      findMany: jest.fn(async ({ where }: { where: { subject: string; caseType: string } }) =>
        cases
          .filter((c) => c.subject === where.subject && c.caseType === where.caseType)
          .map((c) => ({ features: c.features })),
      ),
    },
  } as unknown as PrismaService;

  const caseMemory = {
    recordCase: jest.fn(async (input: RecordedCase) => {
      cases.push(input);
      return { id: `case-${cases.length}` };
    }),
  } as unknown as MindCaseMemoryService;

  return { prisma, caseMemory, cases };
}

describe('EpisodeService.consolidate', () => {
  const t0 = new Date('2026-05-01T10:00:00Z');

  it('writes an episode per thread, reusing the stored summary when present', async () => {
    const { prisma, caseMemory, cases } = makeHarness(
      [
        {
          id: 'th-1',
          title: 'Pedido',
          summary: 'Cliente pediu o produto premium.',
          workspaceId: 'ws-1',
        },
      ],
      [
        {
          threadId: 'th-1',
          role: 'user',
          content: 'quero o premium',
          createdAt: t0,
          deletedAt: null,
        },
        {
          threadId: 'th-1',
          role: 'assistant',
          content: 'ótimo, vou processar',
          createdAt: new Date(t0.getTime() + 1000),
          deletedAt: null,
        },
      ],
    );
    const svc = new EpisodeService(prisma, caseMemory);

    const result = await svc.consolidate('ws-1');

    expect(result.written).toBe(1);
    expect(result.skipped).toBe(0);
    expect(cases).toHaveLength(1);
    const ep = cases[0];
    expect(ep?.caseType).toBe('episode');
    expect(ep?.subject).toBe('th-1');
    expect(ep?.text).toContain('Cliente pediu o produto premium.');
    expect(ep?.features['source']).toBe('thread-summary');
    expect(ep?.features['messageCount']).toBe(2);
    expect(ep?.features['lastMessageAt']).toBe(new Date(t0.getTime() + 1000).toISOString());
  });

  it('derives a transcript episode when no summary exists', async () => {
    const { prisma, caseMemory, cases } = makeHarness(
      [{ id: 'th-2', title: null, summary: null, workspaceId: 'ws-1' }],
      [{ threadId: 'th-2', role: 'user', content: 'oi tudo bem', createdAt: t0, deletedAt: null }],
    );
    const svc = new EpisodeService(prisma, caseMemory);

    await svc.consolidate('ws-1');

    expect(cases).toHaveLength(1);
    expect(cases[0]?.features['source']).toBe('transcript');
    expect(cases[0]?.text).toContain('Usuário: oi tudo bem');
  });

  it('is idempotent — a re-run at the same thread state skips', async () => {
    const { prisma, caseMemory, cases } = makeHarness(
      [{ id: 'th-1', title: 'Pedido', summary: 'resumo', workspaceId: 'ws-1' }],
      [{ threadId: 'th-1', role: 'user', content: 'msg', createdAt: t0, deletedAt: null }],
    );
    const svc = new EpisodeService(prisma, caseMemory);

    const first = await svc.consolidate('ws-1');
    const second = await svc.consolidate('ws-1');

    expect(first.written).toBe(1);
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(1);
    expect(cases).toHaveLength(1);
  });

  it('writes a NEW episode (append-only) after the thread grows', async () => {
    const harness = makeHarness(
      [{ id: 'th-1', title: 'Pedido', summary: 'resumo', workspaceId: 'ws-1' }],
      [{ threadId: 'th-1', role: 'user', content: 'msg-1', createdAt: t0, deletedAt: null }],
    );
    const svc = new EpisodeService(harness.prisma, harness.caseMemory);

    await svc.consolidate('ws-1');
    // Thread grows: a newer message arrives → new lastMessageAt.
    (harness.prisma.chatMessage.findMany as jest.Mock).mockResolvedValue([
      { role: 'user', content: 'msg-1', createdAt: t0 },
      { role: 'assistant', content: 'msg-2', createdAt: new Date(t0.getTime() + 5000) },
    ]);

    const second = await svc.consolidate('ws-1');

    expect(second.written).toBe(1);
    expect(harness.cases).toHaveLength(2);
  });

  it('returns zeros for a blank workspace', async () => {
    const { prisma, caseMemory } = makeHarness([], []);
    const svc = new EpisodeService(prisma, caseMemory);
    expect(await svc.consolidate('')).toEqual({
      workspaceId: '',
      written: 0,
      skipped: 0,
      scanned: 0,
    });
  });
});
