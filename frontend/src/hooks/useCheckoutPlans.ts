'use client';

import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

/* ── Ensure a checkout-compatible product exists for the dashboard Product ── */
async function ensureCheckoutProduct(product: any): Promise<string | null> {
  try {
    const res: any = await apiFetch('/checkout/products');
    const list = Array.isArray(res) ? res : res?.products || res?.data || [];
    const found = list.find((p: any) => p.slug === product.slug || p.name === product.name);
    if (found) return found.id;

    // Create checkout product from dashboard product
    const created: any = await apiFetch('/checkout/products', {
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
    return created?.id || created?.data?.id || null;
  } catch {
    return null;
  }
}

/* ── Plans for a product ── */
export function useCheckoutPlans(product: any) {
  const [checkoutProductId, setCheckoutProductId] = useState<string | null>(null);

  useEffect(() => {
    if (product?.id) {
      ensureCheckoutProduct(product)
        .then(setCheckoutProductId)
        .catch(() => {});
    }
  }, [product?.id]);

  const { data, isLoading, mutate } = useSWR<any>(
    checkoutProductId ? `/checkout/products/${checkoutProductId}` : null,
    swrFetcher,
    { keepPreviousData: true },
  );

  const plans = data?.checkoutPlans || data?.plans || [];
  const checkouts = data?.checkoutTemplates || data?.checkouts || [];

  const createPlan = useCallback(
    async (body: any) => {
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
    async (planId: string, body: any) => {
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
    async (plan: any) => {
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
    async (body: any) => {
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
  const { data, isLoading, mutate } = useSWR<any>(
    planId ? `/checkout/plans/${planId}/bumps` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const bumps = Array.isArray(data) ? data : data?.bumps || [];

  const createBump = useCallback(
    async (body: any) => {
      await apiFetch(`/checkout/plans/${planId}/bumps`, { method: 'POST', body });
      mutate();
    },
    [planId, mutate],
  );

  const updateBump = useCallback(
    async (id: string, body: any) => {
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
  const { data, isLoading, mutate } = useSWR<any>(
    planId ? `/checkout/plans/${planId}/upsells` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const upsells = Array.isArray(data) ? data : data?.upsells || [];

  const createUpsell = useCallback(
    async (body: any) => {
      await apiFetch(`/checkout/plans/${planId}/upsells`, { method: 'POST', body });
      mutate();
    },
    [planId, mutate],
  );

  const updateUpsell = useCallback(
    async (id: string, body: any) => {
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
  const { data, isLoading, mutate } = useSWR<any>('/checkout/coupons', swrFetcher, {
    keepPreviousData: true,
  });
  const coupons = Array.isArray(data) ? data : data?.coupons || [];

  const createCoupon = useCallback(
    async (body: any) => {
      await apiFetch('/checkout/coupons', { method: 'POST', body });
      mutate();
    },
    [mutate],
  );

  const updateCoupon = useCallback(
    async (id: string, body: any) => {
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
    async (body: any) => {
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
  const { data, isLoading, mutate } = useSWR<any>(
    `/checkout/orders${q ? `?${q}` : ''}`,
    swrFetcher,
    { keepPreviousData: true },
  );
  const orders = Array.isArray(data) ? data : data?.orders || [];
  const total = data?.total ?? orders.length;

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
  const { data, isLoading, mutate } = useSWR<any>(
    id ? `/checkout/orders/${id}` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  return { order: data || null, isLoading, mutate };
}

/* ── Pixels (tied to a checkout configId) ── */
export function usePixels(planId: string | null) {
  /* Pixels are embedded in the checkout config record */
  const { data, isLoading, mutate } = useSWR<any>(
    planId ? `/checkout/plans/${planId}/config` : null,
    swrFetcher,
    { keepPreviousData: true },
  );
  const configId: string | null = data?.id || null;
  const pixels = Array.isArray(data?.pixels) ? data.pixels : [];

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
  const { data, isLoading, mutate } = useSWR<any>(
    planId ? `/checkout/plans/${planId}/config` : null,
    swrFetcher,
    { keepPreviousData: true },
  );

  const updateConfig = useCallback(
    async (body: any) => {
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
