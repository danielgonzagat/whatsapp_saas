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

export async function uploadDocument(
  _workspaceId: string,
  file: File,
  type: 'catalog' | 'contract' | 'other' = 'other',
  token?: string,
): Promise<DocumentUpload> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);

  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}/media/documents/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Erro ao fazer upload' }));
    throw new Error(error.message);
  }

  return res.json();
}

export async function listDocuments(
  _workspaceId: string,
  _token?: string,
): Promise<DocumentUpload[]> {
  const res = await apiFetch<{ documents: DocumentUpload[] }>(`/media/documents`);
  if (res.error) {
    return [];
  }
  return res.data?.documents || [];
}
