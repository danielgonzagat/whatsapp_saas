'use client';

import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

/* ── Shared types ── */

interface DashboardProduct {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  images?: string[];
  category?: string;
  price?: number;
}

interface DashboardProductInput extends Partial<DashboardProduct> {
  id?: string;
  name?: string;
}

interface CheckoutProductItem {
  id: string;
  slug?: string;
  name: string;
}

interface CheckoutProductDetail {
  id: string;
  checkoutPlans?: CheckoutPlan[];
  plans?: CheckoutPlan[];
  checkoutTemplates?: CheckoutTemplate[];
  checkouts?: CheckoutTemplate[];
}

interface CheckoutPlan {
  id: string;
  name: string;
  priceInCents?: number;
  quantity?: number;
  maxInstallments?: number;
  freeShipping?: boolean;
  shippingPrice?: number;
  [key: string]: unknown;
}

interface CheckoutTemplate {
  id: string;
  [key: string]: unknown;
}

interface CheckoutProductListResponse {
  products?: CheckoutProductItem[];
  data?: CheckoutProductItem[];
}

interface OrderItem {
  id: string;
  status?: string;
  [key: string]: unknown;
}

interface OrderListResponse {
  orders?: OrderItem[];
  total?: number;
}

interface CheckoutConfigResponse {
  id?: string;
  pixels?: PixelItem[];
  [key: string]: unknown;
}

interface PixelItem {
  id: string;
  type: string;
  pixelId: string;
  accessToken?: string;
}

interface BumpItem {
  id: string;
  [key: string]: unknown;
}

interface BumpListResponse {
  bumps?: BumpItem[];
}

interface UpsellItem {
  id: string;
  [key: string]: unknown;
}

interface UpsellListResponse {
  upsells?: UpsellItem[];
}

interface CouponItem {
  id: string;
  [key: string]: unknown;
}

interface CouponListResponse {
  coupons?: CouponItem[];
}

interface PlanCreateBody {
  name: string;
  priceInCents?: number;
  quantity?: number;
  maxInstallments?: number;
  freeShipping?: boolean;
  shippingPrice?: number;
  [key: string]: unknown;
}

/* ── Ensure a checkout-compatible product exists for the dashboard Product ── */
async function ensureCheckoutProduct(product: DashboardProduct): Promise<string | null> {
  try {
    const res = await apiFetch<CheckoutProductItem[] | CheckoutProductListResponse>(
      '/checkout/products',
    );
    const raw = res.data;
    const list: CheckoutProductItem[] = Array.isArray(raw)
      ? raw
      : (raw as CheckoutProductListResponse)?.products ||
        (raw as CheckoutProductListResponse)?.data ||
        [];
    const found = list.find((p) => p.slug === product.slug || p.name === product.name);
    if (found) return found.id;

    // Create checkout product from dashboard product
    const created = await apiFetch<CheckoutProductItem>('/checkout/products', {
      method: 'POST',
      body: {
        name: product.name,
        slug: product.slug || product.id,
        description: product.description,
        images: product.images || [],
        category: product.category,
        price: product.price || 0,
      },
    });
    return created?.data?.id || null;
  } catch {
    return null;
  }
}

/* ── Plans for a product ── */
export function useCheckoutPlans(product: DashboardProductInput | null | undefined) {
  const [checkoutProductId, setCheckoutProductId] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-sync checkout product only when identifying fields change; product object identity churns on every render
  useEffect(() => {
    if (product?.id && product?.name) {
      ensureCheckoutProduct(product as DashboardProduct)
        .then(setCheckoutProductId)
        .catch(() => {});
    }
  }, [product?.id, product?.name]);

  const { data, isLoading, mutate } = useSWR<CheckoutProductDetail>(
    checkoutProductId ? `/checkout/products/${checkoutProductId}` : null,
    swrFetcher,
    { keepPreviousData: true },
  );

  const plans = data?.checkoutPlans || data?.plans || [];
  const checkouts = data?.checkoutTemplates || data?.checkouts || [];

  const createPlan = useCallback(
    async (body: PlanCreateBody) => {
      if (!checkoutProductId) return null;
      const res = await apiFetch(`/checkout/products/${checkoutProductId}/plans`, {
        method: 'POST',
        body,
      });
      mutate();
      return res;
    },
    [checkoutProductId, mutate],
  );

  const updatePlan = useCallback(
    async (planId: string, body: Partial<PlanCreateBody>) => {
      const res = await apiFetch(`/checkout/plans/${planId}`, { method: 'PUT', body });
      mutate();
      return res;
    },
    [mutate],
  );

  const deletePlan = useCallback(
    async (planId: string) => {
      await apiFetch(`/checkout/plans/${planId}`, { method: 'DELETE' });
      mutate();
    },
    [mutate],
  );

  const duplicatePlan = useCallback(
    async (plan: CheckoutPlan) => {
      if (!checkoutProductId) return null;
      const res = await apiFetch(`/checkout/products/${checkoutProductId}/plans`, {
        method: 'POST',
        body: {
          name: `${plan.name} (Copia)`,
          priceInCents: plan.priceInCents,
          quantity: plan.quantity,
          maxInstallments: plan.maxInstallments,
          freeShipping: plan.freeShipping,
          shippingPrice: plan.shippingPrice,
        },
      });
      mutate();
      return res;
    },
    [checkoutProductId, mutate],
  );

  const createCheckout = useCallback(
    async (body: Record<string, unknown>) => {
      if (!checkoutProductId) return null;
      const res = await apiFetch(`/checkout/products/${checkoutProductId}/checkouts`, {
        method: 'POST',
        body,
      });
      mutate();
      return res;
    },
    [checkoutProductId, mutate],
  );

  const duplicateCheckout = useCallback(
    async (checkoutId: string) => {
      const res = await apiFetch(`/checkout/checkouts/${checkoutId}/duplicate`, {
        method: 'POST',
      });
      mutate();
      return res;
    },
    [mutate],
  );

  const deleteCheckout = useCallback(
    async (checkoutId: string) => {
      await apiFetch(`/checkout/checkouts/${checkoutId}`, { method: 'DELETE' });
      mutate();
    },
    [mutate],
  );

  const syncCheckoutLinks = useCallback(
    async (checkoutId: string, planIds: string[]) => {
      const res = await apiFetch(`/checkout/checkouts/${checkoutId}/links`, {
        method: 'PUT',
        body: { planIds },
      });
      mutate();
      return res;
    },
    [mutate],
  );

  return {
    plans,
    checkouts,
    checkoutProductId,
    isLoading,
    mutate,
    createPlan,
    updatePlan,
    deletePlan,
    duplicatePlan,
    createCheckout,
    duplicateCheckout,
    deleteCheckout,
    syncCheckoutLinks,
  };
}

/* ── Order Bumps ── */
export function useOrderBumps(planId: string | null) {
  const { data, isLoading, mutate } = useSWR<BumpItem[] | BumpListResponse>(
    planId ? `/checkout/plans/${planId}/bumps` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const bumps: BumpItem[] = Array.isArray(data) ? data : (data as BumpListResponse)?.bumps || [];

  const createBump = useCallback(
    async (body: Record<string, unknown>) => {
      await apiFetch(`/checkout/plans/${planId}/bumps`, { method: 'POST', body });
      mutate();
    },
    [planId, mutate],
  );

  const updateBump = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      await apiFetch(`/checkout/bumps/${id}`, { method: 'PUT', body });
      mutate();
    },
    [mutate],
  );

  const deleteBump = useCallback(
    async (id: string) => {
      await apiFetch(`/checkout/bumps/${id}`, { method: 'DELETE' });
      mutate();
    },
    [mutate],
  );

  return { bumps, isLoading, mutate, createBump, updateBump, deleteBump };
}

/* ── Upsells ── */
export function useUpsells(planId: string | null) {
  const { data, isLoading, mutate } = useSWR<UpsellItem[] | UpsellListResponse>(
    planId ? `/checkout/plans/${planId}/upsells` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const upsells: UpsellItem[] = Array.isArray(data)
    ? data
    : (data as UpsellListResponse)?.upsells || [];

  const createUpsell = useCallback(
    async (body: Record<string, unknown>) => {
      await apiFetch(`/checkout/plans/${planId}/upsells`, { method: 'POST', body });
      mutate();
    },
    [planId, mutate],
  );

  const updateUpsell = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      await apiFetch(`/checkout/upsells/${id}`, { method: 'PUT', body });
      mutate();
    },
    [mutate],
  );

  const deleteUpsell = useCallback(
    async (id: string) => {
      await apiFetch(`/checkout/upsells/${id}`, { method: 'DELETE' });
      mutate();
    },
    [mutate],
  );

  return { upsells, isLoading, mutate, createUpsell, updateUpsell, deleteUpsell };
}

/* ── Coupons (workspace-level) ── */
export function useCheckoutCoupons() {
  const { data, isLoading, mutate } = useSWR<CouponItem[] | CouponListResponse>(
    '/checkout/coupons',
    swrFetcher,
    {
      keepPreviousData: true,
    },
  );
  const coupons: CouponItem[] = Array.isArray(data)
    ? data
    : (data as CouponListResponse)?.coupons || [];

  const createCoupon = useCallback(
    async (body: Record<string, unknown>) => {
      await apiFetch('/checkout/coupons', { method: 'POST', body });
      mutate();
    },
    [mutate],
  );

  const updateCoupon = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      await apiFetch(`/checkout/coupons/${id}`, { method: 'PUT', body });
      mutate();
    },
    [mutate],
  );

  const deleteCoupon = useCallback(
    async (id: string) => {
      await apiFetch(`/checkout/coupons/${id}`, { method: 'DELETE' });
      mutate();
    },
    [mutate],
  );

  return { coupons, isLoading, mutate, createCoupon, updateCoupon, deleteCoupon };
}

/* ── Checkout Products — update / delete ── */
export function useCheckoutProduct(productId: string | null) {
  const updateProduct = useCallback(
    async (body: Record<string, unknown>) => {
      if (!productId) return null;
      const res = await apiFetch(`/checkout/products/${productId}`, { method: 'PUT', body });
      return res;
    },
    [productId],
  );

  const deleteProduct = useCallback(async () => {
    if (!productId) return;
    await apiFetch(`/checkout/products/${productId}`, { method: 'DELETE' });
  }, [productId]);

  return { updateProduct, deleteProduct };
}

/* ── Checkout Orders ── */
export function useCheckoutOrders(params?: { status?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  const { data, isLoading, mutate } = useSWR<OrderItem[] | OrderListResponse>(
    `/checkout/orders${q ? `?${q}` : ''}`,
    swrFetcher,
    { keepPreviousData: true },
  );
  const orders: OrderItem[] = Array.isArray(data)
    ? data
    : (data as OrderListResponse)?.orders || [];
  const total = (data as OrderListResponse)?.total ?? orders.length;

  const updateOrderStatus = useCallback(
    async (id: string, status: string, extra?: { trackingCode?: string; trackingUrl?: string }) => {
      const res = await apiFetch(`/checkout/orders/${id}/status`, {
        method: 'PATCH',
        body: { status, ...extra },
      });
      mutate();
      return res;
    },
    [mutate],
  );

  return { orders, total, isLoading, mutate, updateOrderStatus };
}

export function useCheckoutOrder(id: string | null) {
  const { data, isLoading, mutate } = useSWR<OrderItem>(
    id ? `/checkout/orders/${id}` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  return { order: data || null, isLoading, mutate };
}

/* ── Pixels (tied to a checkout configId) ── */
export function usePixels(planId: string | null) {
  /* Pixels are embedded in the checkout config record */
  const { data, isLoading, mutate } = useSWR<CheckoutConfigResponse>(
    planId ? `/checkout/plans/${planId}/config` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const configId: string | null = data?.id || null;
  const pixels: PixelItem[] = Array.isArray(data?.pixels) ? data.pixels : [];

  const createPixel = useCallback(
    async (body: { type: string; pixelId: string; accessToken?: string }) => {
      if (!configId) return null;
      const res = await apiFetch(`/checkout/config/${configId}/pixels`, { method: 'POST', body });
      mutate();
      return res;
    },
    [configId, mutate],
  );

  const updatePixel = useCallback(
    async (
      pixelId: string,
      body: Partial<{ type: string; pixelId: string; accessToken: string }>,
    ) => {
      const res = await apiFetch(`/checkout/pixels/${pixelId}`, { method: 'PUT', body });
      mutate();
      return res;
    },
    [mutate],
  );

  const deletePixel = useCallback(
    async (pixelId: string) => {
      await apiFetch(`/checkout/pixels/${pixelId}`, { method: 'DELETE' });
      mutate();
    },
    [mutate],
  );

  return { pixels, configId, isLoading, mutate, createPixel, updatePixel, deletePixel };
}

/* ── Checkout Config ── */
export function useCheckoutConfig(planId: string | null) {
  const { data, isLoading, mutate } = useSWR<CheckoutConfigResponse>(
    planId ? `/checkout/plans/${planId}/config` : null,
    swrFetcher,
    { keepPreviousData: true },
  );

  const updateConfig = useCallback(
    async (body: Record<string, unknown>) => {
      await apiFetch(`/checkout/plans/${planId}/config`, { method: 'PATCH', body });
      mutate();
    },
    [planId, mutate],
  );

  const resetConfig = useCallback(async () => {
    await apiFetch(`/checkout/plans/${planId}/config/reset`, { method: 'POST' });
    mutate();
  }, [planId, mutate]);

  return { config: data || null, isLoading, mutate, updateConfig, resetConfig };
}
