// productApi and knowledgeBaseApi objects
import { apiFetch, tokenStorage } from './core';
import type {
  KnowledgeBaseItem,
  KnowledgeSourceItem,
} from './asaas';

export interface CatalogProduct {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  category?: string | null;
  imageUrl?: string | null;
  sku?: string | null;
  active?: boolean;
  featured?: boolean;
  metadata?: Record<string, any> | null;
}

export const productApi = {
  getStats: async () => apiFetch<any>('/products/stats'),
  list: (params?: { category?: string; active?: boolean; search?: string }) => {
    const search = new URLSearchParams();
    if (params?.category) search.set('category', params.category);
    if (typeof params?.active === 'boolean') search.set('active', String(params.active));
    if (params?.search) search.set('search', params.search);
    const qs = search.toString();
    return apiFetch<{ products: CatalogProduct[]; count: number }>(`/products${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) => {
    return apiFetch<{ product: CatalogProduct | null; error?: string }>(`/products/${encodeURIComponent(id)}`);
  },

  create: (payload: {
    name: string;
    description?: string;
    price: number;
    category?: string;
    imageUrl?: string;
    sku?: string;
  }) => {
    return apiFetch<{ product: CatalogProduct; success: boolean }>(`/products`, {
      method: 'POST',
      body: payload,
    });
  },

  update: (
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
      metadata: Record<string, any>;
    }>,
  ) => {
    return apiFetch<{ product: CatalogProduct; success: boolean }>(`/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: payload,
    });
  },

  remove: (id: string) => {
    return apiFetch<{ success: boolean; deleted?: string; error?: string }>(`/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  getCategories: () => {
    return apiFetch<{ categories: string[] }>(`/products/categories/list`);
  },
};

export const knowledgeBaseApi = {
  list: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<KnowledgeBaseItem[]>(`/ai/kb/list?workspaceId=${encodeURIComponent(workspaceId)}`);
  },

  create: (name: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<KnowledgeBaseItem>(`/ai/kb/create`, {
      method: 'POST',
      body: { workspaceId, name },
    });
  },

  addSource: (knowledgeBaseId: string, payload: { type: 'TEXT' | 'URL' | 'PDF'; content: string }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<any>(`/ai/kb/source`, {
      method: 'POST',
      body: { workspaceId, knowledgeBaseId, ...payload },
    });
  },

  listSources: (knowledgeBaseId: string) => {
    return apiFetch<KnowledgeSourceItem[]>(`/ai/kb/${encodeURIComponent(knowledgeBaseId)}/sources`);
  },
};
