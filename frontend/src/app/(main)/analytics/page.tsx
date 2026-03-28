'use client';

import { useState } from 'react';
import { useReports, useAIReport } from '@/hooks/useReports';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

function fmtBRL(v: number) { return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`; }
function fmtK(v: number) { return v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : fmtBRL(v); }

/* ── Chart Components ── */
function BarChart({ data, color = '#E85D30', height = 60 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {data.map((v, i) => <div key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, minHeight: 2, background: i === data.length - 1 ? color : `${color}40`, borderRadius: '2px 2px 0 0', transition: 'height .5s ease' }} />)}
    </div>
  );
}

function DonutChart({ segments, size = 100 }: { segments: { value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const radius = 36, cx = size / 2, cy = size / 2;
  const cumulativeValues = segments.reduce<number[]>((acc, seg, i) => {
    acc.push((i === 0 ? 0 : acc[i - 1]) + seg.value);
    return acc;
  }, []);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => {
        const prevCumulative = i === 0 ? 0 : cumulativeValues[i - 1];
        const startAngle = (prevCumulative / total) * 360 - 90;
        const endAngle = (cumulativeValues[i] / total) * 360 - 90;
        const largeArc = endAngle - startAngle > 180 ? 1 : 0;
        const x1 = cx + radius * Math.cos((startAngle * Math.PI) / 180);
        const y1 = cy + radius * Math.sin((startAngle * Math.PI) / 180);
        const x2 = cx + radius * Math.cos((endAngle * Math.PI) / 180);
        const y2 = cy + radius * Math.sin((endAngle * Math.PI) / 180);
        return <path key={i} d={`M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} Z`} fill={seg.color} opacity={0.8} />;
      })}
      <circle cx={cx} cy={cy} r={20} fill="#111113" />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight={700} fill="#E0DDD8" fontFamily={MONO}>{total}</text>
    </svg>
  );
}

function HBar({ label, value, max, color = '#E85D30' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <span style={{ fontSize: 12, color: '#6E6E73', width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SORA }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: '#19191C', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .5s ease' }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 11, color: '#E0DDD8', width: 70, textAlign: 'right', flexShrink: 0 }}>{value.toLocaleString('pt-BR')}</span>
    </div>
  );
}

const PAY_COLORS: Record<string, string> = { PIX: '#E85D30', CREDIT_CARD: '#3B82F6', BOLETO: '#F59E0B', DEBIT: '#10B981', OUTRO: '#6E6E73' };
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

/* ═══ MAIN ═══ */
export default function KloelRelatorio() {
  const [period, setPeriod] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const effectivePeriod = showCustom && customStart && customEnd ? `custom:${customStart}:${customEnd}` : period;
  const { report, isLoading } = useReports(effectivePeriod);
  const { aiReport } = useAIReport();

  const kpi = report.kpi || {};
  const revenueChart = report.revenueChart || { current: [], previous: [] };
  const topProducts = report.topProducts || [];
  const funnel = report.funnel || {};
  const paymentMethods: any[] = report.paymentMethods || [];
  const salesByHour: number[] = report.salesByHour || new Array(24).fill(0);
  const salesByWeekday: number[] = report.salesByWeekday || new Array(7).fill(0);
  const financial = report.financial || {};
  const ai = aiReport || {};

  const totalPayments = paymentMethods.reduce((s: number, p: any) => s + (p.count || 0), 0) || 1;

  return (
    <div style={{ background: '#0A0A0C', minHeight: '100vh', fontFamily: SORA, color: '#E0DDD8', padding: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#E0DDD8', margin: 0, letterSpacing: '-0.02em', fontFamily: SORA }}>Relatorio</h1>
          <p style={{ fontSize: 13, color: '#3A3A3F', margin: '4px 0 0', fontFamily: SORA }}>Visao completa do seu negocio</p>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {['7d', '30d', '90d', '12m'].map(p => (
            <button key={p} onClick={() => { setPeriod(p); setShowCustom(false); }}
              style={{ padding: '6px 14px', background: period === p && !showCustom ? 'rgba(232,93,48,0.06)' : '#111113', border: `1px solid ${period === p && !showCustom ? '#E85D30' : '#222226'}`, borderRadius: 6, color: period === p && !showCustom ? '#E0DDD8' : '#6E6E73', fontSize: 11, fontWeight: period === p && !showCustom ? 600 : 400, cursor: 'pointer', fontFamily: SORA }}>{p}</button>
          ))}
          <button onClick={() => setShowCustom(!showCustom)}
            style={{ padding: '6px 14px', background: showCustom ? 'rgba(232,93,48,0.06)' : '#111113', border: `1px solid ${showCustom ? '#E85D30' : '#222226'}`, borderRadius: 6, color: showCustom ? '#E0DDD8' : '#6E6E73', fontSize: 11, fontWeight: showCustom ? 600 : 400, cursor: 'pointer', fontFamily: SORA }}>Personalizado</button>
          {showCustom && (
            <>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                style={{ padding: '5px 8px', background: '#111113', border: '1px solid #222226', borderRadius: 6, color: '#E0DDD8', fontSize: 11, fontFamily: MONO, outline: 'none' }} />
              <span style={{ color: '#3A3A3F', fontSize: 11 }}>ate</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                style={{ padding: '5px 8px', background: '#111113', border: '1px solid #222226', borderRadius: 6, color: '#E0DDD8', fontSize: 11, fontFamily: MONO, outline: 'none' }} />
            </>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { l: 'Receita total', v: fmtBRL(kpi.totalRevenue || 0), c: '#E85D30', t: kpi.revenueTrend, chart: revenueChart.current?.slice(-7) },
          { l: 'Vendas', v: String(kpi.totalSales || 0), t: kpi.salesTrend, chart: null },
          { l: 'Leads capturados', v: String(kpi.totalLeads || 0), t: kpi.leadsTrend, chart: null },
          { l: 'Conversao', v: `${kpi.conversionRate || 0}%`, c: '#E85D30' },
          { l: 'Ticket medio', v: fmtBRL(kpi.avgTicket || 0) },
          { l: 'ROAS', v: kpi.adSpend ? `${((kpi.totalRevenue || 0) / kpi.adSpend).toFixed(2)}x` : '--', c: kpi.adSpend && (kpi.totalRevenue || 0) / kpi.adSpend >= 3 ? '#10B981' : '#E85D30' },
        ].map(s => (
          <div key={s.l} style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 16 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#6E6E73', letterSpacing: '.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: SORA }}>{s.l}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: s.chart ? 10 : 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: s.c || '#E0DDD8' }}>{s.v}</span>
              {s.t !== undefined && s.t !== 0 && (
                <span style={{ fontSize: 10, color: s.t > 0 ? '#10B981' : '#EF4444' }}>{s.t > 0 ? '+' : ''}{s.t}%</span>
              )}
            </div>
            {s.chart && s.chart.length > 0 && <BarChart data={s.chart} height={28} />}
          </div>
        ))}
      </div>

      {/* Row 1: Revenue Chart + Channel (simplified since we don't have per-channel data yet) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Revenue chart */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 2, fontFamily: SORA }}>Receita — {period === '7d' ? '7 dias' : period === '30d' ? '30 dias' : period === '90d' ? '90 dias' : '12 meses'}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: '#3A3A3F' }}>vs periodo anterior</span>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 10, color: '#E85D30', display: 'flex', alignItems: 'center', gap: 4, fontFamily: SORA }}><span style={{ width: 8, height: 2, background: '#E85D30', display: 'inline-block' }} /> Atual</span>
              <span style={{ fontSize: 10, color: '#3A3A3F', display: 'flex', alignItems: 'center', gap: 4, fontFamily: SORA }}><span style={{ width: 8, height: 2, background: '#3A3A3F', display: 'inline-block' }} /> Anterior</span>
            </div>
          </div>
          {revenueChart.current?.length > 0 ? (() => {
            const data = revenueChart.current;
            const prev = revenueChart.previous || [];
            const max = Math.max(...data, ...prev, 1);
            const w = data.length * 50;
            const pts = (d: number[]) => d.map((v: number, i: number) => `${i * (w / (d.length - 1))},${128 - (v / max) * 116}`).join(' ');
            const poly = (d: number[]) => `0,128 ${pts(d)} ${w},128`;
            return (
              <svg width="100%" height={140} viewBox={`0 0 ${w} 140`} preserveAspectRatio="none">
                {prev.length > 0 && <><polygon points={poly(prev)} fill="rgba(58,58,63,0.1)" /><polyline points={pts(prev)} fill="none" stroke="#3A3A3F" strokeWidth={1} strokeDasharray="4 4" /></>}
                <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E85D30" stopOpacity="0.15"/><stop offset="100%" stopColor="#E85D30" stopOpacity="0"/></linearGradient></defs>
                <polygon points={poly(data)} fill="url(#rg)" />
                <polyline points={pts(data)} fill="none" stroke="#E85D30" strokeWidth={2} />
              </svg>
            );
          })() : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3A3A3F', fontSize: 12, fontFamily: SORA }}>Sem dados de receita no periodo</div>
          )}
        </div>

        {/* Top Products */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 16, fontFamily: SORA }}>Top produtos</span>
          {topProducts.length > 0 ? topProducts.map((p: any, i: number) => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < topProducts.length - 1 ? '1px solid #19191C' : 'none' }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: '#E85D30', width: 20 }}>{String(i + 1).padStart(2, '0')}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#E0DDD8', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SORA }}>{p.name}</span>
                <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: SORA }}>{p.sales} vendas</span>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: '#E0DDD8' }}>{fmtK(p.revenue)}</span>
            </div>
          )) : (
            <div style={{ padding: 24, textAlign: 'center', color: '#3A3A3F', fontSize: 12, fontFamily: SORA }}>Nenhuma venda no periodo</div>
          )}
        </div>
      </div>

      {/* Row 2: Funnel + Payments + AI */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Funnel */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 16, fontFamily: SORA }}>Funil de conversao</span>
          {[
            { stage: 'Visitantes', count: funnel.visitors || 0, color: '#222226' },
            { stage: 'Leads', count: funnel.leads || 0, color: '#3A3A3F' },
            { stage: 'Qualificados', count: funnel.qualified || 0, color: '#6E6E73' },
            { stage: 'Negociacao', count: funnel.negotiation || 0, color: '#E85D30' },
            { stage: 'Vendas', count: funnel.converted || 0, color: '#E85D30' },
          ].map((f, i, arr) => {
            const base = arr[0].count || 1;
            const pct = ((f.count / base) * 100).toFixed(1);
            const dropoff = i > 0 && arr[i - 1].count > 0 ? (((arr[i - 1].count - f.count) / arr[i - 1].count) * 100).toFixed(0) : null;
            return (
              <div key={f.stage} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#E0DDD8', fontFamily: SORA }}>{f.stage}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: f.color }}>{f.count.toLocaleString('pt-BR')}</span>
                    {dropoff && <span style={{ fontFamily: MONO, fontSize: 9, color: '#EF4444' }}>-{dropoff}%</span>}
                  </div>
                </div>
                <div style={{ height: 4, background: '#19191C', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: f.color, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 12, borderTop: '1px solid #19191C', paddingTop: 10 }}>
            <span style={{ fontSize: 10, color: '#3A3A3F', fontFamily: SORA }}>Taxa geral: </span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: '#E85D30' }}>{funnel.visitors ? ((funnel.converted / funnel.visitors) * 100).toFixed(1) : '0'}%</span>
          </div>
        </div>

        {/* Payment methods */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 16, fontFamily: SORA }}>Metodos de pagamento</span>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <DonutChart segments={paymentMethods.length > 0 ? paymentMethods.map((p: any) => ({ value: p.count, color: PAY_COLORS[p.method] || '#6E6E73' })) : [{ value: 1, color: '#222226' }]} />
          </div>
          {paymentMethods.map((p: any) => (
            <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #19191C' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: PAY_COLORS[p.method] || '#6E6E73', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#E0DDD8', flex: 1, fontFamily: SORA }}>{p.method}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: '#6E6E73' }}>{Math.round((p.count / totalPayments) * 100)}%</span>
            </div>
          ))}
          {paymentMethods.length === 0 && <div style={{ textAlign: 'center', color: '#3A3A3F', fontSize: 12, padding: 16, fontFamily: SORA }}>Sem vendas no periodo</div>}
        </div>

        {/* AI Performance */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#E85D30" strokeWidth={1.5}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', fontFamily: SORA }}>Performance da IA</span>
          </div>
          {[
            { l: 'Mensagens processadas', v: (ai.messagesProcessed || 0).toLocaleString('pt-BR'), c: '#E0DDD8' },
            { l: 'Tempo medio resposta', v: ai.avgResponseTime || '—', c: '#E85D30' },
            { l: 'Conversas simultaneas', v: String(ai.activeConversations || 0), c: '#E0DDD8' },
            { l: 'Taxa de resolucao', v: `${ai.resolutionRate || 0}%`, c: '#E85D30' },
            { l: 'Vendas autonomas', v: String(ai.autonomousSales || 0), c: '#E85D30' },
            { l: 'Follow-ups enviados', v: String(ai.followupsSent || 0), c: '#E0DDD8' },
            { l: 'Objecoes tratadas', v: String(ai.objectionsHandled || 0), c: '#E0DDD8' },
            { l: 'Satisfacao (CSAT)', v: ai.csat ? `${ai.csat}/5` : '—', c: '#E85D30' },
          ].map((s, i) => (
            <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 7 ? '1px solid #19191C' : 'none' }}>
              <span style={{ fontSize: 11, color: '#6E6E73', fontFamily: SORA }}>{s.l}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: s.c }}>{s.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Time Patterns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* By hour */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 4, fontFamily: SORA }}>Vendas por hora do dia</span>
          <span style={{ fontSize: 10, color: '#3A3A3F', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 12, fontFamily: MONO }}>Padrao de conversao</span>
          <BarChart data={salesByHour} height={50} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {['0h', '6h', '12h', '18h', '23h'].map(l => <span key={l} style={{ fontFamily: MONO, fontSize: 8, color: '#3A3A3F' }}>{l}</span>)}
          </div>
        </div>

        {/* By weekday */}
        <div style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', display: 'block', marginBottom: 4, fontFamily: SORA }}>Vendas por dia da semana</span>
          <span style={{ fontSize: 10, color: '#3A3A3F', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 12, fontFamily: MONO }}>Distribuicao semanal</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {salesByWeekday.map((v, i) => {
              const max = Math.max(...salesByWeekday, 1);
              const isMax = v === max && v > 0;
              return (
                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ height: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div style={{ width: '100%', height: `${(v / max) * 100}%`, background: isMax ? '#E85D30' : '#E85D3040', borderRadius: '2px 2px 0 0', minHeight: 4 }} />
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: isMax ? '#E85D30' : '#3A3A3F', display: 'block', marginTop: 4 }}>{WEEKDAY_LABELS[i]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 4: Financial */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { l: 'Receita total', v: fmtBRL(kpi.totalRevenue || 0), c: '#E85D30', s: 'Total no periodo' },
          { l: 'Disponivel para saque', v: fmtBRL(financial.available || 0), c: '#E0DDD8', s: 'Saldo liberado' },
          { l: 'A receber', v: fmtBRL(financial.pending || 0), c: '#6E6E73', s: 'Aguardando liberacao' },
          { l: 'Reembolsos', v: fmtBRL(financial.refunds || 0), c: '#3A3A3F', s: `${financial.refundCount || 0} transacoes` },
        ].map(f => (
          <div key={f.l} style={{ background: '#111113', border: '1px solid #222226', borderRadius: 6, padding: 18 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#6E6E73', letterSpacing: '.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6, fontFamily: SORA }}>{f.l}</span>
            <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: f.c }}>{f.v}</span>
            <span style={{ fontSize: 11, color: '#3A3A3F', display: 'block', marginTop: 4, fontFamily: SORA }}>{f.s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
