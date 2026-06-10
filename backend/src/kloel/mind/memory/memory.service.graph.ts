import {
  asMemoryEdgeRelation,
  asMemoryNodeType,
  type MemoryGraphPayload,
} from './memory-graph.types';
import { formatMemoryError } from './memory.service.utils';
import type { MemoryServicePrisma } from './memory.service.prisma';

type MemoryGraphLogger = { warn(message: string, meta?: Record<string, unknown>): void };

/** Shared dependencies for the graph read-model and graph mutation helpers. */
export interface MemoryGraphDeps {
  readonly prisma: MemoryServicePrisma;
  readonly logger: MemoryGraphLogger;
}

/** User-visible patch applied to one scoped memory node via the Graph UI. */
export interface MemoryGraphNodePatch {
  readonly content?: unknown;
  readonly summary?: unknown;
  readonly scope?: unknown;
  readonly pinned?: unknown;
  readonly archived?: unknown;
  readonly sensitive?: unknown;
  readonly blockedForAgent?: unknown;
  readonly forgotten?: unknown;
}

interface RecallMemoryGraphInput extends MemoryGraphDeps {
  readonly workspaceId: string;
  readonly userId: string;
}

/**
 * Read the active typed memory topology for the authenticated user's Graph.
 * This is the same MemoryNode/MemoryEdge source the chat uses for recall; it
 * deliberately excludes forgotten and expired nodes so visual memory cannot
 * resurrect data the user asked Kloel not to use. Scoped by (workspaceId,
 * userId) on every read; best-effort (an error yields an empty graph).
 *
 * Extracted from `MemoryService` (which re-exposes it as `recallGraph`) so the
 * service stays within the architecture size guardrail, mirroring the
 * `memory.service.retrieval.ts` sibling-module pattern.
 *
 * @cluster Mind/Memory
 */
export async function recallMemoryGraph({
  workspaceId,
  userId,
  prisma,
  logger,
}: RecallMemoryGraphInput): Promise<MemoryGraphPayload> {
  const empty: MemoryGraphPayload = { nodes: [], edges: [] };
  if (!workspaceId || !userId) {
    return empty;
  }

  try {
    const now = new Date();
    const memoryNodes = await prisma.memoryNode.findMany({
      where: {
        workspaceId,
        userId,
        forgotten: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ pinned: 'desc' }, { importance: 'desc' }, { createdAt: 'desc' }],
      take: 160,
    });

    if (memoryNodes.length === 0) {
      return empty;
    }

    type GraphSourceRef = NonNullable<MemoryGraphPayload['nodes'][number]['sourceRefs']>[number];
    const validSourceRefTypes = new Set<GraphSourceRef['type']>([
      'conversation',
      'document',
      'file',
      'tool',
      'manual',
      'custom',
    ]);
    const readMetadata = (metadata: unknown): Record<string, unknown> => {
      if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
        return metadata as Record<string, unknown>;
      }
      return {};
    };
    const readText = (value: unknown): string | null => {
      if (typeof value !== 'string') {
        return null;
      }
      const text = value.trim();
      return text.length > 0 ? text : null;
    };
    const coerceSourceRefType = (value: unknown): GraphSourceRef['type'] => {
      const type = readText(value);
      return type && validSourceRefTypes.has(type as GraphSourceRef['type'])
        ? (type as GraphSourceRef['type'])
        : 'custom';
    };
    const readSourceRefs = (metadata: Record<string, unknown>): readonly GraphSourceRef[] => {
      const rawRefs = Array.isArray(metadata['sourceRefs']) ? metadata['sourceRefs'] : [];
      const refs = rawRefs.flatMap((item): GraphSourceRef[] => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          return [];
        }
        const record = item as Record<string, unknown>;
        const label = readText(record['label']);
        if (!label) {
          return [];
        }
        const ref = readText(record['ref']);
        const url = readText(record['url']);
        return [
          {
            type: coerceSourceRefType(record['type']),
            label,
            ...(ref ? { ref } : {}),
            ...(url ? { url } : {}),
          },
        ];
      });
      return refs.length > 0
        ? refs.slice(0, 5)
        : [{ type: 'custom', label: 'Memória do Kloel', ref: 'legacy-memory' }];
    };

    const ids = memoryNodes.map((node) => node.id);
    const idSet = new Set(ids);
    const persistedEdges = await prisma.memoryEdge.findMany({
      where: {
        workspaceId,
        fromId: { in: ids },
        toId: { in: ids },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const nodes: MemoryGraphPayload['nodes'] = [
      {
        id: 'you',
        label: 'Você',
        group: 'center',
        state: 'confirmed',
      },
      ...memoryNodes.map((node) => {
        const metadata = readMetadata(node.metadata);
        const nodeType = asMemoryNodeType(node.type) ?? 'fact';
        const sourceRefs = readSourceRefs(metadata);
        const originLabel = sourceRefs[0]?.label;
        const sensitive =
          nodeType === 'sensitive' ||
          metadata['sensitive'] === true ||
          metadata['classification'] === 'sensitive';
        const archived = nodeType === 'expired' || metadata['archived'] === true;
        const blockedForAgent = metadata['blockedForAgent'] === true;
        const replaced =
          metadata['replaced'] === true || typeof metadata['replacedBy'] === 'string';
        const contradicted = nodeType === 'contradiction' || metadata['contradicted'] === true;
        const scope: 'user' | 'workspace' | 'shared' =
          node.scope === 'workspace' || node.scope === 'shared' || node.scope === 'user'
            ? node.scope
            : 'user';
        const summary = node.summary?.trim() || null;
        const content = node.content.trim();
        const state: MemoryGraphPayload['nodes'][number]['state'] = archived
          ? 'archived'
          : blockedForAgent
            ? 'blocked'
            : sensitive
              ? 'sensitive'
              : node.pinned
                ? 'pinned'
                : replaced
                  ? 'replaced'
                  : contradicted
                    ? 'contradicted'
                    : node.confidence < 0.6
                      ? 'uncertain'
                      : 'confirmed';
        return {
          id: node.id,
          label: summary || content || 'Memória',
          group: nodeType,
          content,
          summary,
          scope,
          updatedAt: node.createdAt.toISOString(),
          confidence: node.confidence,
          importance: node.importance,
          state,
          originLabel,
          sourceRefs,
          pinned: node.pinned,
          sensitive,
          archived,
          blockedForAgent,
          usableByAgent: !archived && !blockedForAgent && !sensitive,
        };
      }),
    ];

    const edges: Array<MemoryGraphPayload['edges'][number]> = [];
    const seenEdges = new Set<string>();
    const pushEdge = (
      from: string,
      to: string,
      relation: MemoryGraphPayload['edges'][number]['relation'],
    ): void => {
      const key = `${from}:${relation}:${to}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        edges.push({ from, to, relation });
      }
    };

    for (const nodeId of ids) {
      pushEdge('you', nodeId, 'belongs_to');
    }
    for (const edge of persistedEdges) {
      if (idSet.has(edge.fromId) && idSet.has(edge.toId)) {
        pushEdge(edge.fromId, edge.toId, asMemoryEdgeRelation(edge.relation) ?? 'references');
      }
    }

    return { nodes, edges };
  } catch (error: unknown) {
    logger.warn('recallGraph failed', {
      context: 'MemoryService.recallGraph',
      error: formatMemoryError(error),
    });
    return empty;
  }
}

interface UpdateMemoryGraphNodeInput extends MemoryGraphDeps {
  readonly workspaceId: string;
  readonly userId: string;
  readonly nodeId: string;
  readonly patch: MemoryGraphNodePatch;
}

/**
 * Apply a user-visible graph edit to one scoped memory node and return the
 * fresh graph. Scoped by (workspaceId, userId); a node that is not owned by
 * the user (or the synthetic `you` center node) is a no-op. Mutations are
 * recorded in a bounded `userActions` audit trail on the node metadata.
 * Best-effort: store/update failures fall back to returning the current graph.
 */
export async function updateMemoryGraphNode({
  workspaceId,
  userId,
  nodeId,
  patch,
  prisma,
  logger,
}: UpdateMemoryGraphNodeInput): Promise<MemoryGraphPayload> {
  if (!workspaceId || !userId || !nodeId || nodeId === 'you') {
    return recallMemoryGraph({ workspaceId, userId, prisma, logger });
  }

  try {
    const existing = await prisma.memoryNode.findFirst({
      where: { workspaceId, userId, id: nodeId, forgotten: false },
    });
    if (!existing) {
      return recallMemoryGraph({ workspaceId, userId, prisma, logger });
    }

    const data: {
      content?: string;
      summary?: string | null;
      scope?: 'user' | 'workspace' | 'shared';
      pinned?: boolean;
      forgotten?: boolean;
      metadata?: Record<string, unknown>;
    } = {};
    const metadata =
      typeof existing.metadata === 'object' &&
      existing.metadata !== null &&
      !Array.isArray(existing.metadata)
        ? { ...existing.metadata }
        : {};
    const changed: string[] = [];
    const setBoolean = (key: 'archived' | 'sensitive' | 'blockedForAgent', value: unknown) => {
      if (typeof value === 'boolean' && metadata[key] !== value) {
        metadata[key] = value;
        changed.push(key);
      }
    };

    const content = typeof patch.content === 'string' ? patch.content.trim() : undefined;
    if (content) {
      data.content = content;
      changed.push('content');
    }
    if (typeof patch.summary === 'string') {
      data.summary = patch.summary.trim() || null;
      changed.push('summary');
    } else if (patch.summary === null) {
      data.summary = null;
      changed.push('summary');
    }
    if (patch.scope === 'user' || patch.scope === 'workspace' || patch.scope === 'shared') {
      data.scope = patch.scope;
      changed.push('scope');
    }
    if (typeof patch.pinned === 'boolean') {
      data.pinned = patch.pinned;
      changed.push('pinned');
    }
    setBoolean('archived', patch.archived);
    setBoolean('sensitive', patch.sensitive);
    setBoolean('blockedForAgent', patch.blockedForAgent);
    if (patch.forgotten === true) {
      data.forgotten = true;
      data.pinned = false;
      metadata['forgottenByUserAt'] = new Date().toISOString();
      changed.push('forgotten');
    }

    if (changed.length === 0) {
      return recallMemoryGraph({ workspaceId, userId, prisma, logger });
    }

    const userActions = Array.isArray(metadata['userActions']) ? metadata['userActions'] : [];
    const safeUserActions: Array<Record<string, unknown>> = userActions
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .slice(-19);
    metadata['userActions'] = [
      ...safeUserActions,
      { at: new Date().toISOString(), action: 'graph_update', changed },
    ];
    data.metadata = metadata;

    await prisma.memoryNode.updateMany({
      where: { workspaceId, userId, id: nodeId },
      data,
    });

    return recallMemoryGraph({ workspaceId, userId, prisma, logger });
  } catch (error: unknown) {
    logger.warn('updateGraphNode failed', {
      context: 'MemoryService.updateGraphNode',
      error: formatMemoryError(error),
    });
    return recallMemoryGraph({ workspaceId, userId, prisma, logger });
  }
}
