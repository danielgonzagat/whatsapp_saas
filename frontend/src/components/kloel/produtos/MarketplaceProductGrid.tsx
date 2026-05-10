'use client';
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
  onSelectItem,
  onToggleSave,
}: {
  filteredMarket: MarketplaceItem[];
  onSelectItem: (item: MarketplaceItem) => void;
  onToggleSave: (productId: string, isSaved: boolean) => void;
}) {
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
            {kloelT('Nenhum produto disponivel no marketplace.')}
          </div>
          <div style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)' }}>
            {kloelT('Novos produtos serao exibidos aqui quando estiverem disponiveis.')}
          </div>
        </div>
      )}
      {filteredMarket.map((m) => (
        <div
          key={m.id}
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
              <img
                src={m.thumbnailUrl || m.imageUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
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
              {m.category} {kloelT('&middot; por')} {m.producer}
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
            <span style={{ color: 'colors.ember.primary' }}>{IC.star(12)}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)' }}>
              {m.rating || 0}
            </span>
          </div>
          <button
            type="button"
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
