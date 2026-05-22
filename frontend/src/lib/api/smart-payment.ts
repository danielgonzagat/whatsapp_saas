import { apiFetch } from './core';

export interface SmartPaymentResultPayload {
  id: string;
  paymentLink?: string;
  pixCode?: string;
  billingType?: 'PIX' | 'CREDIT_CARD';
  suggestedMessage?: string;
}

interface SmartPaymentBackendResponse {
  paymentId?: string;
  id?: string;
  paymentUrl?: string;
  paymentLink?: string;
  pixCopyPaste?: string;
  pixCode?: string;
  billingType?: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
  suggestedMessage?: string;
}

export function normalizeSmartPaymentResult(
  payload: SmartPaymentBackendResponse,
): SmartPaymentResultPayload {
  const result: SmartPaymentResultPayload = {
    id: payload.paymentId || payload.id || '',
  };

  const paymentLink = payload.paymentUrl || payload.paymentLink;
  if (paymentLink) {
    result.paymentLink = paymentLink;
  }

  const pixCode = payload.pixCopyPaste || payload.pixCode;
  if (pixCode) {
    result.pixCode = pixCode;
  }

  if (payload.billingType === 'PIX' || payload.billingType === 'CREDIT_CARD') {
    result.billingType = payload.billingType;
  }

  if (payload.suggestedMessage) {
    result.suggestedMessage = payload.suggestedMessage;
  }

  return result;
}

export const smartPaymentApi = {
  create: async (
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
  ) => {
    const response = await apiFetch<SmartPaymentBackendResponse>(
      `/kloel/payment/${encodeURIComponent(workspaceId)}/create`,
      { method: 'POST', body: data },
    );
    return {
      ...response,
      data: response.data ? normalizeSmartPaymentResult(response.data) : undefined,
    };
  },

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
