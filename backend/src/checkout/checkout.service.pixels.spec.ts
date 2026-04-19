import { decryptCheckoutPixelToken } from './checkout-pixel-crypto';
import { CheckoutService } from './checkout.service';

describe('CheckoutService pixels', () => {
  let prisma: any;
  let service: CheckoutService;
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    prisma = {
      checkoutPixel: {
        create: jest.fn().mockResolvedValue({ id: 'pixel_1' }),
        update: jest.fn().mockResolvedValue({ id: 'pixel_1' }),
      },
      checkoutConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cfg_1',
          pixels: [
            {
              id: 'pixel_1',
              type: 'FACEBOOK',
              pixelId: '1234567890',
              accessToken: 'encrypted-token-placeholder',
              trackPageView: true,
              trackInitiateCheckout: true,
              trackAddPaymentInfo: true,
              trackPurchase: true,
              isActive: true,
            },
          ],
          plan: {
            id: 'plan_1',
            kind: 'PLAN',
            referenceCode: 'MPX9Q2Z7',
            slug: 'checkout-premium',
            checkoutLinks: [],
          },
        }),
      },
      $transaction: jest.fn(),
    };

    service = new CheckoutService(prisma, { processPayment: jest.fn() } as any, {} as any);
    (service as any).planLinkManager.ensurePlanReferenceCode = jest.fn().mockImplementation((plan) => plan);
  });

  afterEach(() => {
    if (typeof originalEncryptionKey === 'string') {
      process.env.ENCRYPTION_KEY = originalEncryptionKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  it('encrypts access tokens before persisting new pixels', async () => {
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

    await service.createPixel('cfg_1', {
      type: 'FACEBOOK',
      pixelId: '1234567890',
      accessToken: 'secret-pixel-token',
    });

    expect(prisma.checkoutPixel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pixelId: '1234567890',
        }),
      }),
    );
    const persistedToken = prisma.checkoutPixel.create.mock.calls[0][0].data.accessToken;
    expect(persistedToken).not.toBe('secret-pixel-token');
    expect(decryptCheckoutPixelToken(persistedToken)).toBe('secret-pixel-token');
  });

  it('does not overwrite an existing token when update payload sends an empty access token', async () => {
    await service.updatePixel('pixel_1', {
      pixelId: 'updated-pixel',
      accessToken: '',
    });

    expect(prisma.checkoutPixel.update).toHaveBeenCalledWith({
      where: { id: 'pixel_1' },
      data: {
        pixelId: 'updated-pixel',
      },
    });
  });
});
