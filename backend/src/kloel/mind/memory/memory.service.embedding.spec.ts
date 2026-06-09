import {
  buildService,
  buildServiceWithVectors,
  FakePrisma,
  FakeVectors,
} from './memory.service.spec.helpers';

/**
 * Embedding write path + consolidated-belief recall specs for `MemoryService`,
 * split out of `memory.service.spec.ts` so each spec file stays within the
 * architecture size guardrail. Same hermetic setup: the DeepSeek completion is
 * stubbed via `nextMemories` (no network, no flakiness).
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

describe('MemoryService — embedding + consolidated beliefs', () => {
  beforeEach(() => {
    nextMemories = [];
    jest.clearAllMocks();
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
      const rawCalls = prisma.$executeRaw.mock.calls as Array<
        [TemplateStringsArray, string, string | undefined, string, string]
      >;
      const call = rawCalls[0];
      if (!call) {
        throw new Error('expected embedding UPDATE call');
      }
      // Tagged template: [stringsArray, vectorString, id, workspaceId, userId]
      const [strings, vectorString, boundId, boundWs, boundUser] = call;
      const sqlText = Array.from(strings).join('');
      expect(sqlText).toContain('UPDATE "RAC_MemoryNode"');
      expect(sqlText).toContain('SET "embedding"');
      expect(sqlText).toContain('::vector');
      expect(vectorString).toMatch(/^\[0\.001(,0\.001)*\]$/);
      expect(boundId).toBe(newId);
      expect(boundWs).toBe('ws-emb');
      expect(boundUser).toBe('user-emb');
    });

    it('skips the write when the embedder returns a vector whose length ≠ 1536 (guard)', async () => {
      const prisma = new FakePrisma();
      const vectors = new FakeVectors([0.1, 0.2, 0.3]); // wrong dimensionality
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
        {
          type: 'fact',
          slot: 'cidade',
          content: 'O usuário mora no RJ',
          confidence: 0.9,
          importance: 0.7,
        },
      ];

      const result = await service.extractFromTurn('ws-emb', 'user-emb', 'moro no rio');

      expect(result.created).toBe(1); // creation must not be broken by an embed failure
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('writes no embedding at all when no VectorService is injected', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma); // no vectors
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
        {
          type: 'fact',
          slot: 'nome',
          content: 'O usuário se chama Ana',
          confidence: 0.9,
          importance: 0.8,
        },
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
        {
          type: 'fact',
          slot: 'nome',
          content: 'O usuário se chama Ana',
          confidence: 0.9,
          importance: 0.8,
        },
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
});
