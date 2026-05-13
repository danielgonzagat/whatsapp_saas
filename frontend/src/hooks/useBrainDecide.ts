'use client';

import { useCallback, useRef, useState } from 'react';
import {
  brainDecide,
  detectOperatorIntent,
  isUnsupportedFallback,
  type BrainDecideOutput,
} from '@/lib/api/brain';

export interface UseBrainDecideResult {
  result: BrainDecideOutput | null;
  isThinking: boolean;
  error: string | null;
  decide: (text: string, conversationId?: string | null) => Promise<BrainDecideOutput | null>;
  reset: () => void;
}

export function useBrainDecide(): UseBrainDecideResult {
  const [result, setResult] = useState<BrainDecideOutput | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setResult(null);
    setIsThinking(false);
    setError(null);
  }, []);

  const decide = useCallback(
    async (
      text: string,
      conversationId?: string | null,
    ): Promise<BrainDecideOutput | null> => {
      const intent = detectOperatorIntent(text);

      if (isUnsupportedFallback(intent)) {
        setResult(null);
        setError('unsupported');
        setIsThinking(false);
        return null;
      }

      if (!intent) {
        setResult(null);
        setError(null);
        return null;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsThinking(true);
      setError(null);

      try {
        const output = await brainDecide({
          intent,
          source: 'chat',
          messages: [{ role: 'user', content: text }],
          context: conversationId ? { conversationId } : undefined,
        });

        if (controller.signal.aborted) {
          return null;
        }

        setResult(output);
        setIsThinking(false);
        return output;
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          return null;
        }
        const msg = err instanceof Error ? err.message : 'brain_decide_failed';
        setError(msg);
        setIsThinking(false);
        return null;
      }
    },
    [],
  );

  return { result, isThinking, error, decide, reset };
}
