'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';

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
      ensureCheckoutProduct(product).then(setCheckoutProductId).catch(() => {});
    }
  }, [product?.id]);

  const { data, isLoading, mutate } = useSWR<any>(
    checkoutProductId ? `/checkout/products/${checkoutProductId}` : null,
    swrFetcher,
    { keepPreviousData: true }
  );

  const plans = data?.checkoutPlans || data?.plans || [];

  const createPlan = useCallback(async (body: any) => {
    if (!checkoutProductId) return null;
    const res = await apiFetch(`/checkout/products/${checkoutProductId}/plans`, {
      method: 'POST',
      body,
    });
    mutate();
    return res;
  }, [checkoutProductId, mutate]);

  const updatePlan = useCallback(async (planId: string, body: any) => {
    const res = await apiFetch(`/checkout/plans/${planId}`, { method: 'PUT', body });
    mutate();
    return res;
  }, [mutate]);

  const deletePlan = useCallback(async (planId: string) => {
    await apiFetch(`/checkout/plans/${planId}`, { method: 'DELETE' });
    mutate();
  }, [mutate]);

  const duplicatePlan = useCallback(async (plan: any) => {
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
  }, [checkoutProductId, mutate]);

  return { plans, checkoutProductId, isLoading, mutate, createPlan, updatePlan, deletePlan, duplicatePlan };
}

/* ── Order Bumps ── */
export function useOrderBumps(planId: string | null) {
  const { data, isLoading, mutate } = useSWR(
    planId ? `/checkout/plans/${planId}/bumps` : null, swrFetcher, { keepPreviousData: true }
  );
  const bumps = Array.isArray(data) ? data : data?.bumps || [];

  const createBump = useCallback(async (body: any) => {
    await apiFetch(`/checkout/plans/${planId}/bumps`, { method: 'POST', body });
    mutate();
  }, [planId, mutate]);

  const updateBump = useCallback(async (id: string, body: any) => {
    await apiFetch(`/checkout/bumps/${id}`, { method: 'PUT', body });
    mutate();
  }, [mutate]);

  const deleteBump = useCallback(async (id: string) => {
    await apiFetch(`/checkout/bumps/${id}`, { method: 'DELETE' });
    mutate();
  }, [mutate]);

  return { bumps, isLoading, mutate, createBump, updateBump, deleteBump };
}

/* ── Upsells ── */
export function useUpsells(planId: string | null) {
  const { data, isLoading, mutate } = useSWR(
    planId ? `/checkout/plans/${planId}/upsells` : null, swrFetcher, { keepPreviousData: true }
  );
  const upsells = Array.isArray(data) ? data : data?.upsells || [];

  const createUpsell = useCallback(async (body: any) => {
    await apiFetch(`/checkout/plans/${planId}/upsells`, { method: 'POST', body });
    mutate();
  }, [planId, mutate]);

  const updateUpsell = useCallback(async (id: string, body: any) => {
    await apiFetch(`/checkout/upsells/${id}`, { method: 'PUT', body });
    mutate();
  }, [mutate]);

  const deleteUpsell = useCallback(async (id: string) => {
    await apiFetch(`/checkout/upsells/${id}`, { method: 'DELETE' });
    mutate();
  }, [mutate]);

  return { upsells, isLoading, mutate, createUpsell, updateUpsell, deleteUpsell };
}

/* ── Coupons (workspace-level) ── */
export function useCheckoutCoupons() {
  const { data, isLoading, mutate } = useSWR('/checkout/coupons', swrFetcher, { keepPreviousData: true });
  const coupons = Array.isArray(data) ? data : data?.coupons || [];

  const createCoupon = useCallback(async (body: any) => {
    await apiFetch('/checkout/coupons', { method: 'POST', body });
    mutate();
  }, [mutate]);

  const updateCoupon = useCallback(async (id: string, body: any) => {
    await apiFetch(`/checkout/coupons/${id}`, { method: 'PUT', body });
    mutate();
  }, [mutate]);

  const deleteCoupon = useCallback(async (id: string) => {
    await apiFetch(`/checkout/coupons/${id}`, { method: 'DELETE' });
    mutate();
  }, [mutate]);

  return { coupons, isLoading, mutate, createCoupon, updateCoupon, deleteCoupon };
}

/* ── Checkout Config ── */
export function useCheckoutConfig(planId: string | null) {
  const { data, isLoading, mutate } = useSWR(
    planId ? `/checkout/plans/${planId}/config` : null, swrFetcher, { keepPreviousData: true }
  );

  const updateConfig = useCallback(async (body: any) => {
    await apiFetch(`/checkout/plans/${planId}/config`, { method: 'PATCH', body });
    mutate();
  }, [planId, mutate]);

  const resetConfig = useCallback(async () => {
    await apiFetch(`/checkout/plans/${planId}/config/reset`, { method: 'POST' });
    mutate();
  }, [planId, mutate]);

  return { config: data || null, isLoading, mutate, updateConfig, resetConfig };
}
