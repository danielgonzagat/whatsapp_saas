'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';

/* ── Subscription info ── */
export function useSubscription() {
  const { data, error, isLoading, mutate } = useSWR('/billing/subscription', swrFetcher);
  return { subscription: data, isLoading, error, mutate };
}

/* ── Usage stats ── */
export function useBillingUsage() {
  const { data, error, isLoading, mutate } = useSWR('/billing/usage', swrFetcher);
  return { usage: data, isLoading, error, mutate };
}

/* ── Response types ── */
interface PaymentMethodsResponse {
  methods?: unknown[];
}

/* ── Payment methods ── */
export function usePaymentMethods() {
  const { data, error, isLoading, mutate } = useSWR('/billing/payment-methods', swrFetcher);
  const methods = Array.isArray(data) ? data : (data as PaymentMethodsResponse)?.methods ?? [];
  return { paymentMethods: methods, isLoading, error, mutate };
}

/* ── Mutations ── */
export function useBillingMutations() {
  const activateTrial = async (plan?: string) =>
    apiFetch('/billing/trial', { method: 'POST', body: plan ? { plan } : undefined });
  const createCheckout = async (body: { planId: string; successUrl?: string; cancelUrl?: string }) =>
    apiFetch('/billing/checkout', { method: 'POST', body });
  return { activateTrial, createCheckout };
}
