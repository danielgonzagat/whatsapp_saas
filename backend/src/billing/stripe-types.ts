import type Stripe from 'stripe';

/**
 * Stripe SDK v22 changed how the entry-point exposes namespace types — only
 * the `Stripe.Stripe` class type is re-exported, not the merged data namespace.
 * This file provides convenient aliases derived from method return types so
 * consumers don't need to reach into internal SDK paths.
 *
 * Pattern: `Awaited<ReturnType<Stripe.Stripe['<resource>']['<method>']>>` returns
 * `Stripe.Response<T> = T & { lastResponse: ... }`. We `Unwrap<>` to drop
 * `lastResponse` so consumers work with raw data types (the common case for
 * webhook payloads, function parameters, and persisted shapes).
 *
 * Add new aliases here as needed.
 */
export type StripeClient = Stripe.Stripe;

type Unwrap<T> = T extends { lastResponse: unknown } ? Omit<T, 'lastResponse'> : T;

/** Stripe balance type. */
export type StripeBalance = Unwrap<Awaited<ReturnType<StripeClient['balance']['retrieve']>>>;
/** Stripe customer type. */
export type StripeCustomer = Unwrap<Awaited<ReturnType<StripeClient['customers']['create']>>>;
/** Stripe subscription type. */
export type StripeSubscription = Unwrap<
  Awaited<ReturnType<StripeClient['subscriptions']['retrieve']>>
>;
/** Stripe invoice type. */
export type StripeInvoice = Unwrap<Awaited<ReturnType<StripeClient['invoices']['retrieve']>>>;
/** Stripe checkout session type. */
export type StripeCheckoutSession = Unwrap<
  Awaited<ReturnType<StripeClient['checkout']['sessions']['create']>>
>;
/** Stripe payment intent type. */
export type StripePaymentIntent = Unwrap<
  Awaited<ReturnType<StripeClient['paymentIntents']['create']>>
>;
/** Stripe refund type. */
export type StripeRefund = Unwrap<Awaited<ReturnType<StripeClient['refunds']['create']>>>;
/** Stripe transfer type. */
export type StripeTransfer = Unwrap<Awaited<ReturnType<StripeClient['transfers']['create']>>>;
/** Stripe account type. */
export type StripeAccount = Unwrap<Awaited<ReturnType<StripeClient['accounts']['create']>>>;
/** Stripe payout type. */
export type StripePayout = Unwrap<Awaited<ReturnType<StripeClient['payouts']['create']>>>;
/** Stripe event type. */
export type StripeEvent = Unwrap<ReturnType<StripeClient['webhooks']['constructEvent']>>;
/** Stripe billing portal session type. */
export type StripeBillingPortalSession = Unwrap<
  Awaited<ReturnType<StripeClient['billingPortal']['sessions']['create']>>
>;
