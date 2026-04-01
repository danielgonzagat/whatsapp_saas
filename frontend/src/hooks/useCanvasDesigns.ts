'use client';

import { useState, useEffect, useCallback } from 'react';
import { mutate } from 'swr';
import { apiFetch } from '@/lib/api';

export interface CanvasDesign {
  id: string;
  workspaceId: string;
  name: string;
  format: string;
  width: number;
  height: number;
  productId?: string | null;
  elements: any;
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
      const res: any = await apiFetch('/canvas/designs');
      const list = res?.data?.designs ?? res?.designs ?? [];
      setDesigns(Array.isArray(list) ? list : []);
    } catch {
      setDesigns([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchDesigns(); }, [fetchDesigns]);

  const deleteDesign = async (id: string) => {
    await apiFetch(`/canvas/designs/${id}`, { method: 'DELETE' });
    setDesigns(prev => prev.filter(d => d.id !== id));
    mutate((key: string) => typeof key === 'string' && key.startsWith('/canvas'));
  };

  const duplicateDesign = async (id: string) => {
    const res: any = await apiFetch(`/canvas/designs/${id}`);
    const orig = res?.data?.design;
    if (!orig) return;
    const dup: any = await apiFetch('/canvas/designs', {
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
    if (dup?.data?.design) {
      setDesigns(prev => [dup.data.design, ...prev]);
      mutate((key: string) => typeof key === 'string' && key.startsWith('/canvas'));
    }
  };

  return { designs, loading, fetchDesigns, deleteDesign, duplicateDesign };
}
