/** Checkout marketplace payment method type. */
export type CheckoutMarketplacePaymentMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO';

/** Checkout marketplace pricing input type. */
export type CheckoutMarketplacePricingInput = {
  baseTotalInCents: number;
  paymentMethod: CheckoutMarketplacePaymentMethod;
  installments?: number;
  marketplaceFeePercent: number;
  installmentInterestMonthlyPercent: number;
  gatewayFeePercent: number;
};

/** Checkout marketplace pricing summary type. */
export type CheckoutMarketplacePricingSummary = {
  baseTotalInCents: number;
  chargedTotalInCents: number;
  installments: number;
  marketplaceFeePercent: number;
  marketplaceFeeInCents: number;
  installmentInterestMonthlyPercent: number;
  installmentInterestInCents: number;
  gatewayFeePercent: number;
  estimatedGatewayFeeInCents: number;
  marketplaceGrossRevenueInCents: number;
  marketplaceNetRevenueInCents: number;
  marketplaceRetainedInCents: number;
  sellerReceivableInCents: number;
};

function normalizePercent(value: number, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeCents(value: number) {
  return Math.max(0, Math.round(Number(value || 0)));
}

/** Build checkout marketplace pricing. */
export function buildCheckoutMarketplacePricing(
  input: CheckoutMarketplacePricingInput,
): CheckoutMarketplacePricingSummary {
  const baseTotalInCents = normalizeCents(input.baseTotalInCents);
  const paymentMethod = input.paymentMethod;
  const installments =
    paymentMethod === 'CREDIT_CARD' ? Math.max(1, Math.round(input.installments || 1)) : 1;
  const marketplaceFeePercent = normalizePercent(input.marketplaceFeePercent);
  const installmentInterestMonthlyPercent = normalizePercent(
    input.installmentInterestMonthlyPercent,
  );
  const gatewayFeePercent = normalizePercent(input.gatewayFeePercent);

  const installmentInterestInCents =
    paymentMethod === 'CREDIT_CARD' && installments > 1
      ? Math.round(
          baseTotalInCents * ((installmentInterestMonthlyPercent / 100) * (installments - 1)),
        )
      : 0;

  const chargedTotalInCents = baseTotalInCents + installmentInterestInCents;
  const marketplaceFeeInCents = Math.round(baseTotalInCents * (marketplaceFeePercent / 100));
  const estimatedGatewayFeeInCents = Math.round(chargedTotalInCents * (gatewayFeePercent / 100));
  const marketplaceGrossRevenueInCents = marketplaceFeeInCents + installmentInterestInCents;
  const marketplaceNetRevenueInCents = Math.max(
    0,
    marketplaceGrossRevenueInCents - estimatedGatewayFeeInCents,
  );
  const marketplaceRetainedInCents = Math.min(chargedTotalInCents, marketplaceNetRevenueInCents);
  const sellerReceivableInCents = Math.max(0, baseTotalInCents - marketplaceFeeInCents);

  return {
    baseTotalInCents,
    chargedTotalInCents,
    installments,
    marketplaceFeePercent,
    marketplaceFeeInCents,
    installmentInterestMonthlyPercent,
    installmentInterestInCents,
    gatewayFeePercent,
    estimatedGatewayFeeInCents,
    marketplaceGrossRevenueInCents,
    marketplaceNetRevenueInCents,
    marketplaceRetainedInCents,
    sellerReceivableInCents,
  };
}
