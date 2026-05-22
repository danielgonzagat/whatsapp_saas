'use client';

import { listFlowExecutions, retryFlowExecution } from '@/lib/api';
import type { FlowExecutionSummary } from '@/lib/api/flows';
import { useCallback, useState } from 'react';

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

export function useFlowExecutions(workspaceId: string | undefined) {
  const [executions, setExecutions] = useState<FlowExecutionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExecutions = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listFlowExecutions(workspaceId, 50);
      setExecutions(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Falha ao carregar execucoes'));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const handleRetry = useCallback(
    async (executionId: string) => {
      try {
        await retryFlowExecution(executionId);
        await fetchExecutions();
      } catch (err: unknown) {
        setError(errorMessage(err, 'Falha ao reprocessar execucao'));
      }
    },
    [fetchExecutions],
  );

  return {
    executions,
    loading,
    error,
    fetchExecutions,
    handleRetry,
  };
}
