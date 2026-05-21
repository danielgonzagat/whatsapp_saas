/**
 * Types for the PaymentProviderRouter.
 *
 * Per ADR-0009: the router picks `mercadopago` for PIX BR and `stripe`
 * for everything else (cartão + Connect marketplace). The decision is
 * deterministic — no fallback, no per-customer logic at the router level.
 */

/** Payment method requested by the user/checkout. */
export type PaymentMethod = 'pix' | 'card' | 'boleto';

/** Canonical provider names (lowercase strings, matching DB `Payment.provider`). */
export type PaymentProvider = 'mercadopago' | 'stripe';

/** Input the router needs to make a decision. */
export interface ProviderRoutingInput {
  readonly method: PaymentMethod;
  readonly country?: string; // ISO-3166-1 alpha-2, e.g. 'BR'
}

/** Output of the routing decision. */
export interface ProviderRoutingDecision {
  readonly provider: PaymentProvider;
  readonly reason: string; // human-readable rationale for audit
}
