'use client';
import { colors } from '@/lib/design-tokens';

import { useState, useMemo } from 'react';
import { SORA, MONO, BG_CARD, BORDER, GREEN, fmtBRL, NP } from './ProdutosView.shared';
import type { MarketplaceItem, MarketplaceStats, AffiliateLink, AffiliateProductItem } from './ProdutosView.types';
import MarketplaceFilters from './MarketplaceFilters';
import MarketplaceProductGrid from './MarketplaceProductGrid';

interface Props {
  earnings: number;
  marketplace: MarketplaceItem[];
  marketplaceStats: MarketplaceStats | undefined;
  affiliateLinks: AffiliateLink[];
  affiliateProducts: AffiliateProductItem[];
  onSelectItem: (item: MarketplaceItem) => void;
  onRefresh: () => void;
  requestingId: string | null;
  onToggleSave: (productId: string, isSaved: boolean) => void;
  onRequestAffiliation: (productId: string) => void;
  onCopyLink: (link: string) => void;
  copiedAffiliate: boolean;
}

export default function AfiliarSeMarketplaceGrid({
  earnings,
  marketplace,
  marketplaceStats: _marketplaceStats,
  affiliateLinks,
  affiliateProducts,
  onSelectItem,
  requestingId: _requestingId,
  onToggleSave,
  onCopyLink,
  copiedAffiliate: _copiedAffiliate,
}: Props) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    marketplace.forEach((m) => {
      if (m.category) cats.add(m.category);
    });
    return Array.from(cats).sort();
  }, [marketplace]);

  const filteredMarket = useMemo(
    () =>
      marketplace.filter((m) => {
        const q = search.toLowerCase();
        const nameMatch = (m.name || '').toLowerCase().includes(q);
        const catMatch = (m.category || '').toLowerCase().includes(q);
        const searchPass = !search || nameMatch || catMatch;
        const catPass = !catFilter || m.category === catFilter;
        return searchPass && catPass;
      }),
    [marketplace, search, catFilter],
  );

  const approvedLinks = useMemo(
    () => affiliateLinks.filter((l) => l.active !== false),
    [affiliateLinks],
  );

  const savedProducts = useMemo(
    () =>
      affiliateProducts.filter(
        (item) => item.status === 'SAVED' || item.affiliateProduct?.isSaved,
      ),
    [affiliateProducts],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Earnings Hero */}
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          padding: '36px 24px 28px',
          borderRadius: 12,
          overflow: 'hidden',
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -40,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 240,
            height: 80,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${GREEN}33 0%, transparent 70%)`,
            filter: 'blur(20px)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)' }}>
            Ganhos Totais
          </div>
          <div style={{ fontFamily: MONO, fontSize: 48, fontWeight: 700, color: GREEN, lineHeight: 1.1 }}>
            {fmtBRL(earnings)}
          </div>
          <div style={{ marginTop: 8 }}>
            <NP w={120} h={24} color={GREEN} />
          </div>
          <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-tertiary)', marginTop: 4 }}>
            {earnings > 0 ? `+${fmtBRL(earnings)} acumulado` : 'Sem ganhos ainda'}
          </div>
        </div>
      </div>

      {/* Search + Category Filters */}
      <MarketplaceFilters
        search={search}
        catFilter={catFilter}
        categories={categories}
        onSearchChange={setSearch}
        onCatFilterChange={setCatFilter}
      />

      {/* Marketplace Stat Cards */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div
          style={{
            flex: 1,
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-tertiary)', textTransform: 'uppercase' }}>
            Ganhos
          </div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: 'var(--app-text-primary)', marginTop: 4 }}>
            {fmtBRL(earnings)}
          </div>
          <div style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-tertiary)', marginTop: 2 }}>
            {approvedLinks.length} links ativos
          </div>
        </div>
        <div
          style={{
            flex: 1,
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-tertiary)', textTransform: 'uppercase' }}>
            Marketplace
          </div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: 'var(--app-text-primary)', marginTop: 4 }}>
            {marketplace.length}
          </div>
          <div style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-tertiary)', marginTop: 2 }}>
            produtos
          </div>
        </div>
        <div
          style={{
            flex: 1,
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-tertiary)', textTransform: 'uppercase' }}>
            Solicitacoes
          </div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: 'var(--app-text-primary)', marginTop: 4 }}>
            {affiliateProducts.length}
          </div>
          <div style={{ fontFamily: SORA, fontSize: 11, color: 'var(--app-text-tertiary)', marginTop: 2 }}>
            {savedProducts.length} salvos
          </div>
        </div>
      </div>

      {/* Nerve Fibers */}
      {(approvedLinks.length > 0 || savedProducts.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div
            style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 700, color: 'var(--app-text-primary)' }}>
              Meus links ativos
            </div>
            {approvedLinks.slice(0, 3).map((link) => (
              <div
                key={link.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: 'var(--app-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {link.affiliateProduct?.name || link.id}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                    {link.clicks || 0} clicks · {link.sales || 0} vendas
                  </div>
                </div>
                {link.url && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCopyLink(link.url!); }}
                    style={{
                      padding: '4px 10px',
                      background: GREEN,
                      border: 'none',
                      borderRadius: 4,
                      color: colors.text.silver,
                      fontFamily: SORA,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      flexShrink: 0,
                      marginLeft: 8,
                    }}
                  >
                    Copiar
                  </button>
                )}
              </div>
            ))}
            {approvedLinks.length === 0 && (
              <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-tertiary)' }}>Nenhum link ativo</div>
            )}
          </div>

          <div
            style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div style={{ fontFamily: SORA, fontSize: 13, fontWeight: 700, color: 'var(--app-text-primary)' }}>
              Produtos salvos
            </div>
            {savedProducts.slice(0, 3).map((saved) => (
              <div
                key={saved.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: `1px solid ${BORDER}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SORA, fontSize: 12, fontWeight: 600, color: 'var(--app-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {saved.affiliateProduct?.name || saved.id}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                    {saved.status || 'Salvo'}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleSave(saved.affiliateProductId || saved.id, false); }}
                  style={{
                    padding: '4px 10px',
                    background: 'none',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 4,
                    color: 'var(--app-text-secondary)',
                    fontFamily: SORA,
                    fontSize: 11,
                    cursor: 'pointer',
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  Remover
                </button>
              </div>
            ))}
            {savedProducts.length === 0 && (
              <div style={{ fontFamily: SORA, fontSize: 12, color: 'var(--app-text-tertiary)' }}>Nenhum produto salvo</div>
            )}
          </div>
        </div>
      )}

      {/* Marketplace Grid */}
      <div>
        <div style={{ fontFamily: SORA, fontSize: 15, fontWeight: 700, color: 'var(--app-text-primary)', marginBottom: 12 }}>
          Marketplace ({filteredMarket.length} produtos)
        </div>
        <MarketplaceProductGrid
          items={filteredMarket}
          onSelectItem={onSelectItem}
          onToggleSave={onToggleSave}
        />
      </div>
    </div>
  );
}
