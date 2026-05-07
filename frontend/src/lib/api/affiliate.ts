import { mutate } from 'swr';
import { apiFetch } from './core';

interface AffiliateProduct {
  id: string;
  name: string;
  price?: number;
  commission?: number;
  category?: string;
}

interface AffiliateLink {
  id: string;
  url: string;
  clicks: number;
  sales: number;
  commission: number;
}

interface AffiliateLinksResponse {
  links: AffiliateLink[];
  count: number;
  totals: {
    clicks: number;
    sales: number;
    revenue: number;
    commission: number;
  };
}

export const affiliateApi = {
  marketplace: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiFetch<{ products: AffiliateProduct[]; total: number }>(`/affiliate/marketplace${qs}`);
  },
  marketplaceStats: () =>
    apiFetch<{ totalProducts: number; totalAffiliates: number }>('/affiliate/marketplace/stats'),
  categories: () => apiFetch<string[]>('/affiliate/marketplace/categories'),
  recommended: () => apiFetch<AffiliateProduct[]>('/affiliate/marketplace/recommended'),
  requestAffiliation: async (productId: string) => {
    const res = await apiFetch<{ success: boolean; affiliationId?: string }>(
      `/affiliate/request/${productId}`,
      { method: 'POST' },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/affiliate'));
    return res;
  },
  myProducts: () => apiFetch<AffiliateProduct[]>('/affiliate/my-products'),
  listProduct: async (productId: string, config: Record<string, unknown>) => {
    const res = await apiFetch<{ success: boolean }>(`/affiliate/list-product/${productId}`, {
      method: 'POST',
      body: config,
    });
    mutate((key: string) => typeof key === 'string' && key.startsWith('/affiliate'));
    return res;
  },
  myLinks: () => apiFetch<AffiliateLinksResponse>('/affiliate/my-links'),
  configureProduct: async (
    productId: string,
    config: {
      commissionPct?: number;
      commissionType?: string;
      commissionFixed?: number;
      cookieDays?: number;
      approvalMode?: string;
      category?: string;
      tags?: string[];
      listed?: boolean;
      thumbnailUrl?: string;
      promoMaterials?: Record<string, unknown>;
    },
  ) => {
    const res = await apiFetch<{ success: boolean }>(
      `/affiliate/config/${encodeURIComponent(productId)}`,
      {
        method: 'PUT',
        body: config,
      },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/affiliate'));
    return res;
  },
  aiSearch: (query: string) =>
    apiFetch<{ results: AffiliateProduct[] }>('/affiliate/ai-search', {
      method: 'POST',
      body: { query },
    }),
  suggest: () =>
    apiFetch<{ products: AffiliateProduct[] }>('/affiliate/suggest', { method: 'POST' }),
  saveProduct: async (productId: string) => {
    const res = await apiFetch<{ success: boolean }>(
      `/affiliate/saved/${encodeURIComponent(productId)}`,
      {
        method: 'POST',
      },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/affiliate'));
    return res;
  },
  unsaveProduct: async (productId: string) => {
    const res = await apiFetch<{ success: boolean }>(
      `/affiliate/saved/${encodeURIComponent(productId)}`,
      {
        method: 'DELETE',
      },
    );
    mutate((key: string) => typeof key === 'string' && key.startsWith('/affiliate'));
    return res;
  },
};
