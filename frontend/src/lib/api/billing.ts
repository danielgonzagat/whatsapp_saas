// billingApi object
import { apiFetch, tokenStorage } from './core';
import type { AsaasStatus, AsaasBalance, AsaasPaymentRecord, SalesReportSummary } from './asaas';

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

  getAsaasStatus: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<AsaasStatus>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/status`);
  },

  connectAsaas: (apiKey: string, environment: 'sandbox' | 'production' = 'sandbox') => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<any>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/connect`, {
      method: 'POST',
      body: { apiKey, environment },
    });
  },

  disconnectAsaas: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<any>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/disconnect`, {
      method: 'DELETE',
    });
  },

  getAsaasBalance: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<AsaasBalance>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/balance`);
  },

  listAsaasPayments: (params?: { status?: string; startDate?: string; endDate?: string }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.startDate) search.set('startDate', params.startDate);
    if (params?.endDate) search.set('endDate', params.endDate);
    const qs = search.toString();
    return apiFetch<{ total: number; payments: AsaasPaymentRecord[] }>(
      `/kloel/asaas/${encodeURIComponent(workspaceId)}/payments${qs ? `?${qs}` : ''}`,
    );
  },

  createAsaasPix: (payload: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    amount: number;
    description: string;
    externalReference?: string;
  }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<any>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/pix`, {
      method: 'POST',
      body: payload,
    });
  },

  createAsaasBoleto: (payload: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    customerCpfCnpj: string;
    amount: number;
    description: string;
    externalReference?: string;
  }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error("missing_workspaceId");
    }
    return apiFetch<any>(`/kloel/asaas/${encodeURIComponent(workspaceId)}/boleto`, {
      method: 'POST',
      body: payload,
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
