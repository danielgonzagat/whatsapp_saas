// ciaApi object and related interfaces. Pure type declarations live in
// cia.types.ts; this module is responsible for the SWR-aware runtime client.
// All historical exports are preserved via `export type` re-exports below so
// existing callers that import from '@/lib/api/cia' continue to compile.
import { mutate } from 'swr';
import { apiFetch } from './core';
import type {
  CiaAccountApproval,
  CiaAccountRuntime,
  CiaCapabilityRegistry,
  CiaConversationActionRegistry,
  CiaConversationProof,
  CiaHumanTask,
  CiaInputSession,
  CiaProof,
  CiaSurfaceResponse,
  CiaWorkItem,
} from './cia.types';

export type {
  CiaAccountApproval,
  CiaAccountRuntime,
  CiaCapabilityRegistry,
  CiaCapabilityRegistryItem,
  CiaCognitiveHighlight,
  CiaConversationActionRegistry,
  CiaConversationProof,
  CiaHumanTask,
  CiaInputSession,
  CiaInsight,
  CiaMarketSignal,
  CiaProof,
  CiaSurfaceResponse,
  CiaWorkItem,
} from './cia.types';

const invalidateCia = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/cia'));

/** Cia api. */
export const ciaApi = {
  getSurface: (workspaceId: string) => {
    return apiFetch<CiaSurfaceResponse>(`/cia/surface/${encodeURIComponent(workspaceId)}`);
  },

  activateAutopilotTotal: async (workspaceId: string, limit?: number) => {
    const res = await apiFetch<Record<string, unknown>>(
      `/cia/autopilot-total/${encodeURIComponent(workspaceId)}`,
      {
        method: 'POST',
        body: { limit },
      },
    );
    invalidateCia();
    return res;
  },

  getHumanTasks: (workspaceId: string) => {
    return apiFetch<CiaHumanTask[]>(`/cia/human-tasks/${encodeURIComponent(workspaceId)}`);
  },

  approveHumanTask: async (
    workspaceId: string,
    taskId: string,
    body?: { message?: string; resume?: boolean },
  ) => {
    const res = await apiFetch<Record<string, unknown>>(
      `/cia/human-tasks/${encodeURIComponent(workspaceId)}/${encodeURIComponent(taskId)}/approve`,
      {
        method: 'POST',
        body: body || {},
      },
    );
    invalidateCia();
    return res;
  },

  rejectHumanTask: async (workspaceId: string, taskId: string) => {
    const res = await apiFetch<Record<string, unknown>>(
      `/cia/human-tasks/${encodeURIComponent(workspaceId)}/${encodeURIComponent(taskId)}/reject`,
      {
        method: 'POST',
      },
    );
    invalidateCia();
    return res;
  },

  resumeConversation: async (workspaceId: string, conversationId: string) => {
    const res = await apiFetch<Record<string, unknown>>(
      `/cia/conversations/${encodeURIComponent(workspaceId)}/${encodeURIComponent(conversationId)}/resume`,
      {
        method: 'POST',
      },
    );
    invalidateCia();
    return res;
  },

  // --- New advanced endpoints ---

  getAccountRuntime: (workspaceId: string) => {
    return apiFetch<CiaAccountRuntime>(`/cia/account-runtime/${encodeURIComponent(workspaceId)}`);
  },

  getCapabilityRegistry: () => {
    return apiFetch<CiaCapabilityRegistry>('/cia/capability-registry');
  },

  getConversationActionRegistry: () => {
    return apiFetch<CiaConversationActionRegistry>('/cia/conversation-action-registry');
  },

  getAccountApprovals: (workspaceId: string) => {
    return apiFetch<CiaAccountApproval[]>(
      `/cia/account-approvals/${encodeURIComponent(workspaceId)}`,
    );
  },

  approveAccountApproval: async (workspaceId: string, approvalId: string) => {
    const res = await apiFetch<Record<string, unknown>>(
      `/cia/account-approvals/${encodeURIComponent(workspaceId)}/${encodeURIComponent(approvalId)}/approve`,
      { method: 'POST' },
    );
    invalidateCia();
    return res;
  },

  rejectAccountApproval: async (workspaceId: string, approvalId: string) => {
    const res = await apiFetch<Record<string, unknown>>(
      `/cia/account-approvals/${encodeURIComponent(workspaceId)}/${encodeURIComponent(approvalId)}/reject`,
      { method: 'POST' },
    );
    invalidateCia();
    return res;
  },

  getAccountInputSessions: (workspaceId: string) => {
    return apiFetch<CiaInputSession[]>(
      `/cia/account-input-sessions/${encodeURIComponent(workspaceId)}`,
    );
  },

  respondToInputSession: async (workspaceId: string, sessionId: string, answer: string) => {
    const res = await apiFetch<Record<string, unknown>>(
      `/cia/account-input-sessions/${encodeURIComponent(workspaceId)}/${encodeURIComponent(sessionId)}/respond`,
      {
        method: 'POST',
        body: { answer },
      },
    );
    invalidateCia();
    return res;
  },

  getAccountWorkItems: (workspaceId: string) => {
    return apiFetch<CiaWorkItem[]>(`/cia/account-work-items/${encodeURIComponent(workspaceId)}`);
  },

  getAccountProof: (workspaceId: string) => {
    return apiFetch<CiaProof>(`/cia/account-proof/${encodeURIComponent(workspaceId)}`);
  },

  getCycleProof: (workspaceId: string) => {
    return apiFetch<CiaProof>(`/cia/cycle-proof/${encodeURIComponent(workspaceId)}`);
  },

  getConversationProof: (workspaceId: string, conversationId: string) => {
    return apiFetch<CiaConversationProof>(
      `/cia/conversation-proof/${encodeURIComponent(workspaceId)}/${encodeURIComponent(conversationId)}`,
    );
  },
};

/** Autostart cia. */
export async function autostartCia(workspaceId: string, limit?: number) {
  const res = await ciaApi.activateAutopilotTotal(workspaceId, limit);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data;
}
