import type {
  PercentRoleInput,
  SplitInput,
  SplitOutput,
  SupplierInput,
} from '../split/split.types';

export interface CreateSaleChargeInput {
  /** Workspace owning the sale (used for audit + idempotency). */
  workspaceId: string;
  /** Stripe Connected Account id of the seller — receives the Direct Charge. */
  sellerStripeAccountId: string;
  /** Buyer-facing amount (cents). What the buyer is charged. */
  buyerPaidCents: bigint;
  /** À vista sale price (cents). Used as base for commission percentages. */
  saleValueCents: bigint;
  /** Interest portion (cents) attributable to installments. Goes to Kloel. */
  interestCents: bigint;
  /** Platform fee (cents). Goes to Kloel via application_fee_amount. */
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
  /**
   * Optional: payment_method_types override. Defaults to ['card', 'boleto'].
   * Add 'pix' once Stripe BR enables PIX capability for the platform.
   */
  paymentMethodTypes?: Array<'card' | 'boleto' | 'pix'>;
}

export interface CreateSaleChargeResult {
  paymentIntentId: string;
  clientSecret: string | null;
  /** Amount actually sent to Stripe. */
  amountCents: bigint;
  /** application_fee_amount sent to Stripe (Kloel cut). */
  applicationFeeCents: bigint;
  /** transfer_group set on the PaymentIntent — used to associate downstream transfers. */
  transferGroup: string;
  /** SplitEngine output for downstream LedgerService.creditPending fan-out. */
  split: SplitOutput;
  /** SplitEngine input snapshot (post-validation). Persisted for audit. */
  splitInput: SplitInput;
}
