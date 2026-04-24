import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';

interface OrderMetadataParams {
  checkoutCode: string | null | undefined;
  capturedLeadId: string | null | undefined;
  correlationId: string;
  deviceFingerprint: string | null | undefined;
  qualityGate: {
    documentDigits: string;
    phoneDigits: string;
    payerAddress: Record<string, unknown> | null;
  };
  customerRegistrationDate: string | null | undefined;
  normalizedOrderQuantity: number;
  planQuantity: number | null | undefined;
  clientTotals: {
    subtotalInCents: number | string | undefined;
    discountInCents: number | string | undefined;
    bumpTotalInCents: number | string | undefined;
    totalInCents: number | string | undefined;
  };
  lineItems: unknown;
  affiliateLink: {
    id: string;
    code: string;
    affiliateWorkspaceId: string;
    affiliateCommissionPct: number;
    affiliateCommissionInCents: number;
  } | null;
  marketplacePricing: {
    baseTotalInCents: number;
    chargedTotalInCents: number;
    installmentInterestMonthlyPercent: number;
    installmentInterestInCents: number;
    gatewayFeePercent: number;
    estimatedGatewayFeeInCents: number;
    marketplaceFeePercent: number;
    marketplaceFeeInCents: number;
    marketplaceGrossRevenueInCents: number;
    marketplaceNetRevenueInCents: number;
    marketplaceRetainedInCents: number;
    sellerReceivableInCents: number;
  };
  producerNetInCents: number;
}

/** Build the JSON metadata blob stored on a CheckoutOrder row. */
export function buildCheckoutOrderMetadata(p: OrderMetadataParams) {
  return toPrismaJsonValue({
    checkoutCode: p.checkoutCode || null,
    capturedLeadId: p.capturedLeadId || null,
    correlationId: p.correlationId,
    deviceFingerprint: p.deviceFingerprint || null,
    qualityGateVersion: 'stripe_checkout_v1',
    customerDocumentDigits: p.qualityGate.documentDigits,
    customerPhoneDigits: p.qualityGate.phoneDigits,
    customerRegistrationDate: p.customerRegistrationDate,
    payerAddress: p.qualityGate.payerAddress,
    pricingVersion: 'server_reconciled_v2',
    orderQuantity: p.normalizedOrderQuantity,
    productUnitsPerPlan: Math.max(1, Math.round(Number(p.planQuantity || 1))),
    subtotalClientInCents: Math.max(0, Math.round(Number(p.clientTotals.subtotalInCents || 0))),
    discountClientInCents: Math.max(0, Math.round(Number(p.clientTotals.discountInCents || 0))),
    bumpTotalClientInCents: Math.max(0, Math.round(Number(p.clientTotals.bumpTotalInCents || 0))),
    totalClientInCents: Math.max(0, Math.round(Number(p.clientTotals.totalInCents || 0))),
    lineItems: p.lineItems,
    affiliateLinkId: p.affiliateLink?.id || null,
    affiliateCode: p.affiliateLink?.code || null,
    affiliateWorkspaceId: p.affiliateLink?.affiliateWorkspaceId || null,
    affiliateCommissionPct: p.affiliateLink?.affiliateCommissionPct || null,
    affiliateCommissionInCents: p.affiliateLink?.affiliateCommissionInCents ?? 0,
    baseTotalInCents: p.marketplacePricing.baseTotalInCents,
    chargedTotalInCents: p.marketplacePricing.chargedTotalInCents,
    installmentInterestMonthlyPercent: p.marketplacePricing.installmentInterestMonthlyPercent,
    installmentInterestInCents: p.marketplacePricing.installmentInterestInCents,
    estimatedGatewayFeePercent: p.marketplacePricing.gatewayFeePercent,
    estimatedGatewayFeeInCents: p.marketplacePricing.estimatedGatewayFeeInCents,
    marketplaceFeePercent: p.marketplacePricing.marketplaceFeePercent,
    marketplaceFeeInCents: p.marketplacePricing.marketplaceFeeInCents,
    marketplaceGrossRevenueInCents: p.marketplacePricing.marketplaceGrossRevenueInCents,
    marketplaceNetRevenueInCents: p.marketplacePricing.marketplaceNetRevenueInCents,
    marketplaceRetainedInCents: p.marketplacePricing.marketplaceRetainedInCents,
    sellerReceivableInCents: p.marketplacePricing.sellerReceivableInCents,
    producerNetInCents: p.producerNetInCents,
    payoutStrategy: p.affiliateLink
      ? 'marketplace_fee_plus_affiliate_reconciliation'
      : 'marketplace_fee',
  });
}
