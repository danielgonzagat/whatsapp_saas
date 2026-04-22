'use client';

import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildCampaignCreateBody,
  type Campaign,
  getCampaignStatusLabel,
  MONO,
  PRODUCT_CAMPAIGNS_COPY,
  SORA,
  toCampaignErrorMessage,
  V,
} from './ProductCampaignsTab.constants';

/** Product campaigns tab. */
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
      fallbackError: string,
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
            borderRadius: '50%',
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

      {campaigns.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 20px',
            background: V.s,
            border: `1px solid ${V.b}`,
            borderRadius: 6,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: V.em,
              letterSpacing: '.25em',
              textTransform: 'uppercase' as const,
              marginBottom: 12,
            }}
          >
            {kloelT(`SEM CAMPANHAS`)}
          </div>
          <div style={{ fontSize: 14, color: V.t, fontFamily: SORA }}>
            {kloelT(`Crie sua primeira campanha para rastrear conversoes`)}
          </div>
        </div>
      ) : (
        <div
          style={{
            background: V.s,
            border: `1px solid ${V.b}`,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr',
              padding: '10px 14px',
              borderBottom: `1px solid ${V.b}`,
              background: V.e,
            }}
          >
            {['Nome', 'Status', 'Enviadas', 'Lidas', 'Acoes'].map((h) => (
              <span
                key={h}
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: V.t3,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {h}
              </span>
            ))}
          </div>
          {campaigns.map((c, i) => {
            const st = getCampaignStatusLabel(c.status);
            return (
              <div
                key={c.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr',
                  padding: '10px 14px',
                  borderBottom: i < campaigns.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 12, color: V.t }}>{c.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: st.color, fontFamily: MONO }}>
                  {st.text}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: V.t2, textAlign: 'center' }}>
                  {c.sentCount || 0}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: V.t2, textAlign: 'center' }}>
                  {c.readCount || 0}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {c.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      onClick={() => handlePause(c.id)}
                      style={{
                        padding: '4px 8px',
                        background: 'none',
                        border: `1px solid ${V.b}`,
                        borderRadius: 4,
                        color: V.t2,
                        fontSize: 10,
                        cursor: 'pointer',
                      }}
                    >
                      {kloelT(`Pausar`)}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleLaunch(c.id)}
                      style={{
                        padding: '4px 8px',
                        background: 'none',
                        border: `1px solid ${V.b}`,
                        borderRadius: 4,
                        color: V.g,
                        fontSize: 10,
                        cursor: 'pointer',
                      }}
                    >
                      {kloelT(`Lancar`)}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLinkModal(c)}
                    style={{
                      padding: '4px 6px',
                      background: 'none',
                      border: `1px solid ${V.b}`,
                      borderRadius: 4,
                      color: V.em,
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    {kloelT(`Links`)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampaignPendingDelete(c)}
                    disabled={deleting === c.id}
                    style={{
                      padding: '4px 6px',
                      background: 'none',
                      border: `1px solid ${V.b}`,
                      borderRadius: 4,
                      color: V.r,
                      fontSize: 10,
                      cursor: 'pointer',
                      opacity: deleting === c.id ? 0.5 : 1,
                    }}
                  >
                    {deleting === c.id ? '...' : 'X'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Link modal (existing) */}
      {linkModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setLinkModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: V.s,
              border: `1px solid ${V.b}`,
              borderRadius: 12,
              padding: '24px 28px',
              maxWidth: 480,
              width: '100%',
            }}
          >
            <h3
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: V.t,
                margin: '0 0 16px',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Links -`)} {linkModal.name}
            </h3>
            {linkModal.pixelId && (
              <div style={{ marginBottom: 12 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 600,
                    color: V.t3,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase' as const,
                    marginBottom: 6,
                  }}
                >
                  {kloelT(`Pixel ID`)}
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <code
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: V.e,
                      borderRadius: 6,
                      color: V.t2,
                      fontSize: 11,
                      fontFamily: MONO,
                    }}
                  >
                    {linkModal.pixelId}
                  </code>
                  <button
                    type="button"
                    onClick={() => cp(linkModal.pixelId || '', `pixel-${linkModal.id}`)}
                    style={{
                      padding: '6px 10px',
                      background: V.em,
                      border: 'none',
                      borderRadius: 4,
                      color: V.ta,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {copied === `pixel-${linkModal.id}` ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  color: V.t3,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase' as const,
                  marginBottom: 6,
                }}
              >
                {kloelT(`Campaign ID`)}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <code
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: V.e,
                    borderRadius: 6,
                    color: V.t2,
                    fontSize: 11,
                    fontFamily: MONO,
                  }}
                >
                  {linkModal.id}
                </code>
                <button
                  type="button"
                  onClick={() => cp(linkModal.id, `id-${linkModal.id}`)}
                  style={{
                    padding: '6px 10px',
                    background: V.em,
                    border: 'none',
                    borderRadius: 4,
                    color: V.ta,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {copied === `id-${linkModal.id}` ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setLinkModal(null)}
                style={{
                  padding: '8px 16px',
                  background: 'none',
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  color: V.t2,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: SORA,
                }}
              >
                {kloelT(`Fechar`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {campaignPendingDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setCampaignPendingDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: V.s,
              border: `1px solid ${V.b}`,
              borderRadius: 12,
              padding: '24px 28px',
              maxWidth: 420,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: V.t,
                  margin: 0,
                  fontFamily: SORA,
                }}
              >
                {PRODUCT_CAMPAIGNS_COPY.deleteTitle}
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: V.t2, fontFamily: SORA }}>
                {PRODUCT_CAMPAIGNS_COPY.deleteDescription}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: V.t3, fontFamily: MONO }}>
                {campaignPendingDelete.name}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setCampaignPendingDelete(null)}
                style={{
                  padding: '8px 16px',
                  background: 'none',
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  color: V.t2,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: SORA,
                }}
              >
                {PRODUCT_CAMPAIGNS_COPY.cancel}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting === campaignPendingDelete.id}
                style={{
                  padding: '8px 16px',
                  background: V.em,
                  border: 'none',
                  borderRadius: 6,
                  color: V.ta,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: deleting === campaignPendingDelete.id ? 'not-allowed' : 'pointer',
                  fontFamily: SORA,
                  opacity: deleting === campaignPendingDelete.id ? 0.5 : 1,
                }}
              >
                {deleting === campaignPendingDelete.id
                  ? PRODUCT_CAMPAIGNS_COPY.deleting
                  : PRODUCT_CAMPAIGNS_COPY.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showNew && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowNew(false)}
          aria-label={PRODUCT_CAMPAIGNS_COPY.closeModalAria}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: V.s,
              border: `1px solid ${V.b}`,
              borderRadius: 12,
              padding: '24px 28px',
              maxWidth: 480,
              width: '100%',
            }}
          >
            <h3
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: V.t,
                margin: '0 0 16px',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Nova Campanha`)}
            </h3>
            <div style={{ marginBottom: 14 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  color: V.t3,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase' as const,
                  marginBottom: 6,
                  fontFamily: SORA,
                }}
              >
                {kloelT(`Nome *`)}
              </span>
              <input
                aria-label={PRODUCT_CAMPAIGNS_COPY.campaignNameAria}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: V.e,
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  color: V.t,
                  fontSize: 13,
                  fontFamily: SORA,
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  color: V.t3,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase' as const,
                  marginBottom: 6,
                  fontFamily: SORA,
                }}
              >
                {kloelT(`Pixel ID (opcional)`)}
              </span>
              <input
                aria-label={PRODUCT_CAMPAIGNS_COPY.pixelIdAria}
                value={newPixelId}
                onChange={(e) => setNewPixelId(e.target.value)}
                placeholder={PRODUCT_CAMPAIGNS_COPY.pixelIdPlaceholder}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: V.e,
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  color: V.t,
                  fontSize: 13,
                  fontFamily: SORA,
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                style={{
                  padding: '8px 16px',
                  background: 'none',
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  color: V.t2,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: SORA,
                }}
              >
                {kloelT(`Cancelar`)}
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                style={{
                  padding: '8px 16px',
                  background: V.em,
                  border: 'none',
                  borderRadius: 6,
                  color: V.ta,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: creating ? 'not-allowed' : 'pointer',
                  fontFamily: SORA,
                  opacity: creating || !newName.trim() ? 0.5 : 1,
                }}
              >
                {creating ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
