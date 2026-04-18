import { useCallback, useState } from 'react';

import { apiFetch } from '@/lib/api/core';

/**
 * Thin hook over the kloel backend's `POST /api/checkout/stripe/intent`
 * endpoint that returns a Stripe PaymentIntent client_secret. Keeps the
 * call site declarative — components only need to call `createIntent`
 * with the order id and pass the resulting `clientSecret` to
 * `<StripePaymentElement />`.
 *
 * The endpoint name is illustrative — the actual route lands when
 * checkout.service.ts is migrated to use stripechargeservice (deferred
 * fase 7 work). Until then this hook is wired but the network call will
 * 404, which is the correct behavior for a partial migration.
 */
export interface UseStripeCheckoutOptions {
  /** Endpoint that returns `{ clientSecret, paymentIntentId }`. */
  endpoint?: string;
}

interface CreateIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

export function useStripeCheckout(options: UseStripeCheckoutOptions = {}): {
  clientSecret: string | null;
  paymentIntentId: string | null;
  loading: boolean;
  error: string | null;
  createIntent: (input: { orderId: string }) => Promise<void>;
  reset: () => void;
} {
  const endpoint = options.endpoint ?? '/api/checkout/stripe/intent';
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createIntent = useCallback(
    async ({ orderId }: { orderId: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<CreateIntentResponse>(endpoint, {
          method: 'POST',
          body: JSON.stringify({ orderId }),
          headers: { 'content-type': 'application/json' },
        });
        if (res.error || !res.data) {
          throw new Error(res.error ?? 'Resposta sem dados de pagamento.');
        }
        setClientSecret(res.data.clientSecret);
        setPaymentIntentId(res.data.paymentIntentId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Falha ao iniciar pagamento.';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [endpoint],
  );

  const reset = useCallback(() => {
    setClientSecret(null);
    setPaymentIntentId(null);
    setError(null);
  }, []);

  return { clientSecret, paymentIntentId, loading, error, createIntent, reset };
}
