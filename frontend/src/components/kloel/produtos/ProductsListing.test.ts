import { describe, expect, it } from 'vitest';

import * as ProductsListingModule from './ProductsListing';
import type { DisplayProduct } from './ProdutosView.types';

const { buildProductTickerText, pluralizePt } = ProductsListingModule as typeof ProductsListingModule & {
  buildProductTickerText: (product: DisplayProduct) => string;
  pluralizePt: (count: number, singular: string, plural: string) => string;
};

describe('buildProductTickerText', () => {
  it('shows the product base price when plan pricing is not configured yet', () => {
    const product = {
      name: 'Produto QA',
      hasPlanPricing: false,
      priceLabel: 'R$ 197,90',
    } as DisplayProduct;

    expect(buildProductTickerText(product)).toBe('Produto QA \u00b7 R$ 197,90');
  });

  it('keeps the no-plan guidance when no base price exists', () => {
    const product = {
      name: 'Produto sem preco',
      hasPlanPricing: false,
      priceLabel: 'Sem planos',
    } as DisplayProduct;

    expect(buildProductTickerText(product)).toBe('Produto sem preco \u00b7 sem planos configurados');
  });
});

describe('pluralizePt', () => {
  it('uses singular text for one catalog product', () => {
    expect(pluralizePt(1, 'produto no catalogo', 'produtos no catalogo')).toBe(
      '1 produto no catalogo',
    );
    expect(pluralizePt(2, 'produto no catalogo', 'produtos no catalogo')).toBe(
      '2 produtos no catalogo',
    );
  });
});
