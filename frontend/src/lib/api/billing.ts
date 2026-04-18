// billingApi object
import { mutate } from 'swr';
import { apiFetch, tokenStorage } from './core';

const invalidateBilling = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/billing'));
import type { SalesReportSummary } from './shared-types';

export const billingApi = {
  getSubscription: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    return apiFetch<{
      status: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
      trialDaysLeft?: number;
      creditsBalance?: number;
      plan?: string;
      currentPeriodEnd?: string;
    }>(`/billing/subscription?workspaceId=${encodeURIComponent(workspaceId)}`);
  },

  activateTrial: async () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    const res = await apiFetch(
      `/billing/activate-trial?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: 'POST' },
    );
    invalidateBilling();
    return res;
  },

  addPaymentMethod: async (paymentMethodId: string) => {
    const res = await apiFetch(`/billing/payment-methods/attach`, {
      method: 'POST',
      body: { paymentMethodId },
    });
    invalidateBilling();
    return res;
  },

  getPaymentMethods: () => {
    return apiFetch<{ paymentMethods: Array<Record<string, unknown>> }>(`/billing/payment-methods`);
  },

  createSetupIntent: (returnUrl?: string) => {
    return apiFetch<{ clientSecret?: string; customerId?: string; url?: string }>(
      `/billing/payment-methods/setup-intent`,
      {
        method: 'POST',
        body: { returnUrl },
      },
    );
  },

  setDefaultPaymentMethod: async (paymentMethodId: string) => {
    const res = await apiFetch<{ ok: boolean }>(
      `/billing/payment-methods/${encodeURIComponent(paymentMethodId)}/default`,
      {
        method: 'POST',
      },
    );
    invalidateBilling();
    return res;
  },

  removePaymentMethod: async (paymentMethodId: string) => {
    const res = await apiFetch<{ ok: boolean }>(
      `/billing/payment-methods/${encodeURIComponent(paymentMethodId)}`,
      {
        method: 'DELETE',
      },
    );
    invalidateBilling();
    return res;
  },

  createCheckoutSession: async (priceId: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    const res = await apiFetch<{ url: string }>(`/billing/checkout`, {
      method: 'POST',
      body: { workspaceId, plan: priceId },
    });
    invalidateBilling();
    return res;
  },

  getSalesReport: (period = 'week') => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    return apiFetch<SalesReportSummary>(
      `/kloel/payments/report/${encodeURIComponent(workspaceId)}?period=${encodeURIComponent(period)}`,
    );
  },
};
