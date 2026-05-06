import type { StripeInvoice, StripeSubscription } from './stripe-types';

/**
 * Stripe invoice variant exposing the optional `subscription` reference Stripe
 * sends on `invoice.payment_succeeded` events. Either a string id, an embedded
 * subscription stub with an id, or null.
 */
export type StripeInvoiceWithSubscription = StripeInvoice & {
  subscription?: string | { id?: string | null } | null;
};

/**
 * Stripe subscription variant carrying the optional `current_period_end` epoch
 * Stripe attaches to subscription objects.
 */
export type StripeSubscriptionWithPeriodEnd = StripeSubscription & {
  current_period_end?: number | null;
};

/**
 * Minimal contract the webhook service needs to push WhatsApp notifications
 * without importing the full WhatsappService class (which would add a
 * circular module-graph dependency).
 */
export type WhatsappNotifier = {
  sendMessage(workspaceId: string, phone: string, message: string): Promise<unknown>;
};
