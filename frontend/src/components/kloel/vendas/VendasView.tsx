'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSales, useSalesStats, useSalesChart, useSubscriptions, useSubscriptionStats, useOrders, useOrderStats, useOrderPipeline } from '@/hooks/useSales';
import { apiFetch } from '@/lib/api';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/* ── Icons ── */
const IC = {
  dollar: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>,
  repeat: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  truck: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  search: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  download: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  undo: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  x: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  pause: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  play: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  map: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  trend: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  trendD: (s: number) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>,
};

/* ── Status configs ── */
const SALE_STATUS: Record<string, { label: string; color: string }> = { paid: { label: 'Pago', color: '#E85D30' }, pending: { label: 'Pendente', color: '#F59E0B' }, refunded: { label: 'Reembolsado', color: '#6E6E73' }, cancelled: { label: 'Cancelado', color: '#3A3A3F' }, overdue: { label: 'Atrasado', color: '#EF4444' } };
const SUB_STATUS: Record<string, { label: string; color: string }> = { ACTIVE: { label: 'Ativa', color: '#E85D30' }, PAST_DUE: { label: 'Atrasada', color: '#F59E0B' }, CANCELLED: { label: 'Cancelada', color: '#3A3A3F' }, PAUSED: { label: 'Pausada', color: '#6E6E73' }, TRIALING: { label: 'Trial', color: '#3B82F6' } };
const ORDER_STATUS: Record<string, { label: string; color: string }> = { PROCESSING: { label: 'Processando', color: '#F59E0B' }, SHIPPED: { label: 'Enviado', color: '#3B82F6' }, DELIVERED: { label: 'Entregue', color: '#E85D30' }, RETURNED: { label: 'Devolvido', color: '#6E6E73' }, CANCELLED: { label: 'Cancelado', color: '#3A3A3F' } };
const PAY_METHODS: Record<string, string> = { PIX: '#E85D30', CREDIT_CARD: '#3B82F6', BOLETO: '#F59E0B', DEBIT: '#10B981' };

/* ── Helpers ── */
function fmtBRL(v: number) { return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`; }
function fmtDate(d: string | Date) { return new Date(d).toLocaleDateString('pt-BR'); }

function Stat({ label, value, color = '#E0DDD8', sub, trend }: { label: string; value: string; color?: string; sub?: string; trend?: number }) {
  return (
    <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 18 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#6E6E73', letterSpacing: '.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: SORA }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color }}>{value}</span>
        {trend !== undefined && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: trend > 0 ? '#10B981' : '#EF4444' }}>
            {trend > 0 ? IC.trend(10) : IC.trendD(10)} {Math.abs(trend)}%
          </span>
        )}
      </div>
      {sub && <span style={{ fontSize: 11, color: '#3A3A3F', marginTop: 4, display: 'block', fontFamily: SORA }}>{sub}</span>}
    </div>
  );
}

function Badge({ status, config }: { status: string; config: Record<string, { label: string; color: string }> }) {
  const s = config[status] || { label: status, color: '#3A3A3F' };
  return <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: s.color, background: `${s.color}12`, padding: '3px 8px', borderRadius: 4, letterSpacing: '.04em', textTransform: 'uppercase' }}>{s.label}</span>;
}

function TH({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: SORA }}>{children}</span>;
}

function MiniChart({ data, color = '#E85D30' }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
      {data.map((v, i) => <div key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, minHeight: 2, background: i === data.length - 1 ? color : '#222226', borderRadius: '2px 2px 0 0' }} />)}
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
interface VendasViewProps { defaultTab?: string; }

export function VendasView({ defaultTab = 'vendas' }: VendasViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState(defaultTab);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailType, setDetailType] = useState<'sale' | 'sub' | 'order'>('sale');
  const [actionLoading, setActionLoading] = useState(false);
  const [shipTrackingCode, setShipTrackingCode] = useState('');
  const [showShipModal, setShowShipModal] = useState<string | null>(null);

  // Data hooks
  const { sales, mutate: mutateSales } = useSales({ status: tab === 'vendas' ? filterStatus : undefined, search: tab === 'vendas' ? search : undefined });
  const { stats: salesStats } = useSalesStats();
  const { chart } = useSalesChart();
  const { subscriptions, mutate: mutateSubs } = useSubscriptions({ status: tab === 'assinaturas' ? filterStatus : undefined });
  const { stats: subStats } = useSubscriptionStats();
  const { orders, mutate: mutateOrders } = useOrders({ status: tab === 'fisicos' ? filterStatus : undefined });
  const { stats: orderStats } = useOrderStats();
  const { pipeline } = useOrderPipeline();

  const handleTabChange = (newTab: string) => {
    setTab(newTab); setFilterStatus('todos'); setSearch('');
    const routes: Record<string, string> = { vendas: '/vendas', assinaturas: '/vendas/assinaturas', fisicos: '/vendas/fisicos' };
    router.push(routes[newTab] || '/vendas');
  };

  const openDetail = (id: string, type: 'sale' | 'sub' | 'order') => { setDetailId(id); setDetailType(type); };

  // Actions
  const handleRefund = async (id: string) => { setActionLoading(true); await apiFetch(`/sales/${id}/refund`, { method: 'POST' }); await mutateSales(); setActionLoading(false); setDetailId(null); };
  const handlePauseSub = async (id: string) => { setActionLoading(true); await apiFetch(`/sales/subscriptions/${id}/pause`, { method: 'POST' }); await mutateSubs(); setActionLoading(false); setDetailId(null); };
  const handleResumeSub = async (id: string) => { setActionLoading(true); await apiFetch(`/sales/subscriptions/${id}/resume`, { method: 'POST' }); await mutateSubs(); setActionLoading(false); setDetailId(null); };
  const handleCancelSub = async (id: string) => { setActionLoading(true); await apiFetch(`/sales/subscriptions/${id}/cancel`, { method: 'POST' }); await mutateSubs(); setActionLoading(false); setDetailId(null); };
  const handleShipOrder = async (id: string) => { if (!shipTrackingCode.trim()) return; setActionLoading(true); await apiFetch(`/sales/orders/${id}/ship`, { method: 'PUT', body: { trackingCode: shipTrackingCode } }); await mutateOrders(); setActionLoading(false); setShowShipModal(null); setShipTrackingCode(''); };
  const handleDeliverOrder = async (id: string) => { setActionLoading(true); await apiFetch(`/sales/orders/${id}/deliver`, { method: 'PUT' }); await mutateOrders(); setActionLoading(false); setDetailId(null); };

  const TABS = [
    { key: 'vendas', label: 'Gestao de Vendas', icon: IC.dollar },
    { key: 'assinaturas', label: 'Assinaturas', icon: IC.repeat },
    { key: 'fisicos', label: 'Produtos Fisicos', icon: IC.truck },
  ];

  /* ── Detail Modal ── */
  function DetailModal() {
    if (!detailId) return null;
    const item: any = detailType === 'sale' ? sales.find((s: any) => s.id === detailId) : detailType === 'sub' ? subscriptions.find((s: any) => s.id === detailId) : orders.find((o: any) => o.id === detailId);
    if (!item) return null;

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={() => setDetailId(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#0A0A0C', border: '1px solid #222226', borderRadius: 6, width: 520, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #19191C', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>{detailType === 'order' ? 'Detalhes do pedido' : detailType === 'sub' ? 'Detalhes da assinatura' : 'Detalhes da venda'}</span>
            <button onClick={() => setDetailId(null)} style={{ background: 'none', border: 'none', color: '#3A3A3F', cursor: 'pointer' }}>{IC.x(16)}</button>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{item.customerName || item.leadPhone || item.productName || 'Cliente'}</span>
                <span style={{ fontSize: 12, color: '#3A3A3F', fontFamily: SORA }}>{item.customerEmail || item.planName || item.addressState || ''}</span>
              </div>
              <Badge status={item.status} config={detailType === 'order' ? ORDER_STATUS : detailType === 'sub' ? SUB_STATUS : SALE_STATUS} />
            </div>

            <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 16, marginBottom: 16 }}>
              {[
                { l: 'Valor', v: fmtBRL(item.amount), c: '#E85D30' },
                item.paymentMethod && { l: 'Metodo', v: item.paymentMethod },
                { l: 'Data', v: fmtDate(item.createdAt || item.startedAt || new Date()) },
                detailType === 'sub' && item.nextBillingAt && { l: 'Proxima cobranca', v: fmtDate(item.nextBillingAt) },
                detailType === 'sub' && { l: 'LTV', v: fmtBRL(item.totalPaid || 0), c: '#E85D30' },
                detailType === 'order' && { l: 'Rastreamento', v: item.trackingCode || 'Aguardando' },
                detailType === 'order' && item.addressState && { l: 'Destino', v: `${item.addressCity || ''}, ${item.addressState}` },
                { l: 'ID', v: item.id },
              ].filter(Boolean).map((r: any, i, arr) => (
                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid #19191C' : 'none' }}>
                  <span style={{ fontSize: 12, color: '#6E6E73', fontFamily: SORA }}>{r.l}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: r.c || '#E0DDD8', fontFamily: r.c ? MONO : SORA }}>{r.v}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {detailType === 'sale' && item.status === 'paid' && (
                <button onClick={() => handleRefund(item.id)} disabled={actionLoading}
                  style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: actionLoading ? 0.5 : 1 }}>
                  {IC.undo(12)} {actionLoading ? 'Processando...' : 'Reembolsar'}
                </button>
              )}
              {detailType === 'sub' && item.status === 'ACTIVE' && (
                <>
                  <button onClick={() => handlePauseSub(item.id)} disabled={actionLoading} style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{IC.pause(12)} Pausar</button>
                  <button onClick={() => handleCancelSub(item.id)} disabled={actionLoading} style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#EF4444', fontSize: 12, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{IC.x(12)} Cancelar</button>
                </>
              )}
              {detailType === 'sub' && item.status === 'PAUSED' && (
                <button onClick={() => handleResumeSub(item.id)} disabled={actionLoading} style={{ flex: 1, padding: '10px 16px', background: '#E85D30', border: 'none', borderRadius: 6, color: '#0A0A0C', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{IC.play(12)} Retomar</button>
              )}
              {detailType === 'order' && item.status === 'PROCESSING' && (
                <button onClick={() => { setShowShipModal(item.id); setDetailId(null); }} style={{ flex: 1, padding: '10px 16px', background: '#E85D30', border: 'none', borderRadius: 6, color: '#0A0A0C', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{IC.truck(12)} Marcar como enviado</button>
              )}
              {detailType === 'order' && item.trackingCode && (
                <button onClick={() => window.open(`https://www.linkcorreios.com.br/?id=${item.trackingCode}`, '_blank')} style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{IC.map(12)} Rastrear</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Ship Modal ── */
  function ShipModal() {
    if (!showShipModal) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={() => setShowShipModal(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#0A0A0C', border: '1px solid #222226', borderRadius: 6, width: 400, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#E0DDD8', marginBottom: 16, fontFamily: SORA }}>Informar envio</h3>
          <label style={{ fontSize: 12, color: '#6E6E73', display: 'block', marginBottom: 6, fontFamily: SORA }}>Codigo de rastreamento</label>
          <input value={shipTrackingCode} onChange={e => setShipTrackingCode(e.target.value)} placeholder="BR000000000BR" autoFocus
            style={{ width: '100%', background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '10px 14px', color: '#E0DDD8', fontSize: 14, fontFamily: MONO, outline: 'none', marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowShipModal(null)} style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA }}>Cancelar</button>
            <button onClick={() => handleShipOrder(showShipModal)} disabled={!shipTrackingCode.trim() || actionLoading}
              style={{ flex: 1, padding: '10px 16px', background: shipTrackingCode.trim() ? '#E85D30' : '#19191C', border: 'none', borderRadius: 6, color: shipTrackingCode.trim() ? '#0A0A0C' : '#3A3A3F', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SORA }}>
              {actionLoading ? 'Enviando...' : 'Confirmar envio'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Tab: Gestao de Vendas ── */
  function GestaoVendas() {
    const st = salesStats;
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <Stat label="Faturamento total" value={fmtBRL(st.totalRevenue || 0)} color="#E85D30" trend={st.revenueTrend} />
          <Stat label="Transacoes" value={String(st.totalTransactions || 0)} sub="Ultimos 30 dias" />
          <Stat label="Pendentes" value={fmtBRL(st.totalPending || 0)} color="#F59E0B" sub={`${st.pendingCount || 0} transacoes`} />
          <Stat label="Ticket medio" value={fmtBRL(st.avgTicket || 0)} />
        </div>
        {chart.length > 0 && (
          <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 18, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>Vendas — Ultimos 30 dias</span>
              {st.revenueTrend && <span style={{ fontFamily: MONO, fontSize: 12, color: st.revenueTrend > 0 ? '#10B981' : '#EF4444' }}>{st.revenueTrend > 0 ? '+' : ''}{st.revenueTrend}%</span>}
            </div>
            <MiniChart data={chart} />
          </div>
        )}
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '8px 14px' }}>
            <span style={{ color: '#3A3A3F' }}>{IC.search(14)}</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente ou produto..."
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#E0DDD8', fontSize: 12, fontFamily: SORA }} />
          </div>
          {['todos', 'paid', 'pending', 'refunded'].map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              style={{ padding: '7px 14px', background: filterStatus === f ? 'rgba(232,93,48,0.06)' : '#111113', border: `1px solid ${filterStatus === f ? '#E85D30' : '#222226'}`, borderRadius: 6, color: filterStatus === f ? '#E0DDD8' : '#6E6E73', fontSize: 11, cursor: 'pointer', fontFamily: SORA }}>
              {f === 'todos' ? 'Todos' : SALE_STATUS[f]?.label || f}
            </button>
          ))}
        </div>
        {/* Table */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 0.8fr 0.8fr', gap: 12, padding: '10px 16px', borderBottom: '1px solid #19191C' }}>
            <TH>Cliente</TH><TH>Produto</TH><TH>Valor</TH><TH>Metodo</TH><TH>Status</TH><TH>Data</TH>
          </div>
          {sales.length === 0 ? (
            <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '60px 20px', textAlign: 'center' }}>
              <span style={{ fontSize: 14, color: '#6E6E73', display: 'block', marginBottom: 8 }}>Nenhuma venda encontrada</span>
              <span style={{ fontSize: 12, color: '#3A3A3F' }}>Pedidos aparecerao aqui quando seus clientes comprarem</span>
            </div>
          ) : sales.map((s: any, i: number) => (
            <div key={s.id} onClick={() => openDetail(s.id, 'sale')}
              style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 0.8fr 0.8fr', gap: 12, padding: '12px 16px', borderBottom: i < sales.length - 1 ? '1px solid #19191C' : 'none', cursor: 'pointer', transition: 'background .1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#19191C')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <div><span style={{ fontSize: 13, fontWeight: 500, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{s.leadPhone || 'Cliente'}</span><span style={{ fontSize: 10, color: '#3A3A3F' }}>{s.leadId?.slice(0, 8) || ''}</span></div>
              <span style={{ fontSize: 12, color: '#6E6E73', alignSelf: 'center', fontFamily: SORA }}>{s.productName || 'Produto'}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: '#E85D30', alignSelf: 'center' }}>{fmtBRL(s.amount)}</span>
              <div style={{ alignSelf: 'center' }}>{s.paymentMethod && <span style={{ fontSize: 10, color: PAY_METHODS[s.paymentMethod] || '#6E6E73', background: `${PAY_METHODS[s.paymentMethod] || '#6E6E73'}12`, padding: '3px 8px', borderRadius: 4, fontWeight: 600, textTransform: 'uppercase', fontFamily: MONO }}>{s.paymentMethod}</span>}</div>
              <div style={{ alignSelf: 'center' }}><Badge status={s.status} config={SALE_STATUS} /></div>
              <span style={{ fontSize: 11, color: '#3A3A3F', alignSelf: 'center' }}>{fmtDate(s.createdAt)}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  /* ── Tab: Assinaturas ── */
  function GestaoAssinaturas() {
    const st = subStats;
    const lc = st.lifecycle || {};
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          <Stat label="MRR" value={fmtBRL(st.mrr || 0)} color="#E85D30" trend={5.8} />
          <Stat label="Assinaturas ativas" value={String(st.activeCount || 0)} />
          <Stat label="Churn rate" value={`${st.churnRate || 0}%`} color={(st.churnRate || 0) > 5 ? '#EF4444' : '#10B981'} />
          <Stat label="LTV medio" value={fmtBRL(st.avgLtv || 0)} />
          <Stat label="ARR projetado" value={fmtBRL(st.arr || 0)} color="#E85D30" />
        </div>
        {/* Lifecycle */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 24 }}>
          {[
            { label: 'Trial', count: lc.trial || 0, color: '#3B82F6' },
            { label: 'Ativas', count: lc.active || 0, color: '#E85D30' },
            { label: 'Atrasadas', count: lc.past_due || 0, color: '#F59E0B' },
            { label: 'Pausadas', count: lc.paused || 0, color: '#6E6E73' },
            { label: 'Canceladas', count: lc.cancelled || 0, color: '#3A3A3F' },
          ].map(s => (
            <div key={s.label} style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 14, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: s.color, opacity: 0.5 }} />
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: s.color, display: 'block' }}>{s.count}</span>
              <span style={{ fontSize: 10, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: SORA }}>{s.label}</span>
            </div>
          ))}
        </div>
        {/* Table */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 0.8fr 1fr 0.8fr', gap: 12, padding: '10px 16px', borderBottom: '1px solid #19191C' }}>
            <TH>Assinante</TH><TH>Plano</TH><TH>Valor/mes</TH><TH>Status</TH><TH>LTV</TH><TH>Prox. cobranca</TH>
          </div>
          {subscriptions.length === 0 ? (
            <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '60px 20px', textAlign: 'center' }}>
              <span style={{ fontSize: 14, color: '#6E6E73', display: 'block', marginBottom: 8 }}>Nenhuma assinatura encontrada</span>
              <span style={{ fontSize: 12, color: '#3A3A3F' }}>Assinaturas aparecerao aqui quando seus clientes assinarem</span>
            </div>
          ) : subscriptions.map((s: any, i: number) => (
            <div key={s.id} onClick={() => openDetail(s.id, 'sub')}
              style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 0.8fr 1fr 0.8fr', gap: 12, padding: '12px 16px', borderBottom: i < subscriptions.length - 1 ? '1px solid #19191C' : 'none', cursor: 'pointer', transition: 'background .1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#19191C')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <div><span style={{ fontSize: 13, fontWeight: 500, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{s.customerName}</span><span style={{ fontSize: 10, color: '#3A3A3F' }}>Desde {fmtDate(s.startedAt)}</span></div>
              <span style={{ fontSize: 12, color: '#6E6E73', alignSelf: 'center', fontFamily: SORA }}>{s.planName}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: '#E0DDD8', alignSelf: 'center' }}>{fmtBRL(s.amount)}</span>
              <div style={{ alignSelf: 'center' }}><Badge status={s.status} config={SUB_STATUS} /></div>
              <span style={{ fontFamily: MONO, fontSize: 12, color: '#E85D30', fontWeight: 600, alignSelf: 'center' }}>{fmtBRL(s.totalPaid || 0)}</span>
              <span style={{ fontSize: 11, color: '#3A3A3F', alignSelf: 'center' }}>{s.nextBillingAt ? fmtDate(s.nextBillingAt) : '—'}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  /* ── Tab: Produtos Fisicos ── */
  function GestaoFisicos() {
    const st = orderStats;
    const pl = pipeline;
    const total = (st.total || 0) || 1;
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <Stat label="Pedidos totais" value={String(st.total || 0)} sub="Ultimos 30 dias" />
          <Stat label="Aguardando envio" value={String(st.processing || 0)} color="#F59E0B" />
          <Stat label="Em transito" value={String(st.shipped || 0)} color="#3B82F6" />
          <Stat label="Entregues" value={String(st.delivered || 0)} color="#E85D30" />
        </div>
        {/* Pipeline */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 18, marginBottom: 24 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 14, fontFamily: SORA }}>Pipeline de fulfillment</span>
          <div style={{ display: 'flex', gap: 4, height: 8, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${((pl.processing || 0) / total) * 100}%`, background: '#F59E0B', borderRadius: '4px 0 0 4px' }} />
            <div style={{ width: `${((pl.shipped || 0) / total) * 100}%`, background: '#3B82F6' }} />
            <div style={{ width: `${((pl.delivered || 0) / total) * 100}%`, background: '#E85D30', borderRadius: '0 4px 4px 0' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            {[{ l: 'Processando', c: '#F59E0B', n: pl.processing || 0 }, { l: 'Enviados', c: '#3B82F6', n: pl.shipped || 0 }, { l: 'Entregues', c: '#E85D30', n: pl.delivered || 0 }].map(s => (
              <span key={s.l} style={{ fontSize: 10, color: '#6E6E73', display: 'flex', alignItems: 'center', gap: 4, fontFamily: SORA }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: s.c }} />{s.l} ({s.n})
              </span>
            ))}
          </div>
        </div>
        {/* Table */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr 1.2fr 0.8fr', gap: 12, padding: '10px 16px', borderBottom: '1px solid #19191C' }}>
            <TH>Cliente</TH><TH>Produto</TH><TH>Valor</TH><TH>Status</TH><TH>Rastreamento</TH><TH>Destino</TH>
          </div>
          {orders.length === 0 ? (
            <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '60px 20px', textAlign: 'center' }}>
              <span style={{ fontSize: 14, color: '#6E6E73', display: 'block', marginBottom: 8 }}>Nenhum pedido encontrado</span>
              <span style={{ fontSize: 12, color: '#3A3A3F' }}>Pedidos aparecerao aqui quando seus clientes comprarem</span>
            </div>
          ) : orders.map((o: any, i: number) => (
            <div key={o.id} onClick={() => openDetail(o.id, 'order')}
              style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr 1.2fr 0.8fr', gap: 12, padding: '12px 16px', borderBottom: i < orders.length - 1 ? '1px solid #19191C' : 'none', cursor: 'pointer', transition: 'background .1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#19191C')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <div><span style={{ fontSize: 13, fontWeight: 500, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{o.customerName}</span><span style={{ fontSize: 10, color: '#3A3A3F' }}>{fmtDate(o.createdAt)}</span></div>
              <span style={{ fontSize: 12, color: '#6E6E73', alignSelf: 'center', fontFamily: SORA }}>{o.productName}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: '#E0DDD8', alignSelf: 'center' }}>{fmtBRL(o.amount)}</span>
              <div style={{ alignSelf: 'center' }}><Badge status={o.status} config={ORDER_STATUS} /></div>
              <span style={{ fontFamily: MONO, fontSize: 11, color: o.trackingCode ? '#6E6E73' : '#3A3A3F', alignSelf: 'center' }}>{o.trackingCode || 'Aguardando'}</span>
              <span style={{ fontSize: 11, color: '#6E6E73', alignSelf: 'center', fontFamily: SORA }}>{o.addressState || '—'}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div style={{ background: '#0A0A0C', minHeight: '100vh', fontFamily: SORA, color: '#E0DDD8', padding: 28 }}>
      <DetailModal />
      <ShipModal />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#E0DDD8', margin: 0, letterSpacing: '-0.02em', fontFamily: SORA }}>Vendas</h1>
          <p style={{ fontSize: 13, color: '#3A3A3F', margin: '4px 0 0', fontFamily: SORA }}>Transacoes, assinaturas e fulfillment</p>
        </div>
        <button style={{ padding: '8px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', gap: 6 }}>{IC.download(14)} Exportar tudo</button>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #19191C', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => handleTabChange(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid #E85D30' : '2px solid transparent', color: tab === t.key ? '#E0DDD8' : '#6E6E73', fontSize: 13, fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer', fontFamily: SORA, transition: 'all .15s' }}>
            <span style={{ color: tab === t.key ? '#E85D30' : '#3A3A3F', display: 'flex' }}>{t.icon(14)}</span> {t.label}
          </button>
        ))}
      </div>

      <div key={tab}>
        {tab === 'vendas' && <GestaoVendas />}
        {tab === 'assinaturas' && <GestaoAssinaturas />}
        {tab === 'fisicos' && <GestaoFisicos />}
      </div>
    </div>
  );
}
