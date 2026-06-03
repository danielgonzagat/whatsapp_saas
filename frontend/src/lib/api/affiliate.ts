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

type AffiliateApiEnvelope<T> = {
  data?: T;
  error?: string;
  status: number;
  success?: boolean;
};

type AffiliateCategoryPayload =
  | string[]
  | { categories?: Array<string | { name?: string | null }> };

type AffiliateProductsPayload = AffiliateProduct[] | { products?: unknown };

type AffiliateMarketplacePayload =
  | AffiliateProduct[]
  | { products?: unknown; total?: number; count?: number };

type AffiliateSearchPayload = {
  products?: unknown;
  results?: unknown;
};

export function requireAffiliateApiSuccess<T>(
  response: T & { error?: string; success?: boolean },
  fallback: string,
): T & { error?: string; success?: boolean } {
  if (response.error || response.success === false) {
    throw new Error(response.error || fallback);
  }
  return response;
}

function withAffiliateData<TData, TMapped>(
  response: AffiliateApiEnvelope<TData>,
  data: TMapped,
): AffiliateApiEnvelope<TMapped> {
  return { ...response, data };
}

function normalizeAffiliateProducts(
  payload: AffiliateProductsPayload | undefined,
  invalidMessage = 'Affiliate products did not return a confirmed payload',
): AffiliateProduct[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'products')) {
    if (Array.isArray(payload.products)) {
      return payload.products;
    }
    throw new Error(invalidMessage);
  }
  throw new Error(invalidMessage);
}

function normalizeMarketplacePayload(payload: AffiliateMarketplacePayload | undefined) {
  if (Array.isArray(payload)) {
    return { products: payload, total: payload.length };
  }
  const products = normalizeAffiliateProducts(
    payload,
    'Affiliate marketplace products did not return a confirmed payload',
  );
  return { products, total: payload?.total ?? payload?.count ?? products.length };
}

function normalizeAffiliateCategories(payload: AffiliateCategoryPayload | undefined): string[] {
  const categories = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.categories)
      ? payload.categories
      : [];
  return categories
    .map((category) => (typeof category === 'string' ? category : category.name || ''))
    .filter((category) => category.length > 0);
}

function normalizeAffiliateSearch(payload: AffiliateSearchPayload | undefined): AffiliateProduct[] {
  const invalidMessage = 'Affiliate search products did not return a confirmed payload';
  if (!payload || typeof payload !== 'object') {
    throw new Error(invalidMessage);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'results')) {
    if (Array.isArray(payload.results)) {
      return payload.results;
    }
    throw new Error(invalidMessage);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'products')) {
    if (Array.isArray(payload.products)) {
      return payload.products;
    }
    throw new Error(invalidMessage);
  }
  throw new Error(invalidMessage);
}

const invalidateAffiliate = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/affiliate'));

export const affiliateApi = {
  marketplace: async (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    const res = requireAffiliateApiSuccess(
      await apiFetch<AffiliateMarketplacePayload>(`/affiliate/marketplace${qs}`),
      'Could not load affiliate marketplace',
    );
    return withAffiliateData(res, normalizeMarketplacePayload(res.data));
  },
  marketplaceStats: async () =>
    requireAffiliateApiSuccess(
      await apiFetch<{ totalProducts: number; totalAffiliates: number }>(
        '/affiliate/marketplace/stats',
      ),
      'Could not load affiliate marketplace stats',
    ),
  categories: async () => {
    const res = requireAffiliateApiSuccess(
      await apiFetch<AffiliateCategoryPayload>('/affiliate/marketplace/categories'),
      'Could not load affiliate categories',
    );
    return withAffiliateData(res, normalizeAffiliateCategories(res.data));
  },
  recommended: async () => {
    const res = requireAffiliateApiSuccess(
      await apiFetch<AffiliateProductsPayload>('/affiliate/marketplace/recommended'),
      'Could not load recommended affiliate products',
    );
    return withAffiliateData(res, normalizeAffiliateProducts(res.data));
  },
  requestAffiliation: async (productId: string) => {
    const res = requireAffiliateApiSuccess(
      await apiFetch<{ success: boolean; affiliationId?: string }>(
        `/affiliate/request/${productId}`,
        { method: 'POST' },
      ),
      'Could not request affiliation',
    );
    invalidateAffiliate();
    return res;
  },
  myProducts: async () => {
    const res = requireAffiliateApiSuccess(
      await apiFetch<AffiliateProductsPayload>('/affiliate/my-products'),
      'Could not load affiliate products',
    );
    return withAffiliateData(res, normalizeAffiliateProducts(res.data));
  },
  listProduct: async (productId: string, config: Record<string, unknown>) => {
    const res = requireAffiliateApiSuccess(
      await apiFetch<{ success: boolean }>(`/affiliate/list-product/${productId}`, {
        method: 'POST',
        body: config,
      }),
      'Could not list product on affiliate marketplace',
    );
    invalidateAffiliate();
    return res;
  },
  myLinks: async () =>
    requireAffiliateApiSuccess(
      await apiFetch<AffiliateLinksResponse>('/affiliate/my-links'),
      'Could not load affiliate links',
    ),
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
    const res = requireAffiliateApiSuccess(
      await apiFetch<{ success: boolean }>(`/affiliate/config/${encodeURIComponent(productId)}`, {
        method: 'PUT',
        body: config,
      }),
      'Could not configure affiliate product',
    );
    invalidateAffiliate();
    return res;
  },
  aiSearch: async (query: string) => {
    const res = requireAffiliateApiSuccess(
      await apiFetch<AffiliateSearchPayload>('/affiliate/ai-search', {
        method: 'POST',
        body: { query },
      }),
      'Could not search affiliate marketplace',
    );
    return withAffiliateData(res, { results: normalizeAffiliateSearch(res.data) });
  },
  suggest: async () => {
    const res = requireAffiliateApiSuccess(
      await apiFetch<AffiliateProductsPayload>('/affiliate/suggest', { method: 'POST' }),
      'Could not load affiliate suggestions',
    );
    return withAffiliateData(res, { products: normalizeAffiliateProducts(res.data) });
  },
  saveProduct: async (productId: string) => {
    const res = requireAffiliateApiSuccess(
      await apiFetch<{ success: boolean }>(`/affiliate/saved/${encodeURIComponent(productId)}`, {
        method: 'POST',
      }),
      'Could not save affiliate product',
    );
    invalidateAffiliate();
    return res;
  },
  unsaveProduct: async (productId: string) => {
    const res = requireAffiliateApiSuccess(
      await apiFetch<{ success: boolean }>(`/affiliate/saved/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
      }),
      'Could not unsave affiliate product',
    );
    invalidateAffiliate();
    return res;
  },
};
