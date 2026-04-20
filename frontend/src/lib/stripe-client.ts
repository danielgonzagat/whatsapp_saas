import { loadStripe, type Stripe } from '@stripe/stripe-js';

/**
 * Lazy singleton for the Stripe.js client. `loadStripe` returns a promise
 * that resolves to the Stripe instance; we cache the promise (not the
 * resolved value) so callers can await it without retriggering the script
 * load. Returns null when the publishable key is missing — components must
 * surface a configuration error to the seller rather than silently failing.
 */
let stripePromise: Promise<Stripe | null> | null = null;

/** Get stripe client. */
export function getStripeClient(): Promise<Stripe | null> {
  if (stripePromise) {
    return stripePromise;
  }

  const publishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
    (typeof window !== 'undefined'
      ? (window as unknown as { __NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY__?: string })
          .__NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY__
      : undefined);

  if (!publishableKey) {
    if (typeof window !== 'undefined') {
      console.error(
        '[stripe-client] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY missing. Stripe checkout will not load.',
      );
    }
    stripePromise = Promise.resolve(null);
    return stripePromise;
  }

  stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

/** Reset stripe client for tests. */
export function resetStripeClientForTests(): void {
  stripePromise = null;
}
