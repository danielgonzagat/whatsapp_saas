import type { StripeClient, StripePaymentIntent } from '../../billing/stripe-types';
import type {
  PercentRoleInput,
  SplitInput,
  SplitOutput,
  SupplierInput,
} from '../split/split.types';

type StripePaymentIntentCreateParams = Parameters<StripeClient['paymentIntents']['create']>[0];

/** Create sale charge input shape. */
export interface CreateSaleChargeInput {
  /** Workspace owning the sale (used for audit + idempotency). */
  workspaceId: string;
  /**
   * Seller destination connected account id used later by the marketplace
   * settlement flow when seller funds are transferred and/or paid out.
   */
  sellerStripeAccountId: string;
  /** Buyer-facing amount (cents). What the buyer is charged. */
  buyerPaidCents: bigint;
  /** À vista sale price (cents). Used as base for commission percentages. */
  saleValueCents: bigint;
  /** Interest portion (cents) attributable to installments. Goes to Kloel. */
  interestCents: bigint;
  /** Marketplace fee bucket (cents) retained by Kloel. */
  platformFeeCents: bigint;
  /** Currency code (lowercase iso 4217, e.g. 'brl'). */
  currency: string;
  /** Idempotency key — typically the kloel-side order id. */
  idempotencyKey: string;
  /** Buyer email used for receipts (optional). */
  buyerEmail?: string;
  /** Optional: arbitrary metadata that should travel with the PaymentIntent. */
  metadata?: Record<string, string>;
  /** Stakeholder splits resolved by the caller (kloel-side product setup). */
  splitConfig?: {
    supplier?: SupplierInput;
    affiliate?: PercentRoleInput;
    coproducer?: PercentRoleInput;
    manager?: PercentRoleInput;
  };
  /** Optional server-side confirmation for payment methods like Pix. */
  confirm?: boolean;
  /** Optional payment_method_data forwarded to PaymentIntent create. */
  paymentMethodData?: StripePaymentIntentCreateParams['payment_method_data'];
  /** Optional payment method options forwarded to PaymentIntent create. */
  paymentMethodOptions?: StripePaymentIntentCreateParams['payment_method_options'];
  /**
   * Optional: payment_method_types override. Defaults to ['card', 'boleto'].
   * Add 'pix' once Stripe BR enables PIX capability for the platform.
   */
  paymentMethodTypes?: Array<'card' | 'boleto' | 'pix'>;
}

/** Create sale charge result shape. */
export interface CreateSaleChargeResult {
  /** Payment intent id property. */
  paymentIntentId: string;
  /** Client secret property. */
  clientSecret: string | null;
  /** Amount actually sent to Stripe. */
  amountCents: bigint;
  /** Fee + interest retained by Kloel inside the marketplace settlement flow. */
  marketplaceRetainedCents: bigint;
  /** transfer_group used by the marketplace post-payment transfer fan-out path. */
  transferGroup: string;
  /** SplitEngine output for downstream LedgerService.creditPending fan-out. */
  split: SplitOutput;
  /** SplitEngine input snapshot (post-validation). Persisted for audit. */
  splitInput: SplitInput;
  /** Raw PaymentIntent returned by Stripe after create/confirm. */
  stripePaymentIntent: StripePaymentIntent;
}
