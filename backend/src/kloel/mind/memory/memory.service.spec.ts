import { ConfigService } from '@nestjs/config';
import { MemoryService } from './memory.service';

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

interface NodeRow {
  id: string;
  workspaceId: string;
  userId: string;
  scope: string;
  type: string;
  content: string;
  summary: string | null;
  confidence: number;
  importance: number;
  recency: number;
  pinned: boolean;
  forgotten: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date | null;
}

interface EdgeRow {
  id: string;
  workspaceId: string;
  fromId: string;
  toId: string;
  relation: string;
  weight: number;
}

/**
 * Map-backed fake of the `memoryNode` / `memoryEdge` Prisma delegates plus the
 * raw escape hatches. It faithfully reproduces only the operations the service
 * uses, including the `metadata.path=['slot']` slot filter that drives
 * contradiction resolution, and the `(workspaceId, userId)` isolation predicate
 * on every read/write.
 */
class FakePrisma {
  nodes: NodeRow[] = [];
  edges: EdgeRow[] = [];
  private idSeq = 0;
  private timeSeq = 0;

  private nextId(): string {
    this.idSeq += 1;
    return `node-${this.idSeq}`;
  }

  private nextTime(): Date {
    this.timeSeq += 1;
    return new Date(1_700_000_000_000 + this.timeSeq * 1000);
  }

  private slotOf(where: { metadata?: { path?: string[]; equals?: unknown } }): unknown {
    return where.metadata?.path?.[0] === 'slot' ? where.metadata.equals : undefined;
  }

  private matchesNode(
    row: NodeRow,
    where: {
      workspaceId?: string;
      userId?: string;
      forgotten?: boolean;
      pinned?: boolean;
      id?: string;
      metadata?: { path?: string[]; equals?: unknown };
      expiresAt?: { lt?: Date };
    },
  ): boolean {
    if (where.workspaceId !== undefined && row.workspaceId !== where.workspaceId) {
      return false;
    }
    if (where.userId !== undefined && row.userId !== where.userId) {
      return false;
    }
    if (where.forgotten !== undefined && row.forgotten !== where.forgotten) {
      return false;
    }
    if (where.pinned !== undefined && row.pinned !== where.pinned) {
      return false;
    }
    if (where.id !== undefined && row.id !== where.id) {
      return false;
    }
    if (where.expiresAt?.lt !== undefined) {
      if (row.expiresAt === null || row.expiresAt.getTime() >= where.expiresAt.lt.getTime()) {
        return false;
      }
    }
    const slot = this.slotOf(where);
    if (slot !== undefined && row.metadata['slot'] !== slot) {
      return false;
    }
    return true;
  }

  memoryNode = {
    findFirst: jest.fn(
      async (args: { where: Parameters<FakePrisma['matchesNode']>[1] }): Promise<NodeRow | null> => {
        const found = this.nodes
          .filter((n) => this.matchesNode(n, args.where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return found[0] ?? null;
      },
    ),
    findMany: jest.fn(
      async (args: {
        where: Parameters<FakePrisma['matchesNode']>[1] & {
          OR?: Array<{ expiresAt: null | { gt: Date } }>;
        };
      }): Promise<NodeRow[]> => {
        return this.nodes
          .filter((n) => this.matchesNode(n, args.where))
          .filter((n) => {
            const or = args.where.OR;
            if (!or) {
              return true;
            }
            return or.some((clause) =>
              clause.expiresAt === null
                ? n.expiresAt === null
                : n.expiresAt !== null && n.expiresAt.getTime() > clause.expiresAt.gt.getTime(),
            );
          })
          .sort((a, b) => b.importance - a.importance);
      },
    ),
    create: jest.fn(async (args: { data: Partial<NodeRow> }): Promise<NodeRow> => {
      const row: NodeRow = {
        id: args.data.id ?? this.nextId(),
        workspaceId: args.data.workspaceId ?? '',
        userId: args.data.userId ?? '',
        scope: args.data.scope ?? 'user',
        type: args.data.type ?? 'fact',
        content: args.data.content ?? '',
        summary: args.data.summary ?? null,
        confidence: args.data.confidence ?? 0.5,
        importance: args.data.importance ?? 0.5,
        recency: args.data.recency ?? 1,
        pinned: args.data.pinned ?? false,
        forgotten: args.data.forgotten ?? false,
        metadata: (args.data.metadata as Record<string, unknown>) ?? {},
        createdAt: this.nextTime(),
        expiresAt: args.data.expiresAt ?? null,
      };
      this.nodes.push(row);
      return row;
    }),
    updateMany: jest.fn(
      async (args: {
        where: Parameters<FakePrisma['matchesNode']>[1];
        data: Partial<NodeRow>;
      }): Promise<{ count: number }> => {
        let count = 0;
        for (const n of this.nodes) {
          if (this.matchesNode(n, args.where)) {
            Object.assign(n, args.data);
            count += 1;
          }
        }
        return { count };
      },
    ),
  };

  memoryEdge = {
    upsert: jest.fn(
      async (args: {
        where: {
          workspaceId_fromId_relation_toId: {
            workspaceId: string;
            fromId: string;
            relation: string;
            toId: string;
          };
        };
        create: Partial<EdgeRow>;
      }): Promise<EdgeRow> => {
        const k = args.where.workspaceId_fromId_relation_toId;
        const existing = this.edges.find(
          (e) =>
            e.workspaceId === k.workspaceId &&
            e.fromId === k.fromId &&
            e.relation === k.relation &&
            e.toId === k.toId,
        );
        if (existing) {
          existing.weight += 1;
          return existing;
        }
        const row: EdgeRow = {
          id: args.create.id ?? `edge-${this.edges.length + 1}`,
          workspaceId: k.workspaceId,
          fromId: k.fromId,
          toId: k.toId,
          relation: k.relation,
          weight: 1,
        };
        this.edges.push(row);
        return row;
      },
    ),
  };

  $executeRaw = jest.fn().mockResolvedValue(0);
  $queryRaw = jest.fn().mockResolvedValue([]);
}

function buildService(prisma: FakePrisma): MemoryService {
  const config = { get: jest.fn() } as unknown as ConfigService;
  // No VectorService injected → degrades to recency/importance ranking (honest).
  return new MemoryService(config, prisma as never, undefined);
}

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
        { type: 'fact', slot: 'cidade', content: 'O usuário mora no RJ', confidence: 0.9, importance: 0.7 },
        { type: 'preference', slot: 'preferencia_formato', content: 'O usuário prefere respostas curtas', confidence: 0.8, importance: 0.6 },
      ];

      const result = await service.extractFromTurn('ws-1', 'user-1', 'moro no rio, me responde curto');

      expect(result.created).toBe(2);
      expect(prisma.nodes).toHaveLength(2);
      expect(prisma.nodes.every((n) => n.workspaceId === 'ws-1' && n.userId === 'user-1')).toBe(true);
      const cityNode = prisma.nodes.find((n) => n.metadata['slot'] === 'cidade');
      expect(cityNode?.type).toBe('fact');
      expect(cityNode?.content).toBe('O usuário mora no RJ');
    });

    it('coerces an unknown type to "fact" and drops items with no slot', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [
        { type: 'banana', slot: 'profissao', content: 'O usuário é dev', confidence: 1, importance: 1 },
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

      nextMemories = [{ type: 'fact', slot: 'cidade', content: 'O usuário mora no RJ', confidence: 0.9, importance: 0.7 }];
      await service.extractFromTurn('ws-1', 'user-1', 'moro no rio');

      nextMemories = [{ type: 'fact', slot: 'cidade', content: 'O usuário mora em SP', confidence: 0.95, importance: 0.7 }];
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

      const same = { type: 'fact', slot: 'nome', content: 'O usuário se chama Ana', confidence: 0.9, importance: 0.7 };
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

      nextMemories = [{ type: 'fact', slot: 'cidade', content: 'A mora no RJ', confidence: 0.9, importance: 0.7 }];
      await service.extractFromTurn('ws-1', 'user-A', 'rj');
      nextMemories = [{ type: 'fact', slot: 'cidade', content: 'B mora em SP', confidence: 0.9, importance: 0.7 }];
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

      nextMemories = [{ type: 'fact', slot: 'empresa', content: 'O usuário trabalha na ACME', confidence: 0.9, importance: 0.6 }];
      await service.extractFromTurn('ws-1', 'user-1', 'trabalho na acme');

      nextMemories = [{ type: 'fact', slot: 'empresa', content: '', confidence: 0.5, importance: 0.5, forget: true }];
      const result = await service.extractFromTurn('ws-1', 'user-1', 'esquece onde trabalho');

      expect(result.forgotten).toBe(1);
      expect(prisma.nodes.filter((n) => !n.forgotten)).toHaveLength(0);
    });

    it('forgetSlot soft-deletes matching non-pinned nodes for the user only', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      nextMemories = [{ type: 'fact', slot: 'stack', content: 'O usuário usa Node', confidence: 0.9, importance: 0.6 }];
      await service.extractFromTurn('ws-1', 'user-1', 'uso node');

      const count = await service.forgetSlot('ws-1', 'user-1', 'stack');

      expect(count).toBe(1);
      expect(prisma.nodes.every((n) => n.forgotten)).toBe(true);
    });

    it('expireStale forgets only past-due, non-pinned nodes', async () => {
      const prisma = new FakePrisma();
      const service = buildService(prisma);
      prisma.nodes.push({
        id: 'n-expired', workspaceId: 'ws-1', userId: 'user-1', scope: 'user', type: 'fact',
        content: 'velho', summary: null, confidence: 0.5, importance: 0.5, recency: 1,
        pinned: false, forgotten: false, metadata: {}, createdAt: new Date(0),
        expiresAt: new Date(Date.now() - 1000),
      });
      prisma.nodes.push({
        id: 'n-pinned', workspaceId: 'ws-1', userId: 'user-1', scope: 'user', type: 'fact',
        content: 'fixo', summary: null, confidence: 0.5, importance: 0.5, recency: 1,
        pinned: true, forgotten: false, metadata: {}, createdAt: new Date(0),
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
        { type: 'fact', slot: 'nome', content: 'O usuário se chama Ana', confidence: 0.9, importance: 0.8 },
        { type: 'preference', slot: 'fmt', content: 'O usuário prefere bullet points', confidence: 0.8, importance: 0.7 },
        { type: 'project', slot: 'proj', content: 'O usuário está construindo o Kloel', confidence: 0.8, importance: 0.9 },
      ];
      await service.extractFromTurn('ws-1', 'user-1', 'contexto');

      const ctx = await service.buildMemoryContextForModel('ws-1', 'user-1', 'no que estou trabalhando?');

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
