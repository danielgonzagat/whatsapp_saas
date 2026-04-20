'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useCallback, useMemo, useState, type FormEvent, type ReactElement } from 'react';

import { getStripeClient } from '@/lib/stripe-client';

/**
 * Stripe Payment Element wrapper for the hosted Kloel checkout runtime.
 *
 * Usage:
 *   <StripePaymentElement
 *     clientSecret={piClientSecret}
 *     onSuccess={() => router.push('/checkout/success')}
 *     onError={(message) => setError(message)}
 *   />
 *
 * The parent component is responsible for calling the kloel backend to create
 * the PaymentIntent (StripeChargeService.createSaleCharge) and passing the
 * resulting `client_secret` here. Confirmation happens client-side via
 * `stripe.confirmPayment` so the buyer never leaves the seller's domain.
 */
export interface StripePaymentElementProps {
  /** PaymentIntent client secret returned by the backend. */
  clientSecret: string;
  /** Called when stripe.confirmPayment resolves with a `succeeded` status. */
  onSuccess?: () => void;
  /** Called with the user-facing message when confirmation errors. */
  onError?: (message: string) => void;
  /**
   * Absolute return URL Stripe redirects to after off-session methods like
   * boleto/pix that complete out of band. Required.
   */
  returnUrl: string;
  /** Optional appearance overrides forwarded to Elements. */
  appearance?: Parameters<typeof Elements>[0]['options'] extends infer O
    ? O extends { appearance?: infer A }
      ? A
      : never
    : never;
}

export function StripePaymentElement(props: StripePaymentElementProps): ReactElement {
  const stripePromise = useMemo(() => getStripeClient(), []);
  const options = useMemo(
    () => ({
      clientSecret: props.clientSecret,
      appearance: props.appearance,
    }),
    [props.clientSecret, props.appearance],
  );

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentForm
        returnUrl={props.returnUrl}
        onSuccess={props.onSuccess}
        onError={props.onError}
      />
    </Elements>
  );
}

interface PaymentFormProps {
  returnUrl: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

function PaymentForm({ returnUrl, onSuccess, onError }: PaymentFormProps): ReactElement {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!stripe || !elements) {
        return;
      }

      setSubmitting(true);
      setInternalError(null);

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      });

      if (error) {
        const message = error.message ?? 'Falha ao processar pagamento.';
        setInternalError(message);
        onError?.(message);
        setSubmitting(false);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        onSuccess?.();
      }
      setSubmitting(false);
    },
    [stripe, elements, returnUrl, onSuccess, onError],
  );

  return (
    <form onSubmit={handleSubmit} className="kloel-stripe-payment-form">
      <PaymentElement />
      {internalError ? (
        <p role="alert" className="kloel-stripe-payment-form__error">
          {internalError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="kloel-stripe-payment-form__submit"
      >
        {submitting ? 'Processando…' : 'Pagar agora'}
      </button>
    </form>
  );
}
