'use client';
import { useEffect, useRef, useState } from 'react';

import { kloelT } from '@/lib/i18n/t';
import { affiliateApi } from '@/lib/api/affiliate';
import type {
  MarketplaceItem,
  MarketplaceStats,
  AffiliateLink,
  AffiliateProductItem,
} from './ProdutosView.types';
import {
  NP,
  LiveFeed,
  SORA,
  MONO,
  BG_CARD,
  BORDER,
  GREEN,
  fmtBRL,
  timeAgo,
} from './ProdutosView.shared';
import { IC } from './ProdutosView.icons';
import MarketplaceFilters from './MarketplaceFilters';
import MarketplaceProductGrid from './MarketplaceProductGrid';
import AffiliateMyApplications from './AffiliateMyApplications';
import AffiliateProductDetail from './AffiliateProductDetail';

export default function AfiliarSe({
  marketplace,
  earnings,
  marketplaceStats,
  affiliateLinks,
  affiliateProducts,
  affiliateLoading = false,
  affiliateLoadError = null,
  onRefresh,
}: {
  marketplace: MarketplaceItem[];
  earnings: number;
  marketplaceStats?: MarketplaceStats;
  affiliateLinks: AffiliateLink[];
  affiliateProducts: AffiliateProductItem[];
  affiliateLoading?: boolean;
  affiliateLoadError?: string | null;
  onRefresh: () => void | Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [selectedMarketItem, setSelectedMarketItem] = useState<MarketplaceItem | null>(null);
  const [copiedAffiliate, setCopiedAffiliate] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [_savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    setSelectedMarketItem((current) => {
      if (!current) {
        return current;
      }

      const refreshed = marketplace.find((item) => item.id === current.id);
      return refreshed && refreshed !== current ? refreshed : current;
    });
  }, [marketplace]);

  const categories: string[] = [
    ...new Set(
      marketplace
        .map((m) => m.category)
        .filter((cat): cat is string => typeof cat === 'string' && cat.length > 0),
    ),
  ];
  const filteredMarket = marketplace.filter((m) => {
    const matchSearch =
      !search ||
      (m.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.category || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || m.category === catFilter;
    return matchSearch && matchCat;
  });
  const approvedLinks = affiliateLinks.filter((link) => link.active !== false);
  const savedProducts = affiliateProducts.filter(
    (item) => item.status === 'SAVED' || item.affiliateProduct?.isSaved,
  );
  const requestedProducts = affiliateProducts.filter(
    (item) => !(item.status === 'SAVED' || item.affiliateProduct?.isSaved),
  );
  const activeLinksLabel = `${approvedLinks.length} ${approvedLinks.length === 1 ? 'link ativo' : 'links ativos'}`;
  const savedProductsLabel = `${savedProducts.length} ${savedProducts.length === 1 ? 'salvo' : 'salvos'}`;

  const handleRequestAffiliation = async (productId: string) => {
    setRequestingId(productId);
    setActionError(null);
    try {
      await affiliateApi.requestAffiliation(productId);
      await onRefresh();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Nao foi possivel solicitar afiliacao.');
    } finally {
      setRequestingId(null);
    }
  };

  const handleToggleSave = async (productId: string, isSaved: boolean) => {
    setSavingId(productId);
    setActionError(null);
    try {
      await (isSaved ? affiliateApi.unsaveProduct(productId) : affiliateApi.saveProduct(productId));
      await onRefresh();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Nao foi possivel atualizar produto salvo.');
    } finally {
      setSavingId(null);
    }
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedAffiliate(true);
      if (copiedTimer.current) {clearTimeout(copiedTimer.current);}
      copiedTimer.current = setTimeout(() => setCopiedAffiliate(false), 2000);
    });
  };

  if (selectedMarketItem) {
    return (
      <AffiliateProductDetail
        item={selectedMarketItem}
        onBack={() => {
          setActionError(null);
          setSelectedMarketItem(null);
        }}
        requestingId={requestingId}
        copiedAffiliate={copiedAffiliate}
        actionError={actionError}
        onRequestAffiliation={handleRequestAffiliation}
        onCopyLink={handleCopyLink}
      />
    );
  }

  return (
    <div style={{ opacity: 1 }}>
      <div style={{ position: 'relative', padding: '32px 0', marginBottom: 24 }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 200, height: 80, borderRadius: '16%', background: 'rgba(232, 93, 48, 0.08)', animation: 'glow 3s ease-in-out', pointerEvents: 'none' }} />
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--app-text-tertiary)', letterSpacing: '0.25em', textTransform: 'uppercase' as const, marginBottom: 4 }}>{kloelT('Ganhos Totais')}</div>
          <div style={{ fontFamily: MONO, fontSize: 80, fontWeight: 700, color: GREEN, letterSpacing: '-0.02em' }}>{fmtBRL(earnings)}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
            <NP w={40} h={14} color={GREEN} />
            <span style={{ fontFamily: MONO, fontSize: 12, color: GREEN }}>{earnings > 0 ? `+${fmtBRL(earnings)} acumulado` : 'Sem ganhos ainda'}</span>
          </div>
        </div>
      </div>

      <MarketplaceFilters
        search={search}
        setSearch={setSearch}
        categories={categories}
        catFilter={catFilter}
        setCatFilter={setCatFilter}
      />

      {affiliateLoadError && (
        <div
          role="alert"
          style={{
            background: 'rgba(255, 80, 80, 0.08)',
            border: '1px solid rgba(255, 80, 80, 0.24)',
            borderRadius: 6,
            padding: 12,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontFamily: SORA, fontSize: 11, fontWeight: 700, color: 'var(--app-text-primary)', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
              {kloelT('Dados de afiliacao indisponiveis')}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--app-text-secondary)', marginTop: 4 }}>
              {affiliateLoadError}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={affiliateLoading}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 4,
              background: 'var(--app-bg-secondary)',
              color: 'var(--app-text-primary)',
              fontFamily: MONO,
              fontSize: 11,
              padding: '8px 10px',
              cursor: affiliateLoading ? 'wait' : 'pointer',
              opacity: affiliateLoading ? 0.72 : 1,
            }}
          >
            {affiliateLoading ? kloelT('Atualizando...') : kloelT('Atualizar')}
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          style={{
            background: 'rgba(255, 80, 80, 0.08)',
            border: '1px solid rgba(255, 80, 80, 0.24)',
            borderRadius: 6,
            padding: 12,
            marginBottom: 20,
            fontFamily: MONO,
            fontSize: 11,
            color: 'var(--app-text-primary)',
          }}
        >
          {actionError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { icon: IC.box, label: 'Ganhos', value: fmtBRL(earnings), sub: approvedLinks.length > 0 ? activeLinksLabel : 'sem ganhos' },
          { icon: IC.trend, label: 'Marketplace', value: String(marketplaceStats?.totalProducts || marketplace.length), sub: 'produtos disponiveis' },
          { icon: IC.heart, label: 'Solicitacoes', value: String(requestedProducts.length), sub: savedProductsLabel },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1, background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ color: GREEN }}>{s.icon(18)}</span>
              <span style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: 'var(--app-text-tertiary)', letterSpacing: '0.25em', textTransform: 'uppercase' as const }}>{s.label}</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, color: 'var(--app-text-primary)' }}>{s.value}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: GREEN, marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <AffiliateMyApplications
        approvedLinks={approvedLinks}
        savedProducts={savedProducts}
        onToggleSave={handleToggleSave}
      />

      <div style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: 'var(--app-text-tertiary)', marginBottom: 10, letterSpacing: '0.25em', textTransform: 'uppercase' as const }}>
        {kloelT('Marketplace (')}{filteredMarket.length} {kloelT('produtos)')}
      </div>

      <MarketplaceProductGrid
        filteredMarket={filteredMarket}
        searchQuery={search.trim()}
        onSelectItem={setSelectedMarketItem}
        onToggleSave={handleToggleSave}
      />

      <div style={{ marginTop: 20 }}>
        <div style={{ fontFamily: SORA, fontSize: 10, fontWeight: 600, color: 'var(--app-text-tertiary)', marginBottom: 10, letterSpacing: '0.25em', textTransform: 'uppercase' as const }}>{kloelT('Vendas Recentes')}</div>
        <LiveFeed
          color={GREEN}
          events={
            approvedLinks.length > 0
              ? approvedLinks.slice(0, 4).map((link) => ({
                  text: `${link.affiliateProduct?.name || 'Produto'} com ${link.clicks || 0} cliques e ${link.sales || 0} vendas.`,
                  time: timeAgo(link.createdAt),
                }))
              : [{ text: 'Aguardando atividade de afiliados...', time: '' }]
          }
        />
      </div>
    </div>
  );
}
