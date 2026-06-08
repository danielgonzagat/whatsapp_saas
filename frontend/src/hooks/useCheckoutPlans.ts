'use client';

import { apiFetch } from '@/lib/api';
import { swrFetcher } from '@/lib/fetcher';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import {
  buildCheckoutProductBody,
  buildCheckoutSeedProduct,
  buildDuplicatePlanBody,
  buildOrdersQueryString,
  extractCheckoutProductList,
  extractCheckoutsFromDetail,
  extractPixels,
  extractPlansFromDetail,
  matchesProduct,
  requireCheckoutMutationSuccess,
  resolveOrdersTotal,
  unwrapArrayOrEnvelope,
  type CheckoutProductItem,
  type CheckoutProductListResponse,
  type DashboardProduct,
} from './useCheckoutPlans.helpers';

/* ── Shared types ── */

interface DashboardProductInput extends Partial<DashboardProduct> {
  id?: string;
  name?: string;
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

async function findExistingCheckoutProductId(
  product: DashboardProduct,
): Promise<string | null | undefined> {
  const res = await apiFetch<CheckoutProductItem[] | CheckoutProductListResponse>(
    '/checkout/products',
  );
  const list = extractCheckoutProductList(res.data);
  const found = list.find((candidate) => matchesProduct(candidate, product));
  return found ? found.id : undefined;
}

async function createCheckoutProductId(product: DashboardProduct): Promise<string | null> {
  const created = await apiFetch<CheckoutProductItem>('/checkout/products', {
    method: 'POST',
    body: buildCheckoutProductBody(product),
  });
  const response = requireCheckoutMutationSuccess(created, 'Erro ao criar produto de checkout');
  return response?.data?.id || null;
}

async function ensureCheckoutProduct(product: DashboardProduct): Promise<string | null> {
  try {
    const existingId = await findExistingCheckoutProductId(product);
    if (existingId !== undefined) {
      return existingId;
    }
    return await createCheckoutProductId(product);
  } catch {
    return null;
  }
}

const CHECKOUT_PRODUCT_ENSURE_CACHE_MS = 30000;
const checkoutProductEnsurePromises = new Map<string, Promise<string | null>>();

function getCheckoutProductEnsureKey(product: DashboardProduct): string {
  return [product.id, product.slug || '', product.name].join(':');
}

function ensureCheckoutProductOnce(product: DashboardProduct): Promise<string | null> {
  const key = getCheckoutProductEnsureKey(product);
  const existing = checkoutProductEnsurePromises.get(key);
  if (existing) {
    return existing;
  }

  const promise = ensureCheckoutProduct(product).finally(() => {
    setTimeout(() => {
      if (checkoutProductEnsurePromises.get(key) === promise) {
        checkoutProductEnsurePromises.delete(key);
      }
    }, CHECKOUT_PRODUCT_ENSURE_CACHE_MS);
  });
  checkoutProductEnsurePromises.set(key, promise);
  return promise;
}

/* ── Plans for a product ── */
export function useCheckoutPlans(product: DashboardProductInput | null | undefined) {
  const [checkoutProductId, setCheckoutProductId] = useState<string | null>(null);
  const checkoutSeedProduct = useMemo<DashboardProduct | null>(
    () => buildCheckoutSeedProduct(product),
    [product],
  );

  useEffect(() => {
    if (!checkoutSeedProduct) {
      return undefined;
    }

    let cancelled = false;
    void ensureCheckoutProductOnce(checkoutSeedProduct)
      .then((id) => {
        if (!cancelled) {
          setCheckoutProductId(id);
        }
      })
      .catch(() => {/* best-effort: non-blocking */});

    return () => {
      cancelled = true;
    };
  }, [checkoutSeedProduct]);

  const { data, isLoading, mutate } = useSWR<CheckoutProductDetail>(
    checkoutProductId ? `/checkout/products/${checkoutProductId}` : null,
    swrFetcher,
    { keepPreviousData: true },
  );

  const plans = extractPlansFromDetail(data);
  const checkouts = extractCheckoutsFromDetail(data);

  const createPlan = useCallback(
    async (body: PlanCreateBody) => {
      if (!checkoutProductId) {
        return null;
      }
      const res = await apiFetch(`/checkout/products/${checkoutProductId}/plans`, {
        method: 'POST',
        body,
      });
      requireCheckoutMutationSuccess(res, 'Erro ao criar plano');
      mutate();
      return res;
    },
    [checkoutProductId, mutate],
  );

  const updatePlan = useCallback(
    async (planId: string, body: Partial<PlanCreateBody>) => {
      const res = await apiFetch(`/checkout/plans/${planId}`, { method: 'PUT', body });
      requireCheckoutMutationSuccess(res, 'Erro ao atualizar plano');
      mutate();
      return res;
    },
    [mutate],
  );

  const deletePlan = useCallback(
    async (planId: string) => {
      const res = await apiFetch(`/checkout/plans/${planId}`, { method: 'DELETE' });
      requireCheckoutMutationSuccess(res, 'Erro ao remover plano');
      mutate();
      return res;
    },
    [mutate],
  );

  const duplicatePlan = useCallback(
    async (plan: CheckoutPlan) => {
      if (!checkoutProductId) {
        return null;
      }
      const res = await apiFetch(`/checkout/products/${checkoutProductId}/plans`, {
        method: 'POST',
        body: buildDuplicatePlanBody(plan),
      });
      requireCheckoutMutationSuccess(res, 'Erro ao duplicar plano');
      mutate();
      return res;
    },
    [checkoutProductId, mutate],
  );

  const createCheckout = useCallback(
    async (body: Record<string, unknown>) => {
      if (!checkoutProductId) {
        return null;
      }
      const res = await apiFetch(`/checkout/products/${checkoutProductId}/checkouts`, {
        method: 'POST',
        body,
      });
      requireCheckoutMutationSuccess(res, 'Erro ao criar checkout');
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
      requireCheckoutMutationSuccess(res, 'Erro ao duplicar checkout');
      mutate();
      return res;
    },
    [mutate],
  );

  const deleteCheckout = useCallback(
    async (checkoutId: string) => {
      const res = await apiFetch(`/checkout/checkouts/${checkoutId}`, { method: 'DELETE' });
      requireCheckoutMutationSuccess(res, 'Erro ao remover checkout');
      mutate();
      return res;
    },
    [mutate],
  );

  const syncCheckoutLinks = useCallback(
    async (checkoutId: string, planIds: string[]) => {
      const res = await apiFetch(`/checkout/checkouts/${checkoutId}/links`, {
        method: 'PUT',
        body: { planIds },
      });
      // PUT /links returns a markerless 200; check apiFetch's error field rather
      // than the mutation-envelope marker (which would false-throw on success).
      const linksError = (res as { error?: unknown }).error;
      if (typeof linksError === 'string' && linksError.trim()) {
        throw new Error(linksError);
      }
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
  const bumps = unwrapArrayOrEnvelope<BumpItem>(data, 'bumps');

  const createBump = useCallback(
    async (body: Record<string, unknown>) => {
      if (!planId) {
        return null;
      }
      const res = await apiFetch(`/checkout/plans/${planId}/bumps`, { method: 'POST', body });
      requireCheckoutMutationSuccess(res, 'Erro ao criar order bump');
      mutate();
      return res;
    },
    [planId, mutate],
  );

  const updateBump = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const res = await apiFetch(`/checkout/bumps/${id}`, { method: 'PUT', body });
      requireCheckoutMutationSuccess(res, 'Erro ao atualizar order bump');
      mutate();
      return res;
    },
    [mutate],
  );

  const deleteBump = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/checkout/bumps/${id}`, { method: 'DELETE' });
      requireCheckoutMutationSuccess(res, 'Erro ao remover order bump');
      mutate();
      return res;
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
  const upsells = unwrapArrayOrEnvelope<UpsellItem>(data, 'upsells');

  const createUpsell = useCallback(
    async (body: Record<string, unknown>) => {
      if (!planId) {
        return null;
      }
      const res = await apiFetch(`/checkout/plans/${planId}/upsells`, { method: 'POST', body });
      requireCheckoutMutationSuccess(res, 'Erro ao criar upsell');
      mutate();
      return res;
    },
    [planId, mutate],
  );

  const updateUpsell = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const res = await apiFetch(`/checkout/upsells/${id}`, { method: 'PUT', body });
      requireCheckoutMutationSuccess(res, 'Erro ao atualizar upsell');
      mutate();
      return res;
    },
    [mutate],
  );

  const deleteUpsell = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/checkout/upsells/${id}`, { method: 'DELETE' });
      requireCheckoutMutationSuccess(res, 'Erro ao remover upsell');
      mutate();
      return res;
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
  const coupons = unwrapArrayOrEnvelope<CouponItem>(data, 'coupons');

  const createCoupon = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await apiFetch('/checkout/coupons', { method: 'POST', body });
      requireCheckoutMutationSuccess(res, 'Erro ao criar cupom');
      mutate();
      return res;
    },
    [mutate],
  );

  const updateCoupon = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const res = await apiFetch(`/checkout/coupons/${id}`, { method: 'PUT', body });
      requireCheckoutMutationSuccess(res, 'Erro ao atualizar cupom');
      mutate();
      return res;
    },
    [mutate],
  );

  const deleteCoupon = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/checkout/coupons/${id}`, { method: 'DELETE' });
      requireCheckoutMutationSuccess(res, 'Erro ao remover cupom');
      mutate();
      return res;
    },
    [mutate],
  );

  return { coupons, isLoading, mutate, createCoupon, updateCoupon, deleteCoupon };
}

/* ── Checkout Products — update / delete ── */
export function useCheckoutProduct(productId: string | null) {
  const updateProduct = useCallback(
    async (body: Record<string, unknown>) => {
      if (!productId) {
        return null;
      }
      const res = await apiFetch(`/checkout/products/${productId}`, { method: 'PUT', body });
      requireCheckoutMutationSuccess(res, 'Erro ao atualizar produto de checkout');
      return res;
    },
    [productId],
  );

  const deleteProduct = useCallback(async () => {
    if (!productId) {
      return null;
    }
    const res = await apiFetch(`/checkout/products/${productId}`, { method: 'DELETE' });
    requireCheckoutMutationSuccess(res, 'Erro ao remover produto de checkout');
    return res;
  }, [productId]);

  return { updateProduct, deleteProduct };
}

/* ── Checkout Orders ── */
export function useCheckoutOrders(params?: { status?: string; page?: number; limit?: number }) {
  const q = buildOrdersQueryString(params);
  const { data, isLoading, mutate } = useSWR<OrderItem[] | OrderListResponse>(
    `/checkout/orders${q}`,
    swrFetcher,
    { keepPreviousData: true },
  );
  const orders = unwrapArrayOrEnvelope<OrderItem>(data, 'orders');
  const total = resolveOrdersTotal(data, orders.length);

  const updateOrderStatus = useCallback(
    async (id: string, status: string, extra?: { trackingCode?: string; trackingUrl?: string }) => {
      const res = await apiFetch(`/checkout/orders/${id}/status`, {
        method: 'PATCH',
        body: { status, ...extra },
      });
      requireCheckoutMutationSuccess(res, 'Erro ao atualizar pedido');
      mutate();
      return res;
    },
    [mutate],
  );

  return { orders, total, isLoading, mutate, updateOrderStatus };
}

/** Use checkout order. */
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
  const pixels: PixelItem[] = extractPixels<PixelItem>(data);

  const createPixel = useCallback(
    async (body: { type: string; pixelId: string; accessToken?: string }) => {
      if (!configId) {
        return null;
      }
      const res = await apiFetch(`/checkout/config/${configId}/pixels`, { method: 'POST', body });
      requireCheckoutMutationSuccess(res, 'Erro ao criar pixel');
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
      requireCheckoutMutationSuccess(res, 'Erro ao atualizar pixel');
      mutate();
      return res;
    },
    [mutate],
  );

  const deletePixel = useCallback(
    async (pixelId: string) => {
      const res = await apiFetch(`/checkout/pixels/${pixelId}`, { method: 'DELETE' });
      requireCheckoutMutationSuccess(res, 'Erro ao remover pixel');
      mutate();
      return res;
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
      if (!planId) {
        return null;
      }
      // Drop computed/display-only fields the update DTO forbids and coerce
      // trustBadges to the DTO shape ({ label }) so the PATCH isn't rejected (400).
      const clean: Record<string, unknown> = { ...body };
      delete clean.pricing;
      delete clean.socialProofAlerts;
      if (Array.isArray(clean.trustBadges)) {
        clean.trustBadges = clean.trustBadges.map((badge) =>
          typeof badge === 'string' ? { label: badge } : badge,
        );
      }
      const res = await apiFetch(`/checkout/plans/${planId}/config`, {
        method: 'PATCH',
        body: clean,
      });
      // /config returns the config object, not a mutation envelope — checking
      // apiFetch's own error field is the correct success criterion (a 200 here
      // has no success-marker, which would make requireCheckoutMutationSuccess
      // throw a false error on a save that actually persisted).
      const resError = (res as { error?: unknown }).error;
      if (typeof resError === 'string' && resError.trim()) {
        throw new Error(resError);
      }
      mutate();
      return res;
    },
    [planId, mutate],
  );

  const resetConfig = useCallback(async () => {
    if (!planId) {
      return null;
    }
    const res = await apiFetch(`/checkout/plans/${planId}/config/reset`, { method: 'POST' });
    requireCheckoutMutationSuccess(res, 'Erro ao resetar configuracao do checkout');
    mutate();
    return res;
  }, [planId, mutate]);

  return { config: data || null, isLoading, mutate, updateConfig, resetConfig };
}
