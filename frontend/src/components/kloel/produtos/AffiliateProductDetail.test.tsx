import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AffiliateProductDetail from './AffiliateProductDetail';
import type { MarketplaceItem } from './ProdutosView.types';

const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

const baseItem: MarketplaceItem = {
  id: 'product-affiliate-1',
  name: 'Produto Afiliado',
  description: 'Produto para afiliados.',
  category: 'E-books',
  producer: 'Produtor QA',
  price: 3990,
  commission: 31,
  sales: 0,
  rating: 0,
  temperature: 50,
  materials: [],
};

function renderDetail(item: Partial<MarketplaceItem>, actionError: string | null = null) {
  return render(
    <AffiliateProductDetail
      item={{ ...baseItem, ...item }}
      onBack={vi.fn()}
      requestingId={null}
      copiedAffiliate={false}
      actionError={actionError}
      onRequestAffiliation={vi.fn()}
      onCopyLink={vi.fn()}
    />,
  );
}

describe('AffiliateProductDetail', () => {
  it('shows rich affiliate materials as readable safe text instead of raw HTML', () => {
    renderDetail({
      materials: [
        '<a href="https://example.com/merchan-qa" target="_blank"><b>Material QA Codex para afiliados</b></a>',
        'TERMOS <i>Termos QA Codex para divulgacao</i>',
      ],
    });

    expect(screen.queryByText(/<a href=/i)).toBeNull();
    expect(screen.queryByText(/<b>/i)).toBeNull();
    expect(screen.queryByText(/<i>/i)).toBeNull();
    expect(screen.getByText('Material QA Codex para afiliados')).toBeTruthy();
    expect(screen.getByText('TERMOS Termos QA Codex para divulgacao')).toBeTruthy();
  });

  it('shows affiliation action errors as an in-product alert', () => {
    renderDetail({}, 'Complete seu cadastro para usar esta funcionalidade');

    expect(screen.getByRole('alert').textContent).toContain(
      'Complete seu cadastro para usar esta funcionalidade',
    );
  });
});
