import { encryptCheckoutPixelToken } from './checkout-pixel-crypto';
import { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';

describe('CheckoutPostPaymentEffectsService', () => {
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    if (typeof originalEncryptionKey === 'string') {
      process.env.ENCRYPTION_KEY = originalEncryptionKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  it('decrypts encrypted Facebook pixel tokens before sending purchase events', async () => {
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

    const facebookCAPI = {
      sendEvent: jest.fn().mockResolvedValue(undefined),
    };
    const checkoutSocialLeadService = {
      markConvertedFromOrder: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CheckoutPostPaymentEffectsService(
      facebookCAPI as any,
      checkoutSocialLeadService as any,
    );

    await service.sendPurchaseSignals(
      {
        id: 'order_1',
        customerEmail: 'comprador@kloel.com',
        customerPhone: '+5511999999999',
        totalInCents: 19900,
        plan: {
          productId: 'prod_1',
          checkoutConfig: {
            pixels: [
              {
                type: 'FACEBOOK',
                isActive: true,
                trackPurchase: true,
                pixelId: '1234567890',
                accessToken: encryptCheckoutPixelToken('secret-pixel-token'),
              },
            ],
          },
        },
      },
      199,
    );

    expect(facebookCAPI.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelId: '1234567890',
        accessToken: 'secret-pixel-token',
        eventName: 'Purchase',
      }),
    );
  });
});
