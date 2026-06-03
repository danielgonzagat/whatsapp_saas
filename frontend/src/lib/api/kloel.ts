// KLOEL Health, PDF upload, Payment Link
import { mutate } from 'swr';
import { API_BASE } from '../http';
import { apiFetch, tokenStorage } from './core';

type JsonRecord = Record<string, unknown>;

/** Kloel health shape. */
export interface KloelHealth {
  /** Status property. */
  status: 'online' | 'offline';
  /** Identity property. */
  identity: string;
}
export interface KloelApprovalRequest {
  /** Approval id. */
  id: string;
  /** Approval kind. */
  kind: string;
  /** Approval scope. */
  scope?: string | null;
  /** Entity type. */
  entityType?: string | null;
  /** Entity id. */
  entityId?: string | null;
  /** State. */
  state: string;
  /** Title. */
  title: string;
  /** Prompt. */
  prompt: string;
  /** Payload. */
  payload: JsonRecord;
  /** Created at ISO string. */
  createdAt: string;
  /** Updated at ISO string. */
  updatedAt: string;
}

interface KloelApprovalListResponse {
  /** Pending approvals. */
  approvals?: unknown;
}

export type KloelApprovalDecision = 'approve' | 'reject' | 'adjust';

export interface KloelApprovalDecisionResponse {
  /** Success flag. */
  success: boolean;
  /** Approval id. */
  approvalRequestId: string;
  /** Resulting state. */
  state: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === 'string';
}

function isKloelApprovalRequest(value: unknown): value is KloelApprovalRequest {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    isOptionalNullableString(value.scope) &&
    isOptionalNullableString(value.entityType) &&
    isOptionalNullableString(value.entityId) &&
    typeof value.state === 'string' &&
    typeof value.title === 'string' &&
    typeof value.prompt === 'string' &&
    isRecord(value.payload) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
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

/** List pending Kloel approval requests. */
export async function listPendingKloelApprovals(): Promise<KloelApprovalRequest[]> {
  const res = await apiFetch<KloelApprovalListResponse>('/kloel/approvals/pending');
  if (res.error) {
    throw new Error(res.error);
  }
  const approvals = res.data?.approvals;
  if (!Array.isArray(approvals) || !approvals.every(isKloelApprovalRequest)) {
    throw new Error('Invalid Kloel approvals payload');
  }
  return approvals;
}

/** Decide a pending Kloel approval request. */
export async function decideKloelApproval(
  approvalRequestId: string,
  decision: KloelApprovalDecision,
  body: { note?: string; adjustment?: JsonRecord } = {},
): Promise<KloelApprovalDecisionResponse> {
  const res = await apiFetch<KloelApprovalDecisionResponse>(
    `/kloel/approvals/${encodeURIComponent(approvalRequestId)}/${decision}`,
    {
      method: 'POST',
      body,
    },
  );
  if (res.error) {
    throw new Error(res.error);
  }
  mutate('kloel:pending-approvals');
  return res.data as KloelApprovalDecisionResponse;
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

export interface UploadChatFileResponse {
  success: boolean;
  url: string;
  type: 'image' | 'document' | 'audio';
  name: string;
  size: number;
  mimeType: string;
}

function normalizeChatUploadType(value: unknown): UploadChatFileResponse['type'] {
  return value === 'image' || value === 'audio' ? value : 'document';
}

// Chat file upload — POST /kloel/upload-chat
export async function uploadChatFile(file: File): Promise<UploadChatFileResponse> {
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
  const payload = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    throw new Error(isRecord(payload) && typeof payload.message === 'string' ? payload.message : 'Failed to upload chat file');
  }
  if (!isRecord(payload) || payload.success !== true || typeof payload.url !== 'string') {
    throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'Failed to upload chat file');
  }
  return {
    success: true,
    url: payload.url,
    type: normalizeChatUploadType(payload.type),
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name : file.name,
    size: typeof payload.size === 'number' ? payload.size : file.size,
    mimeType:
      typeof payload.mimeType === 'string' && payload.mimeType.trim()
        ? payload.mimeType
        : file.type || 'application/octet-stream',
  };
}

// Payment Link
export interface PaymentLinkResponse {
  /** Success property. */
  success: boolean;
  /** Payment link property. */
  paymentLink?: string;
  /** Payment property. */
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
