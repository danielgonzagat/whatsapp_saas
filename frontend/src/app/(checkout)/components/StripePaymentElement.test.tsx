import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

let mockStripe: {
  confirmPayment: ReturnType<typeof vi.fn>;
} | null = null;

let mockElements = { __brand: 'elements' };
let mockReadyPayload: { applePay: boolean; googlePay: boolean } | undefined = {
  applePay: true,
  googlePay: true,
};
let mockConfirmEvent = {
  paymentFailed: vi.fn(),
};

vi.mock('@/lib/stripe-client', () => ({
  getStripeClient: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@stripe/react-stripe-js', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    Elements: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="stripe-elements-provider">{children}</div>
    ),
    PaymentElement: () => <div data-testid="stripe-payment-element-body" />,
    ExpressCheckoutElement: ({
      onReady,
      onConfirm,
    }: {
      onReady?: (event: {
        elementType: 'expressCheckout';
        availablePaymentMethods?: { applePay: boolean; googlePay: boolean };
      }) => void;
      onConfirm: (event: typeof mockConfirmEvent) => void;
    }) => {
      React.useEffect(() => {
        onReady?.({
          elementType: 'expressCheckout',
          availablePaymentMethods: mockReadyPayload,
        });
      }, [onReady]);

      return (
        <button
          type="button"
          data-testid="express-checkout-element"
          onClick={() => onConfirm(mockConfirmEvent)}
        >
          express checkout
        </button>
      );
    },
    useStripe: () => mockStripe,
    useElements: () => mockElements,
  };
});

import { StripePaymentElement } from './StripePaymentElement';

describe('StripePaymentElement', () => {
  beforeEach(() => {
    mockStripe = {
      confirmPayment: vi.fn(),
    };
    mockElements = { __brand: 'elements' };
    mockReadyPayload = {
      applePay: true,
      googlePay: true,
    };
    mockConfirmEvent = {
      paymentFailed: vi.fn(),
    };
  });

  it('reveals the express checkout wallet lane above the payment form when wallets are available', async () => {
    render(
      <StripePaymentElement
        clientSecret="pi_test_secret"
        returnUrl="https://kloel.com/order/123/success"
      />,
    );

    expect(await screen.findByText('Pagar em 1 clique')).toBeInTheDocument();
    expect(screen.getByText('ou pagar com cartão')).toBeInTheDocument();
    expect(screen.getByTestId('express-checkout-element')).toBeInTheDocument();
    expect(screen.getByTestId('stripe-payment-element-body')).toBeInTheDocument();
  });

  it('keeps the express checkout lane hidden when Stripe reports no wallet buttons for the buyer device', async () => {
    mockReadyPayload = undefined;

    render(
      <StripePaymentElement
        clientSecret="pi_test_secret"
        returnUrl="https://kloel.com/order/123/success"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('Pagar em 1 clique')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('stripe-payment-element-body')).toBeInTheDocument();
  });

  it('confirms the payment through Stripe Elements when the buyer uses express checkout', async () => {
    const onSuccess = vi.fn();
    mockStripe?.confirmPayment.mockResolvedValue({
      error: undefined,
      paymentIntent: { status: 'succeeded' },
    });

    render(
      <StripePaymentElement
        clientSecret="pi_test_secret"
        returnUrl="https://kloel.com/order/123/success"
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(await screen.findByTestId('express-checkout-element'));

    await waitFor(() => {
      expect(mockStripe?.confirmPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          elements: mockElements,
          confirmParams: {
            return_url: 'https://kloel.com/order/123/success',
          },
        }),
      );
    });
    expect(mockConfirmEvent.paymentFailed).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('reports immediate express checkout confirmation failures back to the buyer and parent error handler', async () => {
    const onError = vi.fn();
    mockStripe?.confirmPayment.mockResolvedValue({
      error: { message: 'Apple Pay indisponível agora.' },
    });

    render(
      <StripePaymentElement
        clientSecret="pi_test_secret"
        returnUrl="https://kloel.com/order/123/success"
        onError={onError}
      />,
    );

    fireEvent.click(await screen.findByTestId('express-checkout-element'));

    await waitFor(() => {
      expect(mockConfirmEvent.paymentFailed).toHaveBeenCalledWith({ reason: 'fail' });
    });
    expect(onError).toHaveBeenCalledWith('Apple Pay indisponível agora.');
    expect(screen.getByRole('alert')).toHaveTextContent('Apple Pay indisponível agora.');
  });
});
