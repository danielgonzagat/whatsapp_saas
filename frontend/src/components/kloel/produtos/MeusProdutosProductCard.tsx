'use client';

import { kloelT } from '@/lib/i18n/t';
import { useRouter } from 'next/navigation';
import { IconActionButton } from '@/components/kloel/products/product-nerve-center.shared';
import type { DisplayProduct } from './ProdutosView.types';
import { SORA, MONO, BG_CARD, BG_ELEVATED, BORDER, EMBER, fmtBRL } from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';

export default function MeusProdutosProductCard({
  product,
  isMobile,
  onDelete: _onDelete,
}: {
  product: DisplayProduct;
  isMobile: boolean;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const statusColor = product.status === 'active' ? EMBER : product.status === 'pending' ? 'var(--app-text-secondary)' : 'var(--app-text-placeholder)';
  const statusLabel = product.status === 'active' ? 'Ativo' : product.status === 'pending' ? 'Em analise' : 'Rascunho';
  const planCountLabel = product.activePlansCount > 0
    ? `${product.activePlansCount} ${product.activePlansCount === 1 ? 'plano ativo' : 'planos ativos'}`
    : product.plansCount > 0
      ? `${product.plansCount} ${product.plansCount === 1 ? 'plano' : 'planos'}`
      : 'Sem planos';
  const mediaSize = isMobile ? 64 : 56;

  return (
    <div style={{ position: 'relative', padding: isMobile ? '16px' : '14px 16px', background: BG_CARD, borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'visible' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? `${mediaSize}px minmax(0, 1fr)` : `${mediaSize}px minmax(0, 1fr) auto`, columnGap: isMobile ? 12 : 16, rowGap: isMobile ? 10 : 0, alignItems: 'stretch', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, gridRow: isMobile ? '1 / span 3' : '1 / span 2' }}>
          <div style={{ width: mediaSize, height: mediaSize, borderRadius: 12, background: BG_ELEVATED, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, flexShrink: 0 }}>
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
            ) : (
              <span style={{ color: product.color || EMBER }}>{IC.box(20)}</span>
            )}
          </div>
          <div style={{ position: 'relative', zIndex: 6 }}>
            <IconActionButton label={kloelT(`Editar`)} color={EMBER} onClick={() => router.push(`/products/${product.id}`)}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={kloelT(`M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z`)} />
                <path d={kloelT(`m15 5 4 4`)} />
              </svg>
            </IconActionButton>
          </div>
        </div>

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1, fontFamily: SORA, fontSize: isMobile ? 14 : 13, fontWeight: 600, color: 'var(--app-text-primary)', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {product.name}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{product.category}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)' }}>{planCountLabel}</span>
            </div>

            {isMobile && (
              <div style={{ flexShrink: 0, minWidth: 94, textAlign: 'right' }}>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, color: EMBER }}>{fmtBRL(product.revenue)}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                  <span style={{ fontFamily: MONO, fontSize: 10, color: statusColor }}>{statusLabel}</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: isMobile ? '8px 12px' : '7px 12px', borderRadius: 999, border: product.hasPlanPricing ? '1px solid rgba(232,93,48,0.18)' : `1px solid ${BORDER}`, background: product.hasPlanPricing ? 'linear-gradient(180deg, rgba(232,93,48,0.1), rgba(232,93,48,0.04))' : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)', maxWidth: '100%', flexWrap: 'wrap', alignSelf: 'flex-start' }}>
            <span style={{ fontFamily: SORA, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--app-text-secondary)' }}>{kloelT(`Preço`)}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: product.hasPlanPricing ? EMBER : 'var(--app-text-secondary)', wordBreak: 'break-word' }}>{product.priceLabel}</span>
          </div>
        </div>

        {!isMobile && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <div style={{ textAlign: 'right', minWidth: 104 }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: EMBER }}>{fmtBRL(product.revenue)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 2 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                <span style={{ fontFamily: MONO, fontSize: 10, color: statusColor }}>{statusLabel}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
