import { colors } from '@/lib/design-tokens';
import type { ReactNode } from 'react';
import { V, FONT_MONO, FONT_SORA, chartCardStyle, labelStyle } from '../analytics.design-tokens';
import { NeuroPulse } from './NeuroPulse';
export { NeuroPulse };
import type { IconFn } from '../analytics.types';

export function MetricCard({
  title,
  value,
  sub,
  color = V.em,
  icon,
  trend,
  loading,
}: {
  title: string;
  value: string;
  sub?: string;
  color?: string;
  icon: IconFn;
  trend?: number;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div style={{ ...chartCardStyle, padding: '20px 22px', flex: 1, minWidth: 180 }}>
        <NeuroPulse w={160} h={28} color={color} />
      </div>
    );
  }
  return (
    <div style={{ ...chartCardStyle, padding: '20px 22px', flex: 1, minWidth: 180, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: 12, top: 12, color, opacity: 0.08 }}>{icon(40)}</div>
      <span style={{ ...labelStyle, marginBottom: 10 }}>{title}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 28, fontWeight: 700, color, display: 'block', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: V.t2, marginTop: 8, display: 'block' }}>{sub}</span>}
      {trend !== undefined && <MetricCardTrend trend={trend} />}
      <div style={{ marginTop: 10 }}><NeuroPulse color={color} w={140} h={16} /></div>
    </div>
  );
}

function MetricCardTrend({ trend }: { trend: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: trend >= 0 ? V.g2 : V.r }}>
        {trend >= 0
          ? <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          : <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />}
        {trend >= 0
          ? <polyline points="17 6 23 6 23 12" />
          : <polyline points="17 18 23 18 23 12" />}
      </svg>
      <span style={{ fontSize: 10, color: trend >= 0 ? V.g2 : V.r, fontFamily: FONT_MONO, fontWeight: 600 }}>
        {Math.abs(trend)}%
      </span>
    </div>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <div style={{ width: 8, height: 8, borderRadius: 8, background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}40` }} />;
}

export function Button({
  primary,
  accent,
  children,
  onClick,
  style: sx,
}: {
  primary?: boolean;
  accent?: string;
  children: ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
        background: primary ? V.em : accent || 'transparent',
        border: primary || accent ? 'none' : `1px solid ${V.b}`, borderRadius: 6,
        color: primary ? V.void : accent ? colors.text.silver : V.t2,
        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_SORA, ...sx,
      }}
    >
      {children}
    </button>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div style={{ ...chartCardStyle, padding: 40, textAlign: 'center' }}><span style={{ color: V.t3, fontSize: 13 }}>{message}</span></div>;
}

export function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) {return null;}
  return (
    <div style={{ background: V.s, border: `1px solid ${V.b}`, borderRadius: 8, padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,.6)' }}>
      <span style={{ fontSize: 10, color: V.t3, display: 'block', marginBottom: 4, fontFamily: FONT_MONO }}>{label}</span>
      {payload.map((p) => (
        <div key={p.name} style={{ fontSize: 12, fontFamily: FONT_MONO, fontWeight: 600, color: p.color || V.em }}>
          {p.name}: {typeof p.value === 'number' && p.value > 999 ? `R$ ${(p.value / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : typeof p.value === 'number' && p.value < 100 ? `${p.value.toFixed(2)}%` : p.value.toLocaleString('pt-BR')}
        </div>
      ))}
    </div>
  );
}

export function Pagination({ total, perPage = 10, page, setPage }: { total: number; perPage?: number; page: number; setPage: (p: number) => void }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) {return null;}
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderTop: `1px solid ${V.b}` }}>
      <span style={{ fontSize: 10, color: V.t3, fontFamily: FONT_MONO }}>{(page - 1) * perPage + 1} ate {Math.min(page * perPage, total)} de {total}</span>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => (
          <button key={p} type="button" onClick={() => setPage(p)} style={{
            width: 28, height: 28, borderRadius: 4, border: `1px solid ${p === page ? V.em : V.b}`,
            background: p === page ? V.em : 'transparent', color: p === page ? V.void : V.t2,
            fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_MONO,
          }}>{p}</button>
        ))}
      </div>
    </div>
  );
}

export function TableHeader({ cols }: { cols: { l: string; w: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols.map((c) => c.w).join(' '), padding: '10px 14px', background: V.e, borderBottom: `1px solid ${V.b}` }}>
      {cols.map((h) => (
        <span key={h.l || 'empty'} style={{ fontSize: 8, fontWeight: 600, color: V.t3, letterSpacing: '.08em', textTransform: 'uppercase' as const }}>{h.l}</span>
      ))}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div style={{ ...chartCardStyle, padding: 16, marginBottom: 20 }}><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>{children}</div></div>;
}

export function FilterField({ label, children, flex = 1 }: { label: string; children: ReactNode; flex?: number }) {
  return <div style={{ flex, minWidth: 160 }}><span style={labelStyle}>{label}</span>{children}</div>;
}
