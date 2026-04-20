// ciaApi object and related interfaces
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidateCia = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/cia'));

/** Cia market signal shape. */
export interface CiaMarketSignal {
  /** Id property. */
  id?: string;
  /** Normalized key property. */
  normalizedKey?: string;
  /** Frequency property. */
  frequency?: number;
  /** Category property. */
  category?: string;
  /** Updated at property. */
  updatedAt?: string;
  [extra: string]: unknown;
}

/** Cia insight shape. */
export interface CiaInsight {
  /** Id property. */
  id?: string;
  /** Type property. */
  type?: string;
  /** Title property. */
  title?: string;
  /** Description property. */
  description?: string;
  /** Severity property. */
  severity?: string;
  [extra: string]: unknown;
}

/** Cia surface response shape. */
export interface CiaSurfaceResponse {
  /** Title property. */
  title: string;
  /** Subtitle property. */
  subtitle: string;
  /** Workspace name property. */
  workspaceName?: string | null;
  /** State property. */
  state: string;
  /** Today property. */
  today: {
    soldAmount: number;
    activeConversations: number;
    pendingPayments: number;
  };
  /** Now property. */
  now: {
    message: string;
    phase?: string | null;
    type: string;
    ts?: string;
  } | null;
  /** Recent property. */
  recent: Array<{
    type: string;
    message: string;
    phase?: string | null;
    ts?: string;
    meta?: Record<string, unknown>;
  }>;
  /** Business state property. */
  businessState?: Record<string, unknown> | null;
  /** Human tasks property. */
  humanTasks?: CiaHumanTask[];
  /** Cognition property. */
  cognition?: CiaCognitiveHighlight[];
  /** Market signals property. */
  marketSignals?: CiaMarketSignal[];
  /** Insights property. */
  insights?: CiaInsight[];
  /** Runtime property. */
  runtime?: Record<string, unknown> | null;
  /** Autonomy property. */
  autonomy?: Record<string, unknown> | null;
}

/** Cia cognitive highlight shape. */
export interface CiaCognitiveHighlight {
  /** Id property. */
  id: string;
  /** Category property. */
  category: string;
  /** Type property. */
  type?: string | null;
  /** Contact id property. */
  contactId?: string | null;
  /** Conversation id property. */
  conversationId?: string | null;
  /** Phone property. */
  phone?: string | null;
  /** Summary property. */
  summary: string;
  /** Next best action property. */
  nextBestAction?: string | null;
  /** Intent property. */
  intent?: string | null;
  /** Stage property. */
  stage?: string | null;
  /** Outcome property. */
  outcome?: string | null;
  /** Confidence property. */
  confidence?: number | null;
  /** Updated at property. */
  updatedAt?: string | null;
}

/** Cia human task shape. */
export interface CiaHumanTask {
  /** Id property. */
  id: string;
  /** Task type property. */
  taskType: string;
  /** Urgency property. */
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Reason property. */
  reason: string;
  /** Suggested reply property. */
  suggestedReply?: string;
  /** Business impact property. */
  businessImpact?: string;
  /** Contact id property. */
  contactId?: string;
  /** Phone property. */
  phone?: string;
  /** Conversation id property. */
  conversationId?: string | null;
  /** Status property. */
  status?: 'OPEN' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  /** Resolved at property. */
  resolvedAt?: string;
  /** Approved reply property. */
  approvedReply?: string | null;
  /** Created at property. */
  createdAt: string;
}

/** Cia account approval shape. */
export interface CiaAccountApproval {
  /** Id property. */
  id: string;
  /** Memory id property. */
  memoryId?: string;
  /** Approval request id property. */
  approvalRequestId?: string;
  /** Kind property. */
  kind: string;
  /** Status property. */
  status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  /** Requested product name property. */
  requestedProductName: string;
  /** Normalized product name property. */
  normalizedProductName: string;
  /** Contact id property. */
  contactId: string | null;
  /** Contact name property. */
  contactName: string | null;
  /** Phone property. */
  phone: string | null;
  /** Conversation id property. */
  conversationId: string | null;
  /** Customer message property. */
  customerMessage: string;
  /** Operator prompt property. */
  operatorPrompt: string;
  /** Source property. */
  source: string;
  /** First detected at property. */
  firstDetectedAt: string;
  /** Last detected at property. */
  lastDetectedAt: string;
  /** Input session id property. */
  inputSessionId?: string | null;
  /** Materialized product id property. */
  materializedProductId?: string | null;
  /** Responded at property. */
  respondedAt?: string | null;
}

/** Cia input session shape. */
export interface CiaInputSession {
  /** Id property. */
  id: string;
  /** Memory id property. */
  memoryId?: string;
  /** Input collection session id property. */
  inputCollectionSessionId?: string;
  /** Approval id property. */
  approvalId: string;
  /** Kind property. */
  kind: string;
  /** Status property. */
  status: 'WAITING_DESCRIPTION' | 'WAITING_OFFERS' | 'WAITING_COMPANY' | 'COMPLETED';
  /** Product name property. */
  productName: string;
  /** Normalized product name property. */
  normalizedProductName: string;
  /** Contact id property. */
  contactId: string | null;
  /** Contact name property. */
  contactName: string | null;
  /** Phone property. */
  phone: string | null;
  /** Customer message property. */
  customerMessage: string;
  /** Current prompt property. */
  currentPrompt?: string;
  /** Answers property. */
  answers: {
    description?: string | null;
    offers?: string | null;
    company?: string | null;
  };
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt: string;
  /** Completed at property. */
  completedAt?: string | null;
  /** Materialized product id property. */
  materializedProductId?: string | null;
}

/** Cia work item shape. */
export interface CiaWorkItem {
  /** Id property. */
  id: string;
  /** Kind property. */
  kind: string;
  /** Entity type property. */
  entityType: string;
  /** Entity id property. */
  entityId: string;
  /** State property. */
  state: 'OPEN' | 'WAITING_APPROVAL' | 'WAITING_INPUT' | 'BLOCKED' | 'COMPLETED';
  /** Title property. */
  title: string;
  /** Summary property. */
  summary: string;
  /** Priority property. */
  priority: number;
  /** Utility property. */
  utility: number;
  /** Requires approval property. */
  requiresApproval: boolean;
  /** Requires input property. */
  requiresInput: boolean;
  /** Approval state property. */
  approvalState?: string | null;
  /** Input state property. */
  inputState?: string | null;
  /** Blocked by property. */
  blockedBy?: Record<string, unknown> | null;
  /** Evidence property. */
  evidence?: Record<string, unknown> | null;
  /** Metadata property. */
  metadata?: Record<string, unknown> | null;
  /** Created at property. */
  createdAt?: string;
  /** Updated at property. */
  updatedAt?: string;
}

/** Cia account runtime shape. */
export interface CiaAccountRuntime {
  /** Objective property. */
  objective: string;
  /** Mode property. */
  mode: string;
  /** Open approval count property. */
  openApprovalCount: number;
  /** Pending input count property. */
  pendingInputCount: number;
  /** Completed approval count property. */
  completedApprovalCount: number;
  /** Open approvals property. */
  openApprovals: CiaAccountApproval[];
  /** Pending inputs property. */
  pendingInputs: CiaInputSession[];
  /** Work items property. */
  workItems: CiaWorkItem[];
  /** Open work item count property. */
  openWorkItemCount: number;
  /** No legal actions property. */
  noLegalActions: boolean;
  /** No legal action reasons property. */
  noLegalActionReasons: string[];
  /** Capability registry version property. */
  capabilityRegistryVersion: string;
  /** Capability count property. */
  capabilityCount: number;
  /** Conversation action registry version property. */
  conversationActionRegistryVersion: string;
  /** Conversation action count property. */
  conversationActionCount: number;
  /** Last meaningful action at property. */
  lastMeaningfulActionAt: string | null;
}

/** Cia capability registry item shape. */
export interface CiaCapabilityRegistryItem {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Description property. */
  description?: string;
  /** Category property. */
  category?: string;
  [key: string]: unknown;
}

/** Cia capability registry shape. */
export interface CiaCapabilityRegistry {
  /** Version property. */
  version: string;
  /** Items property. */
  items: CiaCapabilityRegistryItem[];
}

/** Cia conversation action registry shape. */
export interface CiaConversationActionRegistry {
  /** Version property. */
  version: string;
  /** Items property. */
  items: CiaCapabilityRegistryItem[];
}

/** Cia proof shape. */
export interface CiaProof {
  /** Id property. */
  id: string;
  /** Key property. */
  key?: string;
  /** Type property. */
  type?: string;
  /** Summary property. */
  summary?: string | null;
  /** Cycle proof id property. */
  cycleProofId?: string | null;
  /** Generated at property. */
  generatedAt: string;
  /** Guarantee report property. */
  guaranteeReport?: string | Record<string, unknown> | null;
  /** Exhaustion report property. */
  exhaustionReport?: string | Record<string, unknown> | null;
  /** Proof type property. */
  proofType?: string;
  /** Status property. */
  status?: string;
  /** No legal actions property. */
  noLegalActions?: boolean;
  /** Candidate count property. */
  candidateCount?: number;
  /** Eligible action count property. */
  eligibleActionCount?: number;
  /** Blocked action count property. */
  blockedActionCount?: number;
  /** Deferred action count property. */
  deferredActionCount?: number;
  /** Waiting approval count property. */
  waitingApprovalCount?: number;
  /** Waiting input count property. */
  waitingInputCount?: number;
  /** Silent remainder count property. */
  silentRemainderCount?: number;
  /** Work item universe property. */
  workItemUniverse?: Record<string, unknown>[];
  /** Action universe property. */
  actionUniverse?: Record<string, unknown>[];
  /** Executed actions property. */
  executedActions?: Record<string, unknown>[];
  /** Blocked actions property. */
  blockedActions?: Record<string, unknown>[];
  /** Deferred actions property. */
  deferredActions?: Record<string, unknown>[];
  /** Canonical property. */
  canonical?: boolean;
}

/** Cia conversation proof shape. */
export interface CiaConversationProof {
  /** Id property. */
  id: string;
  /** Canonical property. */
  canonical: boolean;
  /** Conversation id property. */
  conversationId: string;
  /** Contact id property. */
  contactId: string | null;
  /** Phone property. */
  phone: string | null;
  /** Status property. */
  status: string;
  /** Cycle proof id property. */
  cycleProofId: string | null;
  /** Account proof id property. */
  accountProofId: string | null;
  /** Selected action type property. */
  selectedActionType: string;
  /** Selected tactic property. */
  selectedTactic: string | null;
  /** Governor property. */
  governor: string | null;
  /** Rendered message property. */
  renderedMessage: string | null;
  /** Outcome property. */
  outcome: string | null;
  /** Action universe property. */
  actionUniverse: Record<string, unknown>[];
  /** Tactic universe property. */
  tacticUniverse: Record<string, unknown>[];
  /** Selected action property. */
  selectedAction: Record<string, unknown> | null;
  /** Selected tactic data property. */
  selectedTacticData: Record<string, unknown> | null;
  /** Metadata property. */
  metadata: Record<string, unknown> | null;
  /** Generated at property. */
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
