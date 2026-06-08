import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckoutFooter } from './CheckoutFooter';
import { buildBlancTheme } from './checkout-theme-tokens';

const baseProps = {
  theme: buildBlancTheme(),
  brandName: 'Kloel Test',
  footerPrimary: 'Kloel Test: pay.kloel.com',
  footerSecondary: '',
  footerLegal: 'Checkout seguro por Kloel',
};

describe('CheckoutFooter', () => {
  it('shows payment badges when checkout is available', () => {
    render(<CheckoutFooter {...baseProps} />);

    expect(screen.queryByText('Formas de pagamento')).not.toBeNull();
    expect(screen.queryByText('VISA')).not.toBeNull();
    expect(screen.queryByText('Pix')).not.toBeNull();
  });

  it('shows provider unavailable reason instead of payment badges', () => {
    render(
      <CheckoutFooter
        {...baseProps}
        checkoutUnavailableReason="Stripe/Mercado Pago não estão configurados."
      />,
    );

    expect(screen.queryByText('Pagamento temporariamente indisponível')).not.toBeNull();
    expect(screen.queryByRole('status')?.textContent).toContain('Stripe/Mercado Pago');
    expect(screen.queryByText('VISA')).toBeNull();
    expect(screen.queryByText('Pix')).toBeNull();
  });
});
