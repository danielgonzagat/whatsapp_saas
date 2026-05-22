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
      const res = await apiFetch(`/checkout/plans/${planId}/config`);
      const data = res.data as { pixels?: Pixel[] } | undefined;
      setPixels(Array.isArray(data?.pixels) ? data.pixels : []);
    } catch {
      setPixels([]);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    loadPixels();
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
      {pixels.length === 0 && !loading && (
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
