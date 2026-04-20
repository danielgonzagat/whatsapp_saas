'use client';

import { api } from '@/lib/api';
import type {
  FlowExecutionSummary,
  FlowJsonValue,
  FlowLogEntry,
  FlowRunResult,
  FlowTemplate,
  Flow as LibFlow,
} from '@/lib/api/flows';
import { useCallback, useState } from 'react';
import type { Edge, Node } from 'reactflow';

/** Flow shape. */
export interface Flow {
  id: string;
  name: string;
  description?: string;
  nodes: Node[];
  edges: Edge[];
  isActive: boolean;
  triggerType: string;
  triggerCondition?: string;
  createdAt: string;
  updatedAt: string;
}

/** Flow execution shape. */
export interface FlowExecution {
  id: string;
  status: string;
  currentNodeId?: string;
  state?: Record<string, FlowJsonValue | undefined>;
  logs?: FlowLogEntry[];
  contact: {
    name: string;
    phone: string;
  };
  flow: {
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message || fallback;
  }
  if (typeof err === 'string') {
    return err || fallback;
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message || fallback;
    }
  }
  return fallback;
}

/** Use flows. */
export function useFlows(workspaceId?: string) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFlows = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<Flow[]>(`/flows/${workspaceId}`);
      setFlows(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(errorMessage(err, 'Erro ao carregar fluxos'));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchFlow = useCallback(
    async (flowId: string): Promise<Flow | null> => {
      if (!workspaceId) {
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await api.get<Flow>(`/flows/${workspaceId}/${flowId}`);
        return response.data ?? null;
      } catch (err) {
        setError(errorMessage(err, 'Erro ao carregar fluxo'));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [workspaceId],
  );

  const saveFlow = useCallback(
    async (
      flowId: string,
      data: { nodes: Node[]; edges: Edge[]; name: string },
    ): Promise<LibFlow | undefined> => {
      if (!workspaceId) {
        throw new Error('Workspace não definido');
      }
      setLoading(true);
      setError(null);
      try {
        const response = await api.post<LibFlow>(`/flows/save/${workspaceId}/${flowId}`, data);
        return response.data;
      } catch (err) {
        setError(errorMessage(err, 'Erro ao salvar fluxo'));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [workspaceId],
  );

  const runFlow = useCallback(
    async (
      flowId: string,
      user: string,
      startNode?: string,
    ): Promise<FlowRunResult | undefined> => {
      if (!workspaceId) {
        throw new Error('Workspace não definido');
      }
      setLoading(true);
      setError(null);
      try {
        const flow = await fetchFlow(flowId);
        if (!flow) {
          throw new Error('Fluxo não encontrado');
        }

        // Find start node if not specified
        const effectiveStartNode =
          startNode || flow.nodes.find((n: Node) => n.type === 'start')?.id || flow.nodes[0]?.id;

        const response = await api.post<FlowRunResult>(`/flows/${workspaceId}/${flowId}/run`, {
          flow: {
            nodes: flow.nodes,
            edges: flow.edges,
            name: flow.name,
          },
          startNode: effectiveStartNode,
          user,
          flowId,
        });
        return response.data;
      } catch (err) {
        setError(errorMessage(err, 'Erro ao executar fluxo'));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, fetchFlow],
  );

  const fetchExecutions = useCallback(
    async (limit = 50): Promise<FlowExecutionSummary[]> => {
      if (!workspaceId) {
        return [];
      }
      setLoading(true);
      setError(null);
      try {
        const response = await api.get<FlowExecutionSummary[]>(
          `/flows/${workspaceId}/executions?limit=${limit}`,
        );
        return Array.isArray(response.data) ? response.data : [];
      } catch (err) {
        setError(errorMessage(err, 'Erro ao carregar execuções'));
        return [];
      } finally {
        setLoading(false);
      }
    },
    [workspaceId],
  );

  const fetchExecution = useCallback(
    async (executionId: string): Promise<FlowExecutionSummary | null> => {
      if (!workspaceId) {
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await api.get<FlowExecutionSummary>(`/flows/execution/${executionId}`);
        return response.data ?? null;
      } catch (err) {
        setError(errorMessage(err, 'Erro ao carregar execução'));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [workspaceId],
  );

  const fetchTemplates = useCallback(async (): Promise<FlowTemplate[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<FlowTemplate[]>('/flows/templates');
      return Array.isArray(response.data) ? response.data : [];
    } catch (err) {
      setError(errorMessage(err, 'Erro ao carregar templates'));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createFromTemplate = useCallback(
    async (templateId: string, name: string): Promise<LibFlow | undefined> => {
      if (!workspaceId) {
        throw new Error('Workspace não definido');
      }
      setLoading(true);
      setError(null);
      try {
        const response = await api.post<LibFlow>(`/flows/${workspaceId}/from-template`, {
          templateId,
          name,
        });
        return response.data;
      } catch (err) {
        setError(errorMessage(err, 'Erro ao criar fluxo a partir de template'));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [workspaceId],
  );

  return {
    flows,
    loading,
    error,
    fetchFlows,
    fetchFlow,
    saveFlow,
    runFlow,
    fetchExecutions,
    fetchExecution,
    fetchTemplates,
    createFromTemplate,
  };
}
