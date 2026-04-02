'use client';
import { useState, useEffect } from 'react';
import { mutate } from 'swr';
import { Plus, Pencil, Trash2, Loader2, X } from 'lucide-react';
import { DataTable } from '@/components/kloel/FormExtras';
import { colors } from '@/lib/design-tokens';
import { apiFetch } from '@/lib/api';

interface Commission {
  id: string;
  role: string;
  percentage: number;
  agentName: string | null;
  agentEmail: string | null;
}

const ROLES = [
  { value: 'COPRODUCER', label: 'Coprodutor' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'AFFILIATE', label: 'Afiliado' },
];

export function ProductCommissionsTab({ productId }: { productId: string }) {
  const [items, setItems] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    role: 'AFFILIATE',
    percentage: '',
    agentName: '',
    agentEmail: '',
  });
  const [creating, setCreating] = useState(false);

  const fetch_ = () => {
    apiFetch<any>(`/products/${productId}/commissions`)
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    fetch_();
  }, [productId]);
  const handleCreate = async () => {
    setCreating(true);
    try {
      await apiFetch(`/products/${productId}/commissions`, {
        method: 'POST',
        body: { ...form, percentage: parseFloat(form.percentage) || 0 },
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
    if (!confirm('Excluir comissao?')) return;
    await apiFetch(`/products/${productId}/commissions/${id}`, { method: 'DELETE' });
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

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: colors.ember.primary }} />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold" style={{ color: colors.text.silver }}>
          Comissionamento
        </h3>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: colors.ember.primary, color: '#fff' }}
        >
          <Plus className="h-4 w-4" /> Nova comissao
        </button>
      </div>
      <DataTable
        columns={[
          {
            key: 'role',
            label: 'Papel',
            width: '20%',
            render: (v) => (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
              >
                {ROLES.find((r) => r.value === v)?.label || v}
              </span>
            ),
          },
          {
            key: 'percentage',
            label: 'Comissao',
            width: '15%',
            render: (v) => (
              <span className="text-sm font-bold" style={{ color: colors.text.silver }}>
                {Number(v).toFixed(1)}%
              </span>
            ),
          },
          { key: 'agentName', label: 'Nome', width: '25%' },
          { key: 'agentEmail', label: 'E-mail', width: '25%' },
          {
            key: 'id',
            label: 'Acoes',
            width: '15%',
            render: (_, row) => (
              <div className="flex gap-1.5">
                <button
                  className="rounded-full p-1.5"
                  style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(row.id)}
                  className="rounded-full p-1.5"
                  style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          },
        ]}
        rows={items}
        emptyText="Nenhuma comissao cadastrada"
      />
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
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
                Nova comissao
              </h3>
              <button onClick={() => setShowModal(false)}>
                <X className="h-5 w-5" style={{ color: colors.text.dim }} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                >
                  Papel
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  style={inputStyle}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                >
                  Comissao (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.percentage}
                  onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                >
                  Nome
                </label>
                <input
                  value={form.agentName}
                  onChange={(e) => setForm({ ...form, agentName: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                >
                  E-mail
                </label>
                <input
                  value={form.agentEmail}
                  onChange={(e) => setForm({ ...form, agentEmail: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md px-4 py-2 text-sm"
                style={{
                  border: `1px solid ${colors.border.space}`,
                  color: colors.text.muted,
                  backgroundColor: 'transparent',
                }}
              >
                Fechar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: colors.ember.primary, color: '#fff' }}
              >
                {creating ? 'Criando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
