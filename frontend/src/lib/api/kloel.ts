// KLOEL Health, PDF upload, Payment Link
import { mutate } from 'swr';
import { API_BASE } from '../http';
import { apiFetch, tokenStorage } from './core';

type JsonRecord = Record<string, unknown>;

/** Kloel health shape. */
export interface KloelHealth {
  status: 'online' | 'offline';
  identity: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Get kloel health. */
export async function getKloelHealth(): Promise<KloelHealth> {
  const res = await apiFetch<unknown>(`/kloel/health`);
  if (res.error) {
    throw new Error('KLOEL offline');
  }
  const data = isRecord(res.data) ? res.data : null;
  return {
    status: data?.status === 'online' ? 'online' : 'offline',
    identity: typeof data?.identity === 'string' ? data.identity : '',
  };
}

// PDF Upload
export async function uploadPdf(workspaceId: string, file: File): Promise<JsonRecord> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(
    new Request(`${API_BASE}/kloel/pdf/${workspaceId}/upload`, {
      method: 'POST',
      body: formData,
    }),
  );
  if (!res.ok) {
    throw new Error('Failed to upload PDF');
  }
  const payload = await res.json();
  return isRecord(payload) ? payload : {};
}

// Chat file upload — POST /kloel/upload-chat
export async function uploadChatFile(file: File): Promise<{
  success: boolean;
  url: string;
  type: 'image' | 'document' | 'audio';
  name: string;
  size: number;
  mimeType: string;
}> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/kloel/upload-chat`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${tokenStorage.getToken() || ''}`,
      'x-workspace-id': tokenStorage.getWorkspaceId() || '',
    },
  });
  if (!res.ok) {
    throw new Error('Failed to upload chat file');
  }
  return res.json();
}

// Payment Link
export interface PaymentLinkResponse {
  success: boolean;
  paymentLink?: string;
  payment: {
    id: string;
    invoiceUrl?: string;
    pixQrCodeUrl?: string;
    pixCopyPaste?: string;
    paymentLink?: string;
    status: string;
  };
}

/** Create payment link. */
export async function createPaymentLink(
  workspaceId: string,
  data: {
    amount: number;
    productName: string;
    customerPhone: string;
    customerName?: string;
    leadId?: string;
  },
): Promise<PaymentLinkResponse> {
  const res = await apiFetch<PaymentLinkResponse>(
    `/kloel/payments/create/${encodeURIComponent(workspaceId)}`,
    {
      method: 'POST',
      body: {
        ...data,
        description: data.productName,
      },
    },
  );
  if (res.error) {
    throw new Error(res.error);
  }
  mutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/payments'));
  return res.data as PaymentLinkResponse;
}
