'use client';

import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import type { StripeExpressCheckoutElementConfirmEvent } from '@stripe/stripe-js';
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

/** Stripe payment element. */
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
  const [walletReady, setWalletReady] = useState(false);

  const publishError = useCallback(
    (message: string) => {
      setInternalError(message);
      onError?.(message);
    },
    [onError],
  );

  const confirmCurrentElements = useCallback(async () => {
    if (!stripe || !elements) {
      return { ok: false as const };
    }

    const { error: submitError } = await elements.submit();
    if (submitError) {
      publishError(submitError.message ?? 'Falha ao validar os dados do pagamento.');
      return { ok: false as const };
    }

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    });

    if (error) {
      publishError(error.message ?? 'Falha ao processar pagamento.');
      return { ok: false as const };
    }

    if (paymentIntent?.status === 'succeeded') {
      onSuccess?.();
    }

    return { ok: true as const };
  }, [elements, onSuccess, publishError, returnUrl, stripe]);

  const handleExpressCheckoutConfirm = useCallback(
    async (event: StripeExpressCheckoutElementConfirmEvent) => {
      setSubmitting(true);
      setInternalError(null);

      const result = await confirmCurrentElements();
      if (!result.ok) {
        event.paymentFailed({ reason: 'fail' });
      }

      setSubmitting(false);
    },
    [confirmCurrentElements],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!stripe || !elements) {
        return;
      }

      setSubmitting(true);
      setInternalError(null);
      await confirmCurrentElements();
      setSubmitting(false);
    },
    [confirmCurrentElements, elements, stripe],
  );

  return (
    <form onSubmit={handleSubmit} className="kloel-stripe-payment-form">
      <div className="kloel-stripe-payment-form__wallets">
        <ExpressCheckoutElement
          onReady={() => setWalletReady(true)}
          onConfirm={(event) => void handleExpressCheckoutConfirm(event)}
          options={{
            layout: {
              maxColumns: 1,
              maxRows: 2,
              overflow: 'auto',
            },
          }}
        />
      </div>
      {walletReady ? (
        <div className="kloel-stripe-payment-form__divider" aria-hidden="true">
          <span>ou pagar com cartão</span>
        </div>
      ) : null}
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
