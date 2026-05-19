export type AgentDelegationStatus =
  | 'pending'
  | 'accepted'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentDelegationInput {
  workspaceId: string;
  parentSessionId: string;
  task: string;
  toolScope: string[];
  childSessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentDelegationRecord {
  id: string;
  workspaceId: string;
  parentSessionId: string;
  childSessionId: string | null;
  task: string;
  toolScope: string[];
  status: AgentDelegationStatus;
  resultSummary: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AgentDelegationListResult {
  delegations: AgentDelegationRecord[];
  total: number;
}

export const VALID_STATUSES: ReadonlySet<AgentDelegationStatus> = new Set([
  'pending',
  'accepted',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const TERMINAL_STATUSES: ReadonlySet<AgentDelegationStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

export interface InnerDelegationValue {
  kind: 'agent_delegation';
  parentSessionId: string;
  childSessionId: string | null;
  task: string;
  toolScope: string[];
  status: AgentDelegationStatus;
  resultSummary: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
