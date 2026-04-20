import { adminFetch } from './admin-client';

/** Admin product row shape. */
export interface AdminProductRow {
  /** Id property. */
  id: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Workspace name property. */
  workspaceName: string | null;
  /** Name property. */
  name: string;
  /** Description property. */
  description: string | null;
  /** Price in cents property. */
  priceInCents: number;
  /** Currency property. */
  currency: string;
  /** Category property. */
  category: string | null;
  /** Format property. */
  format: string;
  /** Status property. */
  status: string;
  /** Active property. */
  active: boolean;
  /** Featured property. */
  featured: boolean;
  /** Image url property. */
  imageUrl: string | null;
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt: string;
  /** Commerce property. */
  commerce: {
    approvedOrders: number;
    pendingOrders: number;
    refundedOrders: number;
    chargebackOrders: number;
    gmvInCents: number;
    last30dGmvInCents: number;
  };
}

/** List products response shape. */
export interface ListProductsResponse {
  /** Items property. */
  items: AdminProductRow[];
  /** Total property. */
  total: number;
}

/** Admin product detail shape. */
export interface AdminProductDetail extends AdminProductRow {
  /** Sku property. */
  sku: string | null;
  /** Tags property. */
  tags: string[];
  /** Stock quantity property. */
  stockQuantity: number | null;
  /** Track stock property. */
  trackStock: boolean;
  /** Sales page url property. */
  salesPageUrl: string | null;
  /** Support email property. */
  supportEmail: string | null;
  /** Moderation history property. */
  moderationHistory: Array<{
    id: string;
    action: string;
    createdAt: string;
    details: unknown;
    adminUserName: string | null;
  }>;
  /** Commerce property. */
  commerce: {
    approvedOrders: number;
    pendingOrders: number;
    refundedOrders: number;
    chargebackOrders: number;
    gmvInCents: number;
    last30dGmvInCents: number;
  };
}

/** List products query shape. */
export interface ListProductsQuery {
  /** Search property. */
  search?: string;
  /** Status property. */
  status?: string;
  /** Workspace id property. */
  workspaceId?: string;
  /** Skip property. */
  skip?: number;
  /** Take property. */
  take?: number;
}

/** Admin product state action type. */
export type AdminProductStateAction = 'PAUSE' | 'REACTIVATE';

/** Admin products api. */
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
  approve(productId: string, note?: string, checklist?: string[]): Promise<void> {
    return adminFetch<void>(`/products/${encodeURIComponent(productId)}/approve`, {
      method: 'POST',
      body: { note, checklist },
    });
  },
  reject(productId: string, reason: string, checklist?: string[]): Promise<void> {
    return adminFetch<void>(`/products/${encodeURIComponent(productId)}/reject`, {
      method: 'POST',
      body: { reason, checklist },
    });
  },
  updateState(productId: string, action: AdminProductStateAction, note?: string): Promise<void> {
    return adminFetch<void>(`/products/${encodeURIComponent(productId)}/state`, {
      method: 'POST',
      body: { action, note },
    });
  },
};
