export type CheckoutPaymentCreateArgs = {
  data: Record<string, unknown>;
};

export type CheckoutPaymentTxClient = {
  checkoutPayment: {
    create: jest.Mock<Promise<Record<string, unknown>>, [CheckoutPaymentCreateArgs]>;
  };
  checkoutOrder: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
};

export type CheckoutPaymentTxCallback = (tx: CheckoutPaymentTxClient) => Promise<unknown>;

export type CheckoutPaymentPrismaMock = {
  checkoutOrder: {
    findFirst: jest.Mock;
  };
  checkoutPayment: {
    create: jest.Mock;
  };
  connectAccountBalance: {
    findFirst: jest.Mock;
  };
  workspace: {
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
};

export function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 'KLOEL-001',
    workspaceId: 'ws-1',
    status: 'PENDING',
    totalInCents: 10_000,
    metadata: {
      baseTotalInCents: 10_000,
      chargedTotalInCents: 13_990,
      marketplaceRetainedInCents: 4_980,
      marketplaceFeeInCents: 990,
      installmentInterestInCents: 3_990,
    },
    shippingAddress: {
      cep: '01310-100',
      street: 'Av Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    },
    shippingPrice: 0,
    ipAddress: '127.0.0.1',
    plan: {
      id: 'plan-1',
      name: 'Plano Principal',
      product: {
        id: 'prod-1',
        name: 'Produto X',
        description: 'Descrição X',
        imageUrl: null,
        images: [],
      },
    },
    ...overrides,
  };
}

export function makeChargeResult(overrides: Record<string, unknown> = {}) {
  return {
    paymentIntentId: 'pi_test_123',
    clientSecret: 'pi_test_123_secret',
    stripePaymentIntent: {
      id: 'pi_test_123',
      status: 'requires_payment_method',
      next_action: null,
    },
    amountCents: 13_990n,
    marketplaceRetainedCents: 4_980n,
    transferGroup: 'sale:order-1',
    split: {
      kloelTotalCents: 4_980n,
      residueCents: 9_010n,
      splits: [{ role: 'seller', accountId: 'acct_seller_1', amountCents: 9_010n }],
    },
    splitInput: {
      buyerPaidCents: 13_990n,
      saleValueCents: 10_000n,
      interestCents: 3_990n,
      marketplaceFeeCents: 990n,
      seller: { accountId: 'acct_seller_1' },
    },
    ...overrides,
  };
}
