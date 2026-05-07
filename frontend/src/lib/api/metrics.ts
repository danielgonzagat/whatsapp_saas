import { API_BASE } from '../http';
import { apiFetch } from './core';

export async function getMetrics(token?: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}/metrics`, { headers });
  if (!res.ok) {
    throw new Error('Failed to fetch metrics');
  }
  return res.text();
}

export async function getQueueMetrics(
  _token?: string,
): Promise<Record<string, { waiting: number; active: number; completed: number; failed: number }>> {
  const res =
    await apiFetch<
      Record<string, { waiting: number; active: number; completed: number; failed: number }>
    >(`/metrics/queues`);
  if (res.error) {
    throw new Error('Failed to fetch queue metrics');
  }
  return res.data as Record<
    string,
    { waiting: number; active: number; completed: number; failed: number }
  >;
}
