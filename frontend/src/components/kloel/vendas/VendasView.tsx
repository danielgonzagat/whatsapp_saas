'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSales, useSalesStats, useSalesChart, useSubscriptions, useSubscriptionStats, useOrders, useOrderStats, useOrderPipeline, useOrderAlerts, useReturnOrder, useSaleDetail } from '@/hooks/useSales';
import { useSalesPipeline } from '@/hooks/useSalesPipeline';
import { apiFetch, tokenStorage } from '@/lib/api';
import { smartPaymentApi } from '@/lib/api/misc';

const CRMPipelineView = dynamic(() => import('@/components/kloel/crm/CRMPipelineView'), { ssr: false });

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

/* ── Smart Payment Modal ── */
function SmartPaymentModal({ workspaceId, onClose }: { workspaceId: string | null; onClose: () => void }) {
  const [form, setForm] = useState({ amount: '', description: '', customerName: '', customerPhone: '', customerEmail: '', method: 'pix', dueDate: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ paymentLink?: string; pixCode?: string; boletoUrl?: string } | null>(null);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!workspaceId || !form.amount || !form.customerName || !form.customerPhone) return;
    setLoading(true); setError('');
    try {
      const res = await smartPaymentApi.create(workspaceId, {
        amount: parseFloat(form.amount.replace(',', '.')),
        description: form.description || 'Cobranca',
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        customerEmail: form.customerEmail || undefined,
        method: form.method,
        dueDate: form.dueDate || undefined,
      });
      if (res.error) throw new Error(res.error);
      setResult(res.data as any);
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar cobranca');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text).catch(() => {}); };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0A0A0C', border: '1px solid #222226', borderRadius: 6, width: 480, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #19191C', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>Nova cobranca</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#3A3A3F', cursor: 'pointer' }}>{IC.x(16)}</button>
        </div>
        <div style={{ padding: 20 }}>
          {result ? (
            <div>
              <div style={{ background: '#111113', border: '1px solid #19191C', borderRadius: 6, padding: 16, marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#10B981', display: 'block', marginBottom: 12, fontFamily: SORA }}>Cobranca criada</span>
                {result.paymentLink && (
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 10, color: '#6E6E73', fontFamily: SORA, textTransform: 'uppercase', letterSpacing: '.06em' }}>Link de pagamento</span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <input aria-label="Link de pagamento" readOnly value={result.paymentLink} style={{ flex: 1, background: '#0A0A0C', border: '1px solid #222226', borderRadius: 4, padding: '8px 12px', color: '#E0DDD8', fontSize: 12, fontFamily: MONO, outline: 'none' }} />
                      <button onClick={() => copyToClipboard(result.paymentLink!)} style={{ padding: '8px 12px', background: 'none', border: '1px solid #222226', borderRadius: 4, color: '#6E6E73', fontSize: 11, cursor: 'pointer', fontFamily: SORA, whiteSpace: 'nowrap' }}>Copiar</button>
                    </div>
                  </div>
                )}
                {result.pixCode && (
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 10, color: '#6E6E73', fontFamily: SORA, textTransform: 'uppercase', letterSpacing: '.06em' }}>Codigo PIX</span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <input aria-label="Codigo PIX" readOnly value={result.pixCode} style={{ flex: 1, background: '#0A0A0C', border: '1px solid #222226', borderRadius: 4, padding: '8px 12px', color: '#E0DDD8', fontSize: 12, fontFamily: MONO, outline: 'none' }} />
                      <button onClick={() => copyToClipboard(result.pixCode!)} style={{ padding: '8px 12px', background: 'none', border: '1px solid #222226', borderRadius: 4, color: '#6E6E73', fontSize: 11, cursor: 'pointer', fontFamily: SORA, whiteSpace: 'nowrap' }}>Copiar</button>
                    </div>
                  </div>
                )}
                {result.boletoUrl && (
                  <div>
                    <span style={{ fontSize: 10, color: '#6E6E73', fontFamily: SORA, textTransform: 'uppercase', letterSpacing: '.06em' }}>Boleto</span>
                    <div style={{ marginTop: 4 }}>
                      <a href={result.boletoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#E85D30', fontFamily: SORA, textDecoration: 'underline' }}>Abrir boleto</a>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setResult(null); setForm({ amount: '', description: '', customerName: '', customerPhone: '', customerEmail: '', method: 'pix', dueDate: '' }); }} style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA }}>Nova cobranca</button>
                <button onClick={onClose} style={{ flex: 1, padding: '10px 16px', background: '#E85D30', border: 'none', borderRadius: 6, color: '#0A0A0C', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SORA }}>Fechar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Cliente', key: 'customerName', placeholder: 'Nome do cliente' },
                { label: 'Telefone', key: 'customerPhone', placeholder: '5511999999999' },
                { label: 'E-mail', key: 'customerEmail', placeholder: 'cliente@exemplo.com' },
                { label: 'Valor (R$)', key: 'amount', placeholder: '97,00' },
                { label: 'Descricao', key: 'description', placeholder: 'Ex: Consultoria, Produto X' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <span style={{ fontSize: 10, color: '#6E6E73', fontFamily: SORA, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>{label}</span>
                  <input aria-label={label} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                    style={{ width: '100%', background: '#111113', border: '1px solid #222226', borderRadius: 4, padding: '9px 12px', color: '#E0DDD8', fontSize: 13, fontFamily: key === 'amount' ? MONO : SORA, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 10, color: '#6E6E73', fontFamily: SORA, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Metodo</span>
                  <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                    style={{ width: '100%', background: '#111113', border: '1px solid #222226', borderRadius: 4, padding: '9px 12px', color: '#E0DDD8', fontSize: 13, fontFamily: SORA, outline: 'none' }}>
                    <option value="pix">PIX</option>
                    <option value="boleto">Boleto</option>
                    <option value="credit_card">Cartao</option>
                    <option value="link">Link</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 10, color: '#6E6E73', fontFamily: SORA, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>Vencimento</span>
                  <input aria-label="Data de vencimento" type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    style={{ width: '100%', background: '#111113', border: '1px solid #222226', borderRadius: 4, padding: '9px 12px', color: '#E0DDD8', fontSize: 13, fontFamily: MONO, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              {error && <span style={{ fontSize: 12, color: '#EF4444', fontFamily: SORA }}>{error}</span>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={onClose} style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA }}>Cancelar</button>
                <button onClick={handleCreate} disabled={loading || !form.amount || !form.customerName || !form.customerPhone}
                  style={{ flex: 1, padding: '10px 16px', background: (form.amount && form.customerName && form.customerPhone) ? '#E85D30' : '#19191C', border: 'none', borderRadius: 6, color: (form.amount && form.customerName && form.customerPhone) ? '#0A0A0C' : '#3A3A3F', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SORA, opacity: loading ? 0.6 : 1 }}>
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

function DetailModal({ detailId, detailType, sales, subscriptions, orders, onClose, onRefund, onPauseSub, onResumeSub, onCancelSub, onChangePlan, onOpenShipModal, onReturnOrder, actionLoading }: {
  detailId: string | null; detailType: 'sale' | 'sub' | 'order'; sales: any[]; subscriptions: any[]; orders: any[];
  onClose: () => void; onRefund: (id: string) => void; onPauseSub: (id: string) => void; onResumeSub: (id: string) => void; onCancelSub: (id: string) => void; onChangePlan: (id: string) => void; onOpenShipModal: (id: string) => void; onReturnOrder: (id: string) => void; actionLoading: boolean;
}) {
  // Fetch fresh sale detail from GET /sales/:id when viewing a sale
  const { sale: freshSale } = useSaleDetail(detailId && detailType === 'sale' ? detailId : null);

  if (!detailId) return null;
  const cached: any = detailType === 'sale' ? sales.find((s: any) => s.id === detailId) : detailType === 'sub' ? subscriptions.find((s: any) => s.id === detailId) : orders.find((o: any) => o.id === detailId);
  // For sales, prefer fresh server data; fall back to cached list entry
  const item: any = (detailType === 'sale' && freshSale) ? freshSale : cached;
  if (!item) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0A0A0C', border: '1px solid #222226', borderRadius: 6, width: 520, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #19191C', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>{detailType === 'order' ? 'Detalhes do pedido' : detailType === 'sub' ? 'Detalhes da assinatura' : 'Detalhes da venda'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#3A3A3F', cursor: 'pointer' }}>{IC.x(16)}</button>
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
              <button onClick={() => onRefund(item.id)} disabled={actionLoading}
                style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: actionLoading ? 0.5 : 1 }}>
                {IC.undo(12)} {actionLoading ? 'Processando...' : 'Reembolsar'}
              </button>
            )}
            {detailType === 'sub' && item.status === 'ACTIVE' && (
              <>
                <button onClick={() => onPauseSub(item.id)} disabled={actionLoading} style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{IC.pause(12)} Pausar</button>
                <button onClick={() => onChangePlan(item.id)} disabled={actionLoading} style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #E85D30', borderRadius: 6, color: '#E85D30', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Mudar plano</button>
                <button onClick={() => onCancelSub(item.id)} disabled={actionLoading} style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#EF4444', fontSize: 12, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{IC.x(12)} Cancelar</button>
              </>
            )}
            {detailType === 'sub' && item.status === 'PAUSED' && (
              <button onClick={() => onResumeSub(item.id)} disabled={actionLoading} style={{ flex: 1, padding: '10px 16px', background: '#E85D30', border: 'none', borderRadius: 6, color: '#0A0A0C', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{IC.play(12)} Retomar</button>
            )}
            {detailType === 'order' && item.status === 'PROCESSING' && (
              <button onClick={() => { onOpenShipModal(item.id); onClose(); }} style={{ flex: 1, padding: '10px 16px', background: '#E85D30', border: 'none', borderRadius: 6, color: '#0A0A0C', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{IC.truck(12)} Marcar como enviado</button>
            )}
            {detailType === 'order' && (item.status === 'SHIPPED' || item.status === 'DELIVERED') && (
              <button onClick={() => onReturnOrder(item.id)} disabled={actionLoading} style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: actionLoading ? 0.5 : 1 }}>{IC.undo(12)} Devolver</button>
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

function ShipModal({ showShipModal, onClose, shipTrackingCode, onTrackingCodeChange, onShipOrder, actionLoading }: {
  showShipModal: string | null; onClose: () => void; shipTrackingCode: string; onTrackingCodeChange: (v: string) => void; onShipOrder: (id: string) => void; actionLoading: boolean;
}) {
  if (!showShipModal) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0A0A0C', border: '1px solid #222226', borderRadius: 6, width: 400, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#E0DDD8', marginBottom: 16, fontFamily: SORA }}>Informar envio</h3>
        <label style={{ fontSize: 12, color: '#6E6E73', display: 'block', marginBottom: 6, fontFamily: SORA }}>Codigo de rastreamento</label>
        <input aria-label="Codigo de rastreamento" value={shipTrackingCode} onChange={e => onTrackingCodeChange(e.target.value)} placeholder="BR000000000BR" autoFocus
          style={{ width: '100%', background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '10px 14px', color: '#E0DDD8', fontSize: 14, fontFamily: MONO, outline: 'none', marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA }}>Cancelar</button>
          <button onClick={() => onShipOrder(showShipModal)} disabled={!shipTrackingCode.trim() || actionLoading}
            style={{ flex: 1, padding: '10px 16px', background: shipTrackingCode.trim() ? '#E85D30' : '#19191C', border: 'none', borderRadius: 6, color: shipTrackingCode.trim() ? '#0A0A0C' : '#3A3A3F', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SORA }}>
            {actionLoading ? 'Enviando...' : 'Confirmar envio'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GestaoVendas({ salesStats, chart, search, onSearchChange, filterStatus, onFilterStatusChange, sales, onOpenDetail }: {
  salesStats: any; chart: number[]; search: string; onSearchChange: (v: string) => void; filterStatus: string; onFilterStatusChange: (v: string) => void; sales: any[]; onOpenDetail: (id: string, type: 'sale' | 'sub' | 'order') => void;
}) {
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
          <input aria-label="Buscar por cliente ou produto" value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Buscar por cliente ou produto..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#E0DDD8', fontSize: 12, fontFamily: SORA }} />
        </div>
        {['todos', 'paid', 'pending', 'refunded'].map(f => (
          <button key={f} onClick={() => onFilterStatusChange(f)}
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
          <div key={s.id} onClick={() => onOpenDetail(s.id, 'sale')}
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

function GestaoAssinaturas({ subStats, subscriptions, onOpenDetail }: {
  subStats: any; subscriptions: any[]; onOpenDetail: (id: string, type: 'sale' | 'sub' | 'order') => void;
}) {
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
          <div key={s.id} onClick={() => onOpenDetail(s.id, 'sub')}
            style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 0.8fr 1fr 0.8fr', gap: 12, padding: '12px 16px', borderBottom: i < subscriptions.length - 1 ? '1px solid #19191C' : 'none', cursor: 'pointer', transition: 'background .1s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#19191C')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <div><span style={{ fontSize: 13, fontWeight: 500, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{s.customerName}</span><span style={{ fontSize: 10, color: '#3A3A3F' }}>Desde {fmtDate(s.startedAt)}</span></div>
            <span style={{ fontSize: 12, color: '#6E6E73', alignSelf: 'center', fontFamily: SORA }}>{s.planName}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: '#E0DDD8', alignSelf: 'center' }}>{fmtBRL(s.amount)}</span>
            <div style={{ alignSelf: 'center' }}><Badge status={s.status} config={SUB_STATUS} /></div>
            <span style={{ fontFamily: MONO, fontSize: 12, color: '#E85D30', fontWeight: 600, alignSelf: 'center' }}>{fmtBRL(s.totalPaid || 0)}</span>
            <span style={{ fontSize: 11, color: '#3A3A3F', alignSelf: 'center' }}>{s.nextBillingAt ? fmtDate(s.nextBillingAt) : '\u2014'}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function GestaoFisicos({ orderStats, pipeline, orders, onOpenDetail }: {
  orderStats: any; pipeline: any; orders: any[]; onOpenDetail: (id: string, type: 'sale' | 'sub' | 'order') => void;
}) {
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
          <div key={o.id} onClick={() => onOpenDetail(o.id, 'order')}
            style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr 1.2fr 0.8fr', gap: 12, padding: '12px 16px', borderBottom: i < orders.length - 1 ? '1px solid #19191C' : 'none', cursor: 'pointer', transition: 'background .1s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#19191C')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <div><span style={{ fontSize: 13, fontWeight: 500, color: '#E0DDD8', display: 'block', fontFamily: SORA }}>{o.customerName}</span><span style={{ fontSize: 10, color: '#3A3A3F' }}>{fmtDate(o.createdAt)}</span></div>
            <span style={{ fontSize: 12, color: '#6E6E73', alignSelf: 'center', fontFamily: SORA }}>{o.productName}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: '#E0DDD8', alignSelf: 'center' }}>{fmtBRL(o.amount)}</span>
            <div style={{ alignSelf: 'center' }}><Badge status={o.status} config={ORDER_STATUS} /></div>
            <span style={{ fontFamily: MONO, fontSize: 11, color: o.trackingCode ? '#6E6E73' : '#3A3A3F', alignSelf: 'center' }}>{o.trackingCode || 'Aguardando'}</span>
            <span style={{ fontSize: 11, color: '#6E6E73', alignSelf: 'center', fontFamily: SORA }}>{o.addressState || '\u2014'}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
interface VendasViewProps { defaultTab?: string; }

export function VendasView({ defaultTab = 'vendas' }: VendasViewProps) {
  const router = useRouter();
  const workspaceId = tokenStorage.getWorkspaceId();
  const [tab, setTab] = useState(defaultTab);
  const prevDefaultV = useRef(defaultTab);
  useEffect(() => { if (prevDefaultV.current !== defaultTab) { setTab(defaultTab); prevDefaultV.current = defaultTab; } }, [defaultTab]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailType, setDetailType] = useState<'sale' | 'sub' | 'order'>('sale');
  const [actionLoading, setActionLoading] = useState(false);
  const [shipTrackingCode, setShipTrackingCode] = useState('');
  const [showShipModal, setShowShipModal] = useState<string | null>(null);
  const [showSmartPayment, setShowSmartPayment] = useState(false);

  // Data hooks
  const { sales, mutate: mutateSales } = useSales({ status: tab === 'vendas' ? filterStatus : undefined, search: tab === 'vendas' ? search : undefined });
  const { stats: salesStats } = useSalesStats();
  const { chart } = useSalesChart();
  const { subscriptions, mutate: mutateSubs } = useSubscriptions({ status: tab === 'assinaturas' ? filterStatus : undefined });
  const { stats: subStats } = useSubscriptionStats();
  const { orders, mutate: mutateOrders } = useOrders({ status: tab === 'fisicos' ? filterStatus : undefined });
  const { stats: orderStats } = useOrderStats();
  const { pipeline } = useOrderPipeline();
  const { stages: salesStages, isLoading: salesPipelineLoading } = useSalesPipeline();

  const handleTabChange = (newTab: string) => {
    setTab(newTab); setFilterStatus('todos'); setSearch('');
    const routes: Record<string, string> = { vendas: '/vendas', assinaturas: '/vendas/assinaturas', fisicos: '/vendas/fisicos', pipeline: '/vendas/pipeline' };
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
  const handleChangePlan = async (id: string) => {
    const planName = prompt('Nome do novo plano:');
    if (!planName) return;
    const amount = prompt('Valor do novo plano (ex: 97.00):');
    if (!amount) return;
    setActionLoading(true);
    await apiFetch(`/sales/subscriptions/${id}/change-plan`, { method: 'PUT', body: { newPlanId: id, newPlanName: planName, newAmount: parseFloat(amount) } });
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
  const { alerts: orderAlerts, counts: alertCounts, generateAlerts, resolveAlert, mutate: mutateAlerts } = useOrderAlerts();

  const TABS = [
    { key: 'vendas', label: 'Gestao de Vendas', icon: IC.dollar },
    { key: 'assinaturas', label: 'Assinaturas', icon: IC.repeat },
    { key: 'fisicos', label: 'Produtos Fisicos', icon: IC.truck },
    { key: 'pipeline', label: 'Pipeline CRM', icon: IC.trend },
  ];

  return (
    <div style={{ background: '#0A0A0C', minHeight: '100vh', fontFamily: SORA, color: '#E0DDD8', padding: 28 }}>
      <DetailModal detailId={detailId} detailType={detailType} sales={sales} subscriptions={subscriptions} orders={orders} onClose={() => setDetailId(null)} onRefund={handleRefund} onPauseSub={handlePauseSub} onResumeSub={handleResumeSub} onCancelSub={handleCancelSub} onChangePlan={handleChangePlan} onOpenShipModal={(id) => setShowShipModal(id)} onReturnOrder={handleReturnOrder} actionLoading={actionLoading} />
      <ShipModal showShipModal={showShipModal} onClose={() => setShowShipModal(null)} shipTrackingCode={shipTrackingCode} onTrackingCodeChange={setShipTrackingCode} onShipOrder={handleShipOrder} actionLoading={actionLoading} />
      {showSmartPayment && <SmartPaymentModal workspaceId={workspaceId} onClose={() => setShowSmartPayment(false)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#E0DDD8', margin: 0, letterSpacing: '-0.02em', fontFamily: SORA }}>Vendas</h1>
          <p style={{ fontSize: 13, color: '#3A3A3F', margin: '4px 0 0', fontFamily: SORA }}>Transacoes, assinaturas e fulfillment</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setShowSmartPayment(true)}
            style={{ padding: '8px 16px', background: '#E85D30', border: 'none', borderRadius: 6, color: '#0A0A0C', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', gap: 6 }}>
            {IC.dollar(14)} Cobrar
          </button>
        <button onClick={() => {
          const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
          const escape = (v: unknown) => { const s = String(v ?? ''); return `"${s.replace(/"/g, '""')}"`; };
          let rows: Record<string, unknown>[] = [];
          let filename = '';
          if (tab === 'vendas') {
            filename = `vendas-${now}.csv`;
            rows = sales.map((s: any) => ({ id: s.id, cliente: s.leadPhone || s.customerName || '', produto: s.productName || '', valor: s.amount, status: s.status, metodo: s.paymentMethod || '', data: s.createdAt }));
          } else if (tab === 'assinaturas') {
            filename = `assinaturas-${now}.csv`;
            rows = subscriptions.map((s: any) => ({ id: s.id, cliente: s.customerName || '', plano: s.planName || '', valor: s.amount, status: s.status, ltv: s.totalPaid || 0 }));
          } else {
            filename = `pedidos-${now}.csv`;
            rows = orders.map((o: any) => ({ id: o.id, cliente: o.customerName || '', produto: o.productName || '', valor: o.amount, status: o.status, rastreio: o.trackingCode || '', destino: o.addressState || '' }));
          }
          if (!rows.length) return;
          const headers = Object.keys(rows[0]);
          const csv = [headers.join(';'), ...rows.map(r => headers.map(h => escape(r[h])).join(';'))].join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }} style={{ padding: '8px 16px', background: 'none', border: '1px solid #222226', borderRadius: 6, color: '#6E6E73', fontSize: 12, cursor: 'pointer', fontFamily: SORA, display: 'flex', alignItems: 'center', gap: 6 }}>{IC.download(14)} Exportar tudo</button>
        </div>
      </div>

      {orderAlerts.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: orderAlerts.length > 1 ? 8 : 0 }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span style={{ fontSize: 12, color: '#EF4444', fontFamily: SORA, flex: 1 }}>
              {orderAlerts.length} alerta{orderAlerts.length > 1 ? 's' : ''}:
              {alertCounts?.missingTracking > 0 && ` ${alertCounts.missingTracking} sem rastreio`}
              {alertCounts?.possibleLost > 0 && ` ${alertCounts.possibleLost} possivel extravio`}
              {alertCounts?.chargebacks > 0 && ` ${alertCounts.chargebacks} chargeback`}
            </span>
            <button onClick={() => generateAlerts()} style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#EF4444', fontSize: 10, fontWeight: 600, padding: '4px 10px', cursor: 'pointer', fontFamily: SORA }}>Atualizar</button>
          </div>
          {orderAlerts.slice(0, 3).map((alert: any) => (
            <div key={alert.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(239,68,68,0.1)' }}>
              <span style={{ fontSize: 11, color: '#EF4444', fontFamily: SORA, flex: 1 }}>{alert.message}</span>
              <button onClick={() => resolveAlert(alert.id)} style={{ background: 'none', border: 'none', color: '#6E6E73', fontSize: 10, cursor: 'pointer', fontFamily: SORA, textDecoration: 'underline', padding: 0 }}>Resolver</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #19191C', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => handleTabChange(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid #E85D30' : '2px solid transparent', color: tab === t.key ? '#E0DDD8' : '#6E6E73', fontSize: 13, fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer', fontFamily: SORA, transition: 'all .15s' }}>
            <span style={{ color: tab === t.key ? '#E85D30' : '#3A3A3F', display: 'flex' }}>{t.icon(14)}</span> {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'vendas' && <GestaoVendas salesStats={salesStats} chart={chart} search={search} onSearchChange={setSearch} filterStatus={filterStatus} onFilterStatusChange={setFilterStatus} sales={sales} onOpenDetail={openDetail} />}
        {tab === 'assinaturas' && <GestaoAssinaturas subStats={subStats} subscriptions={subscriptions} onOpenDetail={openDetail} />}
        {tab === 'fisicos' && <GestaoFisicos orderStats={orderStats} pipeline={pipeline} orders={orders} onOpenDetail={openDetail} />}
        {tab === 'pipeline' && (
          <div>
            {/* Sales pipeline stage summary from /pipeline endpoint */}
            {!salesPipelineLoading && salesStages.length > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' as const }}>
                {salesStages.map((stage: any) => {
                  const deals: any[] = stage.deals || [];
                  const totalValue = deals.reduce((sum: number, d: any) => sum + (d.value || 0), 0);
                  return (
                    <div key={stage.id} style={{ flex: 1, minWidth: 120, background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color || '#E85D30', flexShrink: 0 }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase' as const, letterSpacing: '.05em', fontFamily: SORA }}>{stage.name}</span>
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: '#E0DDD8', display: 'block' }}>{deals.length}</span>
                      <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: SORA }}>
                        {totalValue > 0 ? `R$ ${totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
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
