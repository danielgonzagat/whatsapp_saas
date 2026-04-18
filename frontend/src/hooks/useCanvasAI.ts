'use client';

import { apiFetch } from '@/lib/api';
import { useCallback, useState } from 'react';
import { mutate } from 'swr';

export function useCanvasAI() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateImage = useCallback(async (prompt: string, productId?: string) => {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch<{ imageUrl?: string | null }>('/canvas/generate', {
        method: 'POST',
        body: { prompt, productId },
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/canvas'));
      return res?.data?.imageUrl || null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar imagem');
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  const generateText = useCallback(async (type: string, productId?: string) => {
    try {
      const res = await apiFetch<{ suggestions?: string[] }>('/canvas/generate-text', {
        method: 'POST',
        body: { type, productId },
      });
      return res?.data?.suggestions || [];
    } catch {
      return [];
    }
  }, []);

  return { generateImage, generateText, generating, error };
}
