import { ConfigService } from '@nestjs/config';
import { MemoryService } from './memory.service';

export interface NodeRow {
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

export interface EdgeRow {
  id: string;
  workspaceId: string;
  fromId: string;
  toId: string;
  relation: string;
  weight: number;
}

export interface BeliefRow {
  subject: string;
  predicate: string;
  mean: number;
  samples: number;
  updatedAt: Date;
  workspaceId: string;
}

/**
 * Map-backed fake of the `memoryNode` / `memoryEdge` Prisma delegates plus the
 * raw escape hatches. It faithfully reproduces only the operations the service
 * uses, including the `metadata.path=['slot']` slot filter that drives
 * contradiction resolution, and the `(workspaceId, userId)` isolation predicate
 * on every read/write.
 */
export class FakePrisma {
  nodes: NodeRow[] = [];
  edges: EdgeRow[] = [];
  beliefs: BeliefRow[] = [];
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
      (args: {
        where: Parameters<FakePrisma['matchesNode']>[1];
        orderBy?: Record<string, string> | Array<Record<string, string>>;
      }): Promise<NodeRow | null> => {
        const found = this.nodes
          .filter((n) => this.matchesNode(n, args.where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return Promise.resolve(found[0] ?? null);
      },
    ),
    findMany: jest.fn(
      (args: {
        where: Parameters<FakePrisma['matchesNode']>[1] & {
          OR?: Array<{ expiresAt: null | { gt: Date } }>;
        };
        orderBy?: Record<string, string> | Array<Record<string, string>>;
        take?: number;
      }): Promise<NodeRow[]> => {
        return Promise.resolve(
          this.nodes
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
            .sort((a, b) => b.importance - a.importance),
        );
      },
    ),
    create: jest.fn((args: { data: Partial<NodeRow> }): Promise<NodeRow> => {
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
      return Promise.resolve(row);
    }),
    updateMany: jest.fn(
      (args: {
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
        return Promise.resolve({ count });
      },
    ),
  };

  memoryEdge = {
    findMany: jest.fn(
      (args: {
        where: { workspaceId?: string; fromId?: { in?: string[] }; toId?: { in?: string[] } };
        orderBy?: Record<string, string> | Array<Record<string, string>>;
        take?: number;
      }): Promise<Array<{ fromId: string; toId: string; relation: string }>> => {
        const fromIn = args.where.fromId?.in;
        const toIn = args.where.toId?.in;
        const filtered = this.edges
          .filter((e) => args.where.workspaceId === undefined || e.workspaceId === args.where.workspaceId)
          .filter((e) => fromIn === undefined || fromIn.includes(e.fromId))
          .filter((e) => toIn === undefined || toIn.includes(e.toId))
          .map((e) => ({ fromId: e.fromId, toId: e.toId, relation: e.relation }));
        return Promise.resolve(filtered.slice(0, args.take ?? filtered.length));
      },
    ),
    upsert: jest.fn(
      (args: {
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
          return Promise.resolve(existing);
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
        return Promise.resolve(row);
      },
    ),
  };

  mindBelief = {
    findMany: jest.fn(
      (args: {
        where: { workspaceId?: string; updatedAt?: { gte?: Date } };
        take?: number;
      }): Promise<BeliefRow[]> => {
        const filtered = this.beliefs
          .filter((b) => args.where.workspaceId === undefined || b.workspaceId === args.where.workspaceId)
          .filter((b) => {
            const gte = args.where.updatedAt?.gte;
            return gte === undefined || b.updatedAt.getTime() >= gte.getTime();
          })
          .sort((a, b) => b.samples - a.samples || b.updatedAt.getTime() - a.updatedAt.getTime());
        return Promise.resolve(filtered.slice(0, args.take ?? filtered.length));
      },
    ),
  };

  $executeRaw = jest.fn().mockResolvedValue(0);
  $queryRaw = jest.fn().mockResolvedValue([]);
}

export function buildService(prisma: FakePrisma): MemoryService {
  const config = new ConfigService();
  // No VectorService injected → degrades to recency/importance ranking (honest).
  return new MemoryService(config, prisma, undefined);
}

/**
 * Minimal `VectorService` stand-in. `getEmbedding` returns a programmable vector
 * (default: a valid 1536-dim vector) and a `tokensUsed` count, matching the real
 * `EmbeddingResult` shape — enough to exercise the embedding-write path.
 */
export class FakeVectors {
  getEmbedding = jest.fn(
    (_text: string): Promise<{ embedding: number[]; tokensUsed: number }> =>
      Promise.resolve({ embedding: this.nextEmbedding, tokensUsed: 7 }),
  );

  constructor(public nextEmbedding: number[] = new Array(1536).fill(0.001)) {}
}

export function buildServiceWithVectors(
  prisma: FakePrisma,
  vectors: FakeVectors,
): MemoryService {
  const config = new ConfigService();
  return new MemoryService(config, prisma, vectors);
}
