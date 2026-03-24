/**
 * KLOEL COSMOS — SWR Fetcher
 * Wraps apiFetch for SWR compatibility.
 * Throws on error (SWR expects thrown errors).
 * Returns the unwrapped .data from ApiResponse<T>.
 */

import { apiFetch } from './api';

export async function swrFetcher<T = any>(endpoint: string): Promise<T> {
  const res = await apiFetch<T>(endpoint);

  if (res.error) {
    const err = new Error(res.error);
    (err as any).status = res.status;
    throw err;
  }

  return res.data as T;
}

export async function swrMutator<T = any>(
  endpoint: string,
  { arg }: { arg: { method?: string; body?: any } }
): Promise<T> {
  const res = await apiFetch<T>(endpoint, {
    method: arg.method || 'POST',
    body: arg.body,
  });

  if (res.error) {
    const err = new Error(res.error);
    (err as any).status = res.status;
    throw err;
  }

  return res.data as T;
}
