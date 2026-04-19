'use client';

import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import {
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactElement,
} from 'react';

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
  const [walletsReady, setWalletsReady] = useState(false);

  const handleImmediateError = useCallback(
    (message: string) => {
      setInternalError(message);
      onError?.(message);
      setSubmitting(false);
    },
    [onError],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!stripe || !elements) return;

      setSubmitting(true);
      setInternalError(null);

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      });

      if (error) {
        handleImmediateError(error.message ?? 'Falha ao processar pagamento.');
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        onSuccess?.();
      }
      setSubmitting(false);
    },
    [stripe, elements, returnUrl, onSuccess, handleImmediateError],
  );

  const handleExpressCheckoutConfirm = useCallback(
    async (event: Parameters<NonNullable<ComponentProps<typeof ExpressCheckoutElement>['onConfirm']>>[0]) => {
      if (!stripe || !elements) {
        event.paymentFailed({ reason: 'fail' });
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
        event.paymentFailed({ reason: 'fail' });
        handleImmediateError(error.message ?? 'Falha ao processar pagamento.');
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        onSuccess?.();
      }

      setSubmitting(false);
    },
    [stripe, elements, returnUrl, onSuccess, handleImmediateError],
  );

  const expressCheckoutOptions = useMemo(
    () => ({
      buttonHeight: 48,
      layout: {
        maxColumns: 1,
        maxRows: 2,
        overflow: 'never' as const,
      },
      paymentMethods: {
        applePay: 'always' as const,
        googlePay: 'always' as const,
        link: 'auto' as const,
      },
      buttonType: {
        applePay: 'buy' as const,
        googlePay: 'pay' as const,
      },
      buttonTheme: {
        applePay: 'black' as const,
        googlePay: 'black' as const,
      },
    }),
    [],
  );

  return (
    <form onSubmit={handleSubmit} className="kloel-stripe-payment-form">
      <div
        className="kloel-stripe-payment-form__wallets"
        style={{
          display: walletsReady ? 'grid' : 'none',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {walletsReady ? (
          <div
            style={{
              display: 'grid',
              gap: 6,
            }}
          >
            <strong
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'rgba(245, 241, 232, 0.92)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Pagar em 1 clique
            </strong>
            <span
              style={{
                fontSize: 13,
                color: 'rgba(183, 179, 169, 0.88)',
                lineHeight: 1.5,
              }}
            >
              Apple Pay e Google Pay aparecem automaticamente quando o dispositivo do comprador
              suporta wallet nativa.
            </span>
          </div>
        ) : null}
        <ExpressCheckoutElement
          options={expressCheckoutOptions}
          onReady={(event) => {
            const available = event.availablePaymentMethods;
            setWalletsReady(Boolean(available && Object.values(available).some(Boolean)));
          }}
          onConfirm={handleExpressCheckoutConfirm}
        />
        {walletsReady ? (
          <div
            aria-hidden="true"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: 'rgba(183, 179, 169, 0.78)',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            <span>ou pagar com cartão</span>
            <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>
        ) : null}
      </div>
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
