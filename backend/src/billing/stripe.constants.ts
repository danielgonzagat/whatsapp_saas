/**
 * Pinned Stripe API version for the entire monorepo.
 *
 * Locked deliberately so silent upstream behavior changes (parameter shapes,
 * default values, deprecations) cannot affect us between SDK upgrades.
 * Bump only after reviewing the Stripe changelog and running the smoke suite.
 *
 * Source: https://docs.stripe.com/upgrades — version naming uses the
 * `<release-date>.<codename>` convention.
 */
export const STRIPE_API_VERSION = '2026-03-25.dahlia';
