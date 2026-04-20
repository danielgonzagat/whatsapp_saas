// Flow interfaces and functions
import { mutate } from 'swr';
import { apiFetch, buildQuery } from './core';

const invalidateFlows = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/flows'));

/** Flow primitive type. */
export type FlowPrimitive = string | number | boolean | null;
/** Flow json value type. */
export type FlowJsonValue =
  | FlowPrimitive
  | FlowJsonValue[]
  | { [key: string]: FlowJsonValue | undefined };

/** Flow node shape. */
export interface FlowNode {
  /** Id property. */
  id: string;
  /** Type property. */
  type?: string;
  /** Data property. */
  data?: Record<string, FlowJsonValue | undefined>;
  /** Position property. */
  position?: { x: number; y: number };
  [key: string]: FlowJsonValue | undefined | Record<string, FlowJsonValue | undefined>;
}

/** Flow edge shape. */
export interface FlowEdge {
  /** Id property. */
  id: string;
  /** Source property. */
  source: string;
  /** Target property. */
  target: string;
  /** Source handle property. */
  sourceHandle?: string | null;
  /** Target handle property. */
  targetHandle?: string | null;
  /** Label property. */
  label?: string;
  /** Type property. */
  type?: string;
  [key: string]: FlowJsonValue | undefined;
}

/** Flow shape. */
export interface Flow {
  /** Id property. */
  id: string;
  /** Name property. */
  name?: string;
  /** Description property. */
  description?: string;
  /** Is active property. */
  isActive?: boolean;
  /** Trigger type property. */
  triggerType?: string;
  /** Trigger condition property. */
  triggerCondition?: string;
  /** Nodes property. */
  nodes?: FlowNode[];
  /** Edges property. */
  edges?: FlowEdge[];
  /** Created at property. */
  createdAt?: string;
  /** Updated at property. */
  updatedAt?: string;
}

/** Flow log entry shape. */
export interface FlowLogEntry {
  /** Node id property. */
  nodeId?: string;
  /** Type property. */
  type?: string;
  /** Message property. */
  message?: string;
  /** Timestamp property. */
  timestamp?: string;
  /** Data property. */
  data?: Record<string, FlowJsonValue | undefined>;
}

/** Flow execution log shape. */
export interface FlowExecutionLog {
  /** Created at property. */
  createdAt: string;
  /** Logs property. */
  logs: FlowLogEntry[];
}

/** Flow execution status type. */
export type FlowExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'WAITING_INPUT';

/** Flow execution summary shape. */
export interface FlowExecutionSummary {
  /** Id property. */
  id: string;
  /** Status property. */
  status: FlowExecutionStatus | string;
  /** Current node id property. */
  currentNodeId?: string | null;
  /** State property. */
  state?: Record<string, FlowJsonValue | undefined> | null;
  /** Logs property. */
  logs?: FlowLogEntry[] | null;
  /** Contact property. */
  contact?: {
    name?: string | null;
    phone?: string | null;
  } | null;
  /** Flow property. */
  flow?: {
    name?: string | null;
  } | null;
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt: string;
}

/** Flow run result shape. */
export interface FlowRunResult {
  /** Execution id property. */
  executionId?: string;
  /** Status property. */
  status?: FlowExecutionStatus | string;
  /** State property. */
  state?: Record<string, FlowJsonValue | undefined>;
  /** Logs property. */
  logs?: FlowLogEntry[];
}

/** Flow version shape. */
export interface FlowVersion {
  /** Id property. */
  id: string;
  /** Flow id property. */
  flowId: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Label property. */
  label?: string | null;
  /** Nodes property. */
  nodes: FlowNode[];
  /** Edges property. */
  edges: FlowEdge[];
  /** Created at property. */
  createdAt: string;
}

/** Flow optimize result shape. */
export interface FlowOptimizeResult {
  /** Suggestions property. */
  suggestions?: Array<{
    nodeId?: string;
    type?: string;
    message: string;
    severity?: 'info' | 'warning' | 'critical';
  }>;
  /** Improved flow property. */
  improvedFlow?: Pick<Flow, 'nodes' | 'edges'>;
}

/** Get flow templates. */
export async function getFlowTemplates(): Promise<FlowTemplate[]> {
  const res = await apiFetch<FlowTemplate[]>(`/flows/templates`);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data ?? [];
}

/** Run flow. */
export async function runFlow(body: {
  workspaceId: string;
  flow: Flow;
  startNode: string;
  user: string;
  flowId?: string;
}): Promise<FlowRunResult | undefined> {
  const res = await apiFetch<FlowRunResult>(`/flows/run`, {
    method: 'POST',
    body: body,
  });
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateFlows();
  return res.data;
}

/** Run saved flow. */
export async function runSavedFlow(
  workspaceId: string,
  flowId: string,
  body: { startNode: string; user: string; flow?: Flow },
): Promise<FlowRunResult | undefined> {
  const res = await apiFetch<FlowRunResult>(`/flows/${workspaceId}/${flowId}/run`, {
    method: 'POST',
    body: body,
  });
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data;
}

/** Save flow. */
export async function saveFlow(
  workspaceId: string,
  flowId: string,
  flow: Flow,
): Promise<Flow | undefined> {
  const res = await apiFetch<Flow>(`/flows/save/${workspaceId}/${flowId}`, {
    method: 'POST',
    body: flow,
  });
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateFlows();
  return res.data;
}

/** Update flow. */
export async function updateFlow(
  workspaceId: string,
  flowId: string,
  flow: Flow,
): Promise<Flow | undefined> {
  const res = await apiFetch<Flow>(`/flows/${workspaceId}/${flowId}`, {
    method: 'PUT',
    body: flow,
  });
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateFlows();
  return res.data;
}

/** Create flow version. */
export async function createFlowVersion(
  workspaceId: string,
  flowId: string,
  payload: { nodes: FlowNode[]; edges: FlowEdge[]; label?: string },
): Promise<FlowVersion | undefined> {
  const res = await apiFetch<FlowVersion>(`/flows/version/${workspaceId}/${flowId}`, {
    method: 'POST',
    body: payload,
  });
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateFlows();
  return res.data;
}

/** Log flow execution. */
export async function logFlowExecution(
  workspaceId: string,
  flowId: string,
  logs: FlowLogEntry[],
  user?: string,
): Promise<{ ok: boolean } | undefined> {
  const res = await apiFetch<{ ok: boolean }>(`/flows/log/${workspaceId}/${flowId}`, {
    method: 'POST',
    body: { logs, user },
  });
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data;
}

/** Get flow logs. */
export async function getFlowLogs(
  workspaceId: string,
  flowId: string,
): Promise<FlowExecutionLog[]> {
  const res = await apiFetch<FlowExecutionLog[]>(`/flows/log/${workspaceId}/${flowId}`);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data ?? [];
}

/** List flows. */
export async function listFlows(workspaceId: string): Promise<Flow[]> {
  const res = await apiFetch<Flow[]>(`/flows/${workspaceId}`);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data ?? [];
}

/** Get flow. */
export async function getFlow(workspaceId: string, flowId: string): Promise<Flow> {
  const res = await apiFetch<Flow>(`/flows/${workspaceId}/${flowId}`);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data as Flow;
}

/** List flow executions. */
export async function listFlowExecutions(
  workspaceId: string,
  limit = 50,
): Promise<FlowExecutionSummary[]> {
  const res = await apiFetch<FlowExecutionSummary[]>(
    `/flows/${workspaceId}/executions${buildQuery({ limit })}`,
  );
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data ?? [];
}

/** Get flow execution. */
export async function getFlowExecution(
  executionId: string,
): Promise<FlowExecutionSummary | undefined> {
  const res = await apiFetch<FlowExecutionSummary>(`/flows/execution/${executionId}`);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data;
}

/** Retry flow execution. */
export async function retryFlowExecution(
  executionId: string,
): Promise<FlowExecutionSummary | undefined> {
  const res = await apiFetch<FlowExecutionSummary>(`/flows/execution/${executionId}/retry`, {
    method: 'POST',
  });
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateFlows();
  return res.data;
}

/** List flow versions. */
export async function listFlowVersions(
  workspaceId: string,
  flowId: string,
): Promise<FlowVersion[]> {
  const res = await apiFetch<FlowVersion[]>(`/flows/${workspaceId}/${flowId}/versions`);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data ?? [];
}

/** Get flow version. */
export async function getFlowVersion(
  workspaceId: string,
  flowId: string,
  versionId: string,
): Promise<FlowVersion | undefined> {
  const res = await apiFetch<FlowVersion>(`/flows/${workspaceId}/${flowId}/versions/${versionId}`);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data;
}

/** Create flow from template. */
export async function createFlowFromTemplate(
  workspaceId: string,
  templateId: string,
  payload: { flowId?: string; name?: string },
): Promise<Flow | undefined> {
  const res = await apiFetch<Flow>(`/flows/${workspaceId}/from-template/${templateId}`, {
    method: 'POST',
    body: payload,
  });
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateFlows();
  return res.data;
}

// ============================================
// Flow Templates (GET /flow-templates/*)
// ============================================

export interface FlowTemplate {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Category property. */
  category: string;
  /** Description property. */
  description?: string;
  /** Is public property. */
  isPublic?: boolean;
  /** Nodes property. */
  nodes: FlowNode[];
  /** Edges property. */
  edges: FlowEdge[];
  /** Downloads property. */
  downloads?: number;
  /** Created at property. */
  createdAt?: string;
}

/**
 * GET /flow-templates/public — publicly available templates (no auth required)
 */
export async function listPublicFlowTemplates(): Promise<FlowTemplate[]> {
  const res = await apiFetch<FlowTemplate[]>('/flow-templates/public');
  if (res.error) {
    throw new Error(res.error);
  }
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * GET /flow-templates — all templates (admin only)
 */
export async function listAllFlowTemplates(): Promise<FlowTemplate[]> {
  const res = await apiFetch<FlowTemplate[]>('/flow-templates');
  if (res.error) {
    throw new Error(res.error);
  }
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * GET /flow-templates/:id — single template by id
 */
export async function getFlowTemplate(id: string): Promise<FlowTemplate> {
  const res = await apiFetch<FlowTemplate>(`/flow-templates/${encodeURIComponent(id)}`);
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data as FlowTemplate;
}

/**
 * POST /flow-templates — create a new template (admin only)
 */
export async function createFlowTemplate(payload: {
  name: string;
  category: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  description?: string;
  isPublic?: boolean;
}): Promise<FlowTemplate> {
  const res = await apiFetch<FlowTemplate>('/flow-templates', {
    method: 'POST',
    body: payload,
  });
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateFlows();
  return res.data as FlowTemplate;
}

/**
 * POST /flow-templates/:id/download — increment download count and get template nodes/edges
 */
export async function downloadFlowTemplate(id: string): Promise<FlowTemplate> {
  const res = await apiFetch<FlowTemplate>(`/flow-templates/${encodeURIComponent(id)}/download`, {
    method: 'POST',
  });
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data as FlowTemplate;
}

// ============================================
// Flow AI Optimizer (POST /flows/ai/optimize/:flowId)
// ============================================

/**
 * POST /flows/ai/optimize/:flowId — trigger AI optimization for a saved flow
 */
export async function optimizeFlow(flowId: string): Promise<FlowOptimizeResult | undefined> {
  const res = await apiFetch<FlowOptimizeResult>(
    `/flows/ai/optimize/${encodeURIComponent(flowId)}`,
    {
      method: 'POST',
    },
  );
  if (res.error) {
    throw new Error(res.error);
  }
  invalidateFlows();
  return res.data;
}
