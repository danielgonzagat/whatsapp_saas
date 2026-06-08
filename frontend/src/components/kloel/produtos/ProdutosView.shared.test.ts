import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useClientMounted', () => ({ useClientMounted: () => true }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => false }));

import { getProductPlanPriceSummary, Ticker } from './ProdutosView.shared';

describe('getProductPlanPriceSummary', () => {
  it('uses the product base price before a plan is configured', () => {
    const product = {
      minPlanPriceInCents: null,
      maxPlanPriceInCents: null,
      price: 197.9,
    } as Parameters<typeof getProductPlanPriceSummary>[0] & {
      price: number;
    };
    const summary = getProductPlanPriceSummary(product);

    expect(summary.hasPlanPricing).toBe(false);
    expect(summary.minPlanPriceInCents).toBeNull();
    expect(summary.maxPlanPriceInCents).toBeNull();
    expect(summary.priceLabel).toContain('197,90');
    expect(summary.priceLabel).not.toBe('Sem planos');
  });
});

describe('Ticker', () => {
  it('keeps duplicated marquee copy hidden from the accessibility tree', () => {
    const { container } = render(
      createElement(Ticker, {
        items: ['Area A: 0 alunos', 'Area B: 0 alunos'],
      }),
    );

    const accessibleTicker = container.querySelector('span:not([aria-hidden])');
    expect(accessibleTicker?.textContent).toBe('Area A: 0 alunos  ///  Area B: 0 alunos');

    const hiddenTicker = Array.from(container.querySelectorAll('[aria-hidden="true"]')).find((element) =>
      element.textContent?.includes('Area A: 0 alunos'),
    );

    const hiddenText = hiddenTicker?.textContent || '';
    expect(hiddenText).toContain('Area A: 0 alunos');
    expect(hiddenText).toContain('Area B: 0 alunos');
    expect(hiddenText.match(/Area A: 0 alunos/g)).toHaveLength(2);
  });
});
