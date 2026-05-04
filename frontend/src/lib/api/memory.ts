import { apiFetch } from './core';

/** Memory item shape. */
export interface MemoryItem {
  /** Id property. */
  id: string;
  /** Key property. */
  key: string;
  /** Value property. */
  value: unknown;
  /** Type property. */
  type: string;
  /** Created at property. */
  createdAt: string;
  /** Embedding property. */
  embedding?: number[];
}

/** Product shape. */
export interface Product {
  /** Name property. */
  name: string;
  /** Price property. */
  price: number;
  /** Description property. */
  description?: string;
}

export async function getMemoryStats(
  workspaceId: string,
): Promise<{ totalItems: number; products: number; knowledge: number }> {
  const res = await apiFetch<{ totalItems: number; products: number; knowledge: number }>(
    `/kloel/memory/${workspaceId}/stats`,
  );
  if (res.error) {
    throw new Error('Failed to fetch memory stats');
  }
  return res.data as { totalItems: number; products: number; knowledge: number };
}

/** Get memory list. */
export async function getMemoryList(workspaceId: string): Promise<MemoryItem[]> {
  const res = await apiFetch<{ memories: MemoryItem[] }>(`/kloel/memory/${workspaceId}/list`);
  if (res.error) {
    throw new Error('Failed to fetch memories');
  }
  return res.data?.memories || [];
}

/** Save product. */
export async function saveProduct(workspaceId: string, product: Product): Promise<unknown> {
  const res = await apiFetch<unknown>(`/kloel/memory/${workspaceId}/product`, {
    method: 'POST',
    body: product,
  });
  if (res.error) {
    throw new Error('Failed to save product');
  }
  return res.data;
}

/** Search memory. */
export async function searchMemory(workspaceId: string, query: string): Promise<MemoryItem[]> {
  const res = await apiFetch<{ memories: MemoryItem[] }>(`/kloel/memory/${workspaceId}/search`, {
    method: 'POST',
    body: { query },
  });
  if (res.error) {
    throw new Error('Failed to search memory');
  }
  return res.data?.memories || [];
}
