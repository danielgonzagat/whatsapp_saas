import { apiFetch } from './core';

export async function getDashboardStats() {
  return apiFetch<{ revenue: number; leads: number; messages: number; conversions: number }>(
    '/dashboard/stats',
  );
}
