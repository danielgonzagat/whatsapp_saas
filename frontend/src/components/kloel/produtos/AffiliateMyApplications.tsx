'use client';
import { kloelT } from '@/lib/i18n/t';
import {
  SORA,
  MONO,
  BG_CARD,
  BG_ELEVATED,
  BORDER,
  GREEN,
  btnGhost,
} from './ProdutosView.shared';
import type React from 'react';
import type { AffiliateLink, AffiliateProductItem } from './ProdutosView.types';

export default function AffiliateMyApplications({
  approvedLinks,
  savedProducts,
  onToggleSave,
}: {
  approvedLinks: AffiliateLink[];
  savedProducts: AffiliateProductItem[];
  onToggleSave: (productId: string, isSaved: boolean) => void;
}) {
  if (approvedLinks.length === 0 && savedProducts.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 16,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            marginBottom: 10,
          }}
        >
          {kloelT('Meus links ativos')}
        </div>
        {approvedLinks.length === 0 ? (
          <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-secondary)' }}>
            {kloelT('Nenhum link ativo.')}
          </div>
        ) : (
          approvedLinks.slice(0, 3).map((link) => (
            <div
              key={link.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 0',
                borderBottom: `1px solid ${BG_ELEVATED}`,
              }}
            >
              <div>
                <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                  {link.affiliateProduct?.name || 'Produto'}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-secondary)' }}>
                  {link.clicks || 0} {kloelT('cliques .')} {link.sales || 0} vendas
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard
                    .writeText(link.url || link.affiliateProduct?.affiliateLink || '')
                    .catch(() => {})
                }
                style={{ ...btnGhost, padding: '6px 10px' }}
              >
                {kloelT('Copiar')}
              </button>
            </div>
          ))
        )}
      </div>
      <div
        style={{
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 16,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            marginBottom: 10,
          }}
        >
          {kloelT('Produtos salvos')}
        </div>
        {savedProducts.length > 0 ? (
          savedProducts.slice(0, 3).map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 0',
                borderBottom: `1px solid ${BG_ELEVATED}`,
              }}
            >
              <div>
                <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-primary)' }}>
                  {item.affiliateProduct?.name || 'Produto salvo'}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-secondary)' }}>
                  {item.status || 'SAVED'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSave(item.affiliateProductId || item.id, true)}
                style={{ ...btnGhost, padding: '6px 10px' }}
              >
                {kloelT('Remover')}
              </button>
            </div>
          ))
        ) : (
          <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-secondary)' }}>
            {kloelT('Salve produtos do marketplace para analisar depois.')}
          </div>
        )}
      </div>
    </div>
  );
}
