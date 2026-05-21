import { createRequire } from 'node:module';

const stripeRequire = createRequire(__filename);

// Resolve Stripe constructor robustly across Node ESM/CJS interop modes.
// On Node 22+/24+ certain bundlers wrap CJS exports such that `require('stripe')`
// returns `{ default: StripeConstructor, ... }` instead of the constructor itself.
// When that happens, `new StripeRuntime(key)` silently returns an instance whose
// properties (.customers, .paymentMethods) are undefined, causing the Sentry
// NODE-S error spike (1,026 events / 14d on /billing/payment-methods).
//
// Strategy: probe both shapes; prefer the one that is a callable constructor.
function resolveStripeConstructor(): typeof import('stripe') {
  const mod = stripeRequire('stripe') as unknown as
    | typeof import('stripe')
    | { default: typeof import('stripe'); Stripe?: typeof import('stripe') };

  if (typeof mod === 'function') {
    return mod;
  }
  if (mod && typeof (mod as { default?: unknown }).default === 'function') {
    return (mod as { default: typeof import('stripe') }).default;
  }
  if (mod && typeof (mod as { Stripe?: unknown }).Stripe === 'function') {
    return (mod as { Stripe: typeof import('stripe') }).Stripe;
  }
  throw new Error(
    'stripe-runtime: cannot resolve Stripe constructor — ' +
      `require('stripe') returned ${typeof mod} (keys: ${mod ? Object.keys(mod).slice(0, 6).join(',') : 'n/a'})`,
  );
}

/** Stripe runtime — constructor resolved across Node interop modes. */
export const StripeRuntime = resolveStripeConstructor();
