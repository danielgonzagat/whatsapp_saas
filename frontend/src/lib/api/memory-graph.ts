import { apiFetch } from './core';

/**
 * Per-user memory graph — the data behind the "Memória" node. Mirrors the
 * backend `GET /kloel/memory/graph` shape (derived read-time from the user's
 * MindMemory slots; scoped server-side by the JWT workspaceId + userId).
 */
export type MemoryGraphNodeState =
  | 'confirmed'
  | 'uncertain'
  | 'pinned'
  | 'sensitive'
  | 'archived'
  | 'blocked'
  | 'contradicted'
  | 'replaced';

export interface MemoryGraphNode {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly content?: string;
  readonly summary?: string | null;
  readonly scope?: 'user' | 'workspace' | 'shared';
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

export interface MemoryGraphNodePatch {
  readonly content?: string;
  readonly summary?: string | null;
  readonly pinned?: boolean;
  readonly archived?: boolean;
  readonly sensitive?: boolean;
  readonly blockedForAgent?: boolean;
  readonly forgotten?: boolean;
}

export interface MemoryGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly relation?: string;
}

export interface MemoryGraphPayload {
  readonly nodes: readonly MemoryGraphNode[];
  readonly edges: readonly MemoryGraphEdge[];
}

/** Fetch the authenticated user's memory graph. */
export async function getMemoryGraph(): Promise<MemoryGraphPayload> {
  const res = await apiFetch<MemoryGraphPayload>('/kloel/memory/graph', { cache: 'no-store' });
  if (res.error) {
    throw new Error(res.error);
  }
  if (!res.data || !Array.isArray(res.data.nodes) || !Array.isArray(res.data.edges)) {
    throw new Error('Memory graph did not return a confirmed payload');
  }
  return res.data;
}

/** Apply an authenticated edit to one memory graph node and return the refreshed graph. */
export async function updateMemoryGraphNode(
  nodeId: string,
  patch: MemoryGraphNodePatch,
): Promise<MemoryGraphPayload> {
  const res = await apiFetch<MemoryGraphPayload>(
    `/kloel/memory/graph/nodes/${encodeURIComponent(nodeId)}`,
    { method: 'POST', body: patch },
  );
  if (res.error) {
    throw new Error(res.error);
  }
  if (!res.data || !Array.isArray(res.data.nodes) || !Array.isArray(res.data.edges)) {
    throw new Error('Memory graph edit did not return a confirmed payload');
  }
  return res.data;
}
