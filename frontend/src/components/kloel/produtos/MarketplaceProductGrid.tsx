'use client';

import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import {
  NP,
  SORA,
  MONO,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
  GREEN,
  fmtBRL,
  iconBtn,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import type { MarketplaceItem } from './ProdutosView.types';

export default function MarketplaceProductGrid({
  filteredMarket,
  searchQuery = '',
  onSelectItem,
  onToggleSave,
}: {
  filteredMarket: MarketplaceItem[];
  searchQuery?: string;
  onSelectItem: (item: MarketplaceItem) => void;
  onToggleSave: (productId: string, isSaved: boolean) => void;
}) {
  const hasSearchQuery = searchQuery.trim().length > 0;
  const emptyTitle = hasSearchQuery
    ? 'Nenhum produto encontrado para esta busca.'
    : 'Nenhum produto disponivel no marketplace.';
  const emptyDescription = hasSearchQuery
    ? 'Limpe a busca ou tente outro termo.'
    : 'Novos produtos serao exibidos aqui quando estiverem disponiveis.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {filteredMarket.length === 0 && (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
          }}
        >
          <span style={{ color: GREEN, display: 'block', marginBottom: 12 }}>{IC.store(32)}</span>
          <div
            style={{
              fontFamily: SORA,
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              marginBottom: 6,
            }}
          >
            {kloelT(emptyTitle)}
          </div>
          <div style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)' }}>
            {kloelT(emptyDescription)}
          </div>
        </div>
      )}
      {filteredMarket.map((m) => (
        <div
          key={m.id}
          role="button"
          tabIndex={0}
          aria-label={`Abrir ${m.name || 'produto'}`}
          onClick={() => onSelectItem(m)}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 16px 14px 20px',
            background: BG_CARD,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            cursor: 'pointer',
            transition: 'border-color 150ms ease',
            overflow: 'hidden',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (e.currentTarget as HTMLElement).click();
            }
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: GREEN,
            }}
          />
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              background: BG_ELEVATED,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {m.thumbnailUrl || m.imageUrl ? (
              <div
                aria-hidden
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 6,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundImage: `url(${m.thumbnailUrl || m.imageUrl})`,
                }}
              />
            ) : (
              <span style={{ color: GREEN }}>{IC.box(20)}</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                }}
              >
                {m.name}
              </span>
              {(m.temperature || 0) >= 90 && <span>{IC.fire(12)}</span>}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: 'var(--app-text-tertiary)',
                marginTop: 2,
              }}
            >
              {m.category} {kloelT('· por')} {m.producer}
            </div>
          </div>
          <NP w={100} h={24} color={GREEN} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: GREEN }}>
              {m.commission || 0}%
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: 'var(--app-text-secondary)',
                marginTop: 2,
              }}
            >
              {fmtBRL(m.price || 0)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: colors.ember.primary }}>{IC.star(12)}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)' }}>
              {m.rating || 0}
            </span>
          </div>
          <button
            type="button"
            aria-label={`${m.isSaved ? 'Remover dos salvos' : 'Salvar produto'}: ${m.name || 'produto'}`}
            aria-pressed={Boolean(m.isSaved)}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave(m.id, !!m.isSaved);
            }}
            style={{
              ...iconBtn,
              color: m.isSaved ? GREEN : 'var(--app-text-secondary)',
            }}
            title={m.isSaved ? 'Remover dos salvos' : 'Salvar produto'}
          >
            {IC.heart(14)}
          </button>
          <span style={{ color: 'var(--app-text-tertiary)', fontFamily: SORA, fontSize: 16 }}>
            {kloelT('&rsaquo;')}
          </span>
        </div>
      ))}
    </div>
  );
}
