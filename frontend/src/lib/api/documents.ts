import { API_BASE } from '../http';
import { apiFetch } from './core';

export interface DocumentUpload {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  createdAt: string;
}

type DocumentsApiEnvelope<T> = {
  data?: T | undefined;
  error?: string | undefined;
  status: number;
};

type DocumentListPayload = {
  documents: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function normalizeDocumentUpload(value: unknown, missingMessage: string): DocumentUpload {
  const raw = isRecord(value) && isRecord(value.document) ? value.document : value;
  if (!isRecord(raw)) {
    throw new Error(missingMessage);
  }

  const id = pickString(raw, ['id']);
  const name = pickString(raw, ['name', 'fileName']);
  const url = pickString(raw, ['url']);
  const typeValue = pickString(raw, ['type', 'mimeType', 'category']);
  const size = pickNumber(raw, ['size', 'fileSize']);
  const createdAt = pickString(raw, ['createdAt']);

  if (!id || !name || !url || !typeValue || size === undefined || !createdAt) {
    throw new Error(missingMessage);
  }

  return {
    id,
    name,
    url,
    type: typeValue,
    size,
    createdAt,
  };
}

function getDocumentErrorMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) {
    return fallback;
  }
  return pickString(value, ['message', 'error']) ?? fallback;
}

function confirmDocumentList(response: DocumentsApiEnvelope<DocumentListPayload>): DocumentUpload[] {
  if (response.error || response.status >= 400) {
    throw new Error(response.error ?? 'Erro ao listar documentos');
  }

  if (!response.data || !Array.isArray(response.data.documents)) {
    throw new Error('Document list did not return a confirmed payload');
  }

  return response.data.documents.map((document) =>
    normalizeDocumentUpload(document, 'Document list contained an invalid document payload'),
  );
}

export async function uploadDocument(
  workspaceId: string,
  file: File,
  type: 'catalog' | 'contract' | 'other' = 'other',
  token?: string,
): Promise<DocumentUpload> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  if (workspaceId) {
    formData.append('workspaceId', workspaceId);
  }

  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/media/documents/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(getDocumentErrorMessage(payload, 'Erro ao fazer upload'));
  }

  return normalizeDocumentUpload(payload, 'Document upload did not return a confirmed document');
}

export async function listDocuments(
  _workspaceId: string,
  _token?: string,
): Promise<DocumentUpload[]> {
  const res = await apiFetch<DocumentListPayload>(`/media/documents`);
  return confirmDocumentList(res);
}
