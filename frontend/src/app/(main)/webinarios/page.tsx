'use client';

export const dynamic = 'force-dynamic';

import { useAuth } from '@/components/kloel/auth/auth-provider';
import { apiFetch } from '@/lib/api';
import { webinarApi } from '@/lib/api/misc';
import { toSupportedEmbedUrl } from '@/lib/video-embed';
import {
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { mutate } from 'swr';

interface Webinar {
  id: string;
  title: string;
  description?: string | null;
  url: string;
  date: string;
  productId?: string | null;
  status: string;
  createdAt: string;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string) {
  switch (status) {
    case 'LIVE':
      return 'Ao Vivo';
    case 'COMPLETED':
      return 'Concluido';
    default:
      return 'Agendado';
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'LIVE':
      return '#E85D30';
    case 'COMPLETED':
      return '#666';
    default:
      return '#4CAF50';
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'LIVE':
      return <Play size={12} />;
    case 'COMPLETED':
      return <CheckCircle size={12} />;
    default:
      return <Clock size={12} />;
  }
}

/** Attempt to convert a URL into an embeddable URL */
function toEmbedUrl(url: string): string | null {
  return toSupportedEmbedUrl(url);
}

export default function WebinariosPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, workspace, openAuthModal } = useAuth();
  const workspaceId = workspace?.id;

  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Viewer state
  const [viewing, setViewing] = useState<Webinar | null>(null);

  // Edit state
  const [editingWebinar, setEditingWebinar] = useState<Webinar | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchWebinars = async () => {
    if (!workspaceId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<any>('/webinars');
      if (res.error) throw new Error(res.error);
      const data = res.data as any;
      setWebinars(Array.isArray(data?.webinars) ? data.webinars : []);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar webinarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && workspaceId) fetchWebinars();
  }, [isAuthenticated, workspaceId]);

  const handleCreate = async () => {
    if (!formTitle.trim() || !formUrl.trim() || !formDate) return;
    setSaving(true);
    try {
      const res = await apiFetch<any>('/webinars', {
        method: 'POST',
        body: {
          title: formTitle.trim(),
          url: formUrl.trim(),
          date: formDate,
          description: formDescription.trim() || undefined,
        },
      });
      if (res.error) throw new Error(res.error);
      setShowModal(false);
      setFormTitle('');
      setFormUrl('');
      setFormDate('');
      setFormDescription('');
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/webinar'));
      fetchWebinars();
    } catch (e: any) {
      setError(e?.message || 'Falha ao criar webinario');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (w: Webinar, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWebinar(w);
    setEditTitle(w.title);
    setEditUrl(w.url);
    // convert ISO date to datetime-local format
    const d = new Date(w.date);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditDate(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    );
    setEditDescription(w.description ?? '');
  };

  const handleEdit = async () => {
    if (!editingWebinar || !editTitle.trim() || !editUrl.trim() || !editDate) return;
    setEditSaving(true);
    try {
      const res = await webinarApi.update(editingWebinar.id, {
        title: editTitle.trim(),
        url: editUrl.trim(),
        date: editDate,
        description: editDescription.trim() || undefined,
      });
      if (res.error) throw new Error(res.error);
      setEditingWebinar(null);
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/webinar'));
      fetchWebinars();
    } catch (e: any) {
      setError(e?.message || 'Falha ao editar webinario');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await webinarApi.remove(id);
      if (res.error) throw new Error(res.error);
      setConfirmDeleteId(null);
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/webinar'));
      fetchWebinars();
    } catch (e: any) {
      setError(e?.message || 'Falha ao deletar webinario');
    } finally {
      setDeletingId(null);
    }
  };

  // Viewer: embed or external link
  if (viewing) {
    const embedUrl = toEmbedUrl(viewing.url);
    return (
      <div
        style={{
          background: 'var(--app-bg-primary)',
          minHeight: '100vh',
          padding: '24px 32px',
          fontFamily: 'Sora, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => setViewing(null)}
            style={{
              background: 'rgba(232, 93, 48, 0.1)',
              border: '1px solid rgba(232, 93, 48, 0.3)',
              color: '#E85D30',
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'Sora, sans-serif',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <X size={14} /> Voltar
          </button>
          <h2
            style={{ color: 'var(--app-text-primary)', fontSize: 18, fontWeight: 600, margin: 0 }}
          >
            {viewing.title}
          </h2>
          <a
            href={viewing.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#E85D30',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              marginLeft: 'auto',
            }}
          >
            <ExternalLink size={12} /> Abrir original
          </a>
        </div>
        {embedUrl ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              paddingBottom: '56.25%',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#111',
            }}
          >
            <iframe
              src={embedUrl}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(232, 93, 48, 0.06)',
              border: '1px solid rgba(232, 93, 48, 0.15)',
              borderRadius: 8,
              padding: 40,
              textAlign: 'center',
            }}
          >
            <Video size={48} style={{ color: '#E85D30', marginBottom: 16 }} />
            <p style={{ color: 'var(--app-text-primary)', fontSize: 14, marginBottom: 16 }}>
              Este link nao pode ser incorporado diretamente.
            </p>
            <a
              href={viewing.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#E85D30',
                color: '#fff',
                padding: '10px 24px',
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'Sora, sans-serif',
              }}
            >
              Abrir Webinario
            </a>
          </div>
        )}
        {viewing.description && (
          <p style={{ color: '#999', fontSize: 13, marginTop: 16, lineHeight: 1.6 }}>
            {viewing.description}
          </p>
        )}
      </div>
    );
  }

  if (!isLoading && !isAuthenticated) {
    return (
      <div
        style={{
          background: 'var(--app-bg-primary)',
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              color: 'var(--app-text-primary)',
              fontSize: 14,
              marginBottom: 16,
              fontFamily: 'Sora, sans-serif',
            }}
          >
            Faca login para acessar seus webinarios.
          </p>
          <button
            onClick={() => openAuthModal()}
            style={{
              background: '#E85D30',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '10px 24px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'Sora, sans-serif',
            }}
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--app-bg-primary)',
        minHeight: '100vh',
        padding: '24px 32px',
        fontFamily: 'Sora, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Video size={20} style={{ color: '#E85D30' }} />
          <h1
            style={{ color: 'var(--app-text-primary)', fontSize: 20, fontWeight: 700, margin: 0 }}
          >
            Webinarios
          </h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: '#E85D30',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 18px',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'Sora, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Plus size={14} /> Novo Webinario
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            background: 'rgba(232, 93, 48, 0.08)',
            border: '1px solid rgba(232, 93, 48, 0.2)',
            borderRadius: 6,
            padding: '10px 16px',
            marginBottom: 16,
            color: '#E85D30',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={20} style={{ color: '#E85D30', animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && webinars.length === 0 && (
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: 48,
            textAlign: 'center',
          }}
        >
          <Video size={40} style={{ color: '#444', marginBottom: 12 }} />
          <p style={{ color: '#666', fontSize: 14 }}>Nenhum webinario criado ainda.</p>
          <p style={{ color: '#555', fontSize: 12 }}>
            Clique em &quot;Novo Webinario&quot; para comecar.
          </p>
        </div>
      )}

      {/* Webinar list */}
      {!loading && webinars.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 12,
          }}
        >
          {webinars.map((w) => (
            <div
              key={w.id}
              onClick={() => setViewing(w)}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: 20,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                position: 'relative',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(232, 93, 48, 0.3)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <h3
                  style={{
                    color: 'var(--app-text-primary)',
                    fontSize: 15,
                    fontWeight: 600,
                    margin: 0,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {w.title}
                </h3>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: `${statusColor(w.status)}18`,
                      color: statusColor(w.status),
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 4,
                    }}
                  >
                    <StatusIcon status={w.status} />
                    {statusLabel(w.status)}
                  </span>
                  <button
                    onClick={(e) => openEdit(w, e)}
                    title="Editar"
                    style={{
                      background: 'none',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 4,
                      padding: '4px 6px',
                      cursor: 'pointer',
                      color: '#888',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(w.id);
                    }}
                    title="Deletar"
                    style={{
                      background: 'none',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 4,
                      padding: '4px 6px',
                      cursor: 'pointer',
                      color: '#E85D30',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#777',
                  fontSize: 12,
                  marginBottom: 6,
                }}
              >
                <Calendar size={12} />
                {formatDate(w.date)}
              </div>
              {w.description && (
                <p
                  style={{ color: '#888', fontSize: 12, margin: 0, lineHeight: 1.5, marginTop: 4 }}
                >
                  {w.description.length > 100 ? w.description.slice(0, 100) + '...' : w.description}
                </p>
              )}
              <div
                style={{
                  color: '#555',
                  fontSize: 11,
                  marginTop: 8,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {w.url}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#141416',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 28,
              width: 440,
              maxWidth: '90vw',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  color: 'var(--app-text-primary)',
                  fontSize: 16,
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                Novo Webinario
              </h2>
              <button
                aria-label="Fechar modal"
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ color: '#999', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Titulo *
                </label>
                <input
                  aria-label="Titulo do webinario"
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Lancamento do produto X"
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#999', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  URL do Webinario *
                </label>
                <input
                  aria-label="URL do webinario"
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://youtube.com/live/..."
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#999', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Data e Hora *
                </label>
                <input
                  aria-label="Data e hora do webinario"
                  type="datetime-local"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                    colorScheme: 'dark',
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#999', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Descricao (opcional)
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Descreva o webinario..."
                  rows={3}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={saving || !formTitle.trim() || !formUrl.trim() || !formDate}
                style={{
                  background: saving ? '#666' : '#E85D30',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 20px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'Sora, sans-serif',
                  marginTop: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {saving ? (
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Plus size={14} />
                )}
                {saving ? 'Criando...' : 'Criar Webinario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingWebinar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
          }}
          onClick={() => setEditingWebinar(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#141416',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 28,
              width: 440,
              maxWidth: '90vw',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  color: 'var(--app-text-primary)',
                  fontSize: 16,
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                Editar Webinario
              </h2>
              <button
                aria-label="Fechar modal de edicao"
                onClick={() => setEditingWebinar(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ color: '#999', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Titulo *
                </label>
                <input
                  aria-label="Titulo do webinario"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#999', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  URL do Webinario *
                </label>
                <input
                  aria-label="URL do webinario"
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#999', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Data e Hora *
                </label>
                <input
                  aria-label="Data e hora do webinario"
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                    colorScheme: 'dark',
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#999', fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Descricao (opcional)
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                onClick={handleEdit}
                disabled={editSaving || !editTitle.trim() || !editUrl.trim() || !editDate}
                style={{
                  background: editSaving ? '#666' : '#E85D30',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 20px',
                  cursor: editSaving ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'Sora, sans-serif',
                  marginTop: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {editSaving ? (
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                ) : null}
                {editSaving ? 'Salvando...' : 'Salvar alteracoes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete dialog */}
      {confirmDeleteId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
          }}
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#141416',
              border: '1px solid rgba(232,93,48,0.2)',
              borderRadius: 10,
              padding: 28,
              width: 360,
              maxWidth: '90vw',
              textAlign: 'center',
            }}
          >
            <Trash2 size={32} style={{ color: '#E85D30', marginBottom: 12 }} />
            <p
              style={{
                color: 'var(--app-text-primary)',
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Deletar webinario?
            </p>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
              Esta acao nao pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--app-text-primary)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: 'Sora, sans-serif',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                style={{
                  background: '#E85D30',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 20px',
                  cursor: deletingId === confirmDeleteId ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'Sora, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {deletingId === confirmDeleteId ? (
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                ) : null}
                {deletingId === confirmDeleteId ? 'Deletando...' : 'Deletar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
