'use client';
import { kloelT } from '@/lib/i18n/t';
import {
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  EMBER,
  iconBtn,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import type React from 'react';

export default function ProductFilters({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0 14px',
      }}
    >
      <div style={{ position: 'relative', flex: 1 }}>
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--app-text-secondary)',
          }}
        >
          {IC.search(14)}
        </span>
        <input
          aria-label={kloelT('Filtrar produtos')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={kloelT('Buscar produto...')}
          style={{
            width: '100%',
            padding: '9px 14px 9px 36px',
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      {search && (
        <button
          type="button"
          onClick={() => onSearchChange('')}
          style={{ ...iconBtn, color: 'var(--app-text-secondary)' }}
          aria-label={kloelT('Limpar filtro')}
        >
          <svg
            aria-hidden="true"
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
      <span
        style={{
          fontFamily: MONO,
          fontSize: 11,
          color: 'var(--app-text-tertiary)',
          whiteSpace: 'nowrap',
        }}
      >
        {kloelT('Filtros')}
      </span>
    </div>
  );
}
