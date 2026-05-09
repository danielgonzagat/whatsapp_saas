'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

const FILTER_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'affiliate', label: 'Afiliados' },
  { value: 'producer', label: 'Produtores' },
];

export default function AffiliateFilterToolbar({
  filterType,
  setFilterType,
  search,
  setSearch,
  onInvite,
}: {
  filterType: string;
  setFilterType: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
  onInvite: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' as const }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {FILTER_OPTIONS.map((opt) => (
          <button type="button" key={opt.value} onClick={() => setFilterType(opt.value)}
            style={{
              padding: '7px 14px', background: filterType === opt.value ? C.ember : C.card,
              border: `1px solid ${filterType === opt.value ? C.ember : C.border}`, borderRadius: 6,
              color: filterType === opt.value ? colors.text.silver : C.secondary, fontFamily: FONT.sans, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', transition: 'all 150ms ease',
            }}>
            {opt.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
        <div style={{ position: 'relative', width: 280 }}>
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted }}>{IC.search(14)}</div>
          <input
            aria-label="Buscar parceiro" type="text" placeholder={kloelT(`Buscar parceiro...`)} value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 14px 9px 34px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT.sans, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
          />
        </div>
        <button type="button" onClick={onInvite}
          style={{ padding: '9px 14px', background: C.ember, border: 'none', borderRadius: 6, color: C.textOnAccent, fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
          {kloelT(`Convidar afiliado`)}
        </button>
      </div>
    </div>
  );
}
