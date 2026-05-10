'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import {
  NP,
  SORA,
  MONO,
  EMBER,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
  fmt,
  fmtBRL,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import ProductActions from './ProductActions';
import type { DisplayProduct } from './ProdutosView.types';

export default function ProductCardGrid({
  displayProducts,
  isMobile,
  onCreateProduct,
}: {
  displayProducts: DisplayProduct[];
  isMobile: boolean;
  onCreateProduct?: (() => void) | undefined | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 0' }}>
      {displayProducts.length === 0 && (
        <div
          style={{
            padding: '40px 20px', textAlign: 'center', background: BG_CARD,
            borderRadius: 6, border: `1px solid ${BORDER}`,
          }}
        >
          <span style={{ color: EMBER, display: 'block', marginBottom: 12 }}>{IC.box(32)}</span>
          <div style={{
            fontFamily: SORA, fontSize: 14, fontWeight: 600,
            color: 'var(--app-text-primary)', marginBottom: 6,
          }}>
            {kloelT('Nenhum produto cadastrado.')}
          </div>
          <div style={{
            fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)', marginBottom: 16,
          }}>
            {onCreateProduct != null
              ? kloelT('Crie seu primeiro produto para comecar a vender.')
              : kloelT('Crie seu primeiro produto para liberar esta configuracao operacional.')}
          </div>
          {onCreateProduct != null && (
            <button
              type="button"
              onClick={onCreateProduct}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 24px', background: EMBER, border: 'none', borderRadius: 6,
                color: colors.text.silver, fontFamily: SORA, fontSize: 13,
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span style={{ color: colors.text.silver }}>{IC.plus(16)}</span>
              {kloelT('Criar produto')}
            </button>
          )}
        </div>
      )}
      {displayProducts.map((p) => {
        const statusColor =
          p.status === 'active' ? EMBER
          : p.status === 'pending' ? 'var(--app-text-secondary)'
          : 'var(--app-text-placeholder)';
        const statusLabel =
          p.status === 'active' ? 'Ativo'
          : p.status === 'pending' ? 'Em analise'
          : 'Rascunho';
        const planCountLabel =
          p.activePlansCount > 0
            ? `${p.activePlansCount} ${p.activePlansCount === 1 ? 'plano ativo' : 'planos ativos'}`
            : p.plansCount > 0
              ? `${p.plansCount} ${p.plansCount === 1 ? 'plano' : 'planos'}`
              : 'Sem planos';
        const mediaSize = isMobile ? 64 : 56;
        const priceBg = p.hasPlanPricing
          ? 'linear-gradient(180deg, rgba(232,93,48,0.1), rgba(232,93,48,0.04))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))';
        const priceBorder = p.hasPlanPricing
          ? '1px solid rgba(232,93,48,0.18)'
          : `1px solid ${BORDER}`;
        const priceColor = p.hasPlanPricing ? EMBER : 'var(--app-text-secondary)';
        return (
          <div
            key={p.id}
            style={{
              position: 'relative', padding: isMobile ? '16px' : '14px 16px',
              background: BG_CARD, borderRadius: 12,
              border: `1px solid ${BORDER}`, overflow: 'visible',
            }}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? `${mediaSize}px minmax(0, 1fr)`
                : `${mediaSize}px minmax(0, 1fr) auto`,
              columnGap: isMobile ? 12 : 16, rowGap: isMobile ? 10 : 0,
              alignItems: 'stretch', width: '100%',
            }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                justifyContent: 'space-between', gap: 10,
                gridRow: isMobile ? '1 / span 3' : '1 / span 2',
              }}>
                <div style={{
                  width: mediaSize, height: mediaSize, borderRadius: 12,
                  background: BG_ELEVATED, border: `1px solid ${BORDER}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 6, flexShrink: 0,
                }}>
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt=""
                      style={{
                        maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                        borderRadius: 8, display: 'block',
                      }}
                    />
                  ) : (
                    <span style={{ color: p.color || EMBER }}>{IC.box(20)}</span>
                  )}
                </div>
                <div style={{ position: 'relative', zIndex: 6 }}>
                  <ProductActions product={p} onCreateProduct={null} isMobile={isMobile} />
                </div>
              </div>
              <div style={{
                minWidth: 0, display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 12,
              }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}
                >
                  <div style={{
                    minWidth: 0, flex: 1, fontFamily: SORA,
                    fontSize: isMobile ? 14 : 13, fontWeight: 600,
                    color: 'var(--app-text-primary)', lineHeight: 1.4,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {p.name}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex', alignItems: 'flex-start',
                    justifyContent: 'space-between', gap: 12,
                  }}
                >
                  <div style={{
                    minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'flex-start', gap: 3,
                  }}>
                    <span style={{
                      fontFamily: MONO, fontSize: 11, color: 'var(--app-text-tertiary)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}>
                      {p.category}
                    </span>
                    <span style={{
                      fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)',
                    }}>
                      {planCountLabel}
                    </span>
                  </div>
                  {isMobile && (
                    <div style={{ flexShrink: 0, minWidth: 94, textAlign: 'right' }}>
                      <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, color: EMBER }}>
                        {fmtBRL(p.revenue)}
                      </div>
                      <div
                        style={{
                          display: 'inline-flex', alignItems: 'center',
                          justifyContent: 'flex-end', gap: 4, marginTop: 2,
                        }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', background: statusColor,
                        }} />
                        <span style={{ fontFamily: MONO, fontSize: 10, color: statusColor }}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    padding: isMobile ? '8px 12px' : '7px 12px', borderRadius: 999,
                    border: priceBorder, background: priceBg,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    maxWidth: '100%', flexWrap: 'wrap', alignSelf: 'flex-start',
                  }}
                >
                  <span style={{
                    fontFamily: SORA, fontSize: 10, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: 'var(--app-text-secondary)',
                  }}>
                    {kloelT('Preco')}
                  </span>
                  <span style={{
                    fontFamily: MONO, fontSize: 13, fontWeight: 600,
                    color: priceColor, wordBreak: 'break-word',
                  }}>
                    {p.priceLabel}
                  </span>
                </div>
              </div>
              {!isMobile && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                  <div style={{ textAlign: 'right', minWidth: 104 }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: EMBER }}>
                      {fmtBRL(p.revenue)}
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      justifyContent: 'flex-end', marginTop: 2,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', background: statusColor,
                      }} />
                      <span style={{ fontFamily: MONO, fontSize: 10, color: statusColor }}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
