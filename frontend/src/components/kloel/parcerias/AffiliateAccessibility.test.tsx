import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AffiliateFilterToolbar from './AffiliateFilterToolbar';
import AffiliateMarketplaceSearch from './AffiliateMarketplaceSearch';

describe('affiliate search controls', () => {
  it('keeps partner and marketplace search inputs identifiable for browser autofill and auditing', () => {
    render(
      <>
        <AffiliateFilterToolbar
          filterType="todos"
          setFilterType={vi.fn()}
          search=""
          setSearch={vi.fn()}
          onInvite={vi.fn()}
        />
        <AffiliateMarketplaceSearch />
      </>,
    );

    const partnerSearch = screen.getByLabelText('Buscar parceiro');
    const marketplaceSearch = screen.getByLabelText('Buscar no marketplace por categoria ou tag');

    expect(partnerSearch.getAttribute('id')).toBe('affiliate-partner-search');
    expect(partnerSearch.getAttribute('name')).toBe('affiliatePartnerSearch');
    expect(marketplaceSearch.getAttribute('id')).toBe('affiliate-marketplace-search');
    expect(marketplaceSearch.getAttribute('name')).toBe('affiliateMarketplaceSearch');
  });
});
