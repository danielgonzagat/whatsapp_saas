import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProductFilters from './ProductFilters';
import ProductsListing from './ProductsListing';
import AfiliarSe from './ProdutosAfiliarSeTab';
import MarketplaceProductGrid from './MarketplaceProductGrid';
import { normalizeDisplayProduct } from './ProdutosView.helpers';
import type { DisplayProduct } from './ProdutosView.types';

const pushMock = vi.hoisted(() => vi.fn());
const requestAffiliationMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

vi.mock('@/lib/api/affiliate', () => ({
  affiliateApi: {
    requestAffiliation: requestAffiliationMock,
    saveProduct: vi.fn(),
    unsaveProduct: vi.fn(),
  },
}));

beforeEach(() => {
  pushMock.mockReset();
  requestAffiliationMock.mockReset();
});

const catalogProduct: DisplayProduct = {
  id: 'product-1',
  name: 'Mentoria Kloel',
  price: 0,
  sales: 0,
  revenue: 0,
  students: 0,
  category: 'Mentorias',
  status: 'pending',
  color: '#E85D30',
  format: 'digital',
  active: false,
  imageUrl: '',
  plansCount: 0,
  activePlansCount: 0,
  minPlanPriceInCents: null,
  maxPlanPriceInCents: null,
  hasPlanPricing: false,
  priceLabel: 'R$ 0,00',
  memberAreasCount: 0,
  affiliateCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProductFilters', () => {
  it('keeps the product search input identifiable for browser auditing', () => {
    render(<ProductFilters search="" onSearchChange={vi.fn()} />);

    const input = screen.getByLabelText('Filtrar produtos');

    expect(input.getAttribute('id')).toBe('product-filter-search');
    expect(input.getAttribute('name')).toBe('productFilterSearch');
  });

  it('emits search changes and clears the current filter', () => {
    const onSearchChange = vi.fn();

    render(<ProductFilters search="curso" onSearchChange={onSearchChange} />);

    fireEvent.change(screen.getByLabelText('Filtrar produtos'), { target: { value: 'mentoria' } });
    fireEvent.click(screen.getByLabelText('Limpar filtro'));

    expect(onSearchChange).toHaveBeenCalledWith('mentoria');
    expect(onSearchChange).toHaveBeenCalledWith('');
  });
});

describe('ProductsListing search empty state', () => {
  it('explains an empty search result without claiming the catalog is empty', () => {
    render(
      <ProductsListing
        activeProducts={0}
        displayProducts={[catalogProduct]}
        totalRevenue={0}
        totalSales={0}
      />,
    );

    fireEvent.change(screen.getByLabelText('Filtrar produtos'), {
      target: { value: 'produto inexistente' },
    });

    expect(screen.getByText('Nenhum produto encontrado para esta busca.')).toBeTruthy();
    expect(screen.getByText('Limpe o filtro ou tente outro termo.')).toBeTruthy();
    expect(screen.queryByText('Nenhum produto cadastrado.')).toBeNull();
  });

  it('does not claim inactive pending products are ready for traffic', () => {
    render(
      <ProductsListing
        activeProducts={0}
        displayProducts={[{ ...catalogProduct, activePlansCount: 1, hasPlanPricing: true }]}
        totalRevenue={0}
        totalSales={0}
      />,
    );

    expect(screen.queryByText(/esta pronto para receber trafego e checkout/i)).toBeNull();
    expect(
      screen.getByText('Mentoria Kloel tem checkout configurado, mas ainda precisa ser ativado.'),
    ).toBeTruthy();
  });

  it('does not claim the AI engine is operating when no product is active', () => {
    render(
      <ProductsListing
        activeProducts={0}
        displayProducts={[{ ...catalogProduct, activePlansCount: 1, hasPlanPricing: true }]}
        totalRevenue={0}
        totalSales={0}
      />,
    );

    expect(screen.queryByText(/IA operando na jornada de compra/i)).toBeNull();
    expect(
      screen.getByText(
        '1 produto configurado no motor, 1 checkout e 0 afiliados — ative um produto para liberar a IA na jornada de compra.',
      ),
    ).toBeTruthy();
  });
});
describe('MarketplaceProductGrid accessibility', () => {
  it('opens a marketplace product card by keyboard role', () => {
    const onSelectItem = vi.fn();

    render(
      <MarketplaceProductGrid
        filteredMarket={[
          {
            id: 'market-1',
            name: 'Produto acessivel',
            category: 'E-books',
            producer: 'Kloel',
            price: 3990,
            commission: 30,
          },
        ]}
        onSelectItem={onSelectItem}
        onToggleSave={vi.fn()}
      />,
    );

    const productCard = screen.getByRole('button', { name: 'Abrir Produto acessivel' });

    expect(productCard.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(productCard, { key: 'Enter' });
    expect(onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'market-1' }));
  });
});


describe('AfiliarSe marketplace search', () => {
  it('explains an empty marketplace result when search is active', () => {
    render(
      <AfiliarSe
        marketplace={[]}
        earnings={0}
        marketplaceStats={{}}
        affiliateLinks={[]}
        affiliateProducts={[]}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Buscar produtos para se afiliar'), {
      target: { value: 'produto inexistente' },
    });

    expect(screen.getByText('Nenhum produto encontrado para esta busca.')).toBeTruthy();
    expect(screen.getByText('Limpe a busca ou tente outro termo.')).toBeTruthy();
  });


  it('does not count saved marketplace products as affiliation requests', () => {
    render(
      <AfiliarSe
        marketplace={[]}
        earnings={0}
        marketplaceStats={{}}
        affiliateLinks={[]}
        affiliateProducts={[
          { id: 'approved-affiliation', status: 'APPROVED' },
          {
            id: 'saved-affiliation',
            status: 'SAVED',
            affiliateProduct: { name: 'Produto salvo', isSaved: true },
          },
        ]}
        onRefresh={vi.fn()}
      />,
    );

    const solicitationsCard = screen.getByText('Solicitacoes').parentElement?.parentElement;

    expect(solicitationsCard?.textContent).toContain('Solicitacoes1');
    expect(solicitationsCard?.textContent).toContain('1 salvo');
  });
  it('guides users to profile completion when affiliation is blocked', async () => {
    requestAffiliationMock.mockRejectedValueOnce(
      new Error('Complete seu cadastro para usar esta funcionalidade'),
    );

    render(
      <AfiliarSe
        marketplace={[
          {
            id: 'blocked-product',
            name: 'Produto bloqueado',
            category: 'Cursos Online',
            producer: 'Kloel',
            price: 19700,
            commission: 35,
          },
        ]}
        earnings={0}
        marketplaceStats={{}}
        affiliateLinks={[]}
        affiliateProducts={[]}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Produto bloqueado'));
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar afiliacao' }));

    expect(await screen.findByText('Complete seu cadastro para usar esta funcionalidade')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ir para Perfil' }));
    expect(pushMock).toHaveBeenCalledWith('/settings');
  });

  it('refreshes the open detail after an affiliation request resolves', async () => {
    requestAffiliationMock.mockResolvedValueOnce(undefined);
    const onRefresh = vi.fn();
    const marketProduct = {
      id: 'pending-product',
      name: 'Produto pendente',
      category: 'Cursos Online',
      producer: 'Kloel',
      price: 19700,
      commission: 35,
    };

    const { rerender } = render(
      <AfiliarSe
        marketplace={[marketProduct]}
        earnings={0}
        marketplaceStats={{}}
        affiliateLinks={[]}
        affiliateProducts={[]}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByText('Produto pendente'));
    expect(screen.getByText('Nao iniciada')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar afiliacao' }));

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

    rerender(
      <AfiliarSe
        marketplace={[{ ...marketProduct, requestStatus: 'PENDING' }]}
        earnings={0}
        marketplaceStats={{}}
        affiliateLinks={[]}
        affiliateProducts={[]}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText('Pendente')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Solicitacao enviada' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.queryByRole('button', { name: 'Solicitar afiliacao' })).toBeNull();
  });
});

describe('normalizeDisplayProduct', () => {
  it('maps ACTIVE backend status to an active display product', () => {
    const product = normalizeDisplayProduct(
      { id: 'prod-active', name: 'Produto ativo', status: 'ACTIVE', active: true },
      {
        minPlanPriceInCents: null,
        maxPlanPriceInCents: null,
        hasPlanPricing: false,
        priceLabel: 'R$ 0,00',
      },
    );

    expect(product.status).toBe('active');
    expect(product.active).toBe(true);
  });

  it('uses the active flag when a sellable product still has DRAFT status', () => {
    const product = normalizeDisplayProduct(
      { id: 'prod-sellable', name: 'Produto vendavel', status: 'DRAFT', active: true },
      {
        minPlanPriceInCents: null,
        maxPlanPriceInCents: null,
        hasPlanPricing: false,
        priceLabel: 'R$ 0,00',
      },
    );

    expect(product.status).toBe('active');
    expect(product.active).toBe(true);
  });
});
