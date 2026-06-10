import { buildService, FakePrisma } from './memory.service.spec.helpers';

/**
 * Graph read-model (`recallGraph`) + graph mutation (`updateGraphNode`) specs
 * for `MemoryService`, split out of `memory.service.spec.ts` so each spec file
 * stays within the architecture size guardrail. Same hermetic setup: the
 * DeepSeek completion is stubbed via `nextMemories` (no network, no flakiness).
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

describe('MemoryService — graph read-model + mutation', () => {
  beforeEach(() => {
    nextMemories = [];
    jest.clearAllMocks();
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
      expect(userNode).toMatchObject({
        originLabel: 'Kloel Chat',
        sourceRefs: [{ type: 'conversation', label: 'Kloel Chat', ref: 'memory-extraction' }],
      });
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
        {
          type: 'fact',
          slot: 'cidade',
          content: 'O usuário mora no RJ',
          confidence: 0.9,
          importance: 0.7,
        },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'rio');
      // NOTE: supersession marks the prior node forgotten, so it is excluded
      // from the graph; the replaces edge is dropped because one endpoint is
      // no longer an active (visible) node — the graph never resurrects it.
      nextMemories = [
        {
          type: 'fact',
          slot: 'cidade',
          content: 'O usuário mora em SP',
          confidence: 0.95,
          importance: 0.7,
        },
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
        {
          type: 'fact',
          slot: 'cidade',
          content: 'O usuário mora no RJ',
          confidence: 0.9,
          importance: 0.7,
        },
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

    it('updates an owned node scope and returns the refreshed graph', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        {
          type: 'project',
          slot: 'kloel_memory_graph',
          content: 'O usuário está trabalhando na memória-grafo do Kloel',
          confidence: 0.92,
          importance: 0.85,
        },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'memoria');
      const nodeId = prisma.nodes[0]?.id ?? '';

      const graph = await service.updateGraphNode('ws-1', 'user-1', nodeId, { scope: 'workspace' });

      expect(prisma.nodes.find((n) => n.id === nodeId)?.scope).toBe('workspace');
      expect(graph.nodes.find((n) => n.id === nodeId)?.scope).toBe('workspace');
      const actions = prisma.nodes.find((n) => n.id === nodeId)?.metadata['userActions'] as Array<
        Record<string, unknown>
      >;
      expect(actions.at(-1)).toMatchObject({ action: 'graph_update', changed: ['scope'] });
    });

    it('forgets an owned node and removes it from the returned graph', async () => {
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
