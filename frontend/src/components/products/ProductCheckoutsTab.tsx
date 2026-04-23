'use client';
import { kloelT } from '@/lib/i18n/t';
import { DataTable } from '@/components/kloel/FormExtras';
import { apiFetch } from '@/lib/api';
import {
  CHECKOUT_PAYMENT_METHODS,
  CHECKOUT_TAB_COPY,
  Checkout,
  CheckoutFormState,
  createCheckoutForm,
  createDefaultCheckoutForm,
  toCheckoutErrorMessage,
} from '@/components/products/ProductCheckoutsTab.helpers';
import { colors } from '@/lib/design-tokens';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { mutate } from 'swr';

const CHECKOUT_FORM_DRAFT_VERSION = 1;

type ProductCheckoutFormDraft = {
  version: number;
  productId: string;
  savedAt: string;
  form: CheckoutFormState;
  editingCheckoutId: string | null;
  showModal: boolean;
};

function buildCheckoutFormDraftKey(productId: string): string {
  return `kloel:product-checkout-form-draft:${productId}`;
}

function readCheckoutFormDraft(
  raw: string | null,
  productId: string,
): ProductCheckoutFormDraft | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ProductCheckoutFormDraft>;
    if (
      parsed.version !== CHECKOUT_FORM_DRAFT_VERSION ||
      parsed.productId !== productId ||
      !parsed.form
    ) {
      return null;
    }
    return {
      version: CHECKOUT_FORM_DRAFT_VERSION,
      productId,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      form: {
        ...createDefaultCheckoutForm(),
        ...parsed.form,
        paymentMethods: Array.isArray(parsed.form.paymentMethods)
          ? parsed.form.paymentMethods
          : createDefaultCheckoutForm().paymentMethods,
      },
      editingCheckoutId:
        typeof parsed.editingCheckoutId === 'string' ? parsed.editingCheckoutId : null,
      showModal: parsed.showModal === true,
    };
  } catch {
    return null;
  }
}

/** Product checkouts tab. */
export function ProductCheckoutsTab({ productId }: { productId: string }) {
  const fid = useId();
  const [items, setItems] = useState<Checkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCheckoutId, setEditingCheckoutId] = useState<string | null>(null);
  const [form, setForm] = useState<CheckoutFormState>(createDefaultCheckoutForm());
  const [creating, setCreating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [checkoutPendingDelete, setCheckoutPendingDelete] = useState<Checkout | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const checkoutFormDraftKey = buildCheckoutFormDraftKey(productId);

  const fetch_ = useCallback(() => {
    setLoadError(null);
    apiFetch<Checkout[]>(`/products/${productId}/checkouts`)
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch((error: unknown) => {
        setItems([]);
        setLoadError(toCheckoutErrorMessage(error, CHECKOUT_TAB_COPY.loadError));
      })
      .finally(() => setLoading(false));
  }, [productId]);
  useEffect(() => {
    fetch_();
  }, [fetch_]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const syncNetworkState = () => setIsOnline(window.navigator.onLine);
    syncNetworkState();
    window.addEventListener('online', syncNetworkState);
    window.addEventListener('offline', syncNetworkState);
    return () => {
      window.removeEventListener('online', syncNetworkState);
      window.removeEventListener('offline', syncNetworkState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const savedDraft = readCheckoutFormDraft(
      window.localStorage.getItem(checkoutFormDraftKey),
      productId,
    );
    if (!savedDraft) {
      return;
    }
    setForm(savedDraft.form);
    setEditingCheckoutId(savedDraft.editingCheckoutId);
    setShowModal(savedDraft.showModal);
  }, [checkoutFormDraftKey, productId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !showModal) {
      return;
    }
    const payload: ProductCheckoutFormDraft = {
      version: CHECKOUT_FORM_DRAFT_VERSION,
      productId,
      savedAt: new Date().toISOString(),
      form,
      editingCheckoutId,
      showModal,
    };
    window.localStorage.setItem(checkoutFormDraftKey, JSON.stringify(payload));
  }, [checkoutFormDraftKey, editingCheckoutId, form, productId, showModal]);

  const resetForm = () => {
    setForm(createDefaultCheckoutForm());
    setEditingCheckoutId(null);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    setSubmitError(null);
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
      window.localStorage.removeItem(checkoutFormDraftKey);
      setShowModal(false);
      resetForm();
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      fetch_();
    } catch (error: unknown) {
      setSubmitError(toCheckoutErrorMessage(error, CHECKOUT_TAB_COPY.saveError));
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (checkout: Checkout) => {
    setSubmitError(null);
    setEditingCheckoutId(checkout.id);
    setForm(createCheckoutForm(checkout));
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!checkoutPendingDelete) {
      return;
    }
    setDeleteError(null);
    try {
      await apiFetch(`/products/${productId}/checkouts/${checkoutPendingDelete.id}`, {
        method: 'DELETE',
      });
      setCheckoutPendingDelete(null);
      fetch_();
    } catch (error: unknown) {
      setDeleteError(toCheckoutErrorMessage(error, CHECKOUT_TAB_COPY.deleteError));
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
        <div
          className="rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em]"
          style={{
            color: colors.ember.primary,
            border: `1px solid ${colors.border.space}`,
            backgroundColor: 'rgba(232,93,48,0.08)',
          }}
          role="status"
        >
          {kloelT(`Carregando checkouts`)}
        </div>
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
          <Plus className="h-4 w-4" aria-hidden="true" /> {kloelT(`Novo checkout`)}
        </button>
      </div>
      {loadError ? (
        <p className="text-sm" style={{ color: colors.ember.primary }}>
          {loadError}
        </p>
      ) : null}
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
                  aria-label={CHECKOUT_TAB_COPY.editCheckoutAria}
                  className="rounded-full p-1.5"
                  style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setCheckoutPendingDelete(row);
                  }}
                  aria-label={CHECKOUT_TAB_COPY.deleteCheckoutAria}
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
                {editingCheckoutId ? CHECKOUT_TAB_COPY.editCheckout : CHECKOUT_TAB_COPY.newCheckout}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                aria-label={CHECKOUT_TAB_COPY.closeModalAria}
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
                  {CHECKOUT_PAYMENT_METHODS.map((m) => (
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
            {submitError ? (
              <p className="mt-4 text-sm" style={{ color: colors.ember.primary }}>
                {submitError}
              </p>
            ) : null}
            {!isOnline ? (
              <p className="mt-4 text-xs" style={{ color: colors.text.muted }}>
                {kloelT(`Sem conexao agora. O rascunho deste checkout foi salvo localmente.`)}
              </p>
            ) : null}
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
                  ? CHECKOUT_TAB_COPY.saving
                  : editingCheckoutId
                    ? CHECKOUT_TAB_COPY.saveCheckout
                    : CHECKOUT_TAB_COPY.createCheckout}
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutPendingDelete && (
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
            <div className="space-y-3">
              <h3 className="text-lg font-semibold" style={{ color: colors.text.silver }}>
                {kloelT(`Excluir checkout`)}
              </h3>
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT(`Tem certeza que deseja excluir este checkout?`)}
              </p>
              <p className="text-xs" style={{ color: colors.text.dim }}>
                {checkoutPendingDelete.name || checkoutPendingDelete.code}
              </p>
              {deleteError ? (
                <p className="text-sm" style={{ color: colors.ember.primary }}>
                  {deleteError}
                </p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setCheckoutPendingDelete(null);
                }}
                className="rounded-md px-4 py-2 text-sm"
                style={{
                  border: `1px solid ${colors.border.space}`,
                  color: colors.text.muted,
                  backgroundColor: 'transparent',
                }}
              >
                {kloelT(`Cancelar`)}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md px-4 py-2 text-sm font-semibold"
                style={{
                  backgroundColor: colors.ember.primary,
                  color: 'var(--app-text-on-accent)',
                }}
              >
                {kloelT(`Excluir`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
