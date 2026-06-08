import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { StructuredLogger } from '../../../logging/structured-logger';
import { createTextLlmClient, readConfig } from '../../../lib/llm-provider';
import { VectorService } from '../knowledge/vector.service';
import {
  asMemoryEdgeRelation,
  asMemoryNodeType,
  type ExtractResult,
  type MemoryContextForModel,
  type MemoryEdgeRelation,
  type MemoryGraphPayload,
  type RetrievedMemory,
} from './memory-graph.types';
import { EMPTY_MEMORY_CONTEXT, buildMemoryContextFromRetrieved } from './memory.service.context';
import { extractMemoriesFromTurnText } from './memory.service.extraction';
import { retrieveRelevantMemories } from './memory.service.retrieval';
import { formatMemoryError, slugifyMemorySlot } from './memory.service.utils';
import type { MemoryServicePrisma } from './memory.service.prisma';
type MemoryVectorClient = Pick<VectorService, 'getEmbedding'>;


/**
 * Track m3-memory-graph — per-USER typed memory graph + extract→retrieve→inject
 * loop, the in-repo equivalent of an external supermemory/Mem0 deployment.
 *
 * Built ON the existing Kloel stack:
 *   - storage   → `MemoryNode` / `MemoryEdge` Prisma models (Postgres);
 *   - embedding → the existing `VectorService` (OpenAI text-embedding-3-small)
 *                 written into the pgvector `embedding` column;
 *   - retrieval → pgvector `<=>` cosine distance via `$queryRaw`, blended with a
 *                 scope / importance / recency rank;
 *   - extraction→ the primary text LLM (`createTextLlmClient`, DeepSeek default).
 *
 * Differs from `KloelMemoryEngineService` (slot rows in `RAC_MindMemory`, no
 * edges, no typed taxonomy) by being a TYPED GRAPH: every memory is one of
 * fact|preference|project|goal|decision|entity|document|summary|contradiction,
 * and supersession is recorded as an explicit `replaces`/`contradicts` edge so
 * the history is auditable rather than silently overwritten.
 *
 * Per-user isolation is enforced on EVERY read and write via `(workspaceId,
 * userId)`. Contradiction resolution is deterministic via a `slot` aspect key:
 * a new memory about the same slot supersedes the prior one (old node marked
 * `forgotten`, a `replaces` edge recorded). `forget` soft-deletes; `expiresAt`
 * gives a hard TTL. All paths are best-effort and swallow errors — memory must
 * never break a chat turn.
 *
 * @cluster Mind/Memory
 */
@Injectable()
export class MemoryService {
  private readonly logger = StructuredLogger.from(MemoryService.name);

  /** Embedding dimensionality of text-embedding-3-small (pgvector column width). */
  private static readonly EMBED_DIM = 1536;

  /** Half-life for read-time recency decay, in ms (≈ 30 days). */
  private static readonly RECENCY_HALF_LIFE_MS = 30 * 24 * 3600 * 1000;

  /** Cap on memories pulled per retrieval before re-ranking. */
  private static readonly RETRIEVE_POOL = 200;

  /** Max consolidated beliefs injected into a turn's context. */
  private static readonly BELIEF_INJECT_LIMIT = 8;

  /** Beliefs not updated within this window are treated as stale (≈ 90 days). */
  private static readonly BELIEF_STALE_AFTER_MS = 90 * 24 * 3600 * 1000;

  constructor(
    private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: MemoryServicePrisma,
    @Optional() @Inject(VectorService) private readonly vectors?: MemoryVectorClient,
  ) {}

  private model(): string {
    return readConfig('KLOEL_MEMORY_LLM_MODEL', this.config) || 'deepseek-chat';
  }

  // ─── extraction  // ─── extraction ────────────────────────────────────────────────────

  /** Single non-streaming JSON completion against the primary text LLM. */
  private async completeJson(system: string, user: string, maxTokens: number): Promise<unknown> {
    const client = createTextLlmClient(this.config);
    if (!client) {
      return null;
    }
    try {
      const resp = await client.chat.completions.create({
        model: this.model(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: maxTokens,
      });
      const raw = resp.choices[0]?.message?.content;
      if (typeof raw !== 'string' || !raw.trim()) {
        return null;
      }
      return JSON.parse(raw) as unknown;
    } catch (error: unknown) {
      this.logger.warn('memory LLM extraction failed', {
        context: 'MemoryService.completeJson',
        error: formatMemoryError(error),
      });
      return null;
    }
  }

  /**
   * Extract typed memories from a turn and persist them into the per-user graph.
  /**
   * Extract typed memories from a turn and persist them into the per-user graph.
   *
   * Deterministic contradiction resolution by slot: when a memory arrives for a
   * slot that already has an active node, the prior node is marked `forgotten`
   * and a `replaces` edge is recorded from the new node to the old one (and a
   * `contradicts` edge when the content actually differs). `forget` soft-deletes
   * the active node for the slot. Best-effort; never throws.
   */
  async extractFromTurn(
    workspaceId: string,
    userId: string,
    turnText: string,
  ): Promise<ExtractResult> {
    const empty: ExtractResult = {
      created: 0,
      updated: 0,
      contradictions: 0,
      forgotten: 0,
      nodeIds: [],
    };
    if (!workspaceId || !userId || !turnText.trim()) {
      return empty;
    }

    let created = 0;
    let updated = 0;
    let contradictions = 0;
    let forgotten = 0;
    const nodeIds: string[] = [];

    try {
      const memories = await extractMemoriesFromTurnText(turnText, (system, user, maxTokens) =>
        this.completeJson(system, user, maxTokens),
      );
      for (const mem of memories) {
        const prior = await this.prisma.memoryNode.findFirst({
          where: {
            workspaceId,
            userId,
            forgotten: false,
            metadata: { path: ['slot'], equals: mem.slot },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (mem.forget) {
          if (prior) {
            await this.prisma.memoryNode.updateMany({
              where: { id: prior.id, workspaceId, userId },
              data: { forgotten: true },
            });
            forgotten += 1;
          }
          continue;
        }

        const embedding = await this.embedOrNull(mem.content);
        const newId = randomUUID();
        await this.prisma.memoryNode.create({
          data: {
            id: newId,
            workspaceId,
            userId,
            scope: 'user',
            type: mem.type,
            content: mem.content,
            confidence: mem.confidence,
            importance: mem.importance,
            recency: 1,
            pinned: false,
            forgotten: false,
            metadata: { slot: mem.slot },
          },
        });
        if (embedding) {
          await this.writeEmbedding(newId, workspaceId, userId, embedding);
        }
        created += 1;
        nodeIds.push(newId);

        if (prior) {
          // Supersede the prior memory for this aspect.
          await this.prisma.memoryNode.updateMany({
            where: { id: prior.id, workspaceId, userId },
            data: { forgotten: true },
          });
          updated += 1;
          await this.linkEdge(workspaceId, userId, newId, prior.id, 'replaces');
          if (prior.content.trim() !== mem.content) {
            await this.linkEdge(workspaceId, userId, newId, prior.id, 'contradicts');
            contradictions += 1;
          }
        }
      }
    } catch (error: unknown) {
      this.logger.warn('extractFromTurn failed', {
        context: 'MemoryService.extractFromTurn',
        error: formatMemoryError(error),
      });
    }

    return { created, updated, contradictions, forgotten, nodeIds };
  }

  // ─── edges ─────────────────────────────────────────────────────────

  /**
   * Idempotent typed edge between two of THIS user's nodes (best-effort).
   *
   * INVARIANT: `RAC_MemoryEdge` has only a `workspaceId` column — there is no
   * `userId` on the edge, so per-user isolation holds only TRANSITIVELY through
   * the endpoints' own `(workspaceId, userId)` scoping. We therefore enforce it
   * EXPLICITLY here (defense-in-depth): both `fromId` and `toId` must resolve to
   * nodes owned by `(workspaceId, userId)` before any edge is written, so a
   * caller can never silently wire an edge across users or workspaces.
   */
  private async linkEdge(
    workspaceId: string,
    userId: string,
    fromId: string,
    toId: string,
    relation: MemoryEdgeRelation,
  ): Promise<void> {
    if (asMemoryEdgeRelation(relation) === undefined) {
      return;
    }
    if (!(await this.bothEndpointsOwnedByUser(workspaceId, userId, fromId, toId))) {
      return;
    }
    try {
      await this.prisma.memoryEdge.upsert({
        where: {
          workspaceId_fromId_relation_toId: { workspaceId, fromId, relation, toId },
        },
        create: { id: randomUUID(), workspaceId, fromId, toId, relation },
        update: { weight: { increment: 1 } },
      });
    } catch (error: unknown) {
      this.logger.warn('linkEdge failed', {
        context: 'MemoryService.linkEdge',
        error: formatMemoryError(error),
      });
    }
  }

  /**
   * Defense-in-depth ownership check for an edge: returns true only when BOTH
   * node ids resolve to rows owned by `(workspaceId, userId)`. Best-effort — a
   * lookup failure denies the edge rather than risking a cross-user link.
   */
  private async bothEndpointsOwnedByUser(
    workspaceId: string,
    userId: string,
    fromId: string,
    toId: string,
  ): Promise<boolean> {
    try {
      const owns = async (id: string): Promise<boolean> =>
        (await this.prisma.memoryNode.findFirst({ where: { id, workspaceId, userId } })) !== null;
      return (await owns(fromId)) && (await owns(toId));
    } catch (error: unknown) {
      this.logger.warn('linkEdge ownership check failed', {
        context: 'MemoryService.bothEndpointsOwnedByUser',
        error: formatMemoryError(error),
      });
      return false;
    }
  }

  // ─── embedding I/O ─────────────────────────────────────────────────

  private async embedOrNull(text: string): Promise<number[] | null> {
    if (!this.vectors) {
      return null;
    }
    try {
      const { embedding } = await this.vectors.getEmbedding(text);
      return embedding.length === MemoryService.EMBED_DIM ? embedding : null;
    } catch {
      return null;
    }
  }

  /** Persist an embedding into the pgvector column (Prisma can't type it). */
  private async writeEmbedding(
    id: string,
    workspaceId: string,
    userId: string,
    embedding: number[],
  ): Promise<void> {
    try {
      const vectorString = `[${embedding.join(',')}]`;
      await this.prisma.$executeRaw`
        UPDATE "RAC_MemoryNode"
        SET "embedding" = ${vectorString}::vector
        WHERE "id" = ${id} AND "workspaceId" = ${workspaceId} AND "userId" = ${userId}
      `;
    } catch (error: unknown) {
      this.logger.warn('writeEmbedding failed', {
        context: 'MemoryService.writeEmbedding',
        error: formatMemoryError(error),
      });
    }
  }

  // ─── retrieval ─────────────────────────────────────────────────────

  /** Retrieve active memories for THIS user via the retrieval helper. */
  async retrieveRelevant(
    workspaceId: string,
    userId: string,
    query: string,
    k = 8,
  ): Promise<RetrievedMemory[]> {
    return retrieveRelevantMemories({
      workspaceId,
      userId,
      query,
      k,
      prisma: this.prisma,
      embedOrNull: (text) => this.embedOrNull(text),
      logger: this.logger,
      formatError: formatMemoryError,
      retrievePool: MemoryService.RETRIEVE_POOL,
      recencyHalfLifeMs: MemoryService.RECENCY_HALF_LIFE_MS,
    });
  }

  // ─── injection  // ─── injection ─────────────────────────────────────────────────────

  /** Build a compact, model-ready memory context for THIS user and turn. */
  async buildMemoryContextForModel(
    workspaceId: string,
    userId: string,
    query: string,
    k = 8,
  ): Promise<MemoryContextForModel> {
    if (!workspaceId || !userId) {
      return EMPTY_MEMORY_CONTEXT;
    }
    try {
      const [relevant, beliefs] = await Promise.all([
        this.retrieveRelevant(workspaceId, userId, query, k),
        this.fetchConsolidatedBeliefs(workspaceId),
      ]);
      return buildMemoryContextFromRetrieved(relevant, beliefs);
    } catch (error: unknown) {
      this.logger.warn('buildMemoryContextForModel failed', {
        context: 'MemoryService.buildMemoryContextForModel',
        error: formatMemoryError(error),
      });
      return EMPTY_MEMORY_CONTEXT;
    }
  }

  /**
   * Fetch a BOUNDED set of non-stale consolidated beliefs for live recall.
   *
   * These are written WRITE-ONLY by mind-bg consolidation into `RAC_MindBelief`
   * (`subject` = skill, `predicate` = the human-readable learning, `mean`/
   * `samples` = confidence proxy). `RAC_MindBelief` is WORKSPACE-SCOPED (no
   * `userId` column), so this reads at workspace level — these are shared
   * workspace learnings by design, not per-user memories. Stale rows (not
   * updated within `BELIEF_STALE_AFTER_MS`) are excluded; the rest are ordered by
   * reinforcement (`samples`) then recency and capped at `BELIEF_INJECT_LIMIT`.
   * Best-effort: query/store failures yield an empty list (no fabricated section).
   */
  private async fetchConsolidatedBeliefs(workspaceId: string): Promise<string[]> {
    if (!workspaceId) {
      return [];
    }
    try {
      const freshSince = new Date(Date.now() - MemoryService.BELIEF_STALE_AFTER_MS);
      const rows = await this.prisma.mindBelief.findMany({
        where: { workspaceId, updatedAt: { gte: freshSince } },
        orderBy: [{ samples: 'desc' }, { updatedAt: 'desc' }],
        take: MemoryService.BELIEF_INJECT_LIMIT,
      });
      return rows
        .map((row) => row.predicate?.trim())
        .filter((line): line is string => typeof line === 'string' && line.length > 0);
    } catch (error: unknown) {
      this.logger.warn('fetchConsolidatedBeliefs failed', {
        context: 'MemoryService.fetchConsolidatedBeliefs',
        error: formatMemoryError(error),
      });
      return [];
    }
  }

  // ─── graph read-model ─────────────────────────────────────────────

  /**
   * Read the active typed memory topology for the authenticated user's Graph.
   * This is the same MemoryNode/MemoryEdge source the chat uses for recall; it
   * deliberately excludes forgotten and expired nodes so visual memory cannot
   * resurrect data the user asked Kloel not to use. Scoped by (workspaceId,
   * userId) on every read; best-effort (an error yields an empty graph).
   */
  async recallGraph(workspaceId: string, userId: string): Promise<MemoryGraphPayload> {
    const empty: MemoryGraphPayload = { nodes: [], edges: [] };
    if (!workspaceId || !userId) {
      return empty;
    }

    try {
      const now = new Date();
      const memoryNodes = await this.prisma.memoryNode.findMany({
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

      const readMetadata = (metadata: unknown): Record<string, unknown> => {
        if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
          return metadata as Record<string, unknown>;
        }
        return {};
      };

      const ids = memoryNodes.map((node) => node.id);
      const idSet = new Set(ids);
      const persistedEdges = await this.prisma.memoryEdge.findMany({
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
          const sensitive =
            metadata['sensitive'] === true || metadata['classification'] === 'sensitive';
          const archived = metadata['archived'] === true;
          const blockedForAgent = metadata['blockedForAgent'] === true;
          const replaced =
            metadata['replaced'] === true || typeof metadata['replacedBy'] === 'string';
          const nodeType = asMemoryNodeType(node.type) ?? 'fact';
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
      this.logger.warn('recallGraph failed', {
        context: 'MemoryService.recallGraph',
        error: formatMemoryError(error),
      });
      return empty;
    }
  }

  // ─── maintenance  // ─── maintenance ───────────────────────────────────────────────────

  /**
   * Apply a user-visible graph edit to one scoped memory node and return the
   * fresh graph. Scoped by (workspaceId, userId); a node that is not owned by
   * the user (or the synthetic `you` center node) is a no-op. Mutations are
   * recorded in a bounded `userActions` audit trail on the node metadata.
   * Best-effort: store/update failures fall back to returning the current graph.
   */
  async updateGraphNode(
    workspaceId: string,
    userId: string,
    nodeId: string,
    patch: {
      readonly content?: unknown;
      readonly summary?: unknown;
      readonly pinned?: unknown;
      readonly archived?: unknown;
      readonly sensitive?: unknown;
      readonly blockedForAgent?: unknown;
      readonly forgotten?: unknown;
    },
  ): Promise<MemoryGraphPayload> {
    if (!workspaceId || !userId || !nodeId || nodeId === 'you') {
      return this.recallGraph(workspaceId, userId);
    }

    try {
      const existing = await this.prisma.memoryNode.findFirst({
        where: { workspaceId, userId, id: nodeId, forgotten: false },
      });
      if (!existing) {
        return this.recallGraph(workspaceId, userId);
      }

      const data: {
        content?: string;
        summary?: string | null;
        pinned?: boolean;
        forgotten?: boolean;
        metadata?: Record<string, unknown>;
      } = {};
      const metadata =
        typeof existing.metadata === 'object' &&
        existing.metadata !== null &&
        !Array.isArray(existing.metadata)
          ? { ...(existing.metadata as Record<string, unknown>) }
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
        return this.recallGraph(workspaceId, userId);
      }

      const userActions = Array.isArray(metadata['userActions']) ? metadata['userActions'] : [];
      const safeUserActions: Array<Record<string, unknown>> = userActions
        .filter(
          (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
        )
        .slice(-19);
      metadata['userActions'] = [
        ...safeUserActions,
        { at: new Date().toISOString(), action: 'graph_update', changed },
      ];
      data.metadata = metadata;

      await this.prisma.memoryNode.updateMany({
        where: { workspaceId, userId, id: nodeId },
        data,
      });

      return this.recallGraph(workspaceId, userId);
    } catch (error: unknown) {
      this.logger.warn('updateGraphNode failed', {
        context: 'MemoryService.updateGraphNode',
        error: formatMemoryError(error),
      });
      return this.recallGraph(workspaceId, userId);
    }
  }

  /**
   * Soft-delete every memory matching a slot for THIS user. Returns the count
   * forgotten. Used by explicit "forget X" flows outside the extraction path.
   * Pinned nodes are skipped (a pin is an explicit "never forget").
   */
  async forgetSlot(workspaceId: string, userId: string, slot: string): Promise<number> {
    if (!workspaceId || !userId || !slot) {
      return 0;
    }
    try {
      const result = await this.prisma.memoryNode.updateMany({
        where: {
          workspaceId,
          userId,
          pinned: false,
          forgotten: false,
          metadata: { path: ['slot'], equals: slugifyMemorySlot(slot) },
        },
        data: { forgotten: true },
      });
      return result.count;
    } catch (error: unknown) {
      this.logger.warn('forgetSlot failed', {
        context: 'MemoryService.forgetSlot',
        error: formatMemoryError(error),
      });
      return 0;
    }
  }

  /**
   * Hard-expire memories whose `expiresAt` is in the past for THIS user by
   * marking them forgotten. Idempotent; returns the count expired. Pinned nodes
   * are never expired.
   */
  async expireStale(workspaceId: string, userId: string): Promise<number> {
    if (!workspaceId || !userId) {
      return 0;
    }
    try {
      const result = await this.prisma.memoryNode.updateMany({
        where: {
          workspaceId,
          userId,
          pinned: false,
          forgotten: false,
          expiresAt: { lt: new Date() },
        },
        data: { forgotten: true },
      });
      return result.count;
    } catch (error: unknown) {
      this.logger.warn('expireStale failed', {
        context: 'MemoryService.expireStale',
        error: formatMemoryError(error),
      });
      return 0;
    }
  }
}
