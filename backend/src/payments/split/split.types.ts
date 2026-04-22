/**
 * Pure types for the SplitEngine. No runtime imports — kept dependency-free
 * so the engine can be tested in isolation and reused outside NestJS context.
 *
 * Contract (from ADR 0003):
 * - All monetary values are `bigint` cents. Never `number`. Stripe rejects
 *   splits with float-rounding errors.
 * - Percentages are basis points (1/100 of a percent), so 40% = 4000 bp.
 *   This avoids float arithmetic on percentages too.
 * - Priority order: Kloel > Fornecedor > Afiliado > Coprodutor > Gerente > Seller.
 *   Affiliate is capped at the remaining amount but is paid before residual
 *   roles, so it is the last role guaranteed to never be zero (after Kloel
 *   and Fornecedor). Coprodutor, Gerente and Seller may be zero.
 */

export type CentsBigInt = bigint;

/** Split role type. */
export type SplitRole = 'supplier' | 'affiliate' | 'coproducer' | 'manager' | 'seller';

/** Split input shape. */
export interface SplitInput {
  /** Total the buyer paid, including marketplace fee and interest charges. */
  buyerPaidCents: CentsBigInt;
  /** Sticker price (à vista) of the sale. Used as base for commissionBase. */
  saleValueCents: CentsBigInt;
  /** Interest portion attributable to installments (Kloel charge). */
  interestCents: CentsBigInt;
  /** Marketplace fee (Kloel) computed off-engine (typically 9.9% of saleValue). */
  marketplaceFeeCents: CentsBigInt;

  /** Optional fixed-amount supplier (paid right after Kloel). */
  supplier?: SupplierInput;
  /** Optional affiliate. Capped at remaining; never zero unless remaining is zero. */
  affiliate?: PercentRoleInput;
  /** Optional coproducer. May be zero if remaining is exhausted. */
  coproducer?: PercentRoleInput;
  /** Optional manager. May be zero if remaining is exhausted. */
  manager?: PercentRoleInput;
  /** The seller is mandatory and absorbs whatever residue remains. */
  seller: SellerInput;
}

/** Supplier input shape. */
export interface SupplierInput {
  /** Account id property. */
  accountId: string;
  /** Amount cents property. */
  amountCents: CentsBigInt;
}

/** Percent role input shape. */
export interface PercentRoleInput {
  /** Account id property. */
  accountId: string;
  /** Basis points: 4000 = 40%. Range: [0, 10000]. */
  percentBp: number;
}

/** Seller input shape. */
export interface SellerInput {
  /** Account id property. */
  accountId: string;
}

/** Split line shape. */
export interface SplitLine {
  /** Account id property. */
  accountId: string;
  /** Role property. */
  role: SplitRole;
  /** Amount cents property. */
  amountCents: CentsBigInt;
}

/** Split output shape. */
export interface SplitOutput {
  /** Sum of marketplace fee + interest. Always Kloel's first cut. */
  kloelTotalCents: CentsBigInt;
  /** Per-stakeholder breakdown. Empty if everything went to Kloel + residue. */
  splits: SplitLine[];
  /**
   * Rounding/clamping residue that goes to Kloel on top of `kloelTotalCents`.
   * Per ADR 0003 industry practice, the marketplace operator absorbs sub-cent leftovers.
   */
  residueCents: CentsBigInt;
}
