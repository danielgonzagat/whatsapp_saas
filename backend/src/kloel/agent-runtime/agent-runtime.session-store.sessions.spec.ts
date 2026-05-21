import { AgentRuntimeSessionStore } from './agent-runtime.session-store';
function makeStore(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    kloelMemory: {
      create: jest.fn().mockResolvedValue({ id: 'mem_1' }),
      findMany: jest.fn().mockResolvedValue([]),
      ...prismaOverrides,
    },
  };
  const store = new AgentRuntimeSessionStore(prisma as never);
  return { store, prisma };
}
function makeMemoryRow(
  overrides: Partial<{
    id: string;
    key: string;
    category: string;
    content: string;
    value: unknown;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  const now = new Date();
  return {
    id: overrides.id ?? 'mem_1',
    key: overrides.key ?? 'agent_event:turn_1',
    category: overrides.category ?? 'agent_event',
    content: overrides.content ?? 'user asked about pricing plans',
    value: overrides.value ?? null,
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? new Date(now.getTime() - 60 * 60 * 1000),
    updatedAt: overrides.updatedAt ?? new Date(now.getTime() - 60 * 60 * 1000),
  };
}
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
describe('AgentRuntimeSessionStore', () => {
  describe('searchSessions', () => {
    it('groups matching memories by thread metadata and builds a focused transcript window', async () => {
      const longContent =
        'A'.repeat(500) +
        'checkout failed after pix payment and still needs webhook proof' +
        'B'.repeat(500);
      const { store, prisma } = makeStore({
        findMany: jest.fn().mockResolvedValue([
          makeMemoryRow({
            id: 'a',
            key: 'agent_turn:whatsapp:a',
            content: longContent,
            metadata: { threadId: 'thread_1' },
            updatedAt: new Date('2026-05-13T10:00:00.000Z'),
          }),
          makeMemoryRow({
            id: 'b',
            key: 'agent_turn:whatsapp:b',
            content: 'assistant confirmed checkout validation remained pending',
            metadata: { threadId: 'thread_1' },
            updatedAt: new Date('2026-05-13T10:01:00.000Z'),
          }),
        ]),
      });
      const result = await store.searchSessions('ws_1', 'checkout webhook proof', 3);
      expect(result.totalFound).toBe(1);
      expect(result.sessions[0]).toEqual(
        expect.objectContaining({
          sessionId: 'thread_1',
          source: 'thread',
          matchCount: 4,
        }),
      );
      expect(result.sessions[0].transcriptWindow).toContain('checkout failed');
      expect(result.sessions[0].summary).toContain('source=thread');
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ metadata: true }),
        }),
      );
    });
    it('falls back to session, contact, then memory key when grouping', async () => {
      const { store } = makeStore({
        findMany: jest.fn().mockResolvedValue([
          makeMemoryRow({
            id: 'a',
            key: 'agent_runtime:compression:session_1:1',
            content: 'pricing summary',
            metadata: { sessionId: 'session_1' },
          }),
          makeMemoryRow({
            id: 'b',
            key: 'agent_turn:whatsapp:b',
            content: 'pricing objection',
            metadata: { contactId: 'contact_1' },
          }),
          makeMemoryRow({
            id: 'c',
            key: 'agent_skill:pricing',
            content: 'pricing skill',
          }),
        ]),
      });
      const result = await store.searchSessions('ws_1', 'pricing', 5);
      expect(result.sessions.map((session) => session.sessionId)).toEqual(
        expect.arrayContaining(['session_1', 'contact_1', 'agent_skill:pricing']),
      );
    });
    it('returns empty session recall for blank input', async () => {
      const { store } = makeStore();
      await expect(store.searchSessions('ws_1', '   ')).resolves.toEqual({
        query: '',
        tokens: [],
        totalFound: 0,
        sessions: [],
      });
    });
  });
});
