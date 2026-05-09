'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
export const dynamic = 'force-dynamic';

import { useAuth } from '@/components/kloel/auth/auth-provider';
import { apiFetch } from '@/lib/api';
import { webinarApi } from '@/lib/api/webinars';
import { Loader2, Plus, Video } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { mutate } from 'swr';

import type { Webinar, WebinarListResponse } from '@/components/webinarios/types';
import { readErrorMessage } from '@/components/webinarios/utils';
import WebinarCard from '@/components/webinarios/webinar-card';
import WebinarFormModal from '@/components/webinarios/webinar-form-modal';
import type { WebinarFormData } from '@/components/webinarios/webinar-form-modal';
import WebinarDeleteDialog from '@/components/webinarios/webinar-delete-dialog';
import WebinarViewer from '@/components/webinarios/webinar-viewer';

export default function WebinariosPage() {
  const fid = useId();
  const { isAuthenticated, isLoading, workspace, openAuthModal } = useAuth();
  const workspaceId = workspace?.id;

  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);

  const [editingWebinar, setEditingWebinar] = useState<Webinar | null>(null);
  const [editDefaults, setEditDefaults] = useState<WebinarFormData | undefined>(undefined);
  const [editSaving, setEditSaving] = useState(false);

  const [viewing, setViewing] = useState<Webinar | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<WebinarListResponse>('/webinars');
      if (res.error) throw new Error(res.error);
      setWebinars(Array.isArray(res.data?.webinars) ? res.data.webinars : []);
    } catch (err: unknown) {
      setError(readErrorMessage(err, 'Falha ao carregar webinarios'));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (isAuthenticated && workspaceId) {
      void refresh();
    }
  }, [refresh, isAuthenticated, workspaceId]);

  const invalidateCache = useCallback(() => {
    mutate((key: unknown) => typeof key === 'string' && key.startsWith('/webinar'));
  }, []);

  const handleCreate = useCallback(
    async (data: WebinarFormData) => {
      setCreateSaving(true);
      try {
        const res = await apiFetch<{ id: string }>('/webinars', {
          method: 'POST',
          body: {
            title: data.title,
            url: data.url,
            date: data.date,
            description: data.description || undefined,
          },
        });
        if (res.error) throw new Error(res.error);
        setShowCreate(false);
        invalidateCache();
        refresh();
      } catch (err: unknown) {
        setError(readErrorMessage(err, 'Falha ao criar webinario'));
      } finally {
        setCreateSaving(false);
      }
    },
    [refresh, invalidateCache],
  );

  const openEdit = useCallback((webinar: Webinar) => {
    setEditingWebinar(webinar);
    const d = new Date(webinar.date);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditDefaults({
      title: webinar.title,
      url: webinar.url,
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      description: webinar.description ?? '',
    });
  }, []);

  const handleEdit = useCallback(
    async (data: WebinarFormData) => {
      if (!editingWebinar) return;
      setEditSaving(true);
      try {
        const res = await webinarApi.update(editingWebinar.id, {
          title: data.title,
          url: data.url,
          date: data.date,
          description: data.description || undefined,
        });
        if (res.error) throw new Error(res.error);
        setEditingWebinar(null);
        setEditDefaults(undefined);
        invalidateCache();
        refresh();
      } catch (err: unknown) {
        setError(readErrorMessage(err, 'Falha ao editar webinario'));
      } finally {
        setEditSaving(false);
      }
    },
    [editingWebinar, refresh, invalidateCache],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await webinarApi.remove(id);
        if (res.error) throw new Error(res.error);
        setDeletingId(null);
        invalidateCache();
        refresh();
      } catch (err: unknown) {
        setError(readErrorMessage(err, 'Falha ao deletar webinario'));
        setDeletingId(null);
      }
    },
    [refresh, invalidateCache],
  );

  if (viewing) {
    return <WebinarViewer webinar={viewing} onBack={() => setViewing(null)} />;
  }

  if (!isLoading && !isAuthenticated) {
    return (
      <div style={centerPageStyle}>
        <div style={authInnerStyle}>
          <p style={authMessageStyle}>{kloelT('Faca login para acessar seus webinarios.')}</p>
          <button type="button" onClick={() => openAuthModal()} style={loginBtnStyle}>
            {kloelT('Entrar')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div style={headerLeftStyle}>
          <Video size={20} style={emberIconStyle} aria-hidden="true" />
          <h1 style={pageTitleStyle}>{kloelT('Webinarios')}</h1>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} style={createBtnStyle}>
          <Plus size={14} aria-hidden="true" /> {kloelT('Novo Webinario')}
        </button>
      </div>

      {error && <div style={errorBannerStyle}>{error}</div>}

      {loading && (
        <div style={loaderWrapStyle}>
          <Loader2 size={20} style={loaderStyle} aria-hidden="true" />
        </div>
      )}

      {!loading && webinars.length === 0 && (
        <div style={emptyStateStyle}>
          <Video size={40} style={emptyIconStyle} aria-hidden="true" />
          <p style={emptyTextStyle}>{kloelT('Nenhum webinario criado ainda.')}</p>
          <p style={emptyHintStyle}>{kloelT('Clique em "Novo Webinario" para comecar.')}</p>
        </div>
      )}

      {!loading && webinars.length > 0 && (
        <div style={gridStyle}>
          {webinars.map((w) => (
            <WebinarCard
              key={w.id}
              webinar={w}
              onView={setViewing}
              onEdit={openEdit}
              onDelete={setDeletingId}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <WebinarFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          isSaving={createSaving}
          fidPrefix={`${fid}-create`}
          savingLabel="Criando..."
          submitLabel="Criar Webinario"
        />
      )}

      {editingWebinar && editDefaults && (
        <WebinarFormModal
          mode="edit"
          defaultValues={editDefaults}
          onClose={() => {
            setEditingWebinar(null);
            setEditDefaults(undefined);
          }}
          onSubmit={handleEdit}
          isSaving={editSaving}
          fidPrefix={`${fid}-edit`}
          savingLabel="Salvando..."
          submitLabel="Salvar alteracoes"
        />
      )}

      <WebinarDeleteDialog
        open={deletingId !== null}
        isDeleting={deletingId !== null}
        onCancel={() => setDeletingId(null)}
        onConfirm={() => {
          if (deletingId) {
            handleDelete(deletingId);
          }
        }}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const centerPageStyle: React.CSSProperties = {
  background: 'var(--app-bg-primary)',
  minHeight: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};

const authInnerStyle: React.CSSProperties = {
  textAlign: 'center',
};

const authMessageStyle: React.CSSProperties = {
  color: 'var(--app-text-primary)',
  fontSize: 14,
  marginBottom: 16,
  fontFamily: 'Sora, sans-serif',
};

const loginBtnStyle: React.CSSProperties = {
  background: colors.ember.primary,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '10px 24px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'Sora, sans-serif',
};

const pageStyle: React.CSSProperties = {
  background: 'var(--app-bg-primary)',
  minHeight: '100vh',
  padding: '24px 32px',
  fontFamily: 'Sora, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 24,
};

const headerLeftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const emberIconStyle: React.CSSProperties = {
  color: colors.ember.primary,
};

const pageTitleStyle: React.CSSProperties = {
  color: 'var(--app-text-primary)',
  fontSize: 20,
  fontWeight: 700,
  margin: 0,
};

const createBtnStyle: React.CSSProperties = {
  background: colors.ember.primary,
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
};

const errorBannerStyle: React.CSSProperties = {
  background: 'rgba(232, 93, 48, 0.08)',
  border: '1px solid rgba(232, 93, 48, 0.2)',
  borderRadius: 6,
  padding: '10px 16px',
  marginBottom: 16,
  color: colors.ember.primary,
  fontSize: 13,
};

const loaderWrapStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: 40,
};

const loaderStyle: React.CSSProperties = {
  color: colors.ember.primary,
  animation: 'spin 1s linear infinite',
};

const emptyStateStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 8,
  padding: 48,
  textAlign: 'center',
};

const emptyIconStyle: React.CSSProperties = {
  color: '#444',
  marginBottom: 12,
};

const emptyTextStyle: React.CSSProperties = {
  color: '#666',
  fontSize: 14,
};

const emptyHintStyle: React.CSSProperties = {
  color: '#555',
  fontSize: 12,
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: 12,
};
