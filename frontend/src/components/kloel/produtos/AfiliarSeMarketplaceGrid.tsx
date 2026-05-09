'use client';

import { useState, useMemo } from 'react';
import { SORA, MONO, BG_CARD, BG_ELEVATED, BORDER, GREEN, EMBER, fmtBRL, NP } from './ProdutosView.shared';

import { IC } from './ProdutosView.icons';
import type { MarketplaceItem, MarketplaceStats, AffiliateLink, AffiliateProductItem } from './ProdutosView.types';

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


function HeartIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? EMBER : 'none'}
      stroke={filled ? EMBER : 'var(--app-text-tertiary)'}
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}

export default function AfiliarSeMarketplaceGrid({
  earnings,
  marketplace,
  marketplaceStats,
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

  const approvedLinks = useMemo(() => affiliateLinks.filter((l) => l.active !== false), [affiliateLinks]);

  const savedProducts = useMemo(
    () =>
      affiliateProducts.filter(
        (item) =>
          item.status === 'SAVED' || item.affiliateProduct?.isSaved,
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
          <div style={{ fontFamily: SORA, fontSize: 13, color: 'var(--app-text-secondary)' }}>Ganhos Totais</div>
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

      {/* Search */}
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
          onChange={(e) => setSearch(e.target.value)}
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

      {/* Category Chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={() => setCatFilter(null)}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            border: 'none',
            fontFamily: SORA,
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 600,
            background: catFilter === null ? GREEN : BG_ELEVATED,
            color: catFilter === null ? '#fff' : 'var(--app-text-secondary)',
          }}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCatFilter(catFilter === cat ? null : cat)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: 'none',
              fontFamily: SORA,
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 600,
              background: catFilter === cat ? GREEN : BG_ELEVATED,
              color: catFilter === cat ? '#fff' : 'var(--app-text-secondary)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

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
                      color: '#fff',
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
        {filteredMarket.length === 0 ? (
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
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredMarket.map((item) => (
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
                  <HeartIcon filled={!!item.isSaved} size={16} />
                </button>
                <div style={{ color: 'var(--app-text-tertiary)', fontSize: 18, flexShrink: 0, paddingRight: 4 }}>
                  {IC.chevRight(14)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
