import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProductFilters from './ProductFilters';
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
