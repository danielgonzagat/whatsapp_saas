'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';
import { unwrapArray } from '@/lib/normalizer';
import { useWorkspaceId } from './useWorkspaceId';

/* ── List flows ── */
export function useFlows() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(wsId ? `/flows/${wsId}` : null, swrFetcher);
  const items = unwrapArray(data, 'flows');
  return { flows: items, isLoading, error, mutate };
}

/* ── Single flow ── */
export function useFlow(flowId: string | null) {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId && flowId ? `/flows/${wsId}/${flowId}` : null,
    swrFetcher
  );
  return { flow: (data as any)?.flow ?? (data as any)?.data ?? data, isLoading, error, mutate };
}

/* ── Flow templates ── */
export function useFlowTemplates() {
  const { data, error, isLoading } = useSWR('/flows/templates', swrFetcher);
  const items = unwrapArray(data, 'templates');
  return { templates: items, isLoading, error };
}

/* ── Flow executions ── */
export function useFlowExecutions() {
  const wsId = useWorkspaceId();
  const { data, error, isLoading, mutate } = useSWR(
    wsId ? `/flows/${wsId}/executions` : null,
    swrFetcher
  );
  const items = unwrapArray(data, 'executions');
  return { executions: items, isLoading, error, mutate };
}

/* ── Mutations ── */
export function useFlowMutations() {
  const wsId = useWorkspaceId();

  const createFlow = async (body: any) => {
    if (!wsId) throw new Error('Workspace not loaded');
    return apiFetch(`/flows/${wsId}`, { method: 'POST', body });
  };
  const updateFlow = async (flowId: string, body: any) => {
    if (!wsId) throw new Error('Workspace not loaded');
    return apiFetch(`/flows/${wsId}/${flowId}`, { method: 'PUT', body });
  };
  const deleteFlow = async (flowId: string) => {
    if (!wsId) throw new Error('Workspace not loaded');
    return apiFetch(`/flows/${wsId}/${flowId}`, { method: 'DELETE' });
  };
  const toggleFlow = async (flowId: string, active: boolean) => {
    if (!wsId) throw new Error('Workspace not loaded');
    return apiFetch(`/flows/${wsId}/${flowId}/toggle`, { method: 'PUT', body: { active } });
  };
  const executeFlow = async (flowId: string, input?: any) => {
    if (!wsId) throw new Error('Workspace not loaded');
    return apiFetch(`/flows/${wsId}/${flowId}/execute`, { method: 'POST', body: input });
  };

  return { createFlow, updateFlow, deleteFlow, toggleFlow, executeFlow };
}
