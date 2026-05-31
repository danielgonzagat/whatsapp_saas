/**
 * @capability StripeRuntimeLoader
 * @domain payment
 */
import { createRequire } from 'node:module';

const stripeRequire = createRequire(__filename);

/** Stripe runtime. */
export const StripeRuntime = stripeRequire('stripe') as typeof import('stripe');
