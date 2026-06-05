import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProductFilters from './ProductFilters';
import ProductsListing from './ProductsListing';
import AfiliarSe from './ProdutosAfiliarSeTab';
import { normalizeDisplayProduct } from './ProdutosView.helpers';
import type { DisplayProduct } from './ProdutosView.types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

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
