'use client';

import { apiFetch } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";
const V = {
  s: 'var(--bg-space, #111113)',
  e: 'var(--bg-nebula, #19191C)',
  b: 'var(--border-space, #222226)',
  em: '#E85D30',
  t: 'var(--text-starlight, #E0DDD8)',
  t2: 'var(--text-moonlight, #6E6E73)',
  t3: 'var(--text-dust, #3A3A3F)',
  ta: 'var(--app-text-on-accent, #0A0A0C)',
  bl: '#3B82F6',
  r: '#EF4444',
  g: '#22C55E',
};

interface Campaign {
  id: string;
  name: string;
  pixelId?: string | null;
  status: string;
  linkedCampaignId?: string | null;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  repliedCount: number;
  createdAt?: string;
}

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
    } catch {
      setError('Falha ao carregar campanhas');
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    setLoading(true);
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleCreate = async () => {
    if (!newName.trim()) {
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch(`/products/${productId}/campaigns`, {
        method: 'POST',
        body: { name: newName.trim(), pixelId: newPixelId.trim() || undefined },
      });
      if (res.error) {
        setError(res.error);
      } else {
        setShowNew(false);
        setNewName('');
        setNewPixelId('');
        fetchCampaigns();
      }
    } catch {
      setError('Falha ao criar campanha');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (campaignId: string) => {
    if (!confirm('Excluir campanha?')) {
      return;
    }
    setDeleting(campaignId);
    try {
      const res = await apiFetch(`/products/${productId}/campaigns/${campaignId}`, {
        method: 'DELETE',
      });
      if (res.error) {
        setError(res.error);
      } else {
        fetchCampaigns();
      }
    } catch {
      setError('Falha ao excluir campanha');
    } finally {
      setDeleting(null);
    }
  };

  const handleLaunch = async (campaignId: string) => {
    try {
      const res = await apiFetch(`/products/${productId}/campaigns/${campaignId}/launch`, {
        method: 'POST',
        body: {},
      });
      if (res.error) {
        setError(res.error);
      } else {
        fetchCampaigns();
      }
    } catch {
      setError('Falha ao lancar campanha');
    }
  };

  const handlePause = async (campaignId: string) => {
    try {
      const res = await apiFetch(`/products/${productId}/campaigns/${campaignId}/pause`, {
        method: 'POST',
        body: {},
      });
      if (res.error) {
        setError(res.error);
      } else {
        fetchCampaigns();
      }
    } catch {
      setError('Falha ao pausar campanha');
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

  const statusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return { text: 'Ativa', color: V.g };
      case 'PAUSED':
        return { text: 'Pausada', color: V.t2 };
      case 'COMPLETED':
        return { text: 'Concluida', color: V.bl };
      default:
        return { text: 'Rascunho', color: V.t3 };
    }
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
          Campanhas Registradas
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
          + Nova Campanha
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
          Alteracoes de pixel podem levar ate 15 minutos para surtir efeito.
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
            x
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
            SEM CAMPANHAS
          </div>
          <div style={{ fontSize: 14, color: V.t, fontFamily: SORA }}>
            Crie sua primeira campanha para rastrear conversoes
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
            const st = statusLabel(c.status);
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
                      Pausar
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
                      Lancar
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
                    Links
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
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
              borderRadius: 10,
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
              Links - {linkModal.name}
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
                  Pixel ID
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
                Campaign ID
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
                Fechar
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
          aria-label="Fechar modal"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: V.s,
              border: `1px solid ${V.b}`,
              borderRadius: 10,
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
              Nova Campanha
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
                Nome *
              </span>
              <input
                aria-label="Nome da campanha"
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
                Pixel ID (opcional)
              </span>
              <input
                aria-label="Pixel ID"
                value={newPixelId}
                onChange={(e) => setNewPixelId(e.target.value)}
                placeholder="Ex: 123456789"
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
                Cancelar
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
