'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { affiliateApi } from '@/lib/api/affiliate';
import AfiliarSeProductDetail from './AfiliarSeProductDetail';
import AfiliarSeMarketplaceGrid from './AfiliarSeMarketplaceGrid';
import type { MarketplaceItem, MarketplaceStats, AffiliateLink, AffiliateProductItem } from './ProdutosView.types';

interface Props {
  marketplace: MarketplaceItem[];
  earnings: number;
  marketplaceStats: MarketplaceStats | undefined;
  affiliateLinks: AffiliateLink[];
  affiliateProducts: AffiliateProductItem[];
  onRefresh: () => void;
}

export default function AfiliarSe({
  marketplace,
  earnings,
  marketplaceStats,
  affiliateLinks,
  affiliateProducts,
  onRefresh,
}: Props) {
  const [selectedMarketItem, setSelectedMarketItem] = useState<MarketplaceItem | null>(null);
  const [copiedAffiliate, setCopiedAffiliate] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const handleRequestAffiliation = useCallback(
    async (productId: string) => {
      setRequestingId(productId);
      try {
        await affiliateApi.requestAffiliation(productId);
        onRefresh();
      } finally {
        setRequestingId(null);
      }
    },
    [onRefresh],
  );

  const handleToggleSave = useCallback(
    async (productId: string, isSaved: boolean) => {
      if (isSaved) {
        await affiliateApi.saveProduct(productId);
      } else {
        await affiliateApi.unsaveProduct(productId);
      }
      onRefresh();
    },
    [onRefresh],
  );

  const handleCopyLink = useCallback((link: string) => {
    navigator.clipboard.writeText(link).then(
      () => {
        setCopiedAffiliate(true);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopiedAffiliate(false), 2000);
      },
      () => {},
    );
  }, []);

  if (selectedMarketItem) {
    return (
      <AfiliarSeProductDetail
        item={selectedMarketItem}
        onBack={() => setSelectedMarketItem(null)}
        onRefresh={onRefresh}
        requestingId={requestingId}
        copiedAffiliate={copiedAffiliate}
        onCopyLink={handleCopyLink}
        onRequestAffiliation={handleRequestAffiliation}
      />
    );
  }

  return (
    <AfiliarSeMarketplaceGrid
      earnings={earnings}
      marketplace={marketplace}
      marketplaceStats={marketplaceStats}
      affiliateLinks={affiliateLinks}
      affiliateProducts={affiliateProducts}
      onSelectItem={setSelectedMarketItem}
      onRefresh={onRefresh}
      requestingId={requestingId}
      onToggleSave={handleToggleSave}
      onRequestAffiliation={handleRequestAffiliation}
      onCopyLink={handleCopyLink}
      copiedAffiliate={copiedAffiliate}
    />
  );
}
