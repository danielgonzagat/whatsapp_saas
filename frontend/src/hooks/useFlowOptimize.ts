'use client';

import { optimizeFlow } from '@/lib/api';
import type { FlowOptimizeResult } from '@/lib/api/flows';
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

export function useFlowOptimize(flowId: string | null) {
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<FlowOptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOptimize = useCallback(async () => {
    if (!flowId) {
      setError('Salve o fluxo primeiro para otimizar com IA');
      return;
    }
    setOptimizing(true);
    setError(null);
    setResult(null);
    try {
      const data = await optimizeFlow(flowId);
      setResult(data ?? null);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Falha ao otimizar fluxo'));
    } finally {
      setOptimizing(false);
    }
  }, [flowId]);

  return {
    optimizing,
    result,
    error,
    handleOptimize,
  };
}
