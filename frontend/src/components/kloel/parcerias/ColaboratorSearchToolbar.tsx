'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { IC } from './ParceriasView.icons';
import { C, FONT } from './ParceriasDesignTokens';

export default function ColaboratorSearchToolbar({
  search,
  setSearch,
  onInvite,
}: {
  search: string;
  setSearch: (s: string) => void;
  onInvite: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
      <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted }}>{IC.search(14)}</div>
        <input
          aria-label="Buscar colaborador" type="text"
          placeholder={kloelT(`Buscar colaborador...`)} value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', padding: '9px 14px 9px 34px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: FONT.sans, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }}
        />
      </div>
      <button type="button" onClick={onInvite}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: C.ember, border: 'none', borderRadius: 6, color: colors.text.silver, fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        <span style={{ color: colors.text.silver }}>{IC.plus(14)}</span>
        {kloelT(`Convidar`)}
      </button>
    </div>
  );
}
