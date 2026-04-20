/** Checkout marketplace payment method type. */
export type CheckoutMarketplacePaymentMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO';

/** Checkout marketplace pricing input type. */
export type CheckoutMarketplacePricingInput = {
  baseTotalInCents: number;
  paymentMethod: CheckoutMarketplacePaymentMethod;
  installments?: number;
  platformFeePercent: number;
  installmentInterestMonthlyPercent: number;
  gatewayFeePercent: number;
};

/** Checkout marketplace pricing summary type. */
export type CheckoutMarketplacePricingSummary = {
  baseTotalInCents: number;
  chargedTotalInCents: number;
  installments: number;
  platformFeePercent: number;
  platformFeeInCents: number;
  installmentInterestMonthlyPercent: number;
  installmentInterestInCents: number;
  gatewayFeePercent: number;
  estimatedGatewayFeeInCents: number;
  platformGrossRevenueInCents: number;
  platformNetRevenueInCents: number;
  marketplaceFeeInCents: number;
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
  const platformFeePercent = normalizePercent(input.platformFeePercent);
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
  const platformFeeInCents = Math.round(baseTotalInCents * (platformFeePercent / 100));
  const estimatedGatewayFeeInCents = Math.round(chargedTotalInCents * (gatewayFeePercent / 100));
  const platformGrossRevenueInCents = platformFeeInCents + installmentInterestInCents;
  const platformNetRevenueInCents = Math.max(
    0,
    platformGrossRevenueInCents - estimatedGatewayFeeInCents,
  );
  const marketplaceFeeInCents = Math.min(chargedTotalInCents, platformNetRevenueInCents);
  const sellerReceivableInCents = Math.max(0, baseTotalInCents - platformFeeInCents);

  return {
    baseTotalInCents,
    chargedTotalInCents,
    installments,
    platformFeePercent,
    platformFeeInCents,
    installmentInterestMonthlyPercent,
    installmentInterestInCents,
    gatewayFeePercent,
    estimatedGatewayFeeInCents,
    platformGrossRevenueInCents,
    platformNetRevenueInCents,
    marketplaceFeeInCents,
    sellerReceivableInCents,
  };
}
