// productApi, externalPaymentApi, knowledgeBaseApi objects
import { apiFetch, tokenStorage } from './core';
import {
  getExternalPaymentLinks,
  addExternalPaymentLink,
  toggleExternalPaymentLink,
  deleteExternalPaymentLink,
} from './asaas';
import type {
  ExternalPaymentLink,
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
  paymentLink?: string | null;
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
    paymentLink?: string;
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
      paymentLink: string;
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

export const externalPaymentApi = {
  list: (workspaceId: string) => getExternalPaymentLinks(workspaceId),
  add: (
    workspaceId: string,
    data: {
      platform: ExternalPaymentLink['platform'];
      productName: string;
      price: number;
      paymentUrl: string;
      checkoutUrl?: string;
      affiliateUrl?: string;
    },
  ) => addExternalPaymentLink(workspaceId, data),
  toggle: (workspaceId: string, linkId: string) =>
    toggleExternalPaymentLink(workspaceId, linkId),
  remove: (workspaceId: string, linkId: string) =>
    deleteExternalPaymentLink(workspaceId, linkId),
  configurePlatform: (
    workspaceId: string,
    payload: Record<string, any>,
  ) =>
    apiFetch<any>(`/kloel/external-payments/${encodeURIComponent(workspaceId)}/platform`, {
      method: 'POST',
      body: payload,
    }),
  getPlatforms: (workspaceId: string) =>
    apiFetch<{ platforms: any[] }>(`/kloel/external-payments/${encodeURIComponent(workspaceId)}/platforms`),
  generateTracking: (
    workspaceId: string,
    payload: {
      baseUrl: string;
      source?: string;
      medium?: string;
      campaign?: string;
      content?: string;
      leadId?: string;
    },
  ) =>
    apiFetch<{ originalUrl: string; trackingUrl: string }>(
      `/kloel/external-payments/${encodeURIComponent(workspaceId)}/tracking`,
      {
        method: 'POST',
        body: payload,
      },
    ),
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
