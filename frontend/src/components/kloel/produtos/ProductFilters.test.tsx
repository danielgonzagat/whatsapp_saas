import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProductFilters from './ProductFilters';
import AfiliarSe from './ProdutosAfiliarSeTab';
import { normalizeDisplayProduct } from './ProdutosView.helpers';

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
