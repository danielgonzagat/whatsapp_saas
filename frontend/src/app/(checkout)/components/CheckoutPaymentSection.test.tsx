import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./StripePaymentElement', () => ({
  StripePaymentElement: ({ clientSecret }: { clientSecret: string }) => (
    <div data-testid="stripe-payment-element">{clientSecret}</div>
  ),
}));

import { CheckoutPaymentSection } from './CheckoutPaymentSection';
import { buildBlancTheme } from './checkout-theme-tokens';

describe('CheckoutPaymentSection', () => {
  it('renders the Stripe Payment Element instead of the legacy manual card form once the order has a client secret', () => {
    render(
      <CheckoutPaymentSection
        theme={buildBlancTheme()}
        step={3}
        payMethod="card"
        setPayMethod={vi.fn()}
        supportsCard
        supportsPix
        supportsBoleto={false}
        form={{
          cpf: '123.456.789-00',
          name: 'Maria Teste',
          cardNumber: '',
          cardExp: '',
          cardCvv: '',
          cardName: '',
          cardCpf: '',
          installments: '1',
        }}
        updateField={vi.fn(() => vi.fn())}
        installmentOptions={[{ value: 1, label: '1x de R$ 100,00 sem juros' }]}
        totalWithInterest={10000}
        fmtBrl={() => 'R$ 100,00'}
        submitError=""
        isSubmitting={false}
        finalizeOrder={vi.fn()}
        stripeClientSecret="pi_test_secret_123"
        stripeReturnUrl="http://localhost/order/123/success"
        onStripeSuccess={vi.fn()}
        onStripeError={vi.fn()}
      />,
    );

    expect(screen.getByTestId('stripe-payment-element')).toHaveTextContent('pi_test_secret_123');
    expect(screen.queryByLabelText('Número do cartão')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finalizar compra' })).not.toBeInTheDocument();
  });
});
