import Stripe from 'stripe';

/**
 * Pinned Stripe API version for the entire monorepo.
 *
 * Bound to the installed SDK's `Stripe.API_VERSION` static so the literal type
 * accepted by `paymentIntents.create` / `webhooks.constructEvent` always
 * matches the SDK shipped in `node_modules`. Bump by upgrading the `stripe`
 * dependency in `backend/package.json` after reviewing the Stripe changelog
 * and running the smoke suite — the typecheck enforces consistency.
 *
 * Source: https://docs.stripe.com/upgrades — version naming uses the
 * `<release-date>.<codename>` convention.
 */
export const STRIPE_API_VERSION = Stripe.API_VERSION;
