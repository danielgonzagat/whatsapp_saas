import { adminFetch } from './admin-client';

export interface AdminProductRow {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  name: string;
  description: string | null;
  priceInCents: number;
  currency: string;
  category: string | null;
  format: string;
  status: string;
  active: boolean;
  featured: boolean;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  commerce: {
    approvedOrders: number;
    pendingOrders: number;
    refundedOrders: number;
    chargebackOrders: number;
    gmvInCents: number;
    last30dGmvInCents: number;
  };
}

export interface ListProductsResponse {
  items: AdminProductRow[];
  total: number;
}

export interface AdminProductDetail extends AdminProductRow {
  sku: string | null;
  tags: string[];
  stockQuantity: number | null;
  trackStock: boolean;
  salesPageUrl: string | null;
  supportEmail: string | null;
  commerce: {
    approvedOrders: number;
    pendingOrders: number;
    refundedOrders: number;
    chargebackOrders: number;
    gmvInCents: number;
    last30dGmvInCents: number;
  };
}

export interface ListProductsQuery {
  search?: string;
  status?: string;
  workspaceId?: string;
  skip?: number;
  take?: number;
}

export const adminProductsApi = {
  list(query: ListProductsQuery = {}): Promise<ListProductsResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return adminFetch<ListProductsResponse>(qs ? `/products?${qs}` : '/products');
  },
  detail(productId: string): Promise<AdminProductDetail> {
    return adminFetch<AdminProductDetail>(`/products/${encodeURIComponent(productId)}`);
  },
  approve(productId: string, note?: string): Promise<void> {
    return adminFetch<void>(`/products/${encodeURIComponent(productId)}/approve`, {
      method: 'POST',
      body: { note },
    });
  },
  reject(productId: string, reason: string): Promise<void> {
    return adminFetch<void>(`/products/${encodeURIComponent(productId)}/reject`, {
      method: 'POST',
      body: { reason },
    });
  },
};
