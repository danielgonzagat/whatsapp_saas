// WhatsApp API internal utilities for the official Meta Cloud integration.
import { mutate } from 'swr';
import { apiFetch } from './core';

export function invalidateWhatsApp() {
  mutate((key: string) => typeof key === 'string' && key.startsWith('/whatsapp'));
}

export interface WhatsAppApiError extends Error {
  status?: number;
}

export function createWhatsAppApiError(message: string, status = 0): WhatsAppApiError {
  const error = new Error(message) as WhatsAppApiError;
  error.status = status;
  return error;
}

export async function whatsappApiRequest<T = unknown>(
  path: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<T> {
  const res = await apiFetch<T>(path, options);
  if (res.error) {
    throw createWhatsAppApiError(res.error, res.status);
  }
  return res.data as T;
}

export async function whatsappMutatingRequest<T = unknown>(
  path: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<T> {
  const data = await whatsappApiRequest<T>(path, options);
  invalidateWhatsApp();
  return data;
}

