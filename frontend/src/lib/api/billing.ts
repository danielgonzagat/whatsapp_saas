// billingApi object
import { mutate } from 'swr';
import { apiFetch, tokenStorage } from './core';
import type { SalesReportSummary } from './shared-types';

const invalidateBilling = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/billing'));

type BillingMutationEnvelope = { error?: string | undefined; status: number };

function confirmBillingMutation<T extends BillingMutationEnvelope>(
  response: T,
  fallbackMessage: string,
): T {
  if (response.error) {
    throw new Error(response.error);
  }
  if (response.status >= 400) {
    throw new Error(fallbackMessage);
  }
  return response;
}

/** Billing api. */
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
    const confirmed = confirmBillingMutation(res, 'Falha ao ativar trial.');
    invalidateBilling();
    return confirmed;
  },

  cancelSubscription: async () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    const res = await apiFetch(
      `/billing/cancel?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: 'POST' },
    );
    const confirmed = confirmBillingMutation(res, 'Falha ao cancelar assinatura.');
    invalidateBilling();
    return confirmed;
  },

  getBillingUsage: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    return apiFetch<Record<string, unknown>>(`/billing/usage?workspaceId=${encodeURIComponent(workspaceId)}`);
  },

  addPaymentMethod: async (paymentMethodId: string) => {
    const res = await apiFetch(`/billing/payment-methods/attach`, {
      method: 'POST',
      body: { paymentMethodId },
    });
    const confirmed = confirmBillingMutation(res, 'Falha ao anexar metodo de pagamento.');
    invalidateBilling();
    return confirmed;
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
    const confirmed = confirmBillingMutation(res, 'Falha ao definir cartao padrao.');
    invalidateBilling();
    return confirmed;
  },

  removePaymentMethod: async (paymentMethodId: string) => {
    const res = await apiFetch<{ ok: boolean }>(
      `/billing/payment-methods/${encodeURIComponent(paymentMethodId)}`,
      {
        method: 'DELETE',
      },
    );
    const confirmed = confirmBillingMutation(res, 'Falha ao remover metodo de pagamento.');
    invalidateBilling();
    return confirmed;
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
    const confirmed = confirmBillingMutation(res, 'Falha ao criar checkout.');
    invalidateBilling();
    return confirmed;
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
