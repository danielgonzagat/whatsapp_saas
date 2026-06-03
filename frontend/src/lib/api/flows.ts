// Flow API client — runtime functions only. Pure type declarations
// live in `./flows.types` (extracted in Wave 86). The re-export below
// preserves the legacy public API: every type previously imported from
// `@/lib/api/flows` continues to resolve here.
import { mutate } from 'swr';
import { apiFetch, buildQuery } from './core';
import type {
  Flow,
  FlowEdge,
  FlowExecutionLog,
  FlowExecutionSummary,
  FlowLogEntry,
  FlowNode,
  FlowOptimizeResult,
  FlowRunResult,
  FlowTemplate,
  FlowVersion,
} from './flows.types';

export type {
  Flow,
  FlowEdge,
  FlowExecutionLog,
  FlowExecutionStatus,
  FlowExecutionSummary,
  FlowJsonValue,
  FlowLogEntry,
  FlowNode,
  FlowOptimizeResult,
  FlowPrimitive,
  FlowRunResult,
  FlowTemplate,
  FlowVersion,
} from './flows.types';

const invalidateFlows = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/flows'));

type FlowApiEnvelope<T> = {
  data?: T;
  error?: string;
  status?: number;
};

function confirmFlowPayload<T>(
  res: FlowApiEnvelope<T>,
  fallbackError: string,
  missingPayloadError: string,
): T {
  if (res.error) {
    throw new Error(res.error);
  }
  if (typeof res.status === 'number' && res.status >= 400) {
    throw new Error(fallbackError);
  }
  if (res.data === undefined || res.data === null) {
    throw new Error(missingPayloadError);
  }
  return res.data;
}

function confirmFlowListPayload<T>(
  res: FlowApiEnvelope<T[]>,
  fallbackError: string,
  missingPayloadError: string,
): T[] {
  const data = confirmFlowPayload(res, fallbackError, missingPayloadError);
  if (!Array.isArray(data)) {
    throw new Error(missingPayloadError);
  }
  return data;
}

/** Get flow templates. */
export async function getFlowTemplates(): Promise<FlowTemplate[]> {
  const res = await apiFetch<FlowTemplate[]>(`/flows/templates`);
  return confirmFlowListPayload(
    res,
    'Failed to load flow templates',
    'Flow templates did not return a confirmed payload',
  );
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to run flow');
  }
  if (!res.data) {
    throw new Error('Flow run did not return a confirmed payload');
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to run saved flow');
  }
  if (!res.data) {
    throw new Error('Saved flow run did not return a confirmed payload');
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to save flow');
  }
  if (!res.data) {
    throw new Error('Flow save did not return a confirmed payload');
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to update flow');
  }
  if (!res.data) {
    throw new Error('Flow update did not return a confirmed payload');
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to create flow version');
  }
  if (!res.data) {
    throw new Error('Flow version creation did not return a confirmed payload');
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to log flow execution');
  }
  if (!res.data?.ok) {
    throw new Error('Flow execution log did not return confirmed ok');
  }
  return res.data;
}

/** Get flow logs. */
export async function getFlowLogs(
  workspaceId: string,
  flowId: string,
): Promise<FlowExecutionLog[]> {
  const res = await apiFetch<FlowExecutionLog[]>(`/flows/log/${workspaceId}/${flowId}`);
  return confirmFlowListPayload(
    res,
    'Failed to load flow logs',
    'Flow logs did not return a confirmed payload',
  );
}

/** List flows. */
export async function listFlows(workspaceId: string): Promise<Flow[]> {
  const res = await apiFetch<Flow[]>(`/flows/${workspaceId}`);
  return confirmFlowListPayload(
    res,
    'Failed to load flows',
    'Flow list did not return a confirmed payload',
  );
}

/** Get flow. */
export async function getFlow(workspaceId: string, flowId: string): Promise<Flow> {
  const res = await apiFetch<Flow>(`/flows/${workspaceId}/${flowId}`);
  return confirmFlowPayload(
    res,
    'Failed to load flow',
    'Flow did not return a confirmed payload',
  );
}

/** List flow executions. */
export async function listFlowExecutions(
  workspaceId: string,
  limit = 50,
): Promise<FlowExecutionSummary[]> {
  const res = await apiFetch<FlowExecutionSummary[]>(
    '/flows/' + workspaceId + '/executions' + buildQuery({ limit }),
  );
  return confirmFlowListPayload(
    res,
    'Failed to load flow executions',
    'Flow executions did not return a confirmed payload',
  );
}

/** Get flow execution. */
export async function getFlowExecution(executionId: string): Promise<FlowExecutionSummary> {
  const res = await apiFetch<FlowExecutionSummary>(`/flows/execution/${executionId}`);
  return confirmFlowPayload(
    res,
    'Failed to load flow execution',
    'Flow execution did not return a confirmed payload',
  );
}

/** Retry flow execution. */
export async function retryFlowExecution(
  executionId: string,
): Promise<FlowExecutionSummary | undefined> {
  const res = await apiFetch<FlowExecutionSummary>(`/flows/execution/${executionId}/retry`, {
    method: 'POST',
  });
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to retry flow execution');
  }
  if (!res.data) {
    throw new Error('Flow execution retry did not return a confirmed payload');
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
  return confirmFlowListPayload(
    res,
    'Failed to load flow versions',
    'Flow versions did not return a confirmed payload',
  );
}

/** Get flow version. */
export async function getFlowVersion(
  workspaceId: string,
  flowId: string,
  versionId: string,
): Promise<FlowVersion> {
  const res = await apiFetch<FlowVersion>(`/flows/${workspaceId}/${flowId}/versions/${versionId}`);
  return confirmFlowPayload(
    res,
    'Failed to load flow version',
    'Flow version did not return a confirmed payload',
  );
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to create flow from template');
  }
  if (!res.data) {
    throw new Error('Flow template instantiation did not return a confirmed payload');
  }
  invalidateFlows();
  return res.data;
}

// ============================================
// Flow Templates (GET /flow-templates/*)
// ============================================

/**
 * GET /flow-templates/public — publicly available templates (no auth required)
 */
export async function listPublicFlowTemplates(): Promise<FlowTemplate[]> {
  const res = await apiFetch<FlowTemplate[]>('/flow-templates/public');
  return confirmFlowListPayload(
    res,
    'Failed to load public flow templates',
    'Public flow templates did not return a confirmed payload',
  );
}

/**
 * GET /flow-templates — all templates (admin only)
 */
export async function listAllFlowTemplates(): Promise<FlowTemplate[]> {
  const res = await apiFetch<FlowTemplate[]>('/flow-templates');
  return confirmFlowListPayload(
    res,
    'Failed to load flow templates',
    'Flow templates did not return a confirmed payload',
  );
}

/**
 * GET /flow-templates/:id — single template by id
 */
export async function getFlowTemplate(id: string): Promise<FlowTemplate> {
  const res = await apiFetch<FlowTemplate>(`/flow-templates/${encodeURIComponent(id)}`);
  return confirmFlowPayload(
    res,
    'Failed to load flow template',
    'Flow template did not return a confirmed payload',
  );
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to create flow template');
  }
  if (!res.data) {
    throw new Error('Flow template creation did not return a confirmed payload');
  }
  invalidateFlows();
  return res.data;
}

/**
 * POST /flow-templates/:id/download — increment download count and get template nodes/edges
 */
export async function downloadFlowTemplate(id: string): Promise<FlowTemplate> {
  const res = await apiFetch<FlowTemplate>(`/flow-templates/${encodeURIComponent(id)}/download`, {
    method: 'POST',
  });
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to download flow template');
  }
  if (!res.data) {
    throw new Error('Flow template download did not return a confirmed payload');
  }
  return res.data;
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
  if (res.error || res.status >= 400) {
    throw new Error(res.error || 'Failed to optimize flow');
  }
  if (!res.data) {
    throw new Error('Flow optimization did not return a confirmed payload');
  }
  invalidateFlows();
  return res.data;
}
