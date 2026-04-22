'use client';

import { kloelFormatNumber, kloelT } from '@/lib/i18n/t';
import { DataTable } from '@/components/kloel/FormExtras';
import { apiFetch } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import { Eye, Link2, Loader2, Pencil, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { mutate } from 'swr';

interface Plan {
  id: string;
  name: string;
  price: number;
  billingType: string;
  itemsPerPlan: number;
  visibleToAffiliates: boolean;
  active: boolean;
  salesCount: number;
}

const PRODUCT_PLANS_COPY = {
  loadError: kloelT(`Falha ao carregar planos`),
  createError: kloelT(`Falha ao criar plano`),
  duplicateError: kloelT(`Falha ao duplicar plano`),
  closeModalAria: kloelT(`Fechar modal`),
  closeErrorAria: kloelT(`Fechar erro`),
  copied: kloelT(`Copiado`),
  copy: kloelT(`Copiar`),
  visible: kloelT(`VISIVEL`),
  hidden: kloelT(`OCULTO`),
  active: kloelT(`ATIVO`),
  inactive: kloelT(`INATIVO`),
  nameInputAria: kloelT(`Nome do plano`),
  priceInputAria: kloelT(`Valor do plano em reais`),
  itemsInputAria: kloelT(`Itens por plano`),
} as const;

function toPlanErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Product plans tab. */
export function ProductPlansTab({ productId }: { productId: string }) {
  const fid = useId();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState({
    name: '',
    price: '',
    billingType: 'ONE_TIME',
    itemsPerPlan: 1,
  });
  const [creating, setCreating] = useState(false);
  const [linkModalPlan, setLinkModalPlan] = useState<Plan | null>(null);
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

  const copyUrl = (url: string, key: string) => {
    navigator.clipboard?.writeText(url);
    setCopied(key);
    if (copiedTimer.current) {
      clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  };

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch<Plan[]>(`/products/${productId}/plans`);
      setPlans(Array.isArray(response) ? response : []);
      setError(null);
    } catch (caughtError: unknown) {
      setPlans([]);
      setError(toPlanErrorMessage(caughtError, PRODUCT_PLANS_COPY.loadError));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await apiFetch(`/products/${productId}/plans`, {
        method: 'POST',
        body: { ...newPlan, price: Number.parseFloat(newPlan.price) || 0 },
      });
      setShowModal(false);
      setNewPlan({ name: '', price: '', billingType: 'ONE_TIME', itemsPerPlan: 1 });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      await fetchPlans();
    } catch (caughtError: unknown) {
      setError(toPlanErrorMessage(caughtError, PRODUCT_PLANS_COPY.createError));
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (plan: Plan) => {
    setError(null);
    try {
      await apiFetch(`/products/${productId}/plans`, {
        method: 'POST',
        body: {
          name: `${plan.name} (Copia)`,
          price: plan.price,
          billingType: plan.billingType || 'ONE_TIME',
          itemsPerPlan: plan.itemsPerPlan || 1,
        },
      });
      await fetchPlans();
    } catch (caughtError: unknown) {
      setError(toPlanErrorMessage(caughtError, PRODUCT_PLANS_COPY.duplicateError));
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
            aria-label={PRODUCT_PLANS_COPY.closeErrorAria}
            className="rounded-full p-1"
            style={{ color: colors.state.error }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold" style={{ color: colors.text.silver }}>
          {kloelT(`Planos cadastrados`)}
        </h3>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: colors.ember.primary, color: 'var(--app-text-on-accent)' }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> {kloelT(`Novo plano`)}
        </button>
      </div>

      <DataTable
        columns={[
          {
            key: 'id',
            label: 'Codigo',
            width: '12%',
            render: (v) => (
              <span className="font-mono text-xs" style={{ color: colors.text.dim }}>
                {String(v).slice(0, 8)}
              </span>
            ),
          },
          { key: 'name', label: 'Nome', width: '20%' },
          { key: 'itemsPerPlan', label: 'Itens', width: '8%' },
          {
            key: 'price',
            label: 'Valor',
            width: '12%',
            render: (v) => (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: 'rgba(224,221,216,0.12)', color: colors.text.silver }}
              >
                {kloelT(`R$`)}{' '}
                {kloelFormatNumber(Number(v), {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            ),
          },
          {
            key: 'visibleToAffiliates',
            label: 'Afiliados',
            width: '12%',
            render: (v) =>
              v ? (
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ backgroundColor: 'rgba(224,221,216,0.12)', color: colors.text.silver }}
                >
                  {PRODUCT_PLANS_COPY.visible}
                </span>
              ) : (
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ backgroundColor: colors.background.elevated, color: colors.text.muted }}
                >
                  {PRODUCT_PLANS_COPY.hidden}
                </span>
              ),
          },
          {
            key: 'active',
            label: 'Status',
            width: '10%',
            render: (v) =>
              v ? (
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ backgroundColor: 'rgba(224,221,216,0.12)', color: colors.text.silver }}
                >
                  {PRODUCT_PLANS_COPY.active}
                </span>
              ) : (
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
                >
                  {PRODUCT_PLANS_COPY.inactive}
                </span>
              ),
          },
          {
            key: 'salesCount',
            label: 'Vendas',
            width: '10%',
            render: (v) => (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor:
                    Number(v) > 0 ? 'rgba(224,221,216,0.12)' : colors.background.elevated,
                  color: Number(v) > 0 ? colors.text.silver : colors.text.dim,
                }}
              >
                {String(v ?? '')}
              </span>
            ),
          },
          {
            key: 'id',
            label: 'Acoes',
            width: '16%',
            render: (_, row) => (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => router.push(`/products/${productId}?tab=planos`)}
                  title={kloelT(`Editar no Nerve Center`)}
                  className="rounded-full p-1.5"
                  style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDuplicate(row);
                  }}
                  title={kloelT(`Duplicar`)}
                  className="rounded-full p-1.5"
                  style={{ backgroundColor: colors.background.elevated, color: colors.text.muted }}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setLinkModalPlan(row)}
                  title={kloelT(`Links de checkout`)}
                  className="rounded-full p-1.5"
                  style={{ backgroundColor: 'rgba(224,221,216,0.12)', color: colors.text.silver }}
                >
                  <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ),
          },
        ]}
        rows={plans}
        emptyText={kloelT(`Nenhum plano cadastrado`)}
      />

      {/* Modal Links de Checkout */}
      {linkModalPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            backgroundColor: 'var(--cookie-overlay, rgba(0,0,0,0.6))',
            backdropFilter: 'blur(4px)',
          }}
        >
          <button
            type="button"
            aria-label={PRODUCT_PLANS_COPY.closeModalAria}
            onClick={() => setLinkModalPlan(null)}
            className="absolute inset-0"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-lg rounded-md p-6"
            style={{
              backgroundColor: colors.background.void,
              border: `1px solid ${colors.border.space}`,
              boxShadow: 'var(--cookie-shadow, 0 20px 60px rgba(0,0,0,0.5))',
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold" style={{ color: colors.text.silver }}>
                {kloelT(`Acessos operacionais —`)} {linkModalPlan.name}
              </h3>
              <button
                type="button"
                onClick={() => setLinkModalPlan(null)}
                aria-label={PRODUCT_PLANS_COPY.closeModalAria}
              >
                <X className="h-5 w-5" style={{ color: colors.text.dust }} aria-hidden="true" />
              </button>
            </div>
            {[
              { label: 'Abrir produto', url: `${window.location.origin}/products/${productId}` },
              {
                label: 'Abrir tab de planos',
                url: `${window.location.origin}/products/${productId}?tab=planos`,
              },
              {
                label: 'Abrir checkouts',
                url: `${window.location.origin}/products/${productId}?tab=checkouts`,
              },
            ].map((link) => (
              <div
                key={link.label}
                style={{
                  marginBottom: 12,
                  padding: '12px 14px',
                  background: colors.background.surface,
                  border: `1px solid ${colors.border.space}`,
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: colors.text.muted,
                    letterSpacing: '.06em',
                    textTransform: 'uppercase' as const,
                    marginBottom: 6,
                  }}
                >
                  {link.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      flex: 1,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12,
                      color: colors.ember.primary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' as const,
                    }}
                  >
                    {link.url}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyUrl(link.url, link.label)}
                    style={{
                      padding: '5px 12px',
                      background: 'none',
                      border: `1px solid ${colors.border.space}`,
                      borderRadius: 6,
                      color: copied === link.label ? colors.state.success : colors.text.muted,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: "'Sora', sans-serif",
                      minWidth: 70,
                    }}
                  >
                    {copied === link.label ? PRODUCT_PLANS_COPY.copied : PRODUCT_PLANS_COPY.copy}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Novo Plano */}
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
                {kloelT(`Novo plano`)}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label={PRODUCT_PLANS_COPY.closeModalAria}
              >
                <X className="h-5 w-5" style={{ color: colors.text.dim }} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                  htmlFor={`${fid}-nome`}
                >
                  {kloelT(`Nome *`)}
                </label>
                <input
                  aria-label={PRODUCT_PLANS_COPY.nameInputAria}
                  value={newPlan.name}
                  onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                  style={inputStyle}
                  id={`${fid}-nome`}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                  htmlFor={`${fid}-valor`}
                >
                  {kloelT(`Valor (R$) *`)}
                </label>
                <input
                  type="number"
                  step="0.01"
                  aria-label={PRODUCT_PLANS_COPY.priceInputAria}
                  value={newPlan.price}
                  onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })}
                  style={inputStyle}
                  id={`${fid}-valor`}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                  htmlFor={`${fid}-cobranca`}
                >
                  {kloelT(`Forma de cobranca`)}
                </label>
                <select
                  value={newPlan.billingType}
                  onChange={(e) => setNewPlan({ ...newPlan, billingType: e.target.value })}
                  style={inputStyle}
                  id={`${fid}-cobranca`}
                >
                  <option value="ONE_TIME">{kloelT(`Unica`)}</option>
                  <option value="RECURRING">{kloelT(`Recorrente`)}</option>
                  <option value="FREE">{kloelT(`Gratis`)}</option>
                </select>
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase"
                  style={{ color: colors.text.muted }}
                  htmlFor={`${fid}-itens`}
                >
                  {kloelT(`Itens por plano`)}
                </label>
                <input
                  type="number"
                  min={1}
                  aria-label={PRODUCT_PLANS_COPY.itemsInputAria}
                  value={newPlan.itemsPerPlan}
                  onChange={(e) =>
                    setNewPlan({
                      ...newPlan,
                      itemsPerPlan: Number.parseInt(e.target.value, 10) || 1,
                    })
                  }
                  style={inputStyle}
                  id={`${fid}-itens`}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-md px-4 py-2 text-sm font-medium"
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
                disabled={creating || !newPlan.name}
                className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{
                  backgroundColor: colors.ember.primary,
                  color: 'var(--app-text-on-accent)',
                }}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}

                {kloelT(`Adicionar plano`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
