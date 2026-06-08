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
  expiresAt?: { lt?: Date };
};

type MemoryNodeFindManyWhere = MemoryNodeWhere & {
  OR?: Array<{ expiresAt: null | { gt: Date } }>;
};

export type MemoryServicePrisma = {
  memoryNode: {
    findFirst(args: {
      where: MemoryNodeWhere;
      orderBy?: Record<string, string>;
    }): Promise<MemoryNodeStoredRow | null>;
    findMany(args: {
      where: MemoryNodeFindManyWhere;
      orderBy?: Record<string, string>;
      take?: number;
    }): Promise<MemoryNodeStoredRow[]>;
    create(args: { data: Partial<MemoryNodeStoredRow> }): Promise<MemoryNodeStoredRow>;
    updateMany(args: {
      where: MemoryNodeWhere;
      data: Partial<MemoryNodeStoredRow>;
    }): Promise<{ count: number }>;
  };
  memoryEdge: {
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
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};
