'use client';
import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { useCallback, useEffect, useState, useId } from 'react';
import { mutate } from 'swr';
import { PixelRow, PixelAddPanel, type Pixel, type PixelFormState } from './CheckoutPixelRow';

const EMBER = 'colors.ember.primary';
const BORDER = 'var(--border-space, colors.border.space)';
const SECONDARY = 'var(--text-moonlight, colors.text.muted)';
const FAINT = 'var(--text-dust, colors.text.dim)';
const ERROR = 'var(--app-error, #e85d30)';

function toPixelErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function normalizePixelsResponse(response: unknown): Pixel[] {
  const data =
    response && typeof response === 'object' && 'data' in response
      ? (response as { data?: unknown }).data
      : undefined;

  if (!data || typeof data !== 'object' || !('pixels' in data)) {
    return [];
  }

  const pixels = (data as { pixels?: unknown }).pixels;
  if (!Array.isArray(pixels)) {
    throw new Error('Payload de pixels invalido.');
  }

  return pixels;
}

export function PixelsSection({ configId, planId }: { configId: string | null; planId: string }) {
  const fid = useId();
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<PixelFormState>({ type: 'META', pixelId: '', accessToken: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PixelFormState>({
    type: 'META',
    pixelId: '',
    accessToken: '',
  });

  const loadPixels = useCallback(async () => {
    if (!planId) {
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<unknown>(`/checkout/plans/${planId}/config`);
      setPixels(normalizePixelsResponse(res));
      setError('');
    } catch (caughtError: unknown) {
      setError(toPixelErrorMessage(caughtError, 'Falha ao carregar pixels'));
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    queueMicrotask(loadPixels);
  }, [loadPixels]);

  const handleCreate = async () => {
    if (!configId || !form.pixelId.trim()) {
      setError('Informe o ID do pixel');
      return;
    }
    setSaving(true);
    setError('');
    const res = await apiFetch(`/checkout/config/${configId}/pixels`, {
      method: 'POST',
      body: form,
    });
    if (res.error) {
      setError(res.error);
    } else {
      setShowAdd(false);
      setForm({ type: 'META', pixelId: '', accessToken: '' });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/checkout'));
      await loadPixels();
    }
    setSaving(false);
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    setError('');
    const res = await apiFetch(`/checkout/pixels/${id}`, { method: 'PUT', body: editForm });
    if (res.error) {
      setError(res.error);
    } else {
      setEditId(null);
      await loadPixels();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/checkout/pixels/${id}`, { method: 'DELETE' });
    await loadPixels();
  };

  const updateCreateForm = (patch: Partial<PixelFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateEditPixelForm = (patch: Partial<PixelFormState>) => {
    setEditForm((current) => ({ ...current, ...patch }));
  };

  const startEditingPixel = (pixel: Pixel) => {
    setEditId(pixel.id);
    setEditForm({
      type: pixel.type,
      pixelId: pixel.pixelId,
      accessToken: pixel.accessToken || '',
    });
  };

  const closeAddPanel = () => {
    setShowAdd(false);
    setError('');
  };

  if (!configId) {
    return (
      <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: SECONDARY }}>
        {kloelT(`Salve o plano primeiro para configurar pixels.`)}
      </p>
    );
  }

  return (
    <div>
      {loading && (
        <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: SECONDARY }}>
          {kloelT(`Carregando pixels...`)}
        </p>
      )}
      {error && !showAdd && (
        <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: ERROR, marginBottom: 12 }}>
          {error}
        </p>
      )}
      {pixels.map((pixel) => (
        <PixelRow
          key={pixel.id}
          pixel={pixel}
          isEditing={editId === pixel.id}
          editForm={editForm}
          saving={saving}
          onEditFormChange={updateEditPixelForm}
          onSaveEdit={() => void handleUpdate(pixel.id)}
          onCancelEdit={() => setEditId(null)}
          onStartEdit={() => startEditingPixel(pixel)}
          onDelete={() => void handleDelete(pixel.id)}
        />
      ))}
      {pixels.length === 0 && !loading && !error && (
        <p
          style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: FAINT, marginBottom: 12 }}
        >
          {kloelT(`Nenhum pixel configurado.`)}
        </p>
      )}
      {showAdd ? (
        <PixelAddPanel
          fid={fid}
          form={form}
          saving={saving}
          error={error}
          onFormChange={updateCreateForm}
          onCreate={() => void handleCreate()}
          onCancel={closeAddPanel}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: EMBER,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {kloelT(`+ Adicionar pixel`)}
        </button>
      )}
    </div>
  );
}
