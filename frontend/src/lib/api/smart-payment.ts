import { apiFetch } from './core';

export const smartPaymentApi = {
  create: (
    workspaceId: string,
    data: {
      amount: number;
      description: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      method?: string;
      dueDate?: string;
    },
  ) =>
    apiFetch<{ paymentLink?: string; pixCode?: string; boletoUrl?: string; id: string }>(
      `/kloel/payment/${encodeURIComponent(workspaceId)}/create`,
      { method: 'POST', body: data },
    ),

  negotiate: (
    workspaceId: string,
    data: {
      paymentId: string;
      proposedAmount?: number;
      proposedDueDate?: string;
      installments?: number;
    },
  ) =>
    apiFetch<{ success: boolean; negotiationId?: string }>(
      `/kloel/payment/${encodeURIComponent(workspaceId)}/negotiate`,
      {
        method: 'POST',
        body: data,
      },
    ),

  recoveryAnalysis: (workspaceId: string, paymentId: string) =>
    apiFetch<{
      score: number;
      recommendedAction: string;
      estimatedRecovery: number;
      insights: string[];
    }>(
      `/kloel/payment/${encodeURIComponent(workspaceId)}/recovery/${encodeURIComponent(paymentId)}`,
    ),
};
