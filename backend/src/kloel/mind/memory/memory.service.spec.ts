import {
  buildService,
  buildServiceWithVectors,
  FakePrisma,
  FakeVectors,
} from './memory.service.spec.helpers';

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

    it('edge defense-in-depth: verifies both endpoints are user-owned before writing an edge', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'O usuário mora no RJ', confidence: 0.9, importance: 0.7 },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'moro no rio');
      // Clear the create-path lookups so we count only the supersession turn.
      prisma.memoryNode.findFirst.mockClear();

      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'O usuário mora em SP', confidence: 0.95, importance: 0.7 },
      ];
      const result = await service.extractFromTurn('ws-1', 'user-1', 'mudei pra sampa');

      // Normal same-user supersession: ownership check passes, edges are written.
      expect(result.updated).toBe(1);
      expect(prisma.edges.map((e) => e.relation).sort()).toEqual(['contradicts', 'replaces']);
      // The ownership lookups must scope every probe to (workspaceId, userId).
      expect(
        prisma.memoryNode.findFirst.mock.calls.every(
          (c) => c[0]?.where.workspaceId === 'ws-1' && c[0]?.where.userId === 'user-1',
        ),
      ).toBe(true);
    });

    it('edge defense-in-depth: denies the edge when an endpoint is not user-owned', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'O usuário mora no RJ', confidence: 0.9, importance: 0.7 },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'moro no rio');

      // Force the ownership probe to report an unowned endpoint at edge-write time
      // (simulates cross-tenant drift the slot lookup alone would not catch).
      prisma.memoryNode.findFirst.mockImplementation(
        (args: { where: { id?: string } }) =>
          Promise.resolve(args.where.id === undefined ? prisma.nodes[0] ?? null : null),
      );

      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'O usuário mora em SP', confidence: 0.95, importance: 0.7 },
      ];
      const result = await service.extractFromTurn('ws-1', 'user-1', 'mudei pra sampa');

      // Prior is still found (slot lookup has no id), supersession runs, but the
      // edge ownership check (by id) fails → no edge is written.
      expect(result.updated).toBe(1);
      expect(prisma.edges).toHaveLength(0);
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

  describe('embedding write path (writeEmbedding)', () => {
    it('writes the pgvector UPDATE scoped to (id, workspaceId, userId) for a valid 1536-dim vector', async () => {
      const prisma = new FakePrisma();
      const vectors = new FakeVectors(); // default: valid 1536-dim vector
      const service = buildServiceWithVectors(prisma, vectors);
      nextMemories = [
        {
          type: 'fact',
          slot: 'cidade',
          content: 'O usuário mora no RJ',
          confidence: 0.9,
          importance: 0.7,
        },
      ];

      const result = await service.extractFromTurn('ws-emb', 'user-emb', 'moro no rio');

      expect(result.created).toBe(1);
      expect(vectors.getEmbedding).toHaveBeenCalledWith('O usuário mora no RJ');
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);

      const newId = prisma.nodes[0]?.id;
      const call = prisma.$executeRaw.mock.calls[0] ?? [];
      // Tagged template: [stringsArray, vectorString, id, workspaceId, userId]
      const sqlText = (call[0] as string[]).join('');
      expect(sqlText).toContain('UPDATE "RAC_MemoryNode"');
      expect(sqlText).toContain('SET "embedding"');
      expect(sqlText).toContain('::vector');
      const [, vectorString, boundId, boundWs, boundUser] = call;
      expect(typeof vectorString).toBe('string');
      expect(vectorString as string).toMatch(/^\[0\.001(,0\.001)*\]$/);
      expect(boundId).toBe(newId);
      expect(boundWs).toBe('ws-emb');
      expect(boundUser).toBe('user-emb');
    });

    it('skips the write when the embedder returns a vector whose length ≠ 1536 (guard)', async () => {
      const prisma = new FakePrisma();
      const vectors = new FakeVectors([0.1, 0.2, 0.3]); // wrong dimensionality
      const service = buildServiceWithVectors(prisma, vectors);
      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'O usuário mora no RJ', confidence: 0.9, importance: 0.7 },
      ];

      const result = await service.extractFromTurn('ws-emb', 'user-emb', 'moro no rio');

      expect(result.created).toBe(1); // node still created
      expect(vectors.getEmbedding).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw).not.toHaveBeenCalled(); // but no embedding written
    });

    it('skips the write when the embedder throws (embedOrNull → null)', async () => {
      const prisma = new FakePrisma();
      const vectors = new FakeVectors();
      vectors.getEmbedding.mockRejectedValueOnce(new Error('embedding provider down'));
      const service = buildServiceWithVectors(prisma, vectors);
      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'O usuário mora no RJ', confidence: 0.9, importance: 0.7 },
      ];

      const result = await service.extractFromTurn('ws-emb', 'user-emb', 'moro no rio');

      expect(result.created).toBe(1); // creation must not be broken by an embed failure
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('writes no embedding at all when no VectorService is injected', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma); // no vectors
      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'O usuário mora no RJ', confidence: 0.9, importance: 0.7 },
      ];

      const result = await service.extractFromTurn('ws-emb', 'user-emb', 'moro no rio');

      expect(result.created).toBe(1);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('consolidated beliefs in live recall (RAC_MindBelief)', () => {
    const freshBelief = (
      workspaceId: string,
      predicate: string,
      samples: number,
    ): {
      workspaceId: string;
      subject: string;
      predicate: string;
      mean: number;
      samples: number;
      updatedAt: Date;
    } => ({
      workspaceId,
      subject: 'skill-x',
      predicate,
      mean: 0.5,
      samples,
      updatedAt: new Date(), // fresh → non-stale
    });

    it('fetches workspace-scoped non-stale beliefs and injects them as a labeled section', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      // A user memory so the context is non-empty even without beliefs.
      nextMemories = [
        { type: 'fact', slot: 'nome', content: 'O usuário se chama Ana', confidence: 0.9, importance: 0.8 },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'sou a ana');

      prisma.beliefs.push(freshBelief('ws-1', 'Clientes preferem resposta rápida no WhatsApp', 5));
      prisma.beliefs.push(freshBelief('ws-1', 'Descontos acima de 20% aumentam conversão', 9));

      const ctx = await service.buildMemoryContextForModel('ws-1', 'user-1', 'no que devo focar?');

      expect(prisma.mindBelief.findMany).toHaveBeenCalledTimes(1);
      const where = prisma.mindBelief.findMany.mock.calls[0]?.[0]?.where;
      expect(where?.workspaceId).toBe('ws-1'); // scoping enforced
      expect(where?.updatedAt?.gte).toBeInstanceOf(Date); // staleness filter applied

      expect(ctx.text).toContain('APRENDIZADOS CONSOLIDADOS');
      expect(ctx.text).toContain('Clientes preferem resposta rápida no WhatsApp');
      // ordered by samples desc → the 9-sample learning ranks first
      expect(ctx.text).toContain('Descontos acima de 20% aumentam conversão');
    });

    it('does not surface another workspace beliefs (scoping)', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        { type: 'fact', slot: 'nome', content: 'O usuário se chama Ana', confidence: 0.9, importance: 0.8 },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'sou a ana');

      prisma.beliefs.push(freshBelief('ws-OTHER', 'Segredo de outro workspace', 50));

      const ctx = await service.buildMemoryContextForModel('ws-1', 'user-1', 'algo?');

      expect(ctx.text).not.toContain('APRENDIZADOS CONSOLIDADOS');
      expect(ctx.text).not.toContain('Segredo de outro workspace');
    });

    it('renders a beliefs-only context when the user has no memories but the workspace has learnings', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      prisma.beliefs.push(freshBelief('ws-1', 'Leads do Instagram fecham mais rápido', 4));

      const ctx = await service.buildMemoryContextForModel('ws-1', 'user-empty', 'oi');

      expect(ctx.relevantMemories).toHaveLength(0);
      expect(ctx.text).toContain('APRENDIZADOS CONSOLIDADOS');
      expect(ctx.text).toContain('Leads do Instagram fecham mais rápido');
    });

    it('stays a byte-identical empty no-op when neither memories nor beliefs exist', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      const ctx = await service.buildMemoryContextForModel('ws-1', 'user-empty', 'oi');

      expect(ctx.text).toBe('');
      expect(ctx.relevantMemories).toHaveLength(0);
    });
  });

  describe('graph read-model (recallGraph)', () => {
    it('returns an empty graph without scope (defense)', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      expect(await service.recallGraph('', 'user-1')).toEqual({ nodes: [], edges: [] });
      expect(await service.recallGraph('ws-1', '')).toEqual({ nodes: [], edges: [] });
      expect(prisma.memoryNode.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty graph when the user has no active nodes', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      expect(await service.recallGraph('ws-1', 'user-1')).toEqual({ nodes: [], edges: [] });
    });

    it('projects active nodes into a "you"-centered graph, isolated by (workspaceId, userId)', async () => {
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
      // A second user's memory must never leak into user-1's graph.
      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'B mora em SP', confidence: 0.9, importance: 0.7 },
      ];
      await service.extractFromTurn('ws-1', 'user-2', 'sampa');

      const graph = await service.recallGraph('ws-1', 'user-1');

      // center node + exactly the one node user-1 owns
      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes[0]).toMatchObject({ id: 'you', group: 'center', label: 'Você' });
      const userNode = graph.nodes.find((n) => n.id !== 'you');
      expect(userNode?.label).toBe('O usuário mora no RJ');
      expect(userNode?.group).toBe('fact');
      expect(userNode?.state).toBe('confirmed');
      expect(userNode?.usableByAgent).toBe(true);
      // scoping: findMany was probed with the caller's (workspaceId, userId)
      const where = prisma.memoryNode.findMany.mock.calls.at(-1)?.[0]?.where;
      expect(where?.workspaceId).toBe('ws-1');
      expect(where?.userId).toBe('user-1');
      // synthetic belongs_to edge from the center to the user's node
      expect(graph.edges).toContainEqual({ from: 'you', to: userNode?.id, relation: 'belongs_to' });
    });

    it('renders supersession (replaces/contradicts) edges between owned nodes', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'O usuário mora no RJ', confidence: 0.9, importance: 0.7 },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'rio');
      // NOTE: supersession marks the prior node forgotten, so it is excluded
      // from the graph; the replaces edge is dropped because one endpoint is
      // no longer an active (visible) node — the graph never resurrects it.
      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'O usuário mora em SP', confidence: 0.95, importance: 0.7 },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'sampa');

      const graph = await service.recallGraph('ws-1', 'user-1');

      // forgotten prior node is excluded → only center + active node
      expect(graph.nodes.filter((n) => n.id !== 'you')).toHaveLength(1);
      expect(graph.nodes.find((n) => n.id !== 'you')?.label).toBe('O usuário mora em SP');
      // no edge references the forgotten endpoint
      expect(graph.edges.every((e) => e.relation === 'belongs_to')).toBe(true);
    });
  });

  describe('graph mutation (updateGraphNode)', () => {
    it('refuses the synthetic center node and missing scope (no-op, returns graph)', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);

      expect(await service.updateGraphNode('ws-1', 'user-1', 'you', { pinned: true })).toEqual({
        nodes: [],
        edges: [],
      });
      expect(await service.updateGraphNode('', 'user-1', 'n-1', { pinned: true })).toEqual({
        nodes: [],
        edges: [],
      });
      expect(prisma.memoryNode.updateMany).not.toHaveBeenCalled();
    });

    it('pins an owned node, records a userActions audit entry, and returns the fresh graph', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'O usuário mora no RJ', confidence: 0.9, importance: 0.7 },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'rio');
      const nodeId = prisma.nodes[0]?.id ?? '';

      const graph = await service.updateGraphNode('ws-1', 'user-1', nodeId, { pinned: true });

      const node = prisma.nodes.find((n) => n.id === nodeId);
      expect(node?.pinned).toBe(true);
      const actions = node?.metadata['userActions'] as Array<Record<string, unknown>>;
      expect(actions.at(-1)).toMatchObject({ action: 'graph_update', changed: ['pinned'] });
      expect(graph.nodes.find((n) => n.id === nodeId)?.state).toBe('pinned');
      // every write was scoped to the caller's (workspaceId, userId)
      const updWhere = prisma.memoryNode.updateMany.mock.calls.at(-1)?.[0]?.where;
      expect(updWhere?.workspaceId).toBe('ws-1');
      expect(updWhere?.userId).toBe('user-1');
    });

    it('forgets an owned node and removes it from the returned graph', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'O usuário mora no RJ', confidence: 0.9, importance: 0.7 },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'rio');
      const nodeId = prisma.nodes[0]?.id ?? '';

      const graph = await service.updateGraphNode('ws-1', 'user-1', nodeId, { forgotten: true });

      expect(prisma.nodes.find((n) => n.id === nodeId)?.forgotten).toBe(true);
      expect(graph.nodes.find((n) => n.id === nodeId)).toBeUndefined();
    });

    it('does not let one user mutate another user node (isolation)', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        { type: 'fact', slot: 'cidade', content: 'A mora no RJ', confidence: 0.9, importance: 0.7 },
      ];
      await service.extractFromTurn('ws-1', 'user-A', 'rio');
      const aNodeId = prisma.nodes[0]?.id ?? '';

      await service.updateGraphNode('ws-1', 'user-B', aNodeId, { pinned: true });

      // user-B's lookup is scoped to user-B → no row found → no write
      expect(prisma.nodes.find((n) => n.id === aNodeId)?.pinned).toBe(false);
      expect(prisma.memoryNode.updateMany).not.toHaveBeenCalled();
    });
  });
});
