// billingApi object
import { apiFetch, tokenStorage } from './core';
import type { SalesReportSummary } from './asaas';

export const billingApi = {
  getSubscription: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<{
      status: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
      trialDaysLeft?: number;
      creditsBalance?: number;
      plan?: string;
      currentPeriodEnd?: string;
    }>(`/billing/subscription?workspaceId=${encodeURIComponent(workspaceId)}`);
  },

  activateTrial: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch(`/billing/activate-trial?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'POST' });
  },

  addPaymentMethod: (paymentMethodId: string) => {
    return apiFetch(`/billing/payment-methods/attach`, {
      method: 'POST',
      body: { paymentMethodId },
    });
  },

  getPaymentMethods: () => {
    return apiFetch<{ paymentMethods: any[] }>(`/billing/payment-methods`);
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

  setDefaultPaymentMethod: (paymentMethodId: string) => {
    return apiFetch<{ ok: boolean }>(`/billing/payment-methods/${encodeURIComponent(paymentMethodId)}/default`, {
      method: 'POST',
    });
  },

  removePaymentMethod: (paymentMethodId: string) => {
    return apiFetch<{ ok: boolean }>(`/billing/payment-methods/${encodeURIComponent(paymentMethodId)}`, {
      method: 'DELETE',
    });
  },

  createCheckoutSession: (priceId: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<{ url: string }>(`/billing/checkout`, {
      method: 'POST',
      body: { workspaceId, plan: priceId },
    });
  },

  getSalesReport: (period: string = 'week') => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<SalesReportSummary>(
      `/kloel/payments/report/${encodeURIComponent(workspaceId)}?period=${encodeURIComponent(period)}`,
    );
  },
};
