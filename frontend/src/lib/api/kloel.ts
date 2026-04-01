// KLOEL Health, PDF upload, Payment Link
import { API_BASE } from '../http';
import { apiFetch } from './core';

export interface KloelHealth {
  status: 'online' | 'offline';
  identity: string;
}

export async function getKloelHealth(): Promise<KloelHealth> {
  const res = await apiFetch<any>(`/kloel/health`);
  if (res.error) throw new Error('KLOEL offline');
  const data = res.data as Record<string, any> | undefined;
  return {
    status: data?.status === 'online' ? 'online' : 'offline',
    identity: data?.identity || '',
  };
}

// PDF Upload
export async function uploadPdf(workspaceId: string, file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/kloel/pdf/${workspaceId}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload PDF');
  return res.json();
}

// Chat file upload — POST /kloel/upload-chat
export async function uploadChatFile(file: File): Promise<{ url: string; type: string; name: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/kloel/upload-chat`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to upload chat file');
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

export async function createPaymentLink(workspaceId: string, data: {
  amount: number;
  productName: string;
  customerPhone: string;
  customerName?: string;
  leadId?: string;
}): Promise<PaymentLinkResponse> {
  const res = await apiFetch<PaymentLinkResponse>(`/kloel/payments/create/${encodeURIComponent(workspaceId)}`, {
    method: 'POST',
    body: {
      ...data,
      description: data.productName,
    },
  });
  if (res.error) throw new Error(res.error);
  return res.data as PaymentLinkResponse;
}
