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
  /** Product id property. */
  productId: string;
  /** Name property. */
  name: string;
  /** Description property. */
  description: string;
  /** Price property. */
  price: number;
  /** Benefits property. */
  benefits?: string[];
}

type MemoryStats = { totalItems: number; products: number; knowledge: number };

type MemoryApiEnvelope<T> = {
  data?: T | undefined;
  error?: string | undefined;
  status: number;
};

type MemoryListPayload = {
  memories: MemoryItem[];
};

type ProductMemorySaveResponse = {
  status?: string | undefined;
  memory?: unknown;
};

function confirmMemoryPayload<T>(
  response: MemoryApiEnvelope<T>,
  fallbackMessage: string,
  missingPayloadMessage: string,
): T {
  if (response.error || response.status >= 400) {
    throw new Error(response.error ?? fallbackMessage);
  }
  if (response.data === undefined || response.data === null) {
    throw new Error(missingPayloadMessage);
  }
  return response.data;
}

function confirmMemoryListPayload(
  response: MemoryApiEnvelope<MemoryListPayload>,
  fallbackMessage: string,
  missingPayloadMessage: string,
): MemoryItem[] {
  const payload = confirmMemoryPayload(response, fallbackMessage, missingPayloadMessage);
  if (!Array.isArray(payload.memories)) {
    throw new Error(missingPayloadMessage);
  }
  return payload.memories;
}

export async function getMemoryStats(workspaceId: string): Promise<MemoryStats> {
  const res = await apiFetch<MemoryStats>(`/kloel/memory/${workspaceId}/stats`);
  return confirmMemoryPayload(
    res,
    'Failed to fetch memory stats',
    'Memory stats did not return a confirmed payload',
  );
}

/** Get memory list. */
export async function getMemoryList(workspaceId: string): Promise<MemoryItem[]> {
  const res = await apiFetch<MemoryListPayload>(`/kloel/memory/${workspaceId}/list`);
  return confirmMemoryListPayload(
    res,
    'Failed to fetch memories',
    'Memory list did not return a confirmed payload',
  );
}

/** Save product. */
export async function saveProduct(
  workspaceId: string,
  product: Product,
): Promise<ProductMemorySaveResponse> {
  const res = await apiFetch<ProductMemorySaveResponse>(`/kloel/memory/${workspaceId}/product`, {
    method: 'POST',
    body: product,
  });
  const payload = confirmMemoryPayload(
    res,
    'Failed to save product',
    'Product memory save did not return a confirmed payload',
  );
  if (payload.status !== 'saved') {
    throw new Error('Product memory save was not confirmed');
  }
  return payload;
}

/** Search memory. */
export async function searchMemory(workspaceId: string, query: string): Promise<MemoryItem[]> {
  const res = await apiFetch<MemoryListPayload>(`/kloel/memory/${workspaceId}/search`, {
    method: 'POST',
    body: { query },
  });
  return confirmMemoryListPayload(
    res,
    'Failed to search memory',
    'Memory search did not return a confirmed payload',
  );
}
