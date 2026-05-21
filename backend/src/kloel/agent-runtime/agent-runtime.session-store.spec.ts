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
  describe('recordTurn', () => {
    it('persists a turn as a kloelMemory row with category agent_event', async () => {
      const { store, prisma } = makeStore();
      const key = await store.recordTurn({
        workspaceId: 'ws_1',
        channel: 'whatsapp',
        userMessage: 'Quanto custa o plano?',
        assistantMessage: 'Temos planos a partir de R$97.',
        contactId: 'contact_1',
        intent: 'pricing_inquiry',
        confidence: 0.85,
      });
      expect(key).toMatch(/^agent_turn:whatsapp:/);
      expect(prisma.kloelMemory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws_1',
            category: 'agent_event',
            type: 'turn',
            key: expect.stringMatching(/^agent_turn:whatsapp:/),
            content: expect.stringContaining('Quanto custa'),
            value: expect.objectContaining({
              userMessage: expect.stringContaining('Quanto custa'),
              assistantMessage: expect.stringContaining('R$'),
            }),
          }),
        }),
      );
    });
    it('returns null on prisma failure', async () => {
      const { store, prisma } = makeStore({
        create: jest.fn().mockRejectedValue(new Error('db down')),
      });
      const key = await store.recordTurn({
        workspaceId: 'ws_1',
        channel: 'whatsapp',
        userMessage: 'Teste',
      });
      expect(key).toBeNull();
      expect(prisma.kloelMemory.create).toHaveBeenCalledTimes(1);
    });
  });
  describe('recordRuntimeEvent', () => {
    it('persists provider lifecycle events as agent_event memory', async () => {
      const { store, prisma } = makeStore();
      const key = await store.recordRuntimeEvent({
        workspaceId: 'ws_1',
        eventType: 'delegation',
        sessionId: 'parent_1',
        content: 'task: inspect worker result',
        metadata: { childSessionId: 'child_1' },
      });
      expect(key).toMatch(/^agent_runtime:delegation:parent_1:/);
      expect(prisma.kloelMemory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws_1',
            category: 'agent_event',
            type: 'delegation',
            key: expect.stringMatching(/^agent_runtime:delegation:parent_1:/),
            metadata: expect.objectContaining({
              kind: 'agent_runtime_event',
              eventType: 'delegation',
              sessionId: 'parent_1',
              childSessionId: 'child_1',
            }),
          }),
        }),
      );
    });
  });
  describe('search', () => {
    it('returns empty result for missing workspaceId', async () => {
      const { store } = makeStore();
      const result = await store.search('', 'pricing');
      expect(result.query).toBe('pricing');
      expect(result.tokens).toEqual([]);
      expect(result.totalFound).toBe(0);
      expect(result.memories).toEqual([]);
    });
    it('returns empty result for empty query after sanitization', async () => {
      const { store } = makeStore();
      const result = await store.search('ws_1', '   ');
      expect(result).toEqual({ query: '', tokens: [], totalFound: 0, memories: [] });
    });
    it('tokenizes multi-word query and searches across tokens', async () => {
      const { store, prisma } = makeStore({
        findMany: jest.fn().mockResolvedValue([
          makeMemoryRow({
            id: 'a',
            content: 'pricing plans for enterprise',
            key: 'agent_event:1',
          }),
          makeMemoryRow({
            id: 'b',
            content: 'enterprise onboarding guide',
            key: 'agent_skill:2',
          }),
        ]),
      });
      const result = await store.search('ws_1', 'pricing enterprise', 6);
      expect(result.tokens).toContain('pricing');
      expect(result.tokens).toContain('enterprise');
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws_1',
            category: {
              in: ['agent_event', 'agent_skill', 'agent_curated', 'product', 'objection'],
            },
            OR: expect.arrayContaining([
              { content: { contains: 'pricing', mode: 'insensitive' } },
              { key: { contains: 'pricing', mode: 'insensitive' } },
              { content: { contains: 'enterprise', mode: 'insensitive' } },
              { key: { contains: 'enterprise', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });
    it('ranks results by token match count (more matches = higher rank)', async () => {
      const { store } = makeStore({
        findMany: jest.fn().mockResolvedValue([
          makeMemoryRow({ id: 'a', content: 'pricing plans', key: 'agent_event:1' }),
          makeMemoryRow({ id: 'b', content: 'pricing enterprise plans', key: 'agent_event:2' }),
          makeMemoryRow({
            id: 'c',
            content: 'pricing enterprise discount plans',
            key: 'agent_event:3',
          }),
        ]),
      });
      const result = await store.search('ws_1', 'pricing enterprise discount', 6);
      expect(result.totalFound).toBe(3);
      expect(result.memories[0].id).toBe('c');
      expect(result.memories[1].id).toBe('b');
      expect(result.memories[2].id).toBe('a');
      expect(result.memories[0].source.confidence).toBeGreaterThan(
        result.memories[1].source.confidence,
      );
    });
    it('filters out rows with zero token matches', async () => {
      const { store } = makeStore({
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeMemoryRow({ id: 'a', content: 'pricing plans', key: 'k1' }),
            makeMemoryRow({ id: 'b', content: 'unrelated content about weather', key: 'k2' }),
          ]),
      });
      const result = await store.search('ws_1', 'pricing', 6);
      expect(result.totalFound).toBe(1);
      expect(result.memories[0].id).toBe('a');
    });
    it('generates snippet around first matching token', async () => {
      const longContent = 'A'.repeat(200) + 'pricing' + 'B'.repeat(200);
      const { store } = makeStore({
        findMany: jest.fn().mockResolvedValue([makeMemoryRow({ id: 'a', content: longContent })]),
      });
      const result = await store.search('ws_1', 'pricing', 1);
      expect(result.memories[0].snippet).toContain('pricing');
      expect(result.memories[0].snippet).toMatch(/^…/);
      expect(result.memories[0].snippet).toMatch(/…$/);
    });
    it('returns empty snippet for empty content', async () => {
      const { store } = makeStore({
        findMany: jest
          .fn()
          .mockResolvedValue([makeMemoryRow({ id: 'a', content: '', key: 'pricing_skill' })]),
      });
      const result = await store.search('ws_1', 'pricing', 1);
      expect(result.memories[0].snippet).toBe('');
    });
    it('assigns provenance-weighted confidence for full token match', async () => {
      const { store } = makeStore({
        findMany: jest
          .fn()
          .mockResolvedValue([makeMemoryRow({ id: 'a', content: 'pricing enterprise discount' })]),
      });
      const result = await store.search('ws_1', 'pricing enterprise discount', 1);
      expect(result.memories[0].source.confidence).toBeGreaterThan(0.8);
      expect(result.memories[0].source.confidence).toBeLessThanOrEqual(1);
    });
    it('assigns confidence weighted by provenance and freshness for single-token partial match', async () => {
      const { store } = makeStore({
        findMany: jest
          .fn()
          .mockResolvedValue([makeMemoryRow({ id: 'a', content: 'pricing info' })]),
      });
      const result = await store.search('ws_1', 'pricing enterprise discount', 1);
      expect(result.memories[0].source.confidence).toBeGreaterThan(0.5);
    });
    it('assigns TTL-aware freshness based on age vs category TTL', async () => {
      const now = new Date();
      const freshDate = new Date(now.getTime() - 1 * MILLIS_PER_DAY);
      const oldDate = new Date(now.getTime() - 60 * MILLIS_PER_DAY);
      const { store } = makeStore({
        findMany: jest.fn().mockResolvedValue([
          makeMemoryRow({
            id: 'a',
            content: 'pricing',
            createdAt: freshDate,
            category: 'agent_event',
          }),
          makeMemoryRow({
            id: 'b',
            content: 'pricing',
            createdAt: oldDate,
            category: 'agent_event',
          }),
        ]),
      });
      const result = await store.search('ws_1', 'pricing', 3);
      expect(result.memories[0].source.freshness).toBe('fresh');
      expect(result.memories[1].source.freshness).toBe('stale');
    });
    it('includes provenance field matching the memory category', async () => {
      const { store } = makeStore({
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeMemoryRow({ id: 'a', content: 'pricing', category: 'agent_curated' }),
            makeMemoryRow({ id: 'b', content: 'pricing', category: 'agent_event' }),
            makeMemoryRow({ id: 'c', content: 'pricing', category: 'product' }),
          ]),
      });
      const result = await store.search('ws_1', 'pricing', 6);
      expect(result.memories[0].source.provenance).toBe('agent_curated');
      expect(result.memories[1].source.provenance).toBe('agent_event');
      expect(result.memories[2].source.provenance).toBe('product');
    });
    it('ranks curated memories higher than events for the same match count', async () => {
      const { store } = makeStore({
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeMemoryRow({ id: 'a', content: 'pricing plans', category: 'agent_event' }),
            makeMemoryRow({ id: 'b', content: 'pricing plans', category: 'agent_curated' }),
          ]),
      });
      const result = await store.search('ws_1', 'pricing plans', 6);
      expect(result.totalFound).toBe(2);
      expect(result.memories[0].id).toBe('b');
    });
    it('sets expiresAt in source stamp as createdAt + TTL', async () => {
      const now = new Date();
      const created = new Date(now.getTime() - 10 * MILLIS_PER_DAY);
      const { store } = makeStore({
        findMany: jest.fn().mockResolvedValue([
          makeMemoryRow({
            id: 'a',
            content: 'pricing',
            category: 'agent_curated',
            createdAt: created,
          }),
        ]),
      });
      const result = await store.search('ws_1', 'pricing', 1);
      expect(result.memories[0].source.expiresAt).toBeDefined();
      const expectedExpiry = new Date(created.getTime() + 365 * MILLIS_PER_DAY);
      expect(new Date(result.memories[0].source.expiresAt!).getTime()).toBe(
        expectedExpiry.getTime(),
      );
    });
    it('includes retentionScore in source stamp', async () => {
      const { store } = makeStore({
        findMany: jest.fn().mockResolvedValue([
          makeMemoryRow({
            id: 'a',
            content: 'pricing plans detailed',
            category: 'agent_curated',
          }),
        ]),
      });
      const result = await store.search('ws_1', 'pricing', 1);
      expect(result.memories[0].source.retentionScore).toBeDefined();
      expect(typeof result.memories[0].source.retentionScore).toBe('number');
      expect(result.memories[0].source.retentionScore!).toBeGreaterThan(0);
    });
    it('includes ttlMs in source stamp', async () => {
      const { store } = makeStore({
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeMemoryRow({ id: 'a', content: 'pricing', category: 'agent_skill' }),
          ]),
      });
      const result = await store.search('ws_1', 'pricing', 1);
      expect(result.memories[0].source.ttlMs).toBe(180 * MILLIS_PER_DAY);
    });
    it('respects the limit parameter', async () => {
      const { store } = makeStore({
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeMemoryRow({ id: 'a', content: 'pricing A' }),
            makeMemoryRow({ id: 'b', content: 'pricing B' }),
            makeMemoryRow({ id: 'c', content: 'pricing C' }),
          ]),
      });
      const result = await store.search('ws_1', 'pricing', 2);
      expect(result.totalFound).toBe(2);
      expect(result.memories).toHaveLength(2);
    });
    it('strips special characters from tokens', async () => {
      const { store, prisma } = makeStore({
        findMany: jest.fn().mockResolvedValue([]),
      });
      await store.search('ws_1', 'pricing, enterprise! discount?');
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { content: { contains: 'pricing', mode: 'insensitive' } },
              { content: { contains: 'enterprise', mode: 'insensitive' } },
              { content: { contains: 'discount', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });
    it('ignores single-character tokens', async () => {
      const { store, prisma } = makeStore({
        findMany: jest.fn().mockResolvedValue([]),
      });
      await store.search('ws_1', 'a pricing b');
      const callArgs = prisma.kloelMemory.findMany.mock.calls[0][0];
      const tokens = callArgs.where.OR.map(
        (c: { content?: { contains: string } }) => c.content?.contains,
      ).filter(Boolean);
      expect(tokens).not.toContain('a');
      expect(tokens).not.toContain('b');
      expect(tokens).toContain('pricing');
    });
    it('searches across both content and key fields', async () => {
      const { store } = makeStore({
        findMany: jest
          .fn()
          .mockResolvedValue([
            makeMemoryRow({ id: 'a', content: 'nothing here', key: 'pricing_key' }),
            makeMemoryRow({ id: 'b', content: 'pricing content', key: 'unrelated_key' }),
          ]),
      });
      const result = await store.search('ws_1', 'pricing', 6);
      expect(result.totalFound).toBe(2);
    });
    it('returns tokens array in the result for transparency', async () => {
      const { store } = makeStore({
        findMany: jest.fn().mockResolvedValue([]),
      });
      const result = await store.search('ws_1', 'hello world', 6);
      expect(result.tokens).toEqual(['hello', 'world']);
    });
  });
});
