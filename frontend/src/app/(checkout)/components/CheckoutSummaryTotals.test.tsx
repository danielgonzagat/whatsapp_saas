import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckoutSummaryTotals } from './CheckoutSummaryTotals';
import { buildBlancTheme } from './checkout-theme-tokens';

const baseProps = {
  theme: buildBlancTheme(),
  couponApplied: false,
  discount: 0,
  subtotal: 19990,
  shippingInCents: 0,
  totalWithInterest: 19990,
  fmtBrl: (value: number) => `R$ ${(value / 100).toFixed(2)}`,
};

describe('CheckoutSummaryTotals', () => {
  it('shows digital delivery instead of freight for digital products', () => {
    render(<CheckoutSummaryTotals {...baseProps} requiresShipping={false} />);

    expect(screen.queryByText('Entrega')).not.toBeNull();
    expect(screen.queryByText('Digital')).not.toBeNull();
    expect(screen.queryByText('Frete')).toBeNull();
  });

  it('keeps free freight copy for physical products', () => {
    render(<CheckoutSummaryTotals {...baseProps} requiresShipping />);

    expect(screen.queryByText('Frete')).not.toBeNull();
    expect(screen.queryByText('Grátis')).not.toBeNull();
  });
});
