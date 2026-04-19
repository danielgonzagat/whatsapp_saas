import { createRequire } from 'node:module';

const stripeRequire = createRequire(__filename);

export const StripeRuntime = stripeRequire('stripe') as typeof import('stripe');
