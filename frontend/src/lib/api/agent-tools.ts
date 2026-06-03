import { tokenStorage, apiFetch } from './core';

export interface AIToolInfo {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  lastUsed?: string;
  usageCount?: number;
}

type AgentToolsResponse = {
  tools?: unknown;
};

type AgentToolWire = Record<string, unknown>;

function confirmedAIToolsPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object' && Array.isArray((data as AgentToolsResponse).tools)) {
    return (data as { tools: unknown[] }).tools;
  }
  throw new Error('AI tools did not return a confirmed payload');
}

function normalizeAITool(tool: unknown): AIToolInfo {
  if (!tool || typeof tool !== 'object') {
    throw new Error('AI tools did not return a confirmed payload');
  }
  const row = tool as AgentToolWire;
  if (
    typeof row.name !== 'string' ||
    typeof row.description !== 'string' ||
    typeof row.category !== 'string'
  ) {
    throw new Error('AI tools did not return a confirmed payload');
  }

  return {
    name: row.name,
    description: row.description,
    category: row.category,
    enabled: typeof row.enabled === 'boolean' ? row.enabled : true,
    ...(typeof row.lastUsed === 'string' ? { lastUsed: row.lastUsed } : {}),
    ...(typeof row.usageCount === 'number' ? { usageCount: row.usageCount } : {}),
  };
}

export async function listAITools(_token?: string, workspaceId?: string): Promise<AIToolInfo[]> {
  const wsId = workspaceId || tokenStorage.getWorkspaceId();
  if (!wsId) {
    throw new Error('Workspace id is required to list AI tools');
  }

  const res = await apiFetch<AgentToolsResponse | AIToolInfo[]>(
    `/kloel/agent/${encodeURIComponent(wsId)}/tools`,
  );
  if (res.error) {
    throw new Error(res.error);
  }
  if (res.status >= 400) {
    throw new Error('Failed to list AI tools');
  }
  return confirmedAIToolsPayload(res.data).map(normalizeAITool);
}
