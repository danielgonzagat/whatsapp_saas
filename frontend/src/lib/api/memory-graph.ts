import { apiFetch } from './core';

/**
 * Per-user memory graph — the data behind the "Memória" node. Mirrors the
 * backend `GET /kloel/memory/graph` shape (derived read-time from the user's
 * MindMemory slots; scoped server-side by the JWT workspaceId + userId).
 */
export interface MemoryGraphNode {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly slot?: string;
  readonly updatedAt?: string;
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

const EMPTY: MemoryGraphPayload = { nodes: [], edges: [] };

/** Fetch the authenticated user's memory graph. Honest empty graph on error. */
export async function getMemoryGraph(): Promise<MemoryGraphPayload> {
  const res = await apiFetch<MemoryGraphPayload>('/kloel/memory/graph');
  if (res.error || !res.data) {
    return EMPTY;
  }
  return res.data;
}
