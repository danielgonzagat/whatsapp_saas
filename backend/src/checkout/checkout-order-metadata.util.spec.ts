import { buildCheckoutOrderMetadata } from './checkout-order-metadata.util';

describe('buildCheckoutOrderMetadata', () => {
  const baseParams: Parameters<typeof buildCheckoutOrderMetadata>[0] = {
    checkoutCode: 'KO-ABC123',
    capturedLeadId: 'lead-001',
    correlationId: 'corr-xyz',
    deviceFingerprint: 'fp-123',
    qualityGate: {
      documentDigits: '123',
      phoneDigits: '4567',
      payerAddress: { street: 'Rua A', city: 'SP' },
    },
    customerRegistrationDate: '2025-01-15',
    normalizedOrderQuantity: 2,
    planQuantity: 3,
    clientTotals: {
      subtotalInCents: 10000,
      discountInCents: 500,
      bumpTotalInCents: 2000,
      totalInCents: 11500,
    },
    lineItems: [{ name: 'Product A', price: 50 }],
    affiliateLink: {
      id: 'aff-1',
      code: 'PROMO10',
      affiliateWorkspaceId: 'ws-aff',
      affiliateCommissionPct: 10,
      affiliateCommissionInCents: 1150,
    },
    marketplacePricing: {
      baseTotalInCents: 11500,
      chargedTotalInCents: 11500,
      installmentInterestMonthlyPercent: 1.5,
      installmentInterestInCents: 0,
      gatewayFeePercent: 3.99,
      estimatedGatewayFeeInCents: 458,
      marketplaceFeePercent: 10,
      marketplaceFeeInCents: 1150,
      marketplaceGrossRevenueInCents: 11500,
      marketplaceNetRevenueInCents: 9892,
      marketplaceRetainedInCents: 9892,
      sellerReceivableInCents: 8742,
    },
    producerNetInCents: 8742,
  };

  function m(result: ReturnType<typeof buildCheckoutOrderMetadata>) {
    return Object(result);
  }

  it('builds metadata with all fields populated', () => {
    const r = m(buildCheckoutOrderMetadata(baseParams));
    expect(r.checkoutCode).toBe('KO-ABC123');
    expect(r.payoutStrategy).toBe('marketplace_fee_plus_affiliate_reconciliation');
  });

  it('handles null optional fields', () => {
    const r = m(
      buildCheckoutOrderMetadata({ ...baseParams, checkoutCode: undefined, capturedLeadId: null }),
    );
    expect(r.checkoutCode).toBeNull();
    expect(r.capturedLeadId).toBeNull();
  });

  it('clamps negative totals to 0', () => {
    const r = m(
      buildCheckoutOrderMetadata({
        ...baseParams,
        clientTotals: {
          subtotalInCents: -100,
          discountInCents: -50,
          bumpTotalInCents: undefined,
          totalInCents: 0,
        },
      }),
    );
    expect(r.subtotalClientInCents).toBe(0);
    expect(r.discountClientInCents).toBe(0);
  });

  it('uses marketplace_fee when no affiliate', () => {
    const r = m(buildCheckoutOrderMetadata({ ...baseParams, affiliateLink: null }));
    expect(r.payoutStrategy).toBe('marketplace_fee');
    expect(r.affiliateCommissionInCents).toBe(0);
  });
});
