'use client';

import { apiFetch } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';
import { mutate } from 'swr';

/** Canvas design shape. */
export interface CanvasDesign {
  /** Id property. */
  id: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Name property. */
  name: string;
  /** Format property. */
  format: string;
  /** Width property. */
  width: number;
  /** Height property. */
  height: number;
  /** Product id property. */
  productId?: string | null;
  /** Elements property. */
  elements: unknown;
  /** Background property. */
  background: string;
  /** Thumbnail url property. */
  thumbnailUrl?: string | null;
  /** Status property. */
  status: string;
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt: string;
}

/** Use canvas designs. */
export function useCanvasDesigns() {
  const [designs, setDesigns] = useState<CanvasDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unwrapCanvasResponse = useCallback(<T,>(
    response: { data?: T | undefined; error?: string | undefined },
    fallbackMessage: string,
  ): T => {
    if (response.error) {
      throw new Error(response.error);
    }
    if (!response.data) {
      throw new Error(fallbackMessage);
    }
    return response.data;
  }, []);

  const fetchDesigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ designs?: CanvasDesign[] }>('/canvas/designs');
      const payload = unwrapCanvasResponse(res, 'Não foi possível carregar os designs.');
      const list = payload.designs;
      if (list === undefined) {
        setDesigns([]);
        return;
      }
      if (!Array.isArray(list)) {
        throw new Error('Invalid canvas designs payload');
      }
      setDesigns(list);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Não foi possível carregar os designs.');
    } finally {
      setLoading(false);
    }
  }, [unwrapCanvasResponse]);

  useEffect(() => {
    queueMicrotask(() => fetchDesigns());
  }, [fetchDesigns]);

  const deleteDesign = async (id: string) => {
    setError(null);
    const response = await apiFetch(`/canvas/designs/${id}`, { method: 'DELETE' });
    unwrapCanvasResponse(response, 'Não foi possível remover o design.');
    setDesigns((prev) => prev.filter((d) => d.id !== id));
    mutate((key: string) => typeof key === 'string' && key.startsWith('/canvas'));
  };

  const duplicateDesign = async (id: string) => {
    setError(null);
    const res = await apiFetch<{ design?: CanvasDesign }>(`/canvas/designs/${id}`);
    const orig = unwrapCanvasResponse(res, 'Não foi possível carregar o design original.').design;
    if (!orig) {
      throw new Error('Não foi possível carregar o design original.');
    }
    const dup = await apiFetch<{ design?: CanvasDesign }>('/canvas/designs', {
      method: 'POST',
      body: {
        name: `${orig.name} (copia)`,
        format: orig.format,
        width: orig.width,
        height: orig.height,
        elements: orig.elements,
        background: orig.background,
      },
    });
    const created = unwrapCanvasResponse(dup, 'Não foi possível duplicar o design.').design;
    if (!created) {
      throw new Error('Não foi possível duplicar o design.');
    }
    setDesigns((prev) => [created, ...prev]);
    mutate((key: string) => typeof key === 'string' && key.startsWith('/canvas'));
  };

  return { designs, loading, error, fetchDesigns, deleteDesign, duplicateDesign };
}
