import { asMemoryNodeType, type RetrievedMemory } from './memory-graph.types';

type MemoryRetrievedRow = {
  id: string;
  scope: string;
  type: string;
  content: string;
  summary: string | null;
  importance: number;
  confidence: number;
  pinned: boolean;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
};

type MemoryNodeFindManyWhere = {
  workspaceId?: string;
  userId?: string;
  forgotten?: boolean;
  OR?: Array<{ expiresAt: null | { gt: Date } }>;
};

type MemoryRetrievalPrisma = {
  memoryNode: {
    findMany(args: {
      where: MemoryNodeFindManyWhere;
      orderBy?: Record<string, string>;
      take?: number;
    }): Promise<MemoryRetrievedRow[]>;
  };
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type MemoryLogger = { warn(message: string, meta?: Record<string, unknown>): void };
type EmbedFn = (text: string) => Promise<number[] | null>;
type FormatErrorFn = (error: unknown) => string;

interface RetrieveRelevantMemoriesInput {
  readonly workspaceId: string;
  readonly userId: string;
  readonly query: string;
  readonly k: number;
  readonly prisma: MemoryRetrievalPrisma;
  readonly embedOrNull: EmbedFn;
  readonly logger: MemoryLogger;
  readonly formatError: FormatErrorFn;
  readonly retrievePool: number;
  readonly recencyHalfLifeMs: number;
}

export async function retrieveRelevantMemories({
  workspaceId,
  userId,
  query,
  k,
  prisma,
  embedOrNull,
  logger,
  formatError,
  retrievePool,
  recencyHalfLifeMs,
}: RetrieveRelevantMemoriesInput): Promise<RetrievedMemory[]> {
  if (!workspaceId || !userId) {
    return [];
  }
  const limit = Math.max(1, Math.min(k, 50));
  const now = Date.now();

  try {
    const queryEmbedding = query.trim() ? await embedOrNull(query) : null;
    const semanticDistance = queryEmbedding
      ? await semanticDistances({
          workspaceId,
          userId,
          embedding: queryEmbedding,
          prisma,
          logger,
          formatError,
          retrievePool,
        })
      : new Map<string, number>();

    const rows = await prisma.memoryNode.findMany({
      where: {
        workspaceId,
        userId,
        forgotten: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now) } }],
      },
      orderBy: { importance: 'desc' },
      take: retrievePool,
    });

    return rows
      .filter(isAgentUsableMemoryRow)
      .map((row) => {
        const recency = decayRecency(row.createdAt.getTime(), now, recencyHalfLifeMs);
        const dist = semanticDistance.get(row.id);
        const similarity = dist === undefined ? 0.5 : Math.max(0, 1 - dist / 2);
        const scopeBoost = row.scope === 'user' ? 1 : row.scope === 'shared' ? 0.85 : 0.7;
        const pinBoost = row.pinned ? 0.25 : 0;
        const score =
          similarity * 0.5 + row.importance * 0.25 + recency * 0.15 + scopeBoost * 0.1 + pinBoost;
        const type = asMemoryNodeType(row.type) ?? 'fact';
        const safeContent =
          type === 'sensitive' ? 'Memória sensível bloqueada para exposição.' : row.content;
        const safeSummary =
          type === 'sensitive'
            ? 'Memória sensível bloqueada para exposição.'
            : (row.summary ?? null);
        return {
          id: row.id,
          type,
          content: safeContent,
          summary: safeSummary,
          importance: row.importance,
          confidence: row.confidence,
          score,
        } satisfies RetrievedMemory;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error: unknown) {
    logger.warn('retrieveRelevant failed', {
      context: 'MemoryService.retrieveRelevant',
      error: formatError(error),
    });
    return [];
  }
}

function isAgentUsableMemoryRow(row: MemoryRetrievedRow): boolean {
  const metadata = readMemoryMetadata(row.metadata);
  const type = asMemoryNodeType(row.type) ?? 'fact';
  if (type === 'expired') {
    return false;
  }
  return (
    metadata['archived'] !== true &&
    metadata['blockedForAgent'] !== true &&
    metadata['usableByAgent'] !== false
  );
}

function readMemoryMetadata(metadata: unknown): Record<string, unknown> {
  if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

async function semanticDistances({
  workspaceId,
  userId,
  embedding,
  prisma,
  logger,
  formatError,
  retrievePool,
}: {
  readonly workspaceId: string;
  readonly userId: string;
  readonly embedding: number[];
  readonly prisma: MemoryRetrievalPrisma;
  readonly logger: MemoryLogger;
  readonly formatError: FormatErrorFn;
  readonly retrievePool: number;
}): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const vectorString = `[${embedding.join(',')}]`;
    const rows = await prisma.$queryRaw<Array<{ id: string; distance: number }>>`
      SELECT "id", ("embedding" <=> ${vectorString}::vector) AS distance
      FROM "RAC_MemoryNode"
      WHERE "workspaceId" = ${workspaceId}
        AND "userId" = ${userId}
        AND "forgotten" = false
        AND "embedding" IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${retrievePool}
    `;
    for (const row of rows) {
      out.set(row.id, Number(row.distance));
    }
  } catch (error: unknown) {
    logger.warn('semanticDistances failed', {
      context: 'MemoryService.semanticDistances',
      error: formatError(error),
    });
  }
  return out;
}

function decayRecency(createdAtMs: number, nowMs: number, recencyHalfLifeMs: number): number {
  const elapsed = Math.max(0, nowMs - createdAtMs);
  return Math.pow(0.5, elapsed / recencyHalfLifeMs);
}
