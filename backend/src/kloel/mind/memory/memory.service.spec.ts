import { buildService, FakePrisma } from './memory.service.spec.helpers';

/**
 * Programmable LLM extraction result. Each test sets `nextMemories` to the array
 * the mocked DeepSeek completion should "return" as `{"memories": [...]}`. The
 * service's deterministic slot/contradiction/forget logic is what we assert on —
 * the LLM is stubbed so the test is hermetic (no network, no flakiness).
 */
let nextMemories: unknown = [];

jest.mock('../../../lib/llm-provider', () => ({
  createTextLlmClient: jest.fn(() => ({
    chat: {
      completions: {
        create: jest.fn().mockImplementation(() =>
          Promise.resolve({
            choices: [{ message: { content: JSON.stringify({ memories: nextMemories }) } }],
          }),
        ),
      },
    },
  })),
  readConfig: jest.fn(() => 'deepseek-chat'),
}));

describe('MemoryService', () => {
  beforeEach(() => {
    nextMemories = [];
    jest.clearAllMocks();
  });

  describe('extractFromTurn', () => {
    it('creates a typed node per extracted memory, isolated by (workspaceId, userId)', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        {
          type: 'fact',
          slot: 'cidade',
          content: 'O usuário mora no RJ',
          confidence: 0.9,
          importance: 0.7,
        },
        {
          type: 'preference',
          slot: 'preferencia_formato',
          content: 'O usuário prefere respostas curtas',
          confidence: 0.8,
          importance: 0.6,
        },
      ];

      const result = await service.extractFromTurn(
        'ws-1',
        'user-1',
        'moro no rio, me responde curto',
      );

      expect(result.created).toBe(2);
      expect(prisma.nodes).toHaveLength(2);
      expect(prisma.nodes.every((n) => n.workspaceId === 'ws-1' && n.userId === 'user-1')).toBe(
        true,
      );
      const cityNode = prisma.nodes.find((n) => n.metadata['slot'] === 'cidade');
      expect(cityNode?.type).toBe('fact');
      expect(cityNode?.content).toBe('O usuário mora no RJ');
      const firstCreate = prisma.memoryNode.create.mock.calls[0]?.[0];
      expect(firstCreate?.data.workspaceId).toBe('ws-1');
      expect(firstCreate?.data.userId).toBe('user-1');
      expect(firstCreate?.data.metadata).toEqual({ slot: 'cidade' });
    });

    it('coerces an unknown type to "fact" and drops items with no slot', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        {
          type: 'banana',
          slot: 'profissao',
          content: 'O usuário é dev',
          confidence: 1,
          importance: 1,
        },
        { type: 'fact', slot: '', content: 'sem slot — descartado', confidence: 1, importance: 1 },
      ];

      const result = await service.extractFromTurn('ws-1', 'user-1', 'sou dev');

      expect(result.created).toBe(1);
      expect(prisma.nodes[0]?.type).toBe('fact');
      expect(prisma.nodes[0]?.metadata['slot']).toBe('profissao');
    });

    it('returns empty without touching the DB when inputs are blank', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      const result = await service.extractFromTurn('', 'user-1', 'hi');

      expect(result.created).toBe(0);
      expect(prisma.memoryNode.create).not.toHaveBeenCalled();
    });
  });

  describe('contradiction resolution by slot', () => {
    it('supersedes the prior node for a slot and records replaces + contradicts edges', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      nextMemories = [
        {
          type: 'fact',
          slot: 'cidade',
          content: 'O usuário mora no RJ',
          confidence: 0.9,
          importance: 0.7,
        },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'moro no rio');

      nextMemories = [
        {
          type: 'fact',
          slot: 'cidade',
          content: 'O usuário mora em SP',
          confidence: 0.95,
          importance: 0.7,
        },
      ];
      const result = await service.extractFromTurn('ws-1', 'user-1', 'mudei pra sampa');

      expect(result.updated).toBe(1);
      expect(result.contradictions).toBe(1);

      const active = prisma.nodes.filter((n) => !n.forgotten);
      expect(active).toHaveLength(1);
      expect(active[0]?.content).toBe('O usuário mora em SP');

      const forgotten = prisma.nodes.filter((n) => n.forgotten);
      expect(forgotten).toHaveLength(1);
      expect(forgotten[0]?.content).toBe('O usuário mora no RJ');

      const relations = prisma.edges.map((e) => e.relation).sort();
      expect(relations).toEqual(['contradicts', 'replaces']);
      // edge points from the NEW node to the superseded one
      const newId = active[0]?.id;
      const oldId = forgotten[0]?.id;
      expect(prisma.edges.every((e) => e.fromId === newId && e.toId === oldId)).toBe(true);
    });

    it('records a replaces edge but no contradiction when the content is identical', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      const same = {
        type: 'fact',
        slot: 'nome',
        content: 'O usuário se chama Ana',
        confidence: 0.9,
        importance: 0.7,
      };
      nextMemories = [same];
      await service.extractFromTurn('ws-1', 'user-1', 'sou a ana');
      nextMemories = [same];
      const result = await service.extractFromTurn('ws-1', 'user-1', 'me chamo ana');

      expect(result.updated).toBe(1);
      expect(result.contradictions).toBe(0);
      expect(prisma.edges.map((e) => e.relation)).toEqual(['replaces']);
    });

    it('does not let one user contradict another user memory (isolation)', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'A mora no RJ', confidence: 0.9, importance: 0.7 },
      ];
      await service.extractFromTurn('ws-1', 'user-A', 'rj');
      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'B mora em SP', confidence: 0.9, importance: 0.7 },
      ];
      const result = await service.extractFromTurn('ws-1', 'user-B', 'sp');

      // user-B creating does NOT supersede user-A's node
      expect(result.updated).toBe(0);
      expect(result.contradictions).toBe(0);
      expect(prisma.nodes.filter((n) => !n.forgotten)).toHaveLength(2);
    });
  });

  describe('forget', () => {
    it('soft-deletes the active node for a slot when the model flags forget', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      nextMemories = [
        {
          type: 'fact',
          slot: 'empresa',
          content: 'O usuário trabalha na ACME',
          confidence: 0.9,
          importance: 0.6,
        },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'trabalho na acme');

      nextMemories = [
        {
          type: 'fact',
          slot: 'empresa',
          content: '',
          confidence: 0.5,
          importance: 0.5,
          forget: true,
        },
      ];
      const result = await service.extractFromTurn('ws-1', 'user-1', 'esquece onde trabalho');

      expect(result.forgotten).toBe(1);
      expect(prisma.nodes.filter((n) => !n.forgotten)).toHaveLength(0);
    });

    it('forgetSlot soft-deletes matching non-pinned nodes for the user only', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        {
          type: 'fact',
          slot: 'stack',
          content: 'O usuário usa Node',
          confidence: 0.9,
          importance: 0.6,
        },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'uso node');

      const count = await service.forgetSlot('ws-1', 'user-1', 'stack');

      expect(count).toBe(1);
      expect(prisma.nodes.every((n) => n.forgotten)).toBe(true);
    });

    it('expireStale forgets only past-due, non-pinned nodes', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      prisma.nodes.push({
        id: 'n-expired',
        workspaceId: 'ws-1',
        userId: 'user-1',
        scope: 'user',
        type: 'fact',
        content: 'velho',
        summary: null,
        confidence: 0.5,
        importance: 0.5,
        recency: 1,
        pinned: false,
        forgotten: false,
        metadata: {},
        createdAt: new Date(0),
        expiresAt: new Date(Date.now() - 1000),
      });
      prisma.nodes.push({
        id: 'n-pinned',
        workspaceId: 'ws-1',
        userId: 'user-1',
        scope: 'user',
        type: 'fact',
        content: 'fixo',
        summary: null,
        confidence: 0.5,
        importance: 0.5,
        recency: 1,
        pinned: true,
        forgotten: false,
        metadata: {},
        createdAt: new Date(0),
        expiresAt: new Date(Date.now() - 1000),
      });

      const count = await service.expireStale('ws-1', 'user-1');

      expect(count).toBe(1);
      expect(prisma.nodes.find((n) => n.id === 'n-expired')?.forgotten).toBe(true);
      expect(prisma.nodes.find((n) => n.id === 'n-pinned')?.forgotten).toBe(false);
    });
  });

  describe('retrieveRelevant + buildMemoryContextForModel', () => {
    it('excludes forgotten + expired nodes and ranks by importance without an embedder', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        { type: 'fact', slot: 'a', content: 'baixa', confidence: 0.5, importance: 0.2 },
        { type: 'fact', slot: 'b', content: 'alta', confidence: 0.5, importance: 0.9 },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'duas coisas');

      const out = await service.retrieveRelevant('ws-1', 'user-1', 'qualquer', 5);

      expect(out).toHaveLength(2);
      expect(out[0]?.content).toBe('alta'); // higher importance ranks first
    });

    it('buildMemoryContextForModel buckets by type and renders a non-empty block', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        {
          type: 'fact',
          slot: 'nome',
          content: 'O usuário se chama Ana',
          confidence: 0.9,
          importance: 0.8,
        },
        {
          type: 'preference',
          slot: 'fmt',
          content: 'O usuário prefere bullet points',
          confidence: 0.8,
          importance: 0.7,
        },
        {
          type: 'project',
          slot: 'proj',
          content: 'O usuário está construindo o Kloel',
          confidence: 0.8,
          importance: 0.9,
        },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'contexto');

      const ctx = await service.buildMemoryContextForModel(
        'ws-1',
        'user-1',
        'no que estou trabalhando?',
      );

      expect(ctx.userProfileStatic).toContain('O usuário se chama Ana');
      expect(ctx.preferences).toContain('O usuário prefere bullet points');
      expect(ctx.userProfileDynamic).toContain('O usuário está construindo o Kloel');
      expect(ctx.text).toContain('MEMÓRIA DO USUÁRIO');
      expect(ctx.text).toContain('PREFERÊNCIAS DO USUÁRIO');
    });

    it('returns an honest empty context when the user has no memories', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      const ctx = await service.buildMemoryContextForModel('ws-1', 'user-empty', 'oi');

      expect(ctx.text).toBe('');
      expect(ctx.relevantMemories).toHaveLength(0);
    });
  });
});
