// ciaApi object and related interfaces
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidateCia = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/cia'));

/** Cia market signal shape. */
export interface CiaMarketSignal {
  id?: string;
  normalizedKey?: string;
  frequency?: number;
  category?: string;
  updatedAt?: string;
  [extra: string]: unknown;
}

/** Cia insight shape. */
export interface CiaInsight {
  id?: string;
  type?: string;
  title?: string;
  description?: string;
  severity?: string;
  [extra: string]: unknown;
}

/** Cia surface response shape. */
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
    meta?: Record<string, unknown>;
  }>;
  businessState?: Record<string, unknown> | null;
  humanTasks?: CiaHumanTask[];
  cognition?: CiaCognitiveHighlight[];
  marketSignals?: CiaMarketSignal[];
  insights?: CiaInsight[];
  runtime?: Record<string, unknown> | null;
  autonomy?: Record<string, unknown> | null;
}

/** Cia cognitive highlight shape. */
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

/** Cia human task shape. */
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

/** Cia account approval shape. */
export interface CiaAccountApproval {
  id: string;
  memoryId?: string;
  approvalRequestId?: string;
  kind: string;
  status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  requestedProductName: string;
  normalizedProductName: string;
  contactId: string | null;
  contactName: string | null;
  phone: string | null;
  conversationId: string | null;
  customerMessage: string;
  operatorPrompt: string;
  source: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  inputSessionId?: string | null;
  materializedProductId?: string | null;
  respondedAt?: string | null;
}

/** Cia input session shape. */
export interface CiaInputSession {
  id: string;
  memoryId?: string;
  inputCollectionSessionId?: string;
  approvalId: string;
  kind: string;
  status: 'WAITING_DESCRIPTION' | 'WAITING_OFFERS' | 'WAITING_COMPANY' | 'COMPLETED';
  productName: string;
  normalizedProductName: string;
  contactId: string | null;
  contactName: string | null;
  phone: string | null;
  customerMessage: string;
  currentPrompt?: string;
  answers: {
    description?: string | null;
    offers?: string | null;
    company?: string | null;
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  materializedProductId?: string | null;
}

/** Cia work item shape. */
export interface CiaWorkItem {
  id: string;
  kind: string;
  entityType: string;
  entityId: string;
  state: 'OPEN' | 'WAITING_APPROVAL' | 'WAITING_INPUT' | 'BLOCKED' | 'COMPLETED';
  title: string;
  summary: string;
  priority: number;
  utility: number;
  requiresApproval: boolean;
  requiresInput: boolean;
  approvalState?: string | null;
  inputState?: string | null;
  blockedBy?: Record<string, unknown> | null;
  evidence?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Cia account runtime shape. */
export interface CiaAccountRuntime {
  objective: string;
  mode: string;
  openApprovalCount: number;
  pendingInputCount: number;
  completedApprovalCount: number;
  openApprovals: CiaAccountApproval[];
  pendingInputs: CiaInputSession[];
  workItems: CiaWorkItem[];
  openWorkItemCount: number;
  noLegalActions: boolean;
  noLegalActionReasons: string[];
  capabilityRegistryVersion: string;
  capabilityCount: number;
  conversationActionRegistryVersion: string;
  conversationActionCount: number;
  lastMeaningfulActionAt: string | null;
}

/** Cia capability registry item shape. */
export interface CiaCapabilityRegistryItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  [key: string]: unknown;
}

/** Cia capability registry shape. */
export interface CiaCapabilityRegistry {
  version: string;
  items: CiaCapabilityRegistryItem[];
}

/** Cia conversation action registry shape. */
export interface CiaConversationActionRegistry {
  version: string;
  items: CiaCapabilityRegistryItem[];
}

/** Cia proof shape. */
export interface CiaProof {
  id: string;
  key?: string;
  type?: string;
  summary?: string | null;
  cycleProofId?: string | null;
  generatedAt: string;
  guaranteeReport?: string | Record<string, unknown> | null;
  exhaustionReport?: string | Record<string, unknown> | null;
  proofType?: string;
  status?: string;
  noLegalActions?: boolean;
  candidateCount?: number;
  eligibleActionCount?: number;
  blockedActionCount?: number;
  deferredActionCount?: number;
  waitingApprovalCount?: number;
  waitingInputCount?: number;
  silentRemainderCount?: number;
  workItemUniverse?: Record<string, unknown>[];
  actionUniverse?: Record<string, unknown>[];
  executedActions?: Record<string, unknown>[];
  blockedActions?: Record<string, unknown>[];
  deferredActions?: Record<string, unknown>[];
  canonical?: boolean;
}

/** Cia conversation proof shape. */
export interface CiaConversationProof {
  id: string;
  canonical: boolean;
  conversationId: string;
  contactId: string | null;
  phone: string | null;
  status: string;
  cycleProofId: string | null;
  accountProofId: string | null;
  selectedActionType: string;
  selectedTactic: string | null;
  governor: string | null;
  renderedMessage: string | null;
  outcome: string | null;
  actionUniverse: Record<string, unknown>[];
  tacticUniverse: Record<string, unknown>[];
  selectedAction: Record<string, unknown> | null;
  selectedTacticData: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  generatedAt: string;
}

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
