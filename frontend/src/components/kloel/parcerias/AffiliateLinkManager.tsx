'use client';

import { kloelT } from '@/lib/i18n/t';
import { affiliateApi } from '@/lib/api/affiliate';
import type { AffiliateLink, AffiliateLinksTotals } from './partnershipTypes';
import { C, FONT } from './ParceriasDesignTokens';
import useSWR from 'swr';
import AffiliateLinkStatsBar from './AffiliateLinkStatsBar';
import AffiliateLinkList from './AffiliateLinkList';
import AffiliateProductSuggestions from './AffiliateProductSuggestions';
import AffiliateMarketplaceSearch from './AffiliateMarketplaceSearch';

interface AffiliateLinksResponse {
  links: AffiliateLink[];
  count: number;
  totals: AffiliateLinksTotals;
}

export default function AffiliateLinkManager() {
  const { data: linksData, isLoading: linksLoading } = useSWR<AffiliateLinksResponse | undefined>(
    '/affiliate/my-links',
    () => affiliateApi.myLinks().then((r) => r.data),
    { revalidateOnFocus: false },
  );

  const links: AffiliateLink[] = linksData?.links || [];
  const totals: AffiliateLinksTotals = linksData?.totals || { clicks: 0, sales: 0, revenue: 0, commission: 0 };

  return (
    <div style={{ marginTop: 32, borderTop: `1px solid ${C.divider}`, paddingTop: 28 }}>
      <h3 style={{ fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>
        {kloelT(`Meus Links de Afiliado`)}
      </h3>
      <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, margin: '0 0 20px' }}>
        {kloelT(`Produtos de outros produtores que voce esta promovendo`)}
      </p>

      <AffiliateLinkStatsBar totals={totals} />
      <AffiliateLinkList links={links} loading={linksLoading} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <AffiliateProductSuggestions />
        <AffiliateMarketplaceSearch />
      </div>
    </div>
  );
}
