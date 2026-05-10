'use client';
import { colors } from '@/lib/design-tokens';

import { SORA, BG_ELEVATED, BORDER, GREEN } from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';

interface Props {
  search: string;
  catFilter: string | null;
  categories: string[];
  onSearchChange: (value: string) => void;
  onCatFilterChange: (value: string | null) => void;
}

export default function MarketplaceFilters({
  search,
  catFilter,
  categories,
  onSearchChange,
  onCatFilterChange,
}: Props) {
  return (
    <>
      <div style={{ position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--app-text-tertiary)',
            display: 'flex',
          }}
        >
          {IC.search(16)}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar produtos para se afiliar..."
          style={{
            width: '100%',
            padding: '8px 12px 8px 36px',
            background: BG_ELEVATED,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={() => onCatFilterChange(null)}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            border: 'none',
            fontFamily: SORA,
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 600,
            background: catFilter === null ? GREEN : BG_ELEVATED,
            color: catFilter === null ? colors.text.silver : 'var(--app-text-secondary)',
          }}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onCatFilterChange(catFilter === cat ? null : cat)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: 'none',
              fontFamily: SORA,
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
              background: catFilter === cat ? GREEN : BG_ELEVATED,
              color: catFilter === cat ? colors.text.silver : 'var(--app-text-secondary)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>
    </>
  );
}
