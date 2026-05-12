'use client';

import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildCampaignCreateBody,
  type Campaign,
  PRODUCT_CAMPAIGNS_COPY,
  SORA,
  toCampaignErrorMessage,
  V,
} from './ProductCampaignsTab.constants';
import { ProductCampaignList } from './ProductCampaignList';
import { ProductCampaignCreateModal } from './ProductCampaignCreateModal';
import { ProductCampaignLinkModal } from './ProductCampaignLinkModal';
import { ProductCampaignDeleteModal } from './ProductCampaignDeleteModal';

export function ProductCampaignsTab({ productId }: { productId: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPixelId, setNewPixelId] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [campaignPendingDelete, setCampaignPendingDelete] = useState<Campaign | null>(null);
  const [linkModal, setLinkModal] = useState<Campaign | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  const fetchCampaigns = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<Campaign[]>(`/products/${productId}/campaigns`);
      if (res.error) {
        setError(res.error);
        setCampaigns([]);
      } else {
        setCampaigns(Array.isArray(res.data) ? res.data : []);
      }
    } catch (error: unknown) {
      setError(toCampaignErrorMessage(error, PRODUCT_CAMPAIGNS_COPY.loadError));
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    setLoading(true);
    fetchCampaigns();
  }, [fetchCampaigns]);

  const resetNewCampaignForm = () => {
    setShowNew(false);
    setNewName('');
    setNewPixelId('');
  };

  const handleCreate = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch(`/products/${productId}/campaigns`, {
        method: 'POST',
        body: buildCampaignCreateBody(trimmedName, newPixelId),
      });
      if (res.error) {
        setError(res.error);
      } else {
        resetNewCampaignForm();
        await fetchCampaigns();
      }
    } catch (error: unknown) {
      setError(toCampaignErrorMessage(error, PRODUCT_CAMPAIGNS_COPY.createError));
    } finally {
      setCreating(false);
    }
  };

  const runCampaignMutation = useCallback(
    async (
      campaignId: string,
      endpointSuffix: '' | '/launch' | '/pause',
      _fallbackError: string,
      method: 'DELETE' | 'POST' = 'POST',
    ) => {
      const res = await apiFetch(
        `/products/${productId}/campaigns/${campaignId}${endpointSuffix}`,
        {
          method,
          body: method === 'POST' ? {} : undefined,
        },
      );
      if (res.error) {
        setError(res.error);
        return false;
      }
      await fetchCampaigns();
      return true;
    },
    [fetchCampaigns, productId],
  );

  const handleDelete = async () => {
    const pendingDelete = campaignPendingDelete;
    if (!pendingDelete) {
      return;
    }
    setDeleting(pendingDelete.id);
    try {
      const deleted = await runCampaignMutation(
        pendingDelete.id,
        '',
        PRODUCT_CAMPAIGNS_COPY.deleteError,
        'DELETE',
      );
      if (deleted) {
        setCampaignPendingDelete(null);
      }
    } catch (error: unknown) {
      setError(toCampaignErrorMessage(error, PRODUCT_CAMPAIGNS_COPY.deleteError));
    } finally {
      setDeleting(null);
    }
  };

  const handleLaunch = async (campaignId: string) => {
    try {
      await runCampaignMutation(campaignId, '/launch', PRODUCT_CAMPAIGNS_COPY.launchError);
    } catch (error: unknown) {
      setError(toCampaignErrorMessage(error, PRODUCT_CAMPAIGNS_COPY.launchError));
    }
  };

  const handlePause = async (campaignId: string) => {
    try {
      await runCampaignMutation(campaignId, '/pause', PRODUCT_CAMPAIGNS_COPY.pauseError);
    } catch (error: unknown) {
      setError(toCampaignErrorMessage(error, PRODUCT_CAMPAIGNS_COPY.pauseError));
    }
  };

  const cp = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    if (copiedTimer.current) {
      clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
        <div
          style={{
            width: 24,
            height: 24,
            border: `2px solid ${V.b}`,
            borderTopColor: V.em,
            borderRadius: '16%',
            animation: 'spin 1s linear infinite',
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0, fontFamily: SORA }}>
          {kloelT(`Campanhas Registradas`)}
        </h2>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '8px 16px',
            background: V.em,
            border: 'none',
            borderRadius: 6,
            color: V.ta,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: SORA,
          }}
        >
          {kloelT(`+ Nova Campanha`)}
        </button>
      </div>

      <div
        style={{
          background: `${V.bl}08`,
          border: `1px solid ${V.bl}15`,
          borderRadius: 6,
          padding: 12,
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 11, color: V.bl, fontFamily: SORA }}>
          {kloelT(`Alteracoes de pixel podem levar ate 15 minutos para surtir efeito.`)}
        </span>
      </div>

      {error && (
        <div
          style={{
            background: `${V.r}12`,
            border: `1px solid ${V.r}30`,
            borderRadius: 6,
            padding: 12,
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, color: V.r, fontFamily: SORA }}>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: V.r,
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
          >
            <span aria-hidden="true">{PRODUCT_CAMPAIGNS_COPY.dismissSymbol}</span>
          </button>
        </div>
      )}

      <ProductCampaignList
        campaigns={campaigns}
        onLaunch={handleLaunch}
        onPause={handlePause}
        onShowLinks={setLinkModal}
        onDelete={setCampaignPendingDelete}
        deleting={deleting}
      />

      <ProductCampaignLinkModal
        linkModal={linkModal}
        copied={copied}
        onCopy={cp}
        onClose={() => setLinkModal(null)}
      />

      <ProductCampaignDeleteModal
        campaignPendingDelete={campaignPendingDelete}
        deleting={deleting}
        onConfirm={handleDelete}
        onCancel={() => setCampaignPendingDelete(null)}
      />

      <ProductCampaignCreateModal
        showNew={showNew}
        newName={newName}
        newPixelId={newPixelId}
        creating={creating}
        onNameChange={setNewName}
        onPixelIdChange={setNewPixelId}
        onCreate={handleCreate}
        onClose={() => setShowNew(false)}
      />
    </div>
  );
}
