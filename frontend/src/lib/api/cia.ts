// ciaApi object and related interfaces
import { apiFetch } from './core';

export interface CiaSurfaceResponse {
  title: string;
  subtitle: string;
  workspaceName?: string | null;
  state: string;
  today: {
    soldAmount: number;
    activeConversations: number;
    pendingPayments: number;
  };
  now: {
    message: string;
    phase?: string | null;
    type: string;
    ts?: string;
  } | null;
  recent: Array<{
    type: string;
    message: string;
    phase?: string | null;
    ts?: string;
    meta?: Record<string, any>;
  }>;
  businessState?: Record<string, any> | null;
  humanTasks?: CiaHumanTask[];
  cognition?: CiaCognitiveHighlight[];
  marketSignals?: any[];
  insights?: any[];
  runtime?: Record<string, any> | null;
  autonomy?: Record<string, any> | null;
}

export interface CiaCognitiveHighlight {
  id: string;
  category: string;
  type?: string | null;
  contactId?: string | null;
  conversationId?: string | null;
  phone?: string | null;
  summary: string;
  nextBestAction?: string | null;
  intent?: string | null;
  stage?: string | null;
  outcome?: string | null;
  confidence?: number | null;
  updatedAt?: string | null;
}

export interface CiaHumanTask {
  id: string;
  taskType: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  suggestedReply?: string;
  businessImpact?: string;
  contactId?: string;
  phone?: string;
  conversationId?: string | null;
  status?: 'OPEN' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  resolvedAt?: string;
  approvedReply?: string | null;
  createdAt: string;
}

export const ciaApi = {
  getSurface: (workspaceId: string) => {
    return apiFetch<CiaSurfaceResponse>(
      `/cia/surface/${encodeURIComponent(workspaceId)}`,
    );
  },

  activateAutopilotTotal: (workspaceId: string, limit?: number) => {
    return apiFetch<any>(`/cia/autopilot-total/${encodeURIComponent(workspaceId)}`, {
      method: 'POST',
      body: { limit },
    });
  },

  getHumanTasks: (workspaceId: string) => {
    return apiFetch<CiaHumanTask[]>(
      `/cia/human-tasks/${encodeURIComponent(workspaceId)}`,
    );
  },

  approveHumanTask: (
    workspaceId: string,
    taskId: string,
    body?: { message?: string; resume?: boolean },
  ) => {
    return apiFetch<any>(
      `/cia/human-tasks/${encodeURIComponent(workspaceId)}/${encodeURIComponent(taskId)}/approve`,
      {
        method: 'POST',
        body: body || {},
      },
    );
  },

  rejectHumanTask: (workspaceId: string, taskId: string) => {
    return apiFetch<any>(
      `/cia/human-tasks/${encodeURIComponent(workspaceId)}/${encodeURIComponent(taskId)}/reject`,
      {
        method: 'POST',
      },
    );
  },

  resumeConversation: (workspaceId: string, conversationId: string) => {
    return apiFetch<any>(
      `/cia/conversations/${encodeURIComponent(workspaceId)}/${encodeURIComponent(conversationId)}/resume`,
      {
        method: 'POST',
      },
    );
  },
};

export async function autostartCia(workspaceId: string, limit?: number) {
  const res = await ciaApi.activateAutopilotTotal(workspaceId, limit);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data;
}
