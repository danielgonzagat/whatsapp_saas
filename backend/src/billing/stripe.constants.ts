/**
 * Pinned Stripe API version for the entire monorepo.
 *
 * Locked deliberately so silent upstream behavior changes (parameter shapes,
 * default values, deprecations) cannot affect us between SDK upgrades.
 * Bump only after reviewing the Stripe changelog and running the smoke suite.
 *
 * Source: https://docs.stripe.com/upgrades — version naming uses the
 * `<release-date>.<codename>` convention.
 *
 * Stripe republished the `22.2.0` tarball on npm with the pinned API
 * version bumped from `2026-04-22.dahlia` to `2026-05-27.dahlia`; the value
 * here matches the published SDK so a fresh `npm ci` (CI) accepts the
 * literal at the `paymentIntents.create` call site.
 */
export const STRIPE_API_VERSION = '2026-05-27.dahlia';
