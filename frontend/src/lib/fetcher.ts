/**
 * KLOEL COSMOS — SWR Fetcher
 * Wraps apiFetch for SWR compatibility.
 * Throws on error (SWR expects thrown errors).
 * Returns the unwrapped .data from ApiResponse<T>.
 */

import { apiFetch } from './api';

interface FetcherError extends Error {
  status: number;
}

function createFetcherError(message: string, status: number): FetcherError {
  const err = new Error(message) as FetcherError;
  err.status = status;
  return err;
}

/** Swr fetcher. */
export async function swrFetcher<T = unknown>(endpoint: string): Promise<T> {
  const res = await apiFetch<T>(endpoint);

  if (res.error) {
    throw createFetcherError(res.error, res.status);
  }

  return res.data as T;
}

/** Swr mutator. */
export async function swrMutator<T = unknown>(
  endpoint: string,
  { arg }: { arg: { method?: string; body?: Record<string, unknown> } },
): Promise<T> {
  const res = await apiFetch<T>(endpoint, {
    method: arg.method || 'POST',
    body: arg.body,
  });

  if (res.error) {
    throw createFetcherError(res.error, res.status);
  }

  return res.data as T;
}
