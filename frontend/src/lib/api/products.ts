// productApi and knowledgeBaseApi objects
import { mutate } from 'swr';
import { apiFetch, tokenStorage } from './core';

const invalidateProducts = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/products'));
import type { KnowledgeBaseItem, KnowledgeSourceItem } from './shared-types';

/** Catalog product shape. */
export interface CatalogProduct {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Description property. */
  description?: string | null;
  /** Price property. */
  price?: number | null;
  /** Category property. */
  category?: string | null;
  /** Image url property. */
  imageUrl?: string | null;
  /** Sku property. */
  sku?: string | null;
  /** Active property. */
  active?: boolean;
  /** Featured property. */
  featured?: boolean;
  /** Metadata property. */
  metadata?: Record<string, unknown> | null;
}

/** Product api. */
export const productApi = {
  getStats: async () => apiFetch<Record<string, unknown>>('/products/stats'),
  list: (params?: { category?: string; active?: boolean; search?: string }) => {
    const search = new URLSearchParams();
    if (params?.category) {
      search.set('category', params.category);
    }
    if (typeof params?.active === 'boolean') {
      search.set('active', String(params.active));
    }
    if (params?.search) {
      search.set('search', params.search);
    }
    const qs = search.toString();
    return apiFetch<{ products: CatalogProduct[]; count: number }>(
      `/products${qs ? `?${qs}` : ''}`,
    );
  },

  get: (id: string) => {
    return apiFetch<{ product: CatalogProduct | null; error?: string }>(
      `/products/${encodeURIComponent(id)}`,
    );
  },

  create: async (payload: {
    name: string;
    description?: string;
    price: number;
    category?: string;
    imageUrl?: string;
    sku?: string;
  }) => {
    const res = await apiFetch<{ product: CatalogProduct; success: boolean }>(`/products`, {
      method: 'POST',
      body: payload,
    });
    invalidateProducts();
    return res;
  },

  update: async (
    id: string,
    payload: Partial<{
      name: string;
      description: string;
      price: number;
      category: string;
      imageUrl: string;
      sku: string;
      active: boolean;
      featured: boolean;
      metadata: Record<string, unknown>;
    }>,
  ) => {
    const res = await apiFetch<{ product: CatalogProduct; success: boolean }>(
      `/products/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: payload,
      },
    );
    invalidateProducts();
    return res;
  },

  remove: async (id: string) => {
    const res = await apiFetch<{ success: boolean; deleted?: string; error?: string }>(
      `/products/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    );
    invalidateProducts();
    return res;
  },

  getCategories: () => {
    return apiFetch<{ categories: string[] }>(`/products/categories/list`);
  },
};

/** Knowledge base api. */
export const knowledgeBaseApi = {
  list: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    return apiFetch<KnowledgeBaseItem[]>(
      `/ai/kb/list?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
  },

  create: (name: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    return apiFetch<KnowledgeBaseItem>(`/ai/kb/create`, {
      method: 'POST',
      body: { workspaceId, name },
    });
  },

  addSource: (
    knowledgeBaseId: string,
    payload: { type: 'TEXT' | 'URL' | 'PDF'; content: string },
  ) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    return apiFetch<Record<string, unknown>>(`/ai/kb/source`, {
      method: 'POST',
      body: { workspaceId, knowledgeBaseId, ...payload },
    });
  },

  listSources: (knowledgeBaseId: string) => {
    return apiFetch<KnowledgeSourceItem[]>(`/ai/kb/${encodeURIComponent(knowledgeBaseId)}/sources`);
  },
};
