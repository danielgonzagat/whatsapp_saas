'use client';
import { kloelFormatNumber, kloelT } from '@/lib/i18n/t';
import { DataTable } from '@/components/kloel/FormExtras';
import { apiFetch } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { mutate } from 'swr';

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

const PRODUCT_COMMISSIONS_COPY = {
  loadError: kloelT(`Falha ao carregar comissoes`),
  saveError: kloelT(`Falha ao salvar comissao`),
  deleteError: kloelT(`Falha ao excluir comissao`),
  deleteTitle: kloelT(`Excluir comissao`),
  deleteDescription: kloelT(`Tem certeza que deseja excluir esta comissao?`),
  cancel: kloelT(`Cancelar`),
  confirmDelete: kloelT(`Excluir`),
  deleting: kloelT(`Excluindo...`),
  editingTitle: kloelT(`Editar comissao`),
  newTitle: kloelT(`Nova comissao`),
  closeModalAria: kloelT(`Fechar modal`),
  closeErrorAria: kloelT(`Fechar erro`),
  saving: kloelT(`Salvando...`),
  save: kloelT(`Salvar`),
  add: kloelT(`Adicionar`),
} as const;

function toCommissionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function buildCommissionPayload(form: {
  role: string;
  percentage: string;
  agentName: string;
  agentEmail: string;
}) {
  return { ...form, percentage: Number.parseFloat(form.percentage) || 0 };
}

/** Product commissions tab. */
export function ProductCommissionsTab({ productId }: { productId: string }) {
  const fid = useId();
  const [items, setItems] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    role: 'AFFILIATE',
    percentage: '',
    agentName: '',
    agentEmail: '',
  });
  const [creating, setCreating] = useState(false);
  const [commissionPendingDelete, setCommissionPendingDelete] = useState<Commission | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch<Commission[] | { data?: Commission[] }>(
        `/products/${productId}/commissions`,
      );
      setItems(Array.isArray(response) ? response : []);
      setError(null);
    } catch (caughtError: unknown) {
      setItems([]);
      setError(toCommissionErrorMessage(caughtError, PRODUCT_COMMISSIONS_COPY.loadError));
    } finally {
      setLoading(false);
    }
  }, [productId]);
  useEffect(() => {
    fetch_();
  }, [fetch_]);
  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
  };
  const openEditModal = (commission: Commission) => {
    setEditingId(commission.id);
    setForm({
      role: commission.role,
      percentage: String(commission.percentage),
      agentName: commission.agentName || '',
      agentEmail: commission.agentEmail || '',
    });
    setShowModal(true);
  };
  const openCreateModal = () => {
    setEditingId(null);
    setForm({ role: 'AFFILIATE', percentage: '', agentName: '', agentEmail: '' });
    setShowModal(true);
  };
  const handleSave = async () => {
    setCreating(true);
    setError(null);
    try {
      const payload = buildCommissionPayload(form);
      if (editingId) {
        await apiFetch(`/products/${productId}/commissions/${editingId}`, {
          method: 'PUT',
          body: payload,
        });
      } else {
        await apiFetch(`/products/${productId}/commissions`, { method: 'POST', body: payload });
      }
      closeModal();
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      await fetch_();
    } catch (caughtError: unknown) {
      setError(toCommissionErrorMessage(caughtError, PRODUCT_COMMISSIONS_COPY.saveError));
    } finally {
      setCreating(false);
    }
  };
  const handleDelete = async () => {
    if (!commissionPendingDelete) {
      return;
    }
    setDeletingId(commissionPendingDelete.id);
    setError(null);
    try {
      await apiFetch(`/products/${productId}/commissions/${commissionPendingDelete.id}`, {
        method: 'DELETE',
      });
      setCommissionPendingDelete(null);
      await fetch_();
    } catch (caughtError: unknown) {
      setError(toCommissionErrorMessage(caughtError, PRODUCT_COMMISSIONS_COPY.deleteError));
    } finally {
      setDeletingId(null);
    }
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
      {error && (
        <div
          className="flex items-center justify-between rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: colors.state.error,
            backgroundColor: colors.background.elevated,
            color: colors.state.error,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label={PRODUCT_COMMISSIONS_COPY.closeErrorAria}
            className="rounded-full p-1"
            style={{ color: colors.state.error }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold" style={{ color: colors.text.silver }}>
          {kloelT(`Comissionamento`)}
        </h3>
        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: colors.ember.primary, color: 'var(--app-text-on-accent)' }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> {kloelT(`Nova comissao`)}
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
                {ROLES.find((r) => r.value === v)?.label || String(v ?? '')}
              </span>
            ),
          },
          {
            key: 'percentage',
            label: 'Comissao',
            width: '15%',
            render: (v) => (
              <span className="text-sm font-bold" style={{ color: colors.text.silver }}>
                {kloelFormatNumber(Number(v), {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
                %
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
                  type="button"
                  onClick={() => openEditModal(row as Commission)}
                  className="rounded-full p-1.5"
                  style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setCommissionPendingDelete(row as Commission)}
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
        emptyText={kloelT(`Nenhuma comissao cadastrada`)}
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
                {editingId
                  ? PRODUCT_COMMISSIONS_COPY.editingTitle
                  : PRODUCT_COMMISSIONS_COPY.newTitle}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                aria-label={PRODUCT_COMMISSIONS_COPY.closeModalAria}
              >
                <X className="h-5 w-5" style={{ color: colors.text.dim }} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                  htmlFor={`${fid}-papel`}
                >
                  {kloelT(`Papel`)}
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  style={inputStyle}
                  id={`${fid}-papel`}
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
                  htmlFor={`${fid}-comissao`}
                >
                  {kloelT(`Comissao (%)`)}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.percentage}
                  onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                  style={inputStyle}
                  id={`${fid}-comissao`}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                  htmlFor={`${fid}-nome`}
                >
                  {kloelT(`Nome`)}
                </label>
                <input
                  value={form.agentName}
                  onChange={(e) => setForm({ ...form, agentName: e.target.value })}
                  style={inputStyle}
                  id={`${fid}-nome`}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                  htmlFor={`${fid}-email`}
                >
                  {kloelT(`E-mail`)}
                </label>
                <input
                  value={form.agentEmail}
                  onChange={(e) => setForm({ ...form, agentEmail: e.target.value })}
                  style={inputStyle}
                  id={`${fid}-email`}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
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
                onClick={handleSave}
                disabled={creating}
                className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: colors.ember.primary,
                  color: 'var(--app-text-on-accent)',
                }}
              >
                {creating
                  ? PRODUCT_COMMISSIONS_COPY.saving
                  : editingId
                    ? PRODUCT_COMMISSIONS_COPY.save
                    : PRODUCT_COMMISSIONS_COPY.add}
              </button>
            </div>
          </div>
        </div>
      )}
      {commissionPendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'var(--cookie-overlay, rgba(0,0,0,0.6))' }}
          onClick={() => setCommissionPendingDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-md p-6"
            style={{
              backgroundColor: colors.background.surface,
              border: `1px solid ${colors.border.space}`,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-2">
              <h3 className="text-lg font-semibold" style={{ color: colors.text.silver }}>
                {PRODUCT_COMMISSIONS_COPY.deleteTitle}
              </h3>
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {PRODUCT_COMMISSIONS_COPY.deleteDescription}
              </p>
              <p className="text-xs font-medium" style={{ color: colors.text.dim }}>
                {commissionPendingDelete.agentEmail ||
                  commissionPendingDelete.agentName ||
                  commissionPendingDelete.role}
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCommissionPendingDelete(null)}
                className="rounded-md px-4 py-2 text-sm"
                style={{
                  border: `1px solid ${colors.border.space}`,
                  color: colors.text.muted,
                  backgroundColor: 'transparent',
                }}
              >
                {PRODUCT_COMMISSIONS_COPY.cancel}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletingId === commissionPendingDelete.id}
                className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: colors.ember.primary,
                  color: 'var(--app-text-on-accent)',
                }}
              >
                {deletingId === commissionPendingDelete.id
                  ? PRODUCT_COMMISSIONS_COPY.deleting
                  : PRODUCT_COMMISSIONS_COPY.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
