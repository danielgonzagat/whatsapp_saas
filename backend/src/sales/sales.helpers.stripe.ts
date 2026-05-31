import { buildSaleBuyerMetadata, type SaleBuyerMetadataInput } from './sales.helpers.shared';

/**
 * Stripe-specific pure helpers extracted from {@link SalesService}. Owns the
 * checkout URL pair, session/payment-intent metadata builders, line-items
 * builder, full `checkout.sessions.create` input builder, and the chat-facing
 * {@link CreateStripeCardLinkResult} shape.
 *
 * Re-exported from the {@link ./sales.helpers.ts} barrel.
 */

/**
 * Build the Stripe Checkout success/cancel URL pair used by in-chat card
 * purchases. The frontend route `/vendas/gestao-vendas` listens for the
 * `stripe_checkout` query param and shows a confirmation state.
 */
export function buildStripeCheckoutUrls(
  frontendOrigin: string,
  saleId: string,
): { successUrl: string; cancelUrl: string } {
  const encodedSaleId = encodeURIComponent(saleId);
  return {
    successUrl: `${frontendOrigin}/vendas/gestao-vendas?stripe_checkout=success&saleId=${encodedSaleId}`,
    cancelUrl: `${frontendOrigin}/vendas/gestao-vendas?stripe_checkout=canceled&saleId=${encodedSaleId}`,
  };
}

/**
 * Pick the external payment id from a Stripe checkout session. Prefers the
 * expanded payment intent id, then falls back to the session id when the
 * intent is absent (e.g. test fixtures).
 */
export function pickStripeExternalPaymentId(
  paymentIntent: string | { id: string } | null | undefined,
  fallbackSessionId: string,
): string {
  if (typeof paymentIntent === 'string') {
    return paymentIntent;
  }
  return paymentIntent?.id || fallbackSessionId;
}

/**
 * Build the Stripe-specific metadata applied to the sale row after the Stripe
 * checkout session is created.
 */
export function buildStripeSaleUpdateMetadata(
  buyer: SaleBuyerMetadataInput,
  stripeCheckoutSessionId: string,
  stripePaymentIntentId: string,
): Record<string, string> {
  return {
    ...buildSaleBuyerMetadata(buyer),
    stripeCheckoutSessionId,
    stripePaymentIntentId,
  };
}

export interface StripeSessionMetadataInput {
  workspaceId: string;
  saleId: string;
  productId: string;
  planId: string;
  productName: string;
  phone?: string;
}

/**
 * Build the metadata block attached to a Stripe Checkout Session. Includes
 * dual-naming (snake_case + camelCase) keys to remain compatible with both
 * KLOEL webhook handlers and Stripe dashboard inspection.
 */
export function buildStripeSessionMetadata(
  input: StripeSessionMetadataInput,
): Record<string, string> {
  return {
    workspace_id: input.workspaceId,
    workspaceId: input.workspaceId,
    kloel_order_id: input.saleId,
    orderId: input.saleId,
    saleId: input.saleId,
    productId: input.productId,
    planId: input.planId,
    productName: input.productName,
    payment_method: 'CREDIT_CARD',
    sourceCapability: 'sales.create_card_link',
    ...(input.phone ? { phone: input.phone } : {}),
  };
}

/**
 * Build the single-item Stripe Checkout `line_items` array used by in-chat
 * card sales. Keeps quantity, currency and `product_data` aligned across calls.
 */
export function buildStripeCheckoutLineItems(
  productName: string,
  amountCents: number,
): Array<{
  quantity: number;
  price_data: {
    currency: 'brl';
    unit_amount: number;
    product_data: { name: string };
  };
}> {
  return [
    {
      quantity: 1,
      price_data: {
        currency: 'brl',
        unit_amount: amountCents,
        product_data: { name: productName },
      },
    },
  ];
}

/**
 * Build the metadata attached to the Stripe PaymentIntent (subset of the
 * session metadata — excludes catalog identifiers / phone).
 */
export function buildStripePaymentIntentMetadata(
  workspaceId: string,
  saleId: string,
): Record<string, string> {
  return {
    workspace_id: workspaceId,
    workspaceId,
    kloel_order_id: saleId,
    orderId: saleId,
    saleId,
    payment_method: 'CREDIT_CARD',
    sourceCapability: 'sales.create_card_link',
  };
}

/**
 * Structural shape of the `checkout.sessions.create` first positional arg used
 * by {@link SalesService.createStripeCardLink}. Kept structural to avoid a
 * direct dependency on the Stripe SDK type from this pure helpers module —
 * the service still passes the result to a fully-typed Stripe client method,
 * so TS catches drift at the call site.
 */
export interface StripeCheckoutSessionInput {
  mode: 'payment';
  payment_method_types: ['card'];
  customer_email: string;
  line_items: ReturnType<typeof buildStripeCheckoutLineItems>;
  success_url: string;
  cancel_url: string;
  metadata: Record<string, string>;
  payment_intent_data: { metadata: Record<string, string> };
}

export interface BuildStripeCheckoutSessionInputArgs {
  workspaceId: string;
  saleId: string;
  productId: string;
  planId: string;
  productName: string;
  buyerEmail: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  phone?: string;
}

/**
 * Assemble the full `checkout.sessions.create` first arg from the per-call
 * primitives. Composes {@link buildStripeCheckoutLineItems},
 * {@link buildStripeSessionMetadata} and
 * {@link buildStripePaymentIntentMetadata} so the service body stops carrying
 * a 22-line literal object.
 */
export function buildStripeCheckoutSessionInput(
  args: BuildStripeCheckoutSessionInputArgs,
): StripeCheckoutSessionInput {
  return {
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: args.buyerEmail,
    line_items: buildStripeCheckoutLineItems(args.productName, args.amountCents),
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    metadata: buildStripeSessionMetadata({
      workspaceId: args.workspaceId,
      saleId: args.saleId,
      productId: args.productId,
      planId: args.planId,
      productName: args.productName,
      ...(args.phone ? { phone: args.phone } : {}),
    }),
    payment_intent_data: {
      metadata: buildStripePaymentIntentMetadata(args.workspaceId, args.saleId),
    },
  };
}

export interface StripeCardLinkResultInput {
  saleId: string;
  checkoutSessionId: string;
  checkoutUrl: string;
  externalPaymentId: string;
}

/**
 * Build the {@link CreateStripeCardLinkResult} returned to the chat surface.
 * Pure passthrough — the helper exists to keep the three result-builder
 * functions symmetric and to give the spec suite a single import surface for
 * exercising the shape.
 */
export function buildStripeCardLinkResult(input: StripeCardLinkResultInput): {
  saleId: string;
  checkoutSessionId: string;
  checkoutUrl: string;
  externalPaymentId: string;
} {
  return {
    saleId: input.saleId,
    checkoutSessionId: input.checkoutSessionId,
    checkoutUrl: input.checkoutUrl,
    externalPaymentId: input.externalPaymentId,
  };
}
