'use client';

import { SORA, MONO, BG_CARD, BG_ELEVATED, BORDER, GREEN, fmtBRL, NP } from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import type { MarketplaceItem } from './ProdutosView.types';

function HeartIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? GREEN : 'none'}
      stroke={filled ? GREEN : 'var(--app-text-tertiary)'}
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}

interface Props {
  items: MarketplaceItem[];
  onSelectItem: (item: MarketplaceItem) => void;
  onToggleSave: (productId: string, isSaved: boolean) => void;
}

export default function MarketplaceProductGrid({
  items,
  onSelectItem,
  onToggleSave,
}: Props) {
  if (items.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 16px',
          background: BG_CARD,
          borderRadius: 12,
          border: `1px solid ${BORDER}`,
          gap: 10,
          color: 'var(--app-text-tertiary)',
        }}
      >
        {IC.store(32)}
        <div style={{ fontFamily: SORA, fontSize: 14, fontWeight: 600 }}>Nenhum produto disponivel</div>
        <div style={{ fontFamily: SORA, fontSize: 12 }}>
          Nenhum produto encontrado com os filtros atuais.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => onSelectItem(item)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 12px 12px 0',
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderLeft: `3px solid ${GREEN}`,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              overflow: 'hidden',
              flexShrink: 0,
              background: BG_ELEVATED,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 12,
            }}
          >
            {item.thumbnailUrl || item.imageUrl ? (
              <img
                src={item.thumbnailUrl || item.imageUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              IC.box(20)
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.name}
              </span>
              {(item.temperature || 0) >= 90 && IC.fire(14)}
            </div>
            <div style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-tertiary)', marginTop: 2 }}>
              {item.category}{item.producer ? ` · ${item.producer}` : ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <NP w={60} h={14} color={GREEN} />
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: GREEN }}>
                {item.commission || 0}%
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)' }}>
                {fmtBRL(item.price || 0)}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {IC.star(12)}
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)' }}>
              {item.rating || 0}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave(item.id, !item.isSaved);
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}
            aria-label={item.isSaved ? 'Remover dos salvos' : 'Salvar produto'}
          >
            <HeartIcon filled={Boolean(item.isSaved)} size={16} />
          </button>
          <div style={{ color: 'var(--app-text-tertiary)', fontSize: 18, flexShrink: 0, paddingRight: 4 }}>
            {IC.chevRight(14)}
          </div>
        </div>
      ))}
    </div>
  );
}
