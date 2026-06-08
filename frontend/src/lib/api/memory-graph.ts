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
