/**
 * Track m3-memory-graph — shared types for the per-USER typed memory graph.
 *
 * These types describe the typed taxonomy and the extract → retrieve → inject
 * loop implemented by `MemoryService`. They sit on top of the `MemoryNode` /
 * `MemoryEdge` Prisma models (table `RAC_MemoryNode` / `RAC_MemoryEdge`) and the
 * existing Postgres + pgvector + `VectorService` stack — this layer is the
 * in-repo equivalent of an external supermemory/Mem0 service.
 *
 * @cluster Mind/Memory
 */

/** Typed taxonomy for a memory node. Mirrors the `type` column constraint. */
export const MEMORY_NODE_TYPES = [
  'fact',
  'preference',
  'project',
  'goal',
  'decision',
  'entity',
  'document',
  'conversation',
  'task',
  'summary',
  'sensitive',
  'expired',
  'contradiction',
] as const;

export type MemoryNodeType = (typeof MEMORY_NODE_TYPES)[number];

/** Typed relations for a memory edge. Mirrors the `relation` column constraint. */
export const MEMORY_EDGE_RELATIONS = [
  'supports',
  'contradicts',
  'updates',
  'extends',
  'summarizes',
  'belongs_to',
  'references',
  'derived_from',
  'used_by',
  'similar_to',
  'replaces',
  'expires',
  'protects',
] as const;

export type MemoryEdgeRelation = (typeof MEMORY_EDGE_RELATIONS)[number];

/** Scope partition for a node. `user` is the default per-user isolation level. */
export type MemoryScope = 'user' | 'workspace' | 'shared';

/** Narrow an arbitrary string to a known node type, else undefined. */
export function asMemoryNodeType(value: unknown): MemoryNodeType | undefined {
  return typeof value === 'string' && (MEMORY_NODE_TYPES as readonly string[]).includes(value)
    ? (value as MemoryNodeType)
    : undefined;
}

/** Narrow an arbitrary string to a known edge relation, else undefined. */
export function asMemoryEdgeRelation(value: unknown): MemoryEdgeRelation | undefined {
  return typeof value === 'string' && (MEMORY_EDGE_RELATIONS as readonly string[]).includes(value)
    ? (value as MemoryEdgeRelation)
    : undefined;
}

/** A single durable memory the model extracted from a turn (pre-persistence). */
export interface ExtractedMemory {
  readonly type: MemoryNodeType;
  /** Canonical aspect key for deterministic contradiction resolution (snake_case). */
  readonly slot: string;
  /** Atomic, third-person statement ("O usuário ..."). */
  readonly content: string;
  /** [0..1] extraction certainty from the model. */
  readonly confidence: number;
  /** [0..1] salience the model assigns to this memory. */
  readonly importance: number;
  /** True only when the user explicitly asked to forget this aspect. */
  readonly forget: boolean;
}

/** Result of an `extractFromTurn` pass. */
export interface ExtractResult {
  readonly created: number;
  readonly updated: number;
  readonly contradictions: number;
  readonly forgotten: number;
  readonly nodeIds: readonly string[];
}

/** A memory surfaced by `retrieveRelevant`, ranked for injection. */
export interface RetrievedMemory {
  readonly id: string;
  readonly type: MemoryNodeType;
  readonly content: string;
  readonly summary: string | null;
  readonly importance: number;
  readonly confidence: number;
  /** Composite rank score (semantic + scope + importance + recency). Higher = better. */
  readonly score: number;
}

/** Compact, model-ready memory context block. */
export interface MemoryContextForModel {
  /** Stable, slowly-changing identity facts (name, company, language, ...). */
  readonly userProfileStatic: readonly string[];
  /** Recently-changing state (current project, active goal, last decision). */
  readonly userProfileDynamic: readonly string[];
  /** Top relevant memories for THIS turn (query-conditioned). */
  readonly relevantMemories: readonly string[];
  /** Stated preferences (format, tone, channel, ...). */
  readonly preferences: readonly string[];
  /** Hard constraints the model must respect (must/never statements). */
  readonly constraints: readonly string[];
  /** Pre-rendered single string ready to unshift into the system context. */
  readonly text: string;
}

export type MemoryGraphNodeState =
  | 'confirmed'
  | 'uncertain'
  | 'pinned'
  | 'sensitive'
  | 'archived'
  | 'blocked'
  | 'contradicted'
  | 'replaced';

/** Read-model node consumed by the Kloel Graph memory screen. */
export interface MemoryGraphNodeView {
  readonly id: string;
  readonly label: string;
  readonly group: MemoryNodeType | 'center';
  readonly content?: string;
  readonly summary?: string | null;
  readonly scope?: MemoryScope;
  readonly updatedAt?: string;
  readonly confidence?: number;
  readonly importance?: number;
  readonly state?: MemoryGraphNodeState;
  readonly pinned?: boolean;
  readonly sensitive?: boolean;
  readonly archived?: boolean;
  readonly blockedForAgent?: boolean;
  readonly usableByAgent?: boolean;
}

/** Mutations allowed from the user's memory graph detail panel. */
export interface MemoryGraphNodeUpdateInput {
  readonly content?: string;
  readonly summary?: string | null;
  readonly pinned?: boolean;
  readonly archived?: boolean;
  readonly sensitive?: boolean;
  readonly blockedForAgent?: boolean;
  readonly forgotten?: boolean;
}

/** Read-model edge consumed by the Kloel Graph memory screen. */
export interface MemoryGraphEdgeView {
  readonly from: string;
  readonly to: string;
  readonly relation: MemoryEdgeRelation;
}

/** Per-user graph payload for GET /kloel/memory/graph. */
export interface MemoryGraphPayload {
  readonly nodes: readonly MemoryGraphNodeView[];
  readonly edges: readonly MemoryGraphEdgeView[];
}
