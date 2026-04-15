// Flow interfaces and functions
import { mutate } from 'swr';
import { apiFetch, buildQuery } from './core';

const invalidateFlows = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/flows'));

export type FlowPrimitive = string | number | boolean | null;
export type FlowJsonValue =
  | FlowPrimitive
  | FlowJsonValue[]
  | { [key: string]: FlowJsonValue | undefined };

export interface FlowNode {
  id: string;
  type?: string;
  data?: Record<string, FlowJsonValue | undefined>;
  position?: { x: number; y: number };
  [key: string]: FlowJsonValue | undefined | Record<string, FlowJsonValue | undefined>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  type?: string;
  [key: string]: FlowJsonValue | undefined;
}

export interface Flow {
  id: string;
  name?: string;
  description?: string;
  isActive?: boolean;
  triggerType?: string;
  triggerCondition?: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FlowLogEntry {
  nodeId?: string;
  type?: string;
  message?: string;
  timestamp?: string;
  data?: Record<string, FlowJsonValue | undefined>;
}

export interface FlowExecutionLog {
  createdAt: string;
  logs: FlowLogEntry[];
}

export type FlowExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'WAITING_INPUT';

export interface FlowExecutionSummary {
  id: string;
  status: FlowExecutionStatus | string;
  currentNodeId?: string | null;
  state?: Record<string, FlowJsonValue | undefined> | null;
  logs?: FlowLogEntry[] | null;
  contact?: {
    name?: string | null;
    phone?: string | null;
  } | null;
  flow?: {
    name?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlowRunResult {
  executionId?: string;
  status?: FlowExecutionStatus | string;
  state?: Record<string, FlowJsonValue | undefined>;
  logs?: FlowLogEntry[];
}

export interface FlowVersion {
  id: string;
  flowId: string;
  workspaceId: string;
  label?: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt: string;
}

export interface FlowOptimizeResult {
  suggestions?: Array<{
    nodeId?: string;
    type?: string;
    message: string;
    severity?: 'info' | 'warning' | 'critical';
  }>;
  improvedFlow?: Pick<Flow, 'nodes' | 'edges'>;
}

export async function getFlowTemplates(): Promise<FlowTemplate[]> {
  const res = await apiFetch<FlowTemplate[]>(`/flows/templates`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

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
  if (res.error) throw new Error(res.error);
  invalidateFlows();
  return res.data;
}

export async function runSavedFlow(
  workspaceId: string,
  flowId: string,
  body: { startNode: string; user: string; flow?: Flow },
): Promise<FlowRunResult | undefined> {
  const res = await apiFetch<FlowRunResult>(`/flows/${workspaceId}/${flowId}/run`, {
    method: 'POST',
    body: body,
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function saveFlow(
  workspaceId: string,
  flowId: string,
  flow: Flow,
): Promise<Flow | undefined> {
  const res = await apiFetch<Flow>(`/flows/save/${workspaceId}/${flowId}`, {
    method: 'POST',
    body: flow,
  });
  if (res.error) throw new Error(res.error);
  invalidateFlows();
  return res.data;
}

export async function updateFlow(
  workspaceId: string,
  flowId: string,
  flow: Flow,
): Promise<Flow | undefined> {
  const res = await apiFetch<Flow>(`/flows/${workspaceId}/${flowId}`, {
    method: 'PUT',
    body: flow,
  });
  if (res.error) throw new Error(res.error);
  invalidateFlows();
  return res.data;
}

export async function createFlowVersion(
  workspaceId: string,
  flowId: string,
  payload: { nodes: FlowNode[]; edges: FlowEdge[]; label?: string },
): Promise<FlowVersion | undefined> {
  const res = await apiFetch<FlowVersion>(`/flows/version/${workspaceId}/${flowId}`, {
    method: 'POST',
    body: payload,
  });
  if (res.error) throw new Error(res.error);
  invalidateFlows();
  return res.data;
}

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
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function getFlowLogs(
  workspaceId: string,
  flowId: string,
): Promise<FlowExecutionLog[]> {
  const res = await apiFetch<FlowExecutionLog[]>(`/flows/log/${workspaceId}/${flowId}`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function listFlows(workspaceId: string): Promise<Flow[]> {
  const res = await apiFetch<Flow[]>(`/flows/${workspaceId}`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function getFlow(workspaceId: string, flowId: string): Promise<Flow> {
  const res = await apiFetch<Flow>(`/flows/${workspaceId}/${flowId}`);
  if (res.error) throw new Error(res.error);
  return res.data as Flow;
}

export async function listFlowExecutions(
  workspaceId: string,
  limit = 50,
): Promise<FlowExecutionSummary[]> {
  const res = await apiFetch<FlowExecutionSummary[]>(
    `/flows/${workspaceId}/executions${buildQuery({ limit })}`,
  );
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function getFlowExecution(
  executionId: string,
): Promise<FlowExecutionSummary | undefined> {
  const res = await apiFetch<FlowExecutionSummary>(`/flows/execution/${executionId}`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function retryFlowExecution(
  executionId: string,
): Promise<FlowExecutionSummary | undefined> {
  const res = await apiFetch<FlowExecutionSummary>(`/flows/execution/${executionId}/retry`, {
    method: 'POST',
  });
  if (res.error) throw new Error(res.error);
  invalidateFlows();
  return res.data;
}

export async function listFlowVersions(
  workspaceId: string,
  flowId: string,
): Promise<FlowVersion[]> {
  const res = await apiFetch<FlowVersion[]>(`/flows/${workspaceId}/${flowId}/versions`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function getFlowVersion(
  workspaceId: string,
  flowId: string,
  versionId: string,
): Promise<FlowVersion | undefined> {
  const res = await apiFetch<FlowVersion>(`/flows/${workspaceId}/${flowId}/versions/${versionId}`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function createFlowFromTemplate(
  workspaceId: string,
  templateId: string,
  payload: { flowId?: string; name?: string },
): Promise<Flow | undefined> {
  const res = await apiFetch<Flow>(`/flows/${workspaceId}/from-template/${templateId}`, {
    method: 'POST',
    body: payload,
  });
  if (res.error) throw new Error(res.error);
  invalidateFlows();
  return res.data;
}

// ============================================
// Flow Templates (GET /flow-templates/*)
// ============================================

export interface FlowTemplate {
  id: string;
  name: string;
  category: string;
  description?: string;
  isPublic?: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  downloads?: number;
  createdAt?: string;
}

/**
 * GET /flow-templates/public — publicly available templates (no auth required)
 */
export async function listPublicFlowTemplates(): Promise<FlowTemplate[]> {
  const res = await apiFetch<FlowTemplate[]>('/flow-templates/public');
  if (res.error) throw new Error(res.error);
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * GET /flow-templates — all templates (admin only)
 */
export async function listAllFlowTemplates(): Promise<FlowTemplate[]> {
  const res = await apiFetch<FlowTemplate[]>('/flow-templates');
  if (res.error) throw new Error(res.error);
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * GET /flow-templates/:id — single template by id
 */
export async function getFlowTemplate(id: string): Promise<FlowTemplate> {
  const res = await apiFetch<FlowTemplate>(`/flow-templates/${encodeURIComponent(id)}`);
  if (res.error) throw new Error(res.error);
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
  if (res.error) throw new Error(res.error);
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
  if (res.error) throw new Error(res.error);
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
  if (res.error) throw new Error(res.error);
  invalidateFlows();
  return res.data;
}
