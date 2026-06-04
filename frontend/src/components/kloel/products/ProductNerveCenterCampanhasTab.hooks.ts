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
  const [campError, setCampError] = useState('');
  const [campBusyId, setCampBusyId] = useState<string | null>(null);

  const loadCampaigns = useCallback(() => {
    setCampsLoading(true);
    return apiFetch(`/products/${productId}/campaigns`)
      .then((r: unknown) => {
        const d = unwrapApiPayload<Array<JsonRecord>>(r);
        if (!Array.isArray(d)) {
          throw new Error('Invalid product campaigns payload');
        }
        setCamps(d);
      })
      .catch((e: unknown) => {
        showToast(e instanceof Error ? e.message : 'Erro ao carregar campanhas', 'error');
      })
      .finally(() => setCampsLoading(false));
  }, [productId, showToast]);

  useEffect(() => {
    queueMicrotask(loadCampaigns);
  }, [loadCampaigns]);

  const handleCreateCamp = async () => {
    const name = campName.trim();
    if (!name) {
      const message = 'Informe o nome da campanha.';
      setCampError(message);
      showToast(message, 'error');
      return;
    }

    setCampError('');
    try {
      const res = await apiFetch(`/products/${productId}/campaigns`, {
        method: 'POST',
        body: {
          name,
          pixelId: campPixel.trim() || null,
          messageTemplate: campMessage.trim() || undefined,
        },
      });
      const created = unwrapApiPayload<JsonRecord>(res);
      setCamps((prev) => [created, ...prev]);
      setCampName('');
      setCampPixel('');
      setCampMessage('');
      setCampError('');
      setShowCampForm(false);
      showToast('Campanha criada', 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao criar campanha';
      setCampError(message);
      showToast(message, 'error');
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
      await loadCampaigns();
      showToast('Campanha lançada', 'success');
    } catch (e) {
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
      await loadCampaigns();
      showToast('Campanha pausada', 'success');
    } catch (e) {
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
      setCamps((prev) => prev.filter((c: JsonRecord) => c.id !== id));
      showToast('Campanha removida', 'success');
    } catch (e) {
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
    campError,
    setCampError,
    campBusyId,
    loadCampaigns,
    handleCreateCamp,
    handleLaunchCamp,
    handlePauseCamp,
    handleDeleteCamp,
  };
}
