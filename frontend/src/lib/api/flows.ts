// Flow interfaces and functions
import { apiFetch, buildQuery } from './core';

export interface FlowNode {
  id: string;
  type?: string;
  data?: Record<string, any>;
  [key: string]: any;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  [key: string]: any;
}

export interface Flow {
  id: string;
  name?: string;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  [key: string]: any;
}

export interface FlowExecutionLog {
  createdAt: string;
  logs: any[];
}

export async function getFlowTemplates(): Promise<any[]> {
  const res = await apiFetch<any[]>(`/flows/templates`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function runFlow(body: { workspaceId: string; flow: Flow; startNode: string; user: string; flowId?: string }): Promise<any> {
  const res = await apiFetch<any>(`/flows/run`, {
    method: 'POST',
    body: body,
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function runSavedFlow(
  workspaceId: string,
  flowId: string,
  body: { startNode: string; user: string; flow?: Flow },
): Promise<any> {
  const res = await apiFetch<any>(`/flows/${workspaceId}/${flowId}/run`, {
    method: 'POST',
    body: body,
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function saveFlow(workspaceId: string, flowId: string, flow: Flow): Promise<any> {
  const res = await apiFetch<any>(`/flows/save/${workspaceId}/${flowId}`, {
    method: 'POST',
    body: flow,
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function updateFlow(workspaceId: string, flowId: string, flow: Flow): Promise<any> {
  const res = await apiFetch<any>(`/flows/${workspaceId}/${flowId}`, {
    method: 'PUT',
    body: flow,
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function createFlowVersion(
  workspaceId: string,
  flowId: string,
  payload: { nodes: FlowNode[]; edges: FlowEdge[]; label?: string },
): Promise<any> {
  const res = await apiFetch<any>(`/flows/version/${workspaceId}/${flowId}`, {
    method: 'POST',
    body: payload,
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function logFlowExecution(workspaceId: string, flowId: string, logs: any[], user?: string): Promise<any> {
  const res = await apiFetch<any>(`/flows/log/${workspaceId}/${flowId}`, {
    method: 'POST',
    body: { logs, user },
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function getFlowLogs(workspaceId: string, flowId: string): Promise<FlowExecutionLog[]> {
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

export async function listFlowExecutions(workspaceId: string, limit = 50): Promise<any[]> {
  const res = await apiFetch<any[]>(`/flows/${workspaceId}/executions${buildQuery({ limit })}`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function getFlowExecution(executionId: string): Promise<any> {
  const res = await apiFetch<any>(`/flows/execution/${executionId}`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function retryFlowExecution(executionId: string): Promise<any> {
  const res = await apiFetch<any>(`/flows/execution/${executionId}/retry`, { method: 'POST' });
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function listFlowVersions(workspaceId: string, flowId: string): Promise<any[]> {
  const res = await apiFetch<any[]>(`/flows/${workspaceId}/${flowId}/versions`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function getFlowVersion(workspaceId: string, flowId: string, versionId: string): Promise<any> {
  const res = await apiFetch<any>(`/flows/${workspaceId}/${flowId}/versions/${versionId}`);
  if (res.error) throw new Error(res.error);
  return res.data;
}

export async function createFlowFromTemplate(
  workspaceId: string,
  templateId: string,
  payload: { flowId?: string; name?: string },
): Promise<any> {
  const res = await apiFetch<any>(`/flows/${workspaceId}/from-template/${templateId}`, {
    method: 'POST',
    body: payload,
  });
  if (res.error) throw new Error(res.error);
  return res.data;
}
