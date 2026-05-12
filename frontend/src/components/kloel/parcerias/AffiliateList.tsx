'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { IC } from './ParceriasView.icons';
import { C, FONT, TempBar } from './ParceriasDesignTokens';
import type { Affiliate } from './partnershipTypes';

const HEADERS = [
  '', kloelT(`Parceiro`), kloelT(`Tipo`), kloelT(`Vendas`),
  kloelT(`Receita`), kloelT(`Comissao`), kloelT(`Taxa`), kloelT(`Temperatura`),
] as const;

const COL_SIZES = Object.freeze([46, null, 90, 70, 110, 90, 60, 100] as const);

function headerStyle(align?: string): React.CSSProperties {
  return {
    fontFamily: FONT.sans, fontSize: 11, color: C.muted, fontWeight: 500,
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
    textAlign: (align || 'left') as React.CSSProperties['textAlign'],
  };
}

export default function AffiliateList({
  filtered,
  hasData,
  onSelect,
}: {
  filtered: Affiliate[];
  hasData: boolean;
  onSelect: (id: string) => void;
}) {
  const gridCols = COL_SIZES.map((c, i) => {
    if (i === 0) {return '46px';}
    if (c === null) {return '1fr';}
    return `${c}px`;
  }).join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 10, padding: '10px 18px', marginBottom: 4 }}>
        {HEADERS.map((h, i) => {
          if (i === 0) {return <span key={i} />;}
          const align = i >= 3 && i <= 6 ? 'right' : 'left';
          return <span key={i} style={headerStyle(align)}>{h}</span>;
        })}
      </div>

      {filtered.map((a) => {
        const tempColor = (a.temperature || 0) > 70 ? colors.semantic.success : (a.temperature || 0) > 40 ? colors.semantic.warning : C.muted;
        return (
          <button
            type="button" key={a.id || a.email}
            onClick={() => onSelect(a.id || '')}
            aria-label={`Abrir detalhes de ${a.name || a.email || 'afiliado'}`}
            style={{
              display: 'grid', gridTemplateColumns: gridCols, gap: 10, alignItems: 'center',
              padding: '14px 18px', background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 6, cursor: 'pointer', transition: 'border-color 150ms ease',
              textAlign: 'left', borderWidth: 1,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `${C.ember}40`; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
          >
            <div style={{ width: 42, height: 42, borderRadius: '16%', background: a.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.emberBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.sans, fontSize: 16, fontWeight: 600, color: a.type === 'producer' ? colors.semantic.purple : C.ember, flexShrink: 0 }}>
              {(a.name || '?')[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{a.name}</div>
              <div style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{a.email}</div>
            </div>
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: FONT.sans, width: 'fit-content', color: a.type === 'producer' ? colors.semantic.purple : C.ember, background: a.type === 'producer' ? 'rgba(139,92,246,0.15)' : C.emberStrong, letterSpacing: '0.02em', textTransform: 'uppercase' as const }}>
              {a.type === 'producer' ? 'Produtor' : 'Afiliado'}
            </span>
            <div style={{ textAlign: 'right' as const }}><span style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: 600, color: C.text }}>{a.totalSales || 0}</span></div>
            <div style={{ textAlign: 'right' as const }}><span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 600, color: C.text }}>{kloelT(`R$`)} {(a.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span></div>
            <div style={{ textAlign: 'right' as const }}><span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.ember, fontWeight: 600 }}>{kloelT(`R$`)} {(((a.revenue || 0) * (a.commission || 0)) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span></div>
            <div style={{ textAlign: 'right' as const }}><span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 600, color: C.text }}>{a.commission || 0}%</span></div>
            <div style={{ width: 100 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 600, color: tempColor }}>{a.temperature || 0}%</span>
              </div>
              <TempBar value={a.temperature || 0} max={100} color={tempColor} />
            </div>
          </button>
        );
      })}

      {filtered.length === 0 && !hasData && (
        <div style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border-primary)', borderRadius: 6, padding: '60px 20px', textAlign: 'center' as const }}>
          <span style={{ fontSize: 14, color: 'var(--app-text-tertiary)', display: 'block', marginBottom: 8 }}>{kloelT(`Nenhum afiliado cadastrado`)}</span>
          <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>{kloelT(`Convide afiliados para promover seus produtos`)}</span>
        </div>
      )}
      {filtered.length === 0 && hasData && (
        <div style={{ textAlign: 'center' as const, padding: 48, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6 }}>
          <span style={{ color: C.muted }}>{IC.users(32)}</span>
          <p style={{ fontFamily: FONT.sans, fontSize: 14, color: C.secondary, marginTop: 12 }}>{kloelT(`Nenhum parceiro encontrado`)}</p>
        </div>
      )}
    </div>
  );
}
