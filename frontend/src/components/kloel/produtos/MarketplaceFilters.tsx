'use client';
import { kloelT } from '@/lib/i18n/t';
import {
  SORA,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
  GREEN,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';

export default function MarketplaceFilters({
  search,
  setSearch,
  categories,
  catFilter,
  setCatFilter,
}: {
  search: string;
  setSearch: (v: string) => void;
  categories: string[];
  catFilter: string | null;
  setCatFilter: (v: string | null) => void;
}) {
  return (
    <>
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--app-text-secondary)',
          }}
        >
          {IC.search(16)}
        </span>
        <input
          aria-label={kloelT('Buscar produtos para se afiliar')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={kloelT('Buscar produtos para se afiliar...')}
          style={{
            width: '100%',
            padding: '10px 14px 10px 36px',
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box' as const,
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setCatFilter(null)}
          style={{
            padding: '6px 14px',
            borderRadius: 99,
            border: 'none',
            cursor: 'pointer',
            fontFamily: SORA,
            fontSize: 11,
            fontWeight: 600,
            background: !catFilter ? GREEN : BG_ELEVATED,
            color: !catFilter ? 'var(--app-text-on-accent)' : 'var(--app-text-secondary)',
          }}
        >
          {kloelT('Todos')}
        </button>
        {categories.map((cat) => (
          <button
            type="button"
            key={cat}
            onClick={() => setCatFilter(catFilter === cat ? null : cat)}
            style={{
              padding: '6px 14px',
              borderRadius: 99,
              border: 'none',
              cursor: 'pointer',
              fontFamily: SORA,
              fontSize: 11,
              fontWeight: 600,
              background: catFilter === cat ? GREEN : BG_ELEVATED,
              color: catFilter === cat ? 'var(--app-text-on-accent)' : 'var(--app-text-secondary)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>
    </>
  );
}
