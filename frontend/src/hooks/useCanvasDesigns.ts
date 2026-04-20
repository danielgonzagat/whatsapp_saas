'use client';

import { apiFetch } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';
import { mutate } from 'swr';

export interface CanvasDesign {
  id: string;
  workspaceId: string;
  name: string;
  format: string;
  width: number;
  height: number;
  productId?: string | null;
  elements: unknown;
  background: string;
  thumbnailUrl?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function useCanvasDesigns() {
  const [designs, setDesigns] = useState<CanvasDesign[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDesigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ designs?: CanvasDesign[] }>('/canvas/designs');
      const list = res?.data?.designs ?? [];
      setDesigns(Array.isArray(list) ? list : []);
    } catch {
      setDesigns([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDesigns();
  }, [fetchDesigns]);

  const deleteDesign = async (id: string) => {
    await apiFetch(`/canvas/designs/${id}`, { method: 'DELETE' });
    setDesigns((prev) => prev.filter((d) => d.id !== id));
    mutate((key: string) => typeof key === 'string' && key.startsWith('/canvas'));
  };

  const duplicateDesign = async (id: string) => {
    const res = await apiFetch<{ design?: CanvasDesign }>(`/canvas/designs/${id}`);
    const orig = res?.data?.design;
    if (!orig) {
      return;
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
    const created = dup?.data?.design;
    if (created) {
      setDesigns((prev) => [created, ...prev]);
      mutate((key: string) => typeof key === 'string' && key.startsWith('/canvas'));
    }
  };

  return { designs, loading, fetchDesigns, deleteDesign, duplicateDesign };
}
