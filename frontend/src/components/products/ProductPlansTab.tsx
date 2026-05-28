'use client';

import { kloelFormatNumber, kloelT } from '@/lib/i18n/t';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { DataTable } from '@/components/kloel/FormExtras';
import { apiFetch } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import { Eye, Link2, Pencil, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { mutate } from 'swr';

import {
  INITIAL_NEW_PLAN,
  PRODUCT_PLANS_COPY,
  buildDuplicatedPlanBody,
  buildPlanInputStyle,
  buildPlanLinks,
  formatSalesCount,
  isProductsCacheKey,
  normalizePlansResponse,
  parseCreatePlanBody,
  parseItemsPerPlan,
  resolveActiveBadge,
  resolveAffiliateBadge,
  resolveSalesCellStyle,
  shortPlanId,
  toPlanErrorMessage,
  type Plan,
} from './ProductPlansTab.helpers';

const PLAN_INPUT_STYLE = buildPlanInputStyle();

/** Product plans tab. */
export function ProductPlansTab({ productId }: { productId: string }) {
  const fid = useId();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState(INITIAL_NEW_PLAN);
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
      setPlans(normalizePlansResponse(response));
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
        body: parseCreatePlanBody(newPlan),
      });
      setShowModal(false);
      setNewPlan(INITIAL_NEW_PLAN);
      mutate(isProductsCacheKey);
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
        body: buildDuplicatedPlanBody(plan),
      });
      await fetchPlans();
    } catch (caughtError: unknown) {
      setError(toPlanErrorMessage(caughtError, PRODUCT_PLANS_COPY.duplicateError));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <KloelMushroomMark size={28} title="Carregando planos" traceColor={colors.ember.primary} />
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
                {shortPlanId(v)}
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
            render: (v) => {
              const badge = resolveAffiliateBadge(Boolean(v));
              return (
                <span className="rounded-full px-2 py-0.5 text-xs" style={badge.style}>
                  {badge.label}
                </span>
              );
            },
          },
          {
            key: 'active',
            label: 'Status',
            width: '10%',
            render: (v) => {
              const badge = resolveActiveBadge(Boolean(v));
              return (
                <span className="rounded-full px-2 py-0.5 text-xs" style={badge.style}>
                  {badge.label}
                </span>
              );
            },
          },
          {
            key: 'salesCount',
            label: 'Vendas',
            width: '10%',
            render: (v) => (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={resolveSalesCellStyle(v)}
              >
                {formatSalesCount(v)}
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
            {buildPlanLinks(productId, window.location.origin).map((link) => (
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
                  style={PLAN_INPUT_STYLE}
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
                  style={PLAN_INPUT_STYLE}
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
                  style={PLAN_INPUT_STYLE}
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
                      itemsPerPlan: parseItemsPerPlan(e.target.value),
                    })
                  }
                  style={PLAN_INPUT_STYLE}
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
                {creating ? (
                  <KloelMushroomMark size={18} title="Criando plano" traceColor={colors.text.silver} />
                ) : null}

                {kloelT(`Adicionar plano`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
