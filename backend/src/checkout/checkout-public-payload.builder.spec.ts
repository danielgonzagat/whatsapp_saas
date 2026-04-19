import { CheckoutPublicPayloadBuilder } from './checkout-public-payload.builder';

describe('CheckoutPublicPayloadBuilder', () => {
  let prisma: any;
  let builder: CheckoutPublicPayloadBuilder;
  const originalStripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  beforeEach(() => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ws_1',
          name: 'Workspace Teste',
          customDomain: null,
          branding: null,
          fiscalData: null,
        }),
      },
      connectAccountBalance: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cab_1',
          stripeAccountId: 'acct_123',
        }),
      },
    };

    builder = new CheckoutPublicPayloadBuilder(prisma);
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_checkout';
  });

  afterEach(() => {
    if (typeof originalStripePublishableKey === 'string') {
      process.env.STRIPE_PUBLISHABLE_KEY = originalStripePublishableKey;
    } else {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
    }
  });

  it('omits pixel access tokens from the public checkout payload', async () => {
    const result = await builder.build(
      {
        id: 'plan_1',
        name: 'Plano Premium',
        slug: 'plano-premium',
        referenceCode: 'MPX9Q2Z7',
        priceInCents: 19900,
        product: {
          id: 'prod_1',
          name: 'Produto',
          workspaceId: 'ws_1',
        },
        checkoutConfig: {
          theme: 'NOIR',
          pixels: [
            {
              id: 'pixel_1',
              type: 'FACEBOOK',
              pixelId: '1234567890',
              accessToken: 'secret-pixel-token',
              trackPageView: true,
              trackInitiateCheckout: true,
              trackAddPaymentInfo: true,
              trackPurchase: true,
              isActive: true,
            },
          ],
        },
      },
      {},
    );

    expect(result.checkoutConfig).toEqual(
      expect.objectContaining({
        pixels: [
          expect.objectContaining({
            id: 'pixel_1',
            pixelId: '1234567890',
            type: 'FACEBOOK',
          }),
        ],
      }),
    );
    expect(result.checkoutConfig?.pixels?.[0]).not.toHaveProperty('accessToken');
  });
});
