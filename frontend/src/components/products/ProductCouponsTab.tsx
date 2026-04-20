'use client';
import { kloelT } from '@/lib/i18n/t';
import { DataTable } from '@/components/kloel/FormExtras';
import { apiFetch } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { mutate } from 'swr';

interface Coupon {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  active: boolean;
}

/** Product coupons tab. */
export function ProductCouponsTab({ productId }: { productId: string }) {
  const fid = useId();
  const [items, setItems] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    code: '',
    discountType: 'PERCENT',
    discountValue: '',
    maxUses: '',
    expiresAt: '',
  });
  const [creating, setCreating] = useState(false);

  const fetch_ = useCallback(() => {
    apiFetch<Coupon[]>(`/products/${productId}/coupons`)
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [productId]);
  useEffect(() => {
    fetch_();
  }, [fetch_]);
  const handleCreate = async () => {
    setCreating(true);
    try {
      await apiFetch(`/products/${productId}/coupons`, {
        method: 'POST',
        body: {
          code: form.code.toUpperCase(),
          discountType: form.discountType,
          discountValue: Number.parseFloat(form.discountValue) || 0,
          maxUses: Number.parseInt(form.maxUses, 10) || null,
          expiresAt: form.expiresAt || null,
        },
      });
      setShowModal(false);
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      fetch_();
    } catch {
    } finally {
      setCreating(false);
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Excluir cupom?')) {
      return;
    }
    await apiFetch(`/products/${productId}/coupons/${id}`, { method: 'DELETE' });
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
          
          {kloelT(`Cupons de desconto`)}
        </h3>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: colors.ember.primary, color: 'var(--app-text-on-accent)' }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />  {kloelT(`Novo cupom`)}
        </button>
      </div>
      <DataTable
        columns={[
          {
            key: 'code',
            label: 'Codigo',
            width: '15%',
            render: (v) => (
              <span className="font-mono text-sm font-bold" style={{ color: colors.text.silver }}>
                {String(v ?? '')}
              </span>
            ),
          },
          {
            key: 'discountType',
            label: 'Tipo',
            width: '10%',
            render: (v) => (
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
              >
                {v === 'PERCENT' ? '%' : 'R$'}
              </span>
            ),
          },
          {
            key: 'discountValue',
            label: 'Valor',
            width: '10%',
            render: (v, row) => (
              <span className="text-sm font-bold" style={{ color: colors.text.silver }}>
                {row.discountType === 'PERCENT' ? `${v}%` : `R$ ${Number(v).toFixed(2)}`}
              </span>
            ),
          },
          {
            key: 'maxUses',
            label: 'Max Usos',
            width: '10%',
            render: (v) => (v ? String(v) : '\u221E'),
          },
          { key: 'usedCount', label: 'Usados', width: '10%' },
          {
            key: 'expiresAt',
            label: 'Expira',
            width: '15%',
            render: (v) =>
              v ? new Date(v as string | number).toLocaleDateString('pt-BR') : 'Sem expiracao',
          },
          {
            key: 'active',
            label: 'Status',
            width: '10%',
            render: (v) =>
              v ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px]"
                  style={{ backgroundColor: 'rgba(224,221,216,0.12)', color: colors.text.silver }}
                >
                  ATIVO
                </span>
              ) : (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px]"
                  style={{ backgroundColor: colors.background.elevated, color: colors.text.muted }}
                >
                  INATIVO
                </span>
              ),
          },
          {
            key: 'id',
            label: 'Acoes',
            width: '10%',
            render: (_, row) => (
              <button
                type="button"
                onClick={() => handleDelete(row.id)}
                className="rounded-full p-1.5"
                style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ),
          },
        ]}
        rows={items}
        emptyText={kloelT(`Nenhum cupom cadastrado`)}
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
                
                {kloelT(`Novo cupom`)}
              </h3>
              <button type="button" onClick={() => setShowModal(false)}>
                <X className="h-5 w-5" style={{ color: colors.text.dim }} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                  htmlFor={`${fid}-codigo`}
                >
                  
                  {kloelT(`Codigo *`)}
                </label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="DESCONTO10"
                  className="font-mono uppercase"
                  style={inputStyle}
                  id={`${fid}-codigo`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase"
                    style={{ color: colors.text.muted }}
                    htmlFor={`${fid}-tipo`}
                  >
                    
                    {kloelT(`Tipo`)}
                  </label>
                  <select
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                    style={inputStyle}
                    id={`${fid}-tipo`}
                  >
                    <option value="PERCENT">{kloelT(`Percentual (%)`)}</option>
                    <option value="FIXED">{kloelT(`Valor fixo (R$)`)}</option>
                  </select>
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase"
                    style={{ color: colors.text.muted }}
                    htmlFor={`${fid}-valor`}
                  >
                    
                    {kloelT(`Valor`)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    style={inputStyle}
                    id={`${fid}-valor`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase"
                    style={{ color: colors.text.muted }}
                    htmlFor={`${fid}-max-usos`}
                  >
                    
                    {kloelT(`Max usos`)}
                  </label>
                  <input
                    type="number"
                    value={form.maxUses}
                    onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                    placeholder={kloelT(`Ilimitado`)}
                    style={inputStyle}
                    id={`${fid}-max-usos`}
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-semibold uppercase"
                    style={{ color: colors.text.muted }}
                    htmlFor={`${fid}-expira`}
                  >
                    
                    {kloelT(`Expira em`)}
                  </label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                    style={inputStyle}
                    id={`${fid}-expira`}
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
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
                onClick={handleCreate}
                disabled={creating || !form.code}
                className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: colors.ember.primary,
                  color: 'var(--app-text-on-accent)',
                }}
              >
                {creating ? 'Criando...' : 'Criar cupom'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
