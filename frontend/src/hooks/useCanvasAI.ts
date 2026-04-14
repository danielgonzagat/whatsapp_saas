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
      const res: any = await apiFetch('/canvas/generate', {
        method: 'POST',
        body: { prompt, productId },
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/canvas'));
      return res?.imageUrl || null;
    } catch (e: any) {
      setError(e?.message || 'Falha ao gerar imagem');
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  const generateText = useCallback(async (type: string, productId?: string) => {
    try {
      const res: any = await apiFetch('/canvas/generate-text', {
        method: 'POST',
        body: { type, productId },
      });
      return res?.suggestions || [];
    } catch {
      return [];
    }
  }, []);

  return { generateImage, generateText, generating, error };
}
