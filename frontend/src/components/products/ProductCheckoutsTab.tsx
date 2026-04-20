'use client';
import { kloelT } from '@/lib/i18n/t';
import { DataTable } from '@/components/kloel/FormExtras';
import { apiFetch } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { mutate } from 'swr';

interface CheckoutConfig {
  paymentMethods?: string[];
  [key: string]: unknown;
}

interface Checkout {
  id: string;
  name: string;
  code: string;
  config: CheckoutConfig;
  uniqueVisits: number;
  totalVisits: number;
  abandonRate: number;
  cancelRate: number;
  conversionRate: number;
  active: boolean;
}

/** Product checkouts tab. */
export function ProductCheckoutsTab({ productId }: { productId: string }) {
  const fid = useId();
  const [items, setItems] = useState<Checkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCheckoutId, setEditingCheckoutId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', paymentMethods: ['PIX', 'CARTAO'], active: true });
  const [creating, setCreating] = useState(false);

  const fetch_ = useCallback(() => {
    apiFetch<Checkout[]>(`/products/${productId}/checkouts`)
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [productId]);
  useEffect(() => {
    fetch_();
  }, [fetch_]);

  const resetForm = () => {
    setForm({ name: '', paymentMethods: ['PIX', 'CARTAO'], active: true });
    setEditingCheckoutId(null);
  };

  const handleSubmit = async () => {
    setCreating(true);
    try {
      const body = {
        name: form.name,
        active: form.active,
        config: { paymentMethods: form.paymentMethods },
      };
      if (editingCheckoutId) {
        await apiFetch(`/products/${productId}/checkouts/${editingCheckoutId}`, {
          method: 'PUT',
          body,
        });
      } else {
        await apiFetch(`/products/${productId}/checkouts`, { method: 'POST', body });
      }
      setShowModal(false);
      resetForm();
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      fetch_();
    } catch {
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (checkout: Checkout) => {
    setEditingCheckoutId(checkout.id);
    setForm({
      name: checkout.name || '',
      paymentMethods:
        Array.isArray(checkout.config?.paymentMethods) && checkout.config.paymentMethods.length > 0
          ? checkout.config.paymentMethods
          : ['PIX', 'CARTAO'],
      active: checkout.active !== false,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir checkout?')) {
      return;
    }
    await apiFetch(`/products/${productId}/checkouts/${id}`, { method: 'DELETE' });
    fetch_();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    borderRadius: 6,
    border: `1px solid ${colors.border.space}`,
    backgroundColor: colors.background.elevated,
    padding: '10px 16px',
    fontSize: 14,
    color: colors.text.silver,
    outline: 'none',
    fontFamily: "'Sora', sans-serif",
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2
          className="h-6 w-6 animate-spin"
          style={{ color: colors.ember.primary }}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold" style={{ color: colors.text.silver }}>
          
          {kloelT(`Checkouts disponiveis`)}
        </h3>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: colors.ember.primary, color: 'var(--app-text-on-accent)' }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />  {kloelT(`Novo checkout`)}
        </button>
      </div>
      <DataTable
        columns={[
          {
            key: 'code',
            label: 'Codigo',
            width: '10%',
            render: (v) => (
              <span className="font-mono text-xs" style={{ color: colors.text.dim }}>
                {String(v).slice(0, 8)}
              </span>
            ),
          },
          { key: 'name', label: 'Descricao', width: '22%' },
          {
            key: 'config',
            label: 'Pagamento',
            width: '18%',
            render: (v) => {
              const methods = (v as { paymentMethods?: string[] } | null)?.paymentMethods ?? [];
              return (
                <div className="flex flex-wrap gap-1">
                  {methods.map((m) => (
                    <span
                      key={m}
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                      style={{
                        backgroundColor: 'rgba(224,221,216,0.12)',
                        color: colors.text.silver,
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              );
            },
          },
          {
            key: 'active',
            label: 'Status',
            width: '10%',
            render: (v) => (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: v ? 'rgba(16,185,129,0.12)' : 'rgba(232,93,48,0.12)',
                  color: v ? '#7FE2BC' : colors.ember.primary,
                }}
              >
                {v ? 'ATIVO' : 'OFF'}
              </span>
            ),
          },
          {
            key: 'config',
            label: 'Resumo',
            width: '24%',
            render: (v) => {
              const methods = (v as { paymentMethods?: unknown[] } | null)?.paymentMethods;
              const enabled = Array.isArray(methods) && methods.length > 0;
              return (
                <span className="text-xs" style={{ color: colors.text.muted }}>
                  {enabled
                    ? `${(methods as unknown[]).length} forma(s) habilitada(s)`
                    : 'Checkout pronto para configurar no Kloel'}
                </span>
              );
            },
          },
          {
            key: 'id',
            label: 'Acoes',
            width: '16%',
            render: (_, row) => (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handleEdit(row)}
                  className="rounded-full p-1.5"
                  style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(row.id)}
                  className="rounded-full p-1.5"
                  style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ),
          },
        ]}
        rows={items}
        emptyText={kloelT(`Nenhum checkout criado`)}
      />

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'var(--cookie-overlay, rgba(0,0,0,0.6))' }}
        >
          <div
            className="w-full max-w-md rounded-md p-6"
            style={{
              backgroundColor: colors.background.surface,
              border: `1px solid ${colors.border.space}`,
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold" style={{ color: colors.text.silver }}>
                {editingCheckoutId ? 'Editar checkout' : 'Novo checkout'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                <X className="h-5 w-5" style={{ color: colors.text.dim }} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                  htmlFor={`${fid}-desc`}
                >
                  
                  {kloelT(`Descricao *`)}
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={inputStyle}
                  id={`${fid}-desc`}
                />
              </div>
              <div>
                <span
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                >
                  
                  {kloelT(`Formas de pagamento`)}
                </span>
                <div className="flex flex-wrap gap-2">
                  {['BOLETO', 'CARTAO', 'PIX', 'RECEBA_E_PAGUE'].map((m) => (
                    <label
                      key={m}
                      className="flex items-center gap-1.5 text-sm"
                      style={{ color: colors.text.muted }}
                    >
                      <input
                        type="checkbox"
                        checked={form.paymentMethods.includes(m)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            paymentMethods: e.target.checked
                              ? [...form.paymentMethods, m]
                              : form.paymentMethods.filter((x) => x !== m),
                          })
                        }
                        style={{ accentColor: colors.ember.primary }}
                      />
                      {m}
                    </label>
                  ))}
                </div>
              </div>
              <label
                className="flex items-center gap-2 text-sm"
                style={{ color: colors.text.muted }}
              >
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  style={{ accentColor: colors.ember.primary }}
                />
                
                {kloelT(`Checkout ativo`)}
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="rounded-md px-4 py-2 text-sm"
                style={{
                  border: `1px solid ${colors.border.space}`,
                  color: colors.text.muted,
                  backgroundColor: 'transparent',
                }}
              >
                
                {kloelT(`Fechar`)}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={creating || !form.name}
                className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: colors.ember.primary,
                  color: 'var(--app-text-on-accent)',
                }}
              >
                {creating
                  ? 'Salvando...'
                  : editingCheckoutId
                    ? 'Salvar checkout'
                    : 'Criar checkout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
