type MemoryNodeStoredRow = {
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
};

type MemoryNodeWhere = {
  workspaceId?: string;
  userId?: string;
  forgotten?: boolean;
  pinned?: boolean;
  id?: string;
  metadata?: { path?: string[]; equals?: unknown };
  expiresAt?: { lt?: Date; gt?: Date };
};

type MemoryNodeFindManyWhere = MemoryNodeWhere & {
  OR?: Array<{ expiresAt: null | { gt: Date } }>;
};

/** Persisted edge row as read back by the graph read-model (`recallGraph`). */
type MemoryEdgeStoredRow = {
  fromId: string;
  toId: string;
  relation: string;
};

type MemoryEdgeFindManyWhere = {
  workspaceId?: string;
  fromId?: { in?: string[] };
  toId?: { in?: string[] };
};

type OrderBy = Record<string, string> | Array<Record<string, string>>;

/**
 * Consolidated belief row written by mind-bg consolidation (`RAC_MindBelief`).
 * Workspace-scoped only — there is NO `userId` column — so live recall reads it
 * scoped to `workspaceId` (workspace-level learnings, shared across the
 * workspace's users by design). `predicate` carries the human-readable learning;
 * `mean`/`samples` are the confidence proxy; `updatedAt` drives staleness.
 */
type MindBeliefRow = {
  subject: string;
  predicate: string;
  mean: number;
  samples: number;
  updatedAt: Date;
};

type MindBeliefWhere = {
  workspaceId?: string;
  updatedAt?: { gte?: Date };
};

export type MemoryServicePrisma = {
  memoryNode: {
    findFirst(args: {
      where: MemoryNodeWhere;
      orderBy?: OrderBy;
    }): Promise<MemoryNodeStoredRow | null>;
    findMany(args: {
      where: MemoryNodeFindManyWhere;
      orderBy?: OrderBy;
      take?: number;
    }): Promise<MemoryNodeStoredRow[]>;
    create(args: { data: Partial<MemoryNodeStoredRow> }): Promise<MemoryNodeStoredRow>;
    updateMany(args: {
      where: MemoryNodeWhere;
      data: Partial<MemoryNodeStoredRow>;
    }): Promise<{ count: number }>;
  };
  memoryEdge: {
    findMany(args: {
      where: MemoryEdgeFindManyWhere;
      orderBy?: OrderBy;
      take?: number;
    }): Promise<MemoryEdgeStoredRow[]>;
    upsert(args: {
      where: {
        workspaceId_fromId_relation_toId: {
          workspaceId: string;
          fromId: string;
          relation: string;
          toId: string;
        };
      };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
  };
  mindBelief: {
    findMany(args: {
      where: MindBeliefWhere;
      orderBy?: Array<Record<string, string>> | Record<string, string>;
      take?: number;
    }): Promise<MindBeliefRow[]>;
  };
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};
