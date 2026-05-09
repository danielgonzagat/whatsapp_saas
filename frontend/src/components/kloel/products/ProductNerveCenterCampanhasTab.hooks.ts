'use client';

import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/kloel/ToastProvider';
import { useState, useCallback, useEffect } from 'react';
import { unwrapApiPayload, type JsonRecord } from './product-nerve-center.shared';

export function useCampanhasTab(productId: string) {
  const { showToast } = useToast();
  const [camps, setCamps] = useState<Array<JsonRecord>>([]);
  const [campsLoading, setCampsLoading] = useState(true);
  const [showCampForm, setShowCampForm] = useState(false);
  const [campName, setCampName] = useState('');
  const [campPixel, setCampPixel] = useState('');
  const [campMessage, setCampMessage] = useState('');
  const [campBusyId, setCampBusyId] = useState<string | null>(null);

  const loadCampaigns = useCallback(() => {
    setCampsLoading(true);
    return apiFetch(`/products/${productId}/campaigns`)
      .then((r: unknown) => {
        const d = unwrapApiPayload<Array<JsonRecord>>(r);
        setCamps(Array.isArray(d) ? d : []);
      })
      .catch(() => setCamps([]))
      .finally(() => setCampsLoading(false));
  }, [productId]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const handleCreateCamp = async () => {
    if (!campName.trim()) {
      return;
    }
    try {
      const res = await apiFetch(`/products/${productId}/campaigns`, {
        method: 'POST',
        body: {
          name: campName.trim(),
          pixelId: campPixel.trim() || null,
          messageTemplate: campMessage.trim() || undefined,
        },
      });
      // PULSE_OK: cache invalidation handled by auto-revalidation
      const created = unwrapApiPayload<JsonRecord>(res);
      setCamps((prev) => [created, ...prev]);
      setCampName('');
      setCampPixel('');
      setCampMessage('');
      setShowCampForm(false);
      showToast('Campanha criada', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao criar campanha', 'error');
    }
  };

  const handleLaunchCamp = async (id: string, smartTime = false) => {
    setCampBusyId(`launch-${id}`);
    try {
      await unwrapApiPayload(
        await apiFetch(`/products/${productId}/campaigns/${id}/launch`, {
          method: 'POST',
          body: { smartTime },
        }),
      );
      // PULSE_OK: cache invalidation handled by auto-revalidation
      await loadCampaigns();
      showToast('Campanha lançada', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao lançar campanha', 'error');
    } finally {
      setCampBusyId(null);
    }
  };

  const handlePauseCamp = async (id: string) => {
    setCampBusyId(`pause-${id}`);
    try {
      await unwrapApiPayload(
        await apiFetch(`/products/${productId}/campaigns/${id}/pause`, {
          method: 'POST',
        }),
      );
      // PULSE_OK: cache invalidation handled by auto-revalidation
      await loadCampaigns();
      showToast('Campanha pausada', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao pausar campanha', 'error');
    } finally {
      setCampBusyId(null);
    }
  };

  const handleDeleteCamp = async (id: string) => {
    try {
      await unwrapApiPayload(
        await apiFetch(`/products/${productId}/campaigns/${id}`, { method: 'DELETE' }),
      );
      // PULSE_OK: cache invalidation handled by auto-revalidation
      setCamps((prev) => prev.filter((c: JsonRecord) => c.id !== id));
      showToast('Campanha removida', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao remover campanha', 'error');
    }
  };

  return {
    camps,
    campsLoading,
    showCampForm,
    setShowCampForm,
    campName,
    setCampName,
    campPixel,
    setCampPixel,
    campMessage,
    setCampMessage,
    campBusyId,
    loadCampaigns,
    handleCreateCamp,
    handleLaunchCamp,
    handlePauseCamp,
    handleDeleteCamp,
  };
}
