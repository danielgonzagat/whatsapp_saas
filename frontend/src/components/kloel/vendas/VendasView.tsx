'use client';

import { kloelT } from '@/lib/i18n/t';
import CRMPipelineView from '@/components/kloel/crm/CRMPipelineView';
import {
  SUBINTERFACE_PILL_ROW_STYLE,
  getSubinterfacePillStyle,
} from '@/components/kloel/ui/subinterface-pill';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import {
  useOrderAlerts,
  useOrderPipeline,
  useOrderStats,
  useOrders,
  useReturnOrder,
  useSaleDetail,
  useSales,
  useSalesChart,
  useSalesStats,
  useSubscriptionStats,
  useSubscriptions,
} from '@/hooks/useSales';
import { useSalesPipeline } from '@/hooks/useSalesPipeline';
import { apiFetch, tokenStorage } from '@/lib/api';
import { smartPaymentApi } from '@/lib/api/misc';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useEffect, useRef, useState, useId } from 'react';
import { mutate } from 'swr';

/* ── Local view types ── */
interface SaleItem {
  id: string;
  leadId?: string;
  leadPhone?: string;
  customerName?: string;
  productName?: string;
  amount: number;
  status: string;
  paymentMethod?: string;
  createdAt?: string;
}

interface SubscriptionItem {
  id: string;
  customerName?: string;
  planName?: string;
  amount: number;
  status: string;
  totalPaid?: number;
  startedAt?: string;
  nextBillingAt?: string;
}

interface OrderItem {
  id: string;
  customerName?: string;
  productName?: string;
  amount: number;
  status: string;
  trackingCode?: string;
  addressCity?: string;
  addressState?: string;
  createdAt?: string;
}

interface SalesStatsData {
  totalRevenue?: number;
  revenueTrend?: number;
  totalTransactions?: number;
  totalPending?: number;
  pendingCount?: number;
  avgTicket?: number;
}

interface SubStatsData {
  mrr?: number;
  activeCount?: number;
  churnRate?: number;
  avgLtv?: number;
  arr?: number;
  lifecycle?: Record<string, number>;
}

interface OrderStatsData {
  total?: number;
  processing?: number;
  shipped?: number;
  delivered?: number;
}

interface OrderPipelineData {
  processing?: number;
  shipped?: number;
  delivered?: number;
  returned?: number;
}

interface PipelineStage {
  id: string;
  name?: string;
  color?: string;
  deals?: PipelineDeal[];
}

interface PipelineDeal {
  id: string;
  value?: number;
}

interface DetailItemData {
  id: string;
  amount?: number;
  paymentMethod?: string;
  createdAt?: string;
  startedAt?: string;
  nextBillingAt?: string;
  totalPaid?: number;
  trackingCode?: string;
  addressCity?: string;
  addressState?: string;
  status?: string;
  customerName?: string;
  customerEmail?: string;
  leadPhone?: string;
  productName?: string;
  planName?: string;
}

const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/* ── Icons (extracted into VendasView.icons.tsx) ── */
import { IC } from './VendasView.icons';
import { colors } from '@/lib/design-tokens';

/* ── Status configs ── */
const SALE_STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: 'Pago', color: 'colors.ember.primary' },
  pending: { label: 'Pendente', color: '#F59E0B' },
  refunded: { label: 'Reembolsado', color: 'var(--app-text-secondary)' },
  cancelled: { label: 'Cancelado', color: 'var(--app-text-tertiary)' },
  overdue: { label: 'Atrasado', color: '#EF4444' },
};
const SUB_STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativa', color: 'colors.ember.primary' },
  PAST_DUE: { label: 'Atrasada', color: '#F59E0B' },
  CANCELLED: { label: 'Cancelada', color: 'var(--app-text-tertiary)' },
  PAUSED: { label: 'Pausada', color: 'var(--app-text-secondary)' },
  TRIALING: { label: 'Trial', color: '#3B82F6' },
};
const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  PROCESSING: { label: 'Processando', color: '#F59E0B' },
  SHIPPED: { label: 'Enviado', color: '#3B82F6' },
  DELIVERED: { label: 'Entregue', color: 'colors.ember.primary' },
  RETURNED: { label: 'Devolvido', color: 'var(--app-text-secondary)' },
  CANCELLED: { label: 'Cancelado', color: 'var(--app-text-tertiary)' },
};
const PAY_METHODS: Record<string, string> = {
  PIX: 'colors.ember.primary',
  CREDIT_CARD: '#3B82F6',
  BOLETO: '#F59E0B',
  DEBIT: '#10B981',
};

/* ── Helpers ── */
function fmtBRL(v: number) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}
function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('pt-BR');
}

function Stat({
  label,
  value,
  color = 'var(--app-text-primary)',
  sub,
  trend,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
  trend?: number;
}) {
  return (
    <div
      style={{
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: 18,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--app-text-secondary)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          display: 'block',
          marginBottom: 6,
          fontFamily: SORA,
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color }}>{value}</span>
        {trend !== undefined && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              fontSize: 10,
              color: trend > 0 ? '#10B981' : '#EF4444',
            }}
          >
            {trend > 0 ? IC.trend(10) : IC.trendD(10)} {Math.abs(trend)}%
          </span>
        )}
      </div>
      {sub && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--app-text-tertiary)',
            marginTop: 4,
            display: 'block',
            fontFamily: SORA,
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function Badge({
  status,
  config,
}: {
  status: string;
  config: Record<string, { label: string; color: string }>;
}) {
  const s = config[status] || { label: status, color: 'var(--app-text-tertiary)' };
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10,
        fontWeight: 600,
        color: s.color,
        background: `${s.color}12`,
        padding: '3px 8px',
        borderRadius: 4,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
      }}
    >
      {s.label}
    </span>
  );
}

function TH({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--app-text-tertiary)',
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        fontFamily: SORA,
      }}
    >
      {children}
    </span>
  );
}

function MiniChart({ data, color = 'colors.ember.primary' }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  const bars = data.map((value, idx) => ({
    id: `bar-${idx}-of-${data.length}-${value}`,
    value,
    isLast: idx === data.length - 1,
  }));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
      {bars.map((bar) => (
        <div
          key={bar.id}
          style={{
            flex: 1,
            height: `${(bar.value / max) * 100}%`,
            minHeight: 2,
            background: bar.isLast ? color : 'var(--app-accent-light)',
            borderRadius: '2px 2px 0 0',
          }}
        />
      ))}
    </div>
  );
}

/* ── Smart Payment Modal ── */
function SmartPaymentModal({
  workspaceId,
  onClose,
}: {
  workspaceId: string | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    amount: '',
    description: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    method: 'pix',
    dueDate: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    paymentLink?: string;
    pixCode?: string;
    boletoUrl?: string;
  } | null>(null);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!workspaceId || !form.amount || !form.customerName || !form.customerPhone) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await smartPaymentApi.create(workspaceId, {
        amount: Number.parseFloat(form.amount.replace(',', '.')),
        description: form.description || 'Cobranca',
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail || undefined,
        method: form.method,
        dueDate: form.dueDate || undefined,
      });
      if (res.error) {
        throw new Error(res.error);
      }
      setResult(res.data ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao criar cobranca');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <button
        type="button"
        aria-label="Fechar modal"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--app-bg-primary)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          width: 480,
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--app-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              fontFamily: SORA,
            }}
          >
            {kloelT(`Nova cobranca`)}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--app-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            {IC.x(16)}
          </button>
        </div>
        <div style={{ padding: 20 }}>
          {result ? (
            <div>
              <div
                style={{
                  background: 'var(--app-bg-card)',
                  border: '1px solid var(--app-border-subtle)',
                  borderRadius: 6,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#10B981',
                    display: 'block',
                    marginBottom: 12,
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`Cobranca criada`)}
                </span>
                {result.paymentLink && (
                  <div style={{ marginBottom: 10 }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--app-text-secondary)',
                        fontFamily: SORA,
                        textTransform: 'uppercase',
                        letterSpacing: '.06em',
                      }}
                    >
                      {kloelT(`Link de pagamento`)}
                    </span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <input
                        aria-label="Link de pagamento"
                        readOnly
                        value={result.paymentLink}
                        style={{
                          flex: 1,
                          background: 'var(--app-bg-primary)',
                          border: '1px solid var(--app-border-primary)',
                          borderRadius: 4,
                          padding: '8px 12px',
                          color: 'var(--app-text-primary)',
                          fontSize: 12,
                          fontFamily: MONO,
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (result.paymentLink) {
                            copyToClipboard(result.paymentLink);
                          }
                        }}
                        style={{
                          padding: '8px 12px',
                          background: 'none',
                          border: '1px solid var(--app-border-primary)',
                          borderRadius: 4,
                          color: 'var(--app-text-secondary)',
                          fontSize: 11,
                          cursor: 'pointer',
                          fontFamily: SORA,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {kloelT(`Copiar`)}
                      </button>
                    </div>
                  </div>
                )}
                {result.pixCode && (
                  <div style={{ marginBottom: 10 }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--app-text-secondary)',
                        fontFamily: SORA,
                        textTransform: 'uppercase',
                        letterSpacing: '.06em',
                      }}
                    >
                      {kloelT(`Codigo PIX`)}
                    </span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <input
                        aria-label="Codigo PIX"
                        readOnly
                        value={result.pixCode}
                        style={{
                          flex: 1,
                          background: 'var(--app-bg-primary)',
                          border: '1px solid var(--app-border-primary)',
                          borderRadius: 4,
                          padding: '8px 12px',
                          color: 'var(--app-text-primary)',
                          fontSize: 12,
                          fontFamily: MONO,
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (result.pixCode) {
                            copyToClipboard(result.pixCode);
                          }
                        }}
                        style={{
                          padding: '8px 12px',
                          background: 'none',
                          border: '1px solid var(--app-border-primary)',
                          borderRadius: 4,
                          color: 'var(--app-text-secondary)',
                          fontSize: 11,
                          cursor: 'pointer',
                          fontFamily: SORA,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {kloelT(`Copiar`)}
                      </button>
                    </div>
                  </div>
                )}
                {result.boletoUrl && (
                  <div>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--app-text-secondary)',
                        fontFamily: SORA,
                        textTransform: 'uppercase',
                        letterSpacing: '.06em',
                      }}
                    >
                      {kloelT(`Boleto`)}
                    </span>
                    <div style={{ marginTop: 4 }}>
                      <a
                        href={result.boletoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 12,
                          color: 'colors.ember.primary',
                          fontFamily: SORA,
                          textDecoration: 'underline',
                        }}
                      >
                        {kloelT(`Abrir boleto`)}
                      </a>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setForm({
                      amount: '',
                      description: '',
                      customerName: '',
                      customerPhone: '',
                      customerEmail: '',
                      method: 'pix',
                      dueDate: '',
                    });
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'none',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    color: 'var(--app-text-secondary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`Nova cobranca`)}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'colors.ember.primary',
                    border: 'none',
                    borderRadius: 6,
                    color: 'var(--app-text-on-accent)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`Fechar`)}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Cliente', key: 'customerName', placeholder: 'Nome do cliente' },
                { label: 'Telefone', key: 'customerPhone', placeholder: '5511999999999' },
                { label: 'E-mail', key: 'customerEmail', placeholder: 'cliente@exemplo.com' },
                { label: 'Valor (R$)', key: 'amount', placeholder: '97,00' },
                {
                  label: 'Descricao',
                  key: 'description',
                  placeholder: 'Ex: Consultoria, Produto X',
                },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--app-text-secondary)',
                      fontFamily: SORA,
                      textTransform: 'uppercase',
                      letterSpacing: '.06em',
                      display: 'block',
                      marginBottom: 6,
                    }}
                  >
                    {label}
                  </span>
                  <input
                    aria-label={label}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{
                      width: '100%',
                      background: 'var(--app-bg-card)',
                      border: '1px solid var(--app-border-primary)',
                      borderRadius: 4,
                      padding: '9px 12px',
                      color: 'var(--app-text-primary)',
                      fontSize: 13,
                      fontFamily: key === 'amount' ? MONO : SORA,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--app-text-secondary)',
                      fontFamily: SORA,
                      textTransform: 'uppercase',
                      letterSpacing: '.06em',
                      display: 'block',
                      marginBottom: 6,
                    }}
                  >
                    {kloelT(`Metodo`)}
                  </span>
                  <select
                    value={form.method}
                    onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'var(--app-bg-card)',
                      border: '1px solid var(--app-border-primary)',
                      borderRadius: 4,
                      padding: '9px 12px',
                      color: 'var(--app-text-primary)',
                      fontSize: 13,
                      fontFamily: SORA,
                      outline: 'none',
                    }}
                  >
                    <option value="pix">PIX</option>
                    <option value="boleto">{kloelT(`Boleto`)}</option>
                    <option value="credit_card">{kloelT(`Cartao`)}</option>
                    <option value="link">{kloelT(`Link`)}</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--app-text-secondary)',
                      fontFamily: SORA,
                      textTransform: 'uppercase',
                      letterSpacing: '.06em',
                      display: 'block',
                      marginBottom: 6,
                    }}
                  >
                    {kloelT(`Vencimento`)}
                  </span>
                  <input
                    aria-label="Data de vencimento"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    style={{
                      width: '100%',
                      background: 'var(--app-bg-card)',
                      border: '1px solid var(--app-border-primary)',
                      borderRadius: 4,
                      padding: '9px 12px',
                      color: 'var(--app-text-primary)',
                      fontSize: 13,
                      fontFamily: MONO,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              {error && (
                <span style={{ fontSize: 12, color: '#EF4444', fontFamily: SORA }}>{error}</span>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'none',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    color: 'var(--app-text-secondary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`Cancelar`)}
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={loading || !form.amount || !form.customerName || !form.customerPhone}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background:
                      form.amount && form.customerName && form.customerPhone
                        ? 'colors.ember.primary'
                        : 'var(--app-bg-secondary)',
                    border: 'none',
                    borderRadius: 6,
                    color:
                      form.amount && form.customerName && form.customerPhone
                        ? 'var(--app-text-on-accent)'
                        : 'var(--app-text-placeholder)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: SORA,
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? 'Criando...' : 'Cobrar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Extracted Sub-Components ── */

function DetailModal({
  detailId,
  detailType,
  sales,
  subscriptions,
  orders,
  onClose,
  onRefund,
  onPauseSub,
  onResumeSub,
  onCancelSub,
  onChangePlan,
  onOpenShipModal,
  onReturnOrder,
  actionLoading,
}: {
  detailId: string | null;
  detailType: 'sale' | 'sub' | 'order';
  sales: SaleItem[];
  subscriptions: SubscriptionItem[];
  orders: OrderItem[];
  onClose: () => void;
  onRefund: (id: string) => void;
  onPauseSub: (id: string) => void;
  onResumeSub: (id: string) => void;
  onCancelSub: (id: string) => void;
  onChangePlan: (id: string) => void;
  onOpenShipModal: (id: string) => void;
  onReturnOrder: (id: string) => void;
  actionLoading: boolean;
}) {
  // Fetch fresh sale detail from GET /sales/:id when viewing a sale
  const { sale: freshSale } = useSaleDetail(detailId && detailType === 'sale' ? detailId : null);

  if (!detailId) {
    return null;
  }
  const cached: DetailItemData | undefined =
    detailType === 'sale'
      ? sales.find((s) => s.id === detailId)
      : detailType === 'sub'
        ? subscriptions.find((s) => s.id === detailId)
        : orders.find((o) => o.id === detailId);
  // For sales, prefer fresh server data; fall back to cached list entry
  const item: DetailItemData | undefined =
    detailType === 'sale' && freshSale ? (freshSale as DetailItemData) : cached;
  if (!item) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--app-bg-primary)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          width: 520,
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--app-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              fontFamily: SORA,
            }}
          >
            {detailType === 'order'
              ? 'Detalhes do pedido'
              : detailType === 'sub'
                ? 'Detalhes da assinatura'
                : 'Detalhes da venda'}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--app-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            {IC.x(16)}
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  display: 'block',
                  fontFamily: SORA,
                }}
              >
                {item.customerName || item.leadPhone || item.productName || 'Cliente'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)', fontFamily: SORA }}>
                {item.customerEmail || item.planName || item.addressState || ''}
              </span>
            </div>
            <Badge
              status={item.status || ''}
              config={
                detailType === 'order'
                  ? ORDER_STATUS
                  : detailType === 'sub'
                    ? SUB_STATUS
                    : SALE_STATUS
              }
            />
          </div>

          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 16,
              marginBottom: 16,
            }}
          >
            {(
              [
                { l: 'Valor', v: fmtBRL(item.amount || 0), c: 'colors.ember.primary' },
                item.paymentMethod && { l: 'Metodo', v: item.paymentMethod },
                { l: 'Data', v: fmtDate(item.createdAt || item.startedAt || new Date()) },
                detailType === 'sub' &&
                  item.nextBillingAt && { l: 'Proxima cobranca', v: fmtDate(item.nextBillingAt) },
                detailType === 'sub' && {
                  l: 'LTV',
                  v: fmtBRL(item.totalPaid || 0),
                  c: 'colors.ember.primary',
                },
                detailType === 'order' && {
                  l: 'Rastreamento',
                  v: item.trackingCode || 'Aguardando',
                },
                detailType === 'order' &&
                  item.addressState && {
                    l: 'Destino',
                    v: `${item.addressCity || ''}, ${item.addressState}`,
                  },
                { l: 'ID', v: item.id },
              ] as (false | { l: string; v: string | number; c?: string })[]
            )
              .filter((x): x is { l: string; v: string | number; c?: string } => Boolean(x))
              .map((r, i, arr) => (
                <div
                  key={r.l}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom:
                      i < arr.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                  }}
                >
                  <span
                    style={{ fontSize: 12, color: 'var(--app-text-secondary)', fontFamily: SORA }}
                  >
                    {r.l}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: r.c || 'var(--app-text-primary)',
                      fontFamily: r.c ? MONO : SORA,
                    }}
                  >
                    {r.v}
                  </span>
                </div>
              ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {detailType === 'sale' && item.status === 'paid' && (
              <button
                type="button"
                onClick={() => onRefund(item.id)}
                disabled={actionLoading}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'none',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  color: 'var(--app-text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: SORA,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  opacity: actionLoading ? 0.5 : 1,
                }}
              >
                {IC.undo(12)} {actionLoading ? 'Processando...' : 'Reembolsar'}
              </button>
            )}
            {detailType === 'sub' && item.status === 'ACTIVE' && (
              <>
                <button
                  type="button"
                  onClick={() => onPauseSub(item.id)}
                  disabled={actionLoading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'none',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    color: 'var(--app-text-secondary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: SORA,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {IC.pause(12)} {kloelT(`Pausar`)}
                </button>
                <button
                  type="button"
                  onClick={() => onChangePlan(item.id)}
                  disabled={actionLoading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'none',
                    border: '1px solid colors.ember.primary',
                    borderRadius: 6,
                    color: 'colors.ember.primary',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: SORA,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {kloelT(`Mudar plano`)}
                </button>
                <button
                  type="button"
                  onClick={() => onCancelSub(item.id)}
                  disabled={actionLoading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'none',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    color: '#EF4444',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: SORA,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  {IC.x(12)} {kloelT(`Cancelar`)}
                </button>
              </>
            )}
            {detailType === 'sub' && item.status === 'PAUSED' && (
              <button
                type="button"
                onClick={() => onResumeSub(item.id)}
                disabled={actionLoading}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'colors.ember.primary',
                  border: 'none',
                  borderRadius: 6,
                  color: 'var(--app-text-on-accent)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: SORA,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {IC.play(12)} {kloelT(`Retomar`)}
              </button>
            )}
            {detailType === 'order' && item.status === 'PROCESSING' && (
              <button
                type="button"
                onClick={() => {
                  onOpenShipModal(item.id);
                  onClose();
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'colors.ember.primary',
                  border: 'none',
                  borderRadius: 6,
                  color: 'var(--app-text-on-accent)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: SORA,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {IC.truck(12)} {kloelT(`Marcar como enviado`)}
              </button>
            )}
            {detailType === 'order' &&
              (item.status === 'SHIPPED' || item.status === 'DELIVERED') && (
                <button
                  type="button"
                  onClick={() => onReturnOrder(item.id)}
                  disabled={actionLoading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'none',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    color: 'var(--app-text-secondary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: SORA,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    opacity: actionLoading ? 0.5 : 1,
                  }}
                >
                  {IC.undo(12)} {kloelT(`Devolver`)}
                </button>
              )}
            {detailType === 'order' && item.trackingCode && (
              <button
                type="button"
                onClick={() =>
                  window.open(`https://www.linkcorreios.com.br/?id=${item.trackingCode}`, '_blank')
                }
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: 'none',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  color: 'var(--app-text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: SORA,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {IC.map(12)} {kloelT(`Rastrear`)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShipModal({
  showShipModal,
  onClose,
  shipTrackingCode,
  onTrackingCodeChange,
  onShipOrder,
  actionLoading,
}: {
  showShipModal: string | null;
  onClose: () => void;
  shipTrackingCode: string;
  onTrackingCodeChange: (v: string) => void;
  onShipOrder: (id: string) => void;
  actionLoading: boolean;
}) {
  const fid = useId();
  if (!showShipModal) {
    return null;
  }
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--app-bg-primary)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          width: 400,
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      >
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            marginBottom: 16,
            fontFamily: SORA,
          }}
        >
          {kloelT(`Informar envio`)}
        </h3>
        <label
          style={{
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            display: 'block',
            marginBottom: 6,
            fontFamily: SORA,
          }}
          htmlFor={`${fid}-tracking`}
        >
          {kloelT(`Codigo de rastreamento`)}
        </label>
        <input
          aria-label="Codigo de rastreamento"
          value={shipTrackingCode}
          onChange={(e) => onTrackingCodeChange(e.target.value)}
          placeholder="BR000000000BR"
          autoFocus
          style={{
            width: '100%',
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: '10px 14px',
            color: 'var(--app-text-primary)',
            fontSize: 14,
            fontFamily: MONO,
            outline: 'none',
            marginBottom: 16,
          }}
          id={`${fid}-tracking`}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: 'none',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              color: 'var(--app-text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: SORA,
            }}
          >
            {kloelT(`Cancelar`)}
          </button>
          <button
            type="button"
            onClick={() => onShipOrder(showShipModal)}
            disabled={!shipTrackingCode.trim() || actionLoading}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: shipTrackingCode.trim()
                ? 'colors.ember.primary'
                : 'var(--app-bg-secondary)',
              border: 'none',
              borderRadius: 6,
              color: shipTrackingCode.trim()
                ? 'var(--app-text-on-accent)'
                : 'var(--app-text-placeholder)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: SORA,
            }}
          >
            {actionLoading ? 'Enviando...' : 'Confirmar envio'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GestaoVendas({
  salesStats,
  chart,
  search,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  sales,
  onOpenDetail,
}: {
  salesStats: SalesStatsData;
  chart: number[];
  search: string;
  onSearchChange: (v: string) => void;
  filterStatus: string;
  onFilterStatusChange: (v: string) => void;
  sales: SaleItem[];
  onOpenDetail: (id: string, type: 'sale' | 'sub' | 'order') => void;
}) {
  const { isMobile } = useResponsiveViewport();
  const st = salesStats;
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Stat
          label={kloelT(`Faturamento total`)}
          value={fmtBRL(st.totalRevenue || 0)}
          color="colors.ember.primary"
          trend={st.revenueTrend}
        />
        <Stat
          label={kloelT(`Transacoes`)}
          value={String(st.totalTransactions || 0)}
          sub={kloelT(`Ultimos 30 dias`)}
        />
        <Stat
          label={kloelT(`Pendentes`)}
          value={fmtBRL(st.totalPending || 0)}
          color="#F59E0B"
          sub={`${st.pendingCount || 0} transacoes`}
        />
        <Stat label={kloelT(`Ticket medio`)} value={fmtBRL(st.avgTicket || 0)} />
      </div>
      {chart.length > 0 && (
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 18,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Vendas — Ultimos 30 dias`)}
            </span>
            {st.revenueTrend && (
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: st.revenueTrend > 0 ? '#10B981' : '#EF4444',
                }}
              >
                {st.revenueTrend > 0 ? '+' : ''}
                {st.revenueTrend}%
              </span>
            )}
          </div>
          <MiniChart data={chart} />
        </div>
      )}
      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          alignItems: isMobile ? 'stretch' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: '8px 14px',
          }}
        >
          <span style={{ color: 'var(--app-text-tertiary)' }}>{IC.search(14)}</span>
          <input
            aria-label="Buscar por cliente ou produto"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={kloelT(`Buscar por cliente ou produto...`)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: SORA,
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['todos', 'paid', 'pending', 'refunded'].map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => onFilterStatusChange(f)}
              style={{
                padding: '7px 14px',
                background: filterStatus === f ? 'var(--app-bg-card)' : 'colors.ember.primary',
                border: '1px solid colors.ember.primary',
                borderRadius: 6,
                color: filterStatus === f ? 'colors.ember.primary' : 'var(--app-text-on-accent)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {f === 'todos' ? 'Todos' : SALE_STATUS[f]?.label || f}
            </button>
          ))}
        </div>
      </div>
      {/* Table */}
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {!isMobile && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1.5fr 1fr 1fr 0.8fr 0.8fr',
              gap: 12,
              padding: '10px 16px',
              borderBottom: '1px solid var(--app-border-subtle)',
            }}
          >
            <TH>{kloelT(`Cliente`)}</TH>
            <TH>{kloelT(`Produto`)}</TH>
            <TH>{kloelT(`Valor`)}</TH>
            <TH>{kloelT(`Metodo`)}</TH>
            <TH>{kloelT(`Status`)}</TH>
            <TH>{kloelT(`Data`)}</TH>
          </div>
        )}
        {sales.length === 0 ? (
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '60px 20px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: 'var(--app-text-secondary)',
                display: 'block',
                marginBottom: 8,
              }}
            >
              {kloelT(`Nenhuma venda encontrada`)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Pedidos aparecerao aqui quando seus clientes comprarem`)}
            </span>
          </div>
        ) : (
          sales.map((s, i: number) =>
            isMobile ? (
              <button
                type="button"
                key={s.id}
                onClick={() => onOpenDetail(s.id, 'sale')}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  padding: '14px 16px',
                  borderBottom:
                    i < sales.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--app-text-primary)',
                        display: 'block',
                        fontFamily: SORA,
                      }}
                    >
                      {s.leadPhone || 'Cliente'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                      {s.productName || 'Produto'}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'colors.ember.primary',
                    }}
                  >
                    {fmtBRL(s.amount)}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    {s.paymentMethod && (
                      <span
                        style={{
                          fontSize: 10,
                          color: PAY_METHODS[s.paymentMethod] || 'var(--app-text-secondary)',
                          background: `${PAY_METHODS[s.paymentMethod] || 'var(--app-text-secondary)'}12`,
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          fontFamily: MONO,
                        }}
                      >
                        {s.paymentMethod}
                      </span>
                    )}
                  </div>
                  <Badge status={s.status} config={SALE_STATUS} />
                  <span style={{ fontSize: 11, color: 'var(--app-text-tertiary)' }}>
                    {fmtDate(s.createdAt || new Date())}
                  </span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                key={s.id}
                onClick={() => onOpenDetail(s.id, 'sale')}
                aria-label={`Abrir detalhes da venda ${s.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.5fr 1fr 1fr 0.8fr 0.8fr',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom:
                    i < sales.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                  cursor: 'pointer',
                  transition: 'background .1s',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--app-bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--app-text-primary)',
                      display: 'block',
                      fontFamily: SORA,
                    }}
                  >
                    {s.leadPhone || 'Cliente'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                    {s.leadId?.slice(0, 8) || ''}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--app-text-secondary)',
                    alignSelf: 'center',
                    fontFamily: SORA,
                  }}
                >
                  {s.productName || 'Produto'}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'colors.ember.primary',
                    alignSelf: 'center',
                  }}
                >
                  {fmtBRL(s.amount)}
                </span>
                <div style={{ alignSelf: 'center' }}>
                  {s.paymentMethod && (
                    <span
                      style={{
                        fontSize: 10,
                        color: PAY_METHODS[s.paymentMethod] || 'var(--app-text-secondary)',
                        background: `${PAY_METHODS[s.paymentMethod] || 'var(--app-text-secondary)'}12`,
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        fontFamily: MONO,
                      }}
                    >
                      {s.paymentMethod}
                    </span>
                  )}
                </div>
                <div style={{ alignSelf: 'center' }}>
                  <Badge status={s.status} config={SALE_STATUS} />
                </div>
                <span
                  style={{ fontSize: 11, color: 'var(--app-text-tertiary)', alignSelf: 'center' }}
                >
                  {fmtDate(s.createdAt || new Date())}
                </span>
              </button>
            ),
          )
        )}
      </div>
    </>
  );
}

function GestaoAssinaturas({
  subStats,
  subscriptions,
  onOpenDetail,
}: {
  subStats: SubStatsData;
  subscriptions: SubscriptionItem[];
  onOpenDetail: (id: string, type: 'sale' | 'sub' | 'order') => void;
}) {
  const st = subStats;
  const lc = st.lifecycle || {};
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Stat label="MRR" value={fmtBRL(st.mrr || 0)} color="colors.ember.primary" trend={5.8} />
        <Stat label={kloelT(`Assinaturas ativas`)} value={String(st.activeCount || 0)} />
        <Stat
          label={kloelT(`Churn rate`)}
          value={`${st.churnRate || 0}%`}
          color={(st.churnRate || 0) > 5 ? '#EF4444' : '#10B981'}
        />
        <Stat label={kloelT(`LTV medio`)} value={fmtBRL(st.avgLtv || 0)} />
        <Stat
          label={kloelT(`ARR projetado`)}
          value={fmtBRL(st.arr || 0)}
          color="colors.ember.primary"
        />
      </div>
      {/* Lifecycle */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 24 }}
      >
        {[
          { label: 'Trial', count: lc.trial || 0, color: '#3B82F6' },
          { label: 'Ativas', count: lc.active || 0, color: 'colors.ember.primary' },
          { label: 'Atrasadas', count: lc.past_due || 0, color: '#F59E0B' },
          { label: 'Pausadas', count: lc.paused || 0, color: 'var(--app-text-secondary)' },
          { label: 'Canceladas', count: lc.cancelled || 0, color: 'var(--app-text-tertiary)' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 14,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: s.color,
                opacity: 0.5,
              }}
            />
            <span
              style={{
                fontFamily: MONO,
                fontSize: 24,
                fontWeight: 700,
                color: s.color,
                display: 'block',
              }}
            >
              {s.count}
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'var(--app-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                fontFamily: SORA,
              }}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>
      {/* Table */}
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.2fr 1fr 0.8fr 1fr 0.8fr',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid var(--app-border-subtle)',
          }}
        >
          <TH>{kloelT(`Assinante`)}</TH>
          <TH>{kloelT(`Plano`)}</TH>
          <TH>{kloelT(`Valor/mes`)}</TH>
          <TH>{kloelT(`Status`)}</TH>
          <TH>LTV</TH>
          <TH>{kloelT(`Prox. cobranca`)}</TH>
        </div>
        {subscriptions.length === 0 ? (
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '60px 20px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: 'var(--app-text-secondary)',
                display: 'block',
                marginBottom: 8,
              }}
            >
              {kloelT(`Nenhuma assinatura encontrada`)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Assinaturas aparecerao aqui quando seus clientes assinarem`)}
            </span>
          </div>
        ) : (
          subscriptions.map((s, i: number) => (
            <div
              key={s.id}
              onClick={() => onOpenDetail(s.id, 'sub')}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.2fr 1fr 0.8fr 1fr 0.8fr',
                gap: 12,
                padding: '12px 16px',
                borderBottom:
                  i < subscriptions.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                cursor: 'pointer',
                transition: 'background .1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--app-bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).click();
                }
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--app-text-primary)',
                    display: 'block',
                    fontFamily: SORA,
                  }}
                >
                  {s.customerName}
                </span>
                <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                  {kloelT(`Desde`)} {fmtDate(s.startedAt || new Date())}
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--app-text-secondary)',
                  alignSelf: 'center',
                  fontFamily: SORA,
                }}
              >
                {s.planName}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  alignSelf: 'center',
                }}
              >
                {fmtBRL(s.amount)}
              </span>
              <div style={{ alignSelf: 'center' }}>
                <Badge status={s.status} config={SUB_STATUS} />
              </div>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: 'colors.ember.primary',
                  fontWeight: 600,
                  alignSelf: 'center',
                }}
              >
                {fmtBRL(s.totalPaid || 0)}
              </span>
              <span
                style={{ fontSize: 11, color: 'var(--app-text-tertiary)', alignSelf: 'center' }}
              >
                {s.nextBillingAt ? fmtDate(s.nextBillingAt) : '\u2014'}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function GestaoFisicos({
  orderStats,
  pipeline,
  orders,
  onOpenDetail,
}: {
  orderStats: OrderStatsData;
  pipeline: OrderPipelineData;
  orders: OrderItem[];
  onOpenDetail: (id: string, type: 'sale' | 'sub' | 'order') => void;
}) {
  const st = orderStats;
  const pl = pipeline;
  const total = st.total || 0 || 1;
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Stat
          label={kloelT(`Pedidos totais`)}
          value={String(st.total || 0)}
          sub={kloelT(`Ultimos 30 dias`)}
        />
        <Stat
          label={kloelT(`Aguardando envio`)}
          value={String(st.processing || 0)}
          color="#F59E0B"
        />
        <Stat label={kloelT(`Em transito`)} value={String(st.shipped || 0)} color="#3B82F6" />
        <Stat
          label={kloelT(`Entregues`)}
          value={String(st.delivered || 0)}
          color="colors.ember.primary"
        />
      </div>
      {/* Pipeline */}
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 18,
          marginBottom: 24,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            display: 'block',
            marginBottom: 14,
            fontFamily: SORA,
          }}
        >
          {kloelT(`Pipeline de fulfillment`)}
        </span>
        <div style={{ display: 'flex', gap: 4, height: 8, borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              width: `${((pl.processing || 0) / total) * 100}%`,
              background: '#F59E0B',
              borderRadius: '4px 0 0 4px',
            }}
          />
          <div style={{ width: `${((pl.shipped || 0) / total) * 100}%`, background: '#3B82F6' }} />
          <div
            style={{
              width: `${((pl.delivered || 0) / total) * 100}%`,
              background: 'colors.ember.primary',
              borderRadius: '0 4px 4px 0',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          {[
            { l: 'Processando', c: '#F59E0B', n: pl.processing || 0 },
            { l: 'Enviados', c: '#3B82F6', n: pl.shipped || 0 },
            { l: 'Entregues', c: 'colors.ember.primary', n: pl.delivered || 0 },
          ].map((s) => (
            <span
              key={s.l}
              style={{
                fontSize: 10,
                color: 'var(--app-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: SORA,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 2, background: s.c }} />
              {s.l} ({s.n})
            </span>
          ))}
        </div>
      </div>
      {/* Table */}
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr 1.2fr 0.8fr',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid var(--app-border-subtle)',
          }}
        >
          <TH>{kloelT(`Cliente`)}</TH>
          <TH>{kloelT(`Produto`)}</TH>
          <TH>{kloelT(`Valor`)}</TH>
          <TH>{kloelT(`Status`)}</TH>
          <TH>{kloelT(`Rastreamento`)}</TH>
          <TH>{kloelT(`Destino`)}</TH>
        </div>
        {orders.length === 0 ? (
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '60px 20px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: 'var(--app-text-secondary)',
                display: 'block',
                marginBottom: 8,
              }}
            >
              {kloelT(`Nenhum pedido encontrado`)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Pedidos aparecerao aqui quando seus clientes comprarem`)}
            </span>
          </div>
        ) : (
          orders.map((o, i: number) => (
            <div
              key={o.id}
              onClick={() => onOpenDetail(o.id, 'order')}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr 1.2fr 0.8fr',
                gap: 12,
                padding: '12px 16px',
                borderBottom: i < orders.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                cursor: 'pointer',
                transition: 'background .1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--app-bg-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).click();
                }
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--app-text-primary)',
                    display: 'block',
                    fontFamily: SORA,
                  }}
                >
                  {o.customerName}
                </span>
                <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                  {fmtDate(o.createdAt || new Date())}
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--app-text-secondary)',
                  alignSelf: 'center',
                  fontFamily: SORA,
                }}
              >
                {o.productName}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  alignSelf: 'center',
                }}
              >
                {fmtBRL(o.amount)}
              </span>
              <div style={{ alignSelf: 'center' }}>
                <Badge status={o.status} config={ORDER_STATUS} />
              </div>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: o.trackingCode
                    ? 'var(--app-text-secondary)'
                    : 'var(--app-text-placeholder)',
                  alignSelf: 'center',
                }}
              >
                {o.trackingCode || 'Aguardando'}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--app-text-secondary)',
                  alignSelf: 'center',
                  fontFamily: SORA,
                }}
              >
                {o.addressState || '\u2014'}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
interface VendasViewProps {
  defaultTab?: string;
}

/** Vendas view. */
export function VendasView({ defaultTab = 'vendas' }: VendasViewProps) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams?.get('tab');
  const workspaceId = tokenStorage.getWorkspaceId();
  const [tab, setTab] = useState(requestedTab || defaultTab);
  const prevDefaultV = useRef(defaultTab);
  useEffect(() => {
    if (prevDefaultV.current !== defaultTab) {
      setTab(defaultTab);
      prevDefaultV.current = defaultTab;
    }
  }, [defaultTab]);
  useEffect(() => {
    if (requestedTab && requestedTab !== tab) {
      setTab(requestedTab);
    }
  }, [requestedTab, tab]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailType, setDetailType] = useState<'sale' | 'sub' | 'order'>('sale');
  const [actionLoading, setActionLoading] = useState(false);
  const [shipTrackingCode, setShipTrackingCode] = useState('');
  const [showShipModal, setShowShipModal] = useState<string | null>(null);
  const [showSmartPayment, setShowSmartPayment] = useState(false);

  // Data hooks
  const { sales, mutate: mutateSales } = useSales({
    status: tab === 'vendas' ? filterStatus : undefined,
    search: tab === 'vendas' ? search : undefined,
  });
  const { stats: salesStats } = useSalesStats();
  const { chart } = useSalesChart();
  const { subscriptions, mutate: mutateSubs } = useSubscriptions({
    status: tab === 'assinaturas' ? filterStatus : undefined,
  });
  const { stats: subStats } = useSubscriptionStats();
  const { orders, mutate: mutateOrders } = useOrders({
    status: tab === 'fisicos' ? filterStatus : undefined,
  });
  const { stats: orderStats } = useOrderStats();
  const { pipeline } = useOrderPipeline();
  const { stages: salesStages, isLoading: salesPipelineLoading } = useSalesPipeline();

  const handleTabChange = (newTab: string) => {
    setTab(newTab);
    setFilterStatus('todos');
    setSearch('');
    const routes: Record<string, string> = {
      vendas: '/vendas',
      assinaturas: '/vendas/assinaturas',
      fisicos: '/vendas/fisicos',
      pipeline: '/vendas/pipeline',
      estrategias: '/vendas?tab=estrategias',
    };
    const nextRoute = routes[newTab] || '/vendas';
    const currentRoute = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;
    if (currentRoute === nextRoute) {
      return;
    }
    startTransition(() => {
      router.push(nextRoute);
    });
  };

  const openDetail = (id: string, type: 'sale' | 'sub' | 'order') => {
    setDetailId(id);
    setDetailType(type);
  };

  // Actions
  const invalidateSales = () =>
    mutate((key: string) => typeof key === 'string' && key.startsWith('/sales'));
  const handleRefund = async (id: string) => {
    setActionLoading(true);
    await apiFetch(`/sales/${id}/refund`, { method: 'POST' });
    await mutateSales();
    invalidateSales();
    setActionLoading(false);
    setDetailId(null);
  };
  const handlePauseSub = async (id: string) => {
    setActionLoading(true);
    await apiFetch(`/sales/subscriptions/${id}/pause`, { method: 'POST' });
    await mutateSubs();
    invalidateSales();
    setActionLoading(false);
    setDetailId(null);
  };
  const handleResumeSub = async (id: string) => {
    setActionLoading(true);
    await apiFetch(`/sales/subscriptions/${id}/resume`, { method: 'POST' });
    await mutateSubs();
    invalidateSales();
    setActionLoading(false);
    setDetailId(null);
  };
  const handleCancelSub = async (id: string) => {
    setActionLoading(true);
    await apiFetch(`/sales/subscriptions/${id}/cancel`, { method: 'POST' });
    await mutateSubs();
    invalidateSales();
    setActionLoading(false);
    setDetailId(null);
  };
  const handleShipOrder = async (id: string) => {
    if (!shipTrackingCode.trim()) {
      return;
    }
    setActionLoading(true);
    await apiFetch(`/sales/orders/${id}/ship`, {
      method: 'PUT',
      body: { trackingCode: shipTrackingCode },
    });
    await mutateOrders();
    invalidateSales();
    setActionLoading(false);
    setShowShipModal(null);
    setShipTrackingCode('');
  };
  const _handleDeliverOrder = async (id: string) => {
    setActionLoading(true);
    await apiFetch(`/sales/orders/${id}/deliver`, { method: 'PUT' });
    await mutateOrders();
    invalidateSales();
    setActionLoading(false);
    setDetailId(null);
  };
  const handleChangePlan = async (id: string) => {
    const planName = prompt('Nome do novo plano:');
    if (!planName) {
      return;
    }
    const amount = prompt('Valor do novo plano (ex: 97.00):');
    if (!amount) {
      return;
    }
    setActionLoading(true);
    await apiFetch(`/sales/subscriptions/${id}/change-plan`, {
      method: 'PUT',
      body: { newPlanId: id, newPlanName: planName, newAmount: Number.parseFloat(amount) },
    });
    await mutateSubs();
    setActionLoading(false);
    setDetailId(null);
  };

  // Return physical order
  const { returnOrder } = useReturnOrder();
  const handleReturnOrder = async (id: string) => {
    setActionLoading(true);
    await returnOrder(id);
    await mutateOrders();
    setActionLoading(false);
    setDetailId(null);
  };

  // Order alerts
  const {
    alerts: orderAlerts,
    counts: alertCounts,
    generateAlerts,
    resolveAlert,
  } = useOrderAlerts();

  const estrategiasTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, 1fr)',
          gap: 12,
        }}
      >
        <Stat
          label={kloelT(`Receita viva`)}
          value={fmtBRL(salesStats.totalRevenue || 0)}
          color="colors.ember.primary"
          sub={kloelT(`Volume do período`)}
        />
        <Stat
          label={kloelT(`Assinaturas ativas`)}
          value={String(subStats.activeCount || 0)}
          color="#10B981"
          sub={kloelT(`Base recorrente`)}
        />
        <Stat
          label={kloelT(`Pedidos a enviar`)}
          value={String(orderStats.processing || 0)}
          color="#F59E0B"
          sub={kloelT(`Fulfillment pendente`)}
        />
        <Stat
          label={kloelT(`Alertas`)}
          value={String(orderAlerts.length || 0)}
          color={orderAlerts.length > 0 ? '#EF4444' : 'var(--app-text-secondary)'}
          sub={kloelT(`Pontos de atenção`)}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {[
          {
            title: 'Recuperar carrinhos',
            desc: 'Acione follow-ups para leads que não finalizaram a compra.',
            metric: `${alertCounts?.possibleLost || 0} sinais de perda`,
            cta: 'Abrir Follow-ups',
            action: () => router.push('/followups'),
          },
          {
            title: 'Oferecer bump e cupom',
            desc: 'Use produtos publicados para destravar mais ticket e conversão.',
            metric: `${salesStats.totalTransactions || 0} transações`,
            cta: 'Abrir Produtos',
            action: () => router.push('/products?feature=order-bump'),
          },
          {
            title: 'Escalar recorrência',
            desc: 'Revise churn, atrasos e saúde das assinaturas sem sair de Vendas.',
            metric: `${subStats.pastDueCount || 0} atrasadas`,
            cta: 'Abrir Assinaturas',
            action: () => handleTabChange('assinaturas'),
          },
          {
            title: 'Cobrança imediata',
            desc: 'Gere um link de pagamento ou cobrança avulsa para não perder timing.',
            metric: `${salesStats.pendingCount || 0} pendências`,
            cta: 'Criar Cobrança',
            action: () => setShowSmartPayment(true),
          },
          {
            title: 'Fulfillment físico',
            desc: 'Concentre rastreio, envio e entregas dos produtos físicos.',
            metric: `${orderStats.shipped || 0} em trânsito`,
            cta: 'Abrir Físicos',
            action: () => handleTabChange('fisicos'),
          },
          {
            title: 'Pipeline comercial',
            desc: 'Revise gargalos do CRM e destrave negócios em aberto.',
            metric: `${salesStages.length || 0} etapas`,
            cta: 'Abrir Pipeline',
            action: () => handleTabChange('pipeline'),
          },
        ].map((card) => (
          <div
            key={card.title}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                marginBottom: 8,
                fontFamily: SORA,
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--app-text-secondary)',
                lineHeight: 1.6,
                minHeight: 56,
                fontFamily: SORA,
              }}
            >
              {card.desc}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'colors.ember.primary',
                marginTop: 10,
              }}
            >
              {card.metric}
            </div>
            <button
              type="button"
              onClick={card.action}
              style={{
                marginTop: 14,
                padding: '8px 16px',
                background: 'colors.ember.primary',
                border: 'none',
                borderRadius: 6,
                color: 'var(--app-text-on-accent)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {card.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const TABS = [
    { key: 'vendas', label: 'Gestao de Vendas', icon: IC.dollar },
    { key: 'assinaturas', label: 'Assinaturas', icon: IC.repeat },
    { key: 'fisicos', label: 'Produtos Fisicos', icon: IC.truck },
    { key: 'pipeline', label: 'Pipeline CRM', icon: IC.trend },
    { key: 'estrategias', label: 'Estrategias', icon: IC.map },
  ];

  return (
    <div
      data-testid="sales-view-root"
      style={{
        background: 'var(--app-bg-primary)',
        minHeight: '100vh',
        fontFamily: SORA,
        color: 'var(--app-text-primary)',
        padding: isMobile ? 16 : 24,
      }}
    >
      <DetailModal
        detailId={detailId}
        detailType={detailType}
        sales={sales as SaleItem[]}
        subscriptions={subscriptions as SubscriptionItem[]}
        orders={orders as OrderItem[]}
        onClose={() => setDetailId(null)}
        onRefund={handleRefund}
        onPauseSub={handlePauseSub}
        onResumeSub={handleResumeSub}
        onCancelSub={handleCancelSub}
        onChangePlan={handleChangePlan}
        onOpenShipModal={(id) => setShowShipModal(id)}
        onReturnOrder={handleReturnOrder}
        actionLoading={actionLoading}
      />
      <ShipModal
        showShipModal={showShipModal}
        onClose={() => setShowShipModal(null)}
        shipTrackingCode={shipTrackingCode}
        onTrackingCodeChange={setShipTrackingCode}
        onShipOrder={handleShipOrder}
        actionLoading={actionLoading}
      />
      {showSmartPayment && (
        <SmartPaymentModal workspaceId={workspaceId} onClose={() => setShowSmartPayment(false)} />
      )}

      {/* Action buttons removed from header for clean pill-tab layout */}

      {orderAlerts.length > 0 && (
        <div
          style={{
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
            padding: '12px 16px',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: orderAlerts.length > 1 ? 8 : 0,
            }}
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#EF4444"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                d={kloelT(
                  `M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z`,
                )}
              />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{ fontSize: 12, color: '#EF4444', fontFamily: SORA, flex: 1 }}>
              {orderAlerts.length} alerta{orderAlerts.length > 1 ? 's' : ''}:
              {alertCounts?.missingTracking > 0 && ` ${alertCounts.missingTracking} sem rastreio`}
              {alertCounts?.possibleLost > 0 && ` ${alertCounts.possibleLost} possivel extravio`}
              {alertCounts?.chargebacks > 0 && ` ${alertCounts.chargebacks} chargeback`}
            </span>
            <button
              type="button"
              onClick={() => generateAlerts()}
              style={{
                background: 'none',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 6,
                color: '#EF4444',
                fontSize: 10,
                fontWeight: 600,
                padding: '4px 10px',
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Atualizar`)}
            </button>
          </div>
          {orderAlerts.slice(0, 3).map((alert) => (
            <div
              key={alert.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 0',
                borderTop: '1px solid rgba(239,68,68,0.1)',
              }}
            >
              <span style={{ fontSize: 11, color: '#EF4444', fontFamily: SORA, flex: 1 }}>
                {alert.message}
              </span>
              <button
                type="button"
                onClick={() => resolveAlert(alert.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--app-text-secondary)',
                  fontSize: 10,
                  cursor: 'pointer',
                  fontFamily: SORA,
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                {kloelT(`Resolver`)}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={SUBINTERFACE_PILL_ROW_STYLE}>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            style={getSubinterfacePillStyle(tab === t.key, isMobile)}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {tab === 'vendas' && (
          <GestaoVendas
            salesStats={salesStats as SalesStatsData}
            chart={chart}
            search={search}
            onSearchChange={setSearch}
            filterStatus={filterStatus}
            onFilterStatusChange={setFilterStatus}
            sales={sales as SaleItem[]}
            onOpenDetail={openDetail}
          />
        )}
        {tab === 'assinaturas' && (
          <GestaoAssinaturas
            subStats={subStats as SubStatsData}
            subscriptions={subscriptions as SubscriptionItem[]}
            onOpenDetail={openDetail}
          />
        )}
        {tab === 'fisicos' && (
          <GestaoFisicos
            orderStats={orderStats as OrderStatsData}
            pipeline={pipeline as OrderPipelineData}
            orders={orders as OrderItem[]}
            onOpenDetail={openDetail}
          />
        )}
        {tab === 'estrategias' && estrategiasTab}
        {tab === 'pipeline' && (
          <div>
            {/* Sales pipeline stage summary from /pipeline endpoint */}
            {!salesPipelineLoading && salesStages.length > 0 && (
              <div
                style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' as const }}
              >
                {salesStages.map((stage: PipelineStage) => {
                  const deals: PipelineDeal[] = stage.deals || [];
                  const totalValue = deals.reduce((sum: number, d) => sum + (d.value || 0), 0);
                  return (
                    <div
                      key={stage.id}
                      style={{
                        flex: 1,
                        minWidth: 120,
                        background: 'var(--app-bg-card)',
                        border: '1px solid var(--app-border-primary)',
                        borderRadius: 6,
                        padding: '12px 14px',
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: stage.color || 'colors.ember.primary',
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: 'var(--app-text-secondary)',
                            textTransform: 'uppercase' as const,
                            letterSpacing: '.05em',
                            fontFamily: SORA,
                          }}
                        >
                          {stage.name}
                        </span>
                      </div>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 20,
                          fontWeight: 700,
                          color: 'var(--app-text-primary)',
                          display: 'block',
                        }}
                      >
                        {deals.length}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--app-text-tertiary)',
                          fontFamily: SORA,
                        }}
                      >
                        {totalValue > 0
                          ? 'R$ ' + totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                          : 'R$ 0,00'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <CRMPipelineView />
          </div>
        )}
      </div>
    </div>
  );
}
