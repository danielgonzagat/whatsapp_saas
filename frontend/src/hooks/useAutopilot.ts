'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import { unwrapArray } from '@/lib/normalizer';

/* ── Status (auto-refresh every 30s) ── */
export function useAutopilotStatus() {
  const { data, error, isLoading, mutate } = useSWR('/autopilot/status', swrFetcher, {
    refreshInterval: 30_000,
  });
  return { status: data, isLoading, error, mutate };
}

/* ── Configuration ── */
export function useAutopilotConfig() {
  const { data, error, isLoading, mutate } = useSWR('/autopilot/config', swrFetcher);
  return { config: data, isLoading, error, mutate };
}

/* ── Stats (auto-refresh every 60s) ── */
export function useAutopilotStats() {
  const { data, error, isLoading, mutate } = useSWR('/autopilot/stats', swrFetcher, {
    refreshInterval: 60_000,
  });
  return { stats: data, isLoading, error, mutate };
}

/* ── Actions with optional filters ── */
export function useAutopilotActions(params?: { type?: string; status?: string; limit?: string }) {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v) as [string, string][]
      ).toString()
    : '';
  const { data, error, isLoading, mutate } = useSWR(`/autopilot/actions${qs}`, swrFetcher);
  const items = unwrapArray(data, 'actions');
  return { actions: items, isLoading, error, mutate };
}

/* ── Mutations ── */
export function useAutopilotMutations() {
  const toggle = async (enabled: boolean) =>
    apiFetch('/autopilot/toggle', { method: 'POST', body: { enabled } });
  const updateConfig = async (body: any) =>
    apiFetch('/autopilot/config', { method: 'PUT', body });
  const run = async (body?: any) =>
    apiFetch('/autopilot/run', { method: 'POST', body });
  const test = async (body?: any) =>
    apiFetch('/autopilot/test', { method: 'POST', body });
  return { toggle, updateConfig, run, test };
}
