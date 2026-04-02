"use client";

import { useState, useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import { api } from '@/lib/api';

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

export interface FlowExecution {
  id: string;
  status: string;
  currentNodeId?: string;
  state?: Record<string, any>;
  logs?: any[];
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

export function useFlows(workspaceId?: string) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFlows = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/flows/${workspaceId}`);
      setFlows(response.data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar fluxos');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchFlow = useCallback(async (flowId: string): Promise<Flow | null> => {
    if (!workspaceId) return null;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/flows/${workspaceId}/${flowId}`);
      return response.data;
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar fluxo');
      return null;
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const saveFlow = useCallback(async (
    flowId: string,
    data: { nodes: Node[]; edges: Edge[]; name: string }
  ) => {
    if (!workspaceId) throw new Error('Workspace não definido');
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`/flows/save/${workspaceId}/${flowId}`, data);
      return response.data;
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar fluxo');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const runFlow = useCallback(async (
    flowId: string,
    user: string,
    startNode?: string
  ) => {
    if (!workspaceId) throw new Error('Workspace não definido');
    setLoading(true);
    setError(null);
    try {
      const flow = await fetchFlow(flowId);
      if (!flow) throw new Error('Fluxo não encontrado');

      // Find start node if not specified
      const effectiveStartNode = startNode || 
        flow.nodes.find((n: any) => n.type === 'start')?.id ||
        flow.nodes[0]?.id;

      const response = await api.post(`/flows/${workspaceId}/${flowId}/run`, {
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
    } catch (err: any) {
      setError(err.message || 'Erro ao executar fluxo');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [workspaceId, fetchFlow]);

  const fetchExecutions = useCallback(async (limit = 50): Promise<FlowExecution[]> => {
    if (!workspaceId) return [];
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/flows/${workspaceId}/executions?limit=${limit}`);
      return response.data;
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar execuções');
      return [];
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchExecution = useCallback(async (executionId: string): Promise<FlowExecution | null> => {
    if (!workspaceId) return null;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/flows/${workspaceId}/executions/${executionId}`);
      return response.data;
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar execução');
      return null;
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/flows/templates');
      return response.data;
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar templates');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createFromTemplate = useCallback(async (templateId: string, name: string) => {
    if (!workspaceId) throw new Error('Workspace não definido');
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`/flows/${workspaceId}/from-template`, {
        templateId,
        name,
      });
      return response.data;
    } catch (err: any) {
      setError(err.message || 'Erro ao criar fluxo a partir de template');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

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
