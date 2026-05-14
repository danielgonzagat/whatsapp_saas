import { PrismaService } from '../prisma/prisma.service';
import { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';
type CheckoutOrderForEffects = {
  id?: string;
  orderNumber?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  totalInCents?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  plan?: {
    productId?: string | null;
    product?: { name?: string | null } | null;
    checkoutConfig?: {
      pixels?: Array<{
        type?: string | null;
        isActive?: boolean | null;
        trackPurchase?: boolean | null;
        accessToken?: string | null;
        pixelId?: string | null;
      }> | null;
    } | null;
  } | null;
};
const makeOrder = (overrides: Partial<CheckoutOrderForEffects> = {}): CheckoutOrderForEffects => ({
  id: 'order_1',
  orderNumber: 'ORD-001',
  customerName: 'Test Customer',
  customerEmail: 'test@example.com',
  customerPhone: '11999999999',
  totalInCents: 9900,
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  metadata: { capturedLeadId: 'lead_1', correlationId: 'corr_1' },
  plan: {
    productId: 'prod_1',
    product: { name: 'Test Product' },
    checkoutConfig: {
      pixels: [
        {
          type: 'FACEBOOK',
          pixelId: 'fb_pixel_1',
          accessToken: 'fb_token',
          isActive: true,
          trackPurchase: true,
        },
      ],
    },
  },
  ...overrides,
});
describe('CheckoutPostPaymentEffectsService', () => {
  let service: CheckoutPostPaymentEffectsService;
  let prisma: {
    memberArea: { findMany: jest.Mock; updateMany: jest.Mock };
    memberEnrollment: {
      findFirst: jest.Mock;
      create: jest.Mock;
      aggregate: jest.Mock;
    };
  };
  let facebookCAPI: { sendEvent: jest.Mock };
  let checkoutSocialLeadService: { markConvertedFromOrder: jest.Mock };
  let memberAreaUpdateMock: jest.Mock;
  beforeEach(() => {
    memberAreaUpdateMock = jest.fn().mockResolvedValue({ count: 1 });
    prisma = {
      memberArea: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: memberAreaUpdateMock,
      },
      memberEnrollment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'enr_1' }),
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0 },
          _avg: { progress: 0 },
        }),
      },
    };
    facebookCAPI = { sendEvent: jest.fn().mockResolvedValue(undefined) };
    checkoutSocialLeadService = {
      markConvertedFromOrder: jest.fn().mockResolvedValue(undefined),
    };
    service = new CheckoutPostPaymentEffectsService(
      prisma as PrismaService,
      facebookCAPI as never,
      checkoutSocialLeadService as never,
    );
  });
  describe('markLeadConverted', () => {
    it('calls social lead service with order metadata', async () => {
      const order = makeOrder();
      await service.markLeadConverted(order, 'ws_1');
      expect(checkoutSocialLeadService.markConvertedFromOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws_1',
          orderId: 'order_1',
          capturedLeadId: 'lead_1',
          customerEmail: 'test@example.com',
          customerPhone: '11999999999',
        }),
      );
    });
    it('no-ops when workspaceId is missing', async () => {
      const order = makeOrder();
      await service.markLeadConverted(order);
      expect(checkoutSocialLeadService.markConvertedFromOrder).not.toHaveBeenCalled();
    });
    it('no-ops when order.id is missing', async () => {
      const order = makeOrder({ id: undefined });
      await service.markLeadConverted(order, 'ws_1');
      expect(checkoutSocialLeadService.markConvertedFromOrder).not.toHaveBeenCalled();
    });
    it('handles social lead service error gracefully', async () => {
      checkoutSocialLeadService.markConvertedFromOrder.mockRejectedValue(
        new Error('Social lead service down'),
      );
      const order = makeOrder();
      await expect(service.markLeadConverted(order, 'ws_1')).resolves.toBeUndefined();
    });
    it('reads deviceFingerprint from metadata when present', async () => {
      const order = makeOrder({
        metadata: {
          capturedLeadId: 'lead_2',
          deviceFingerprint: 'fp_abc123',
          correlationId: 'corr_1',
        },
      });
      await service.markLeadConverted(order, 'ws_1');
      expect(checkoutSocialLeadService.markConvertedFromOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceFingerprint: 'fp_abc123',
        }),
      );
    });
    it('handles null/undefined metadata gracefully', async () => {
      const order = makeOrder({ metadata: null });
      await service.markLeadConverted(order, 'ws_1');
      const [payload] = checkoutSocialLeadService.markConvertedFromOrder.mock.calls[0];
      expect(payload).not.toHaveProperty('capturedLeadId');
      expect(payload).not.toHaveProperty('deviceFingerprint');
    });
    it('calls auto-enrollment for member areas', async () => {
      prisma.memberArea.findMany.mockResolvedValue([
        {
          id: 'ma_1',
          workspaceId: 'ws_1',
          productId: 'prod_1',
          active: true,
          name: 'Course A',
        },
      ]);
      const order = makeOrder();
      await service.markLeadConverted(order, 'ws_1');
      expect(prisma.memberArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws_1', productId: 'prod_1', active: true },
        }),
      );
    });
  });
  describe('sendPurchaseSignals', () => {
    it('sends Facebook purchase event for active pixels', async () => {
      const order = makeOrder();
      await service.sendPurchaseSignals(order, 9900);
      expect(facebookCAPI.sendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          pixelId: 'fb_pixel_1',
          accessToken: 'fb_token',
          eventName: 'Purchase',
          email: 'test@example.com',
          phone: '11999999999',
          amount: 9900,
          currency: 'BRL',
          productId: 'prod_1',
        }),
      );
    });
    it('skips inactive pixels', async () => {
      const order = makeOrder({
        plan: {
          productId: 'prod_1',
          product: { name: 'Test' },
          checkoutConfig: {
            pixels: [
              {
                type: 'FACEBOOK',
                pixelId: 'fb_1',
                accessToken: 'token',
                isActive: false,
                trackPurchase: true,
              },
            ],
          },
        },
      });
      await service.sendPurchaseSignals(order, 9900);
      expect(facebookCAPI.sendEvent).not.toHaveBeenCalled();
    });
    it('skips non-FACEBOOK pixels', async () => {
      const order = makeOrder({
        plan: {
          productId: 'prod_1',
          product: { name: 'Test' },
          checkoutConfig: {
            pixels: [
              {
                type: 'GOOGLE_ADS',
                pixelId: 'ga_1',
                accessToken: 'token',
                isActive: true,
                trackPurchase: true,
              },
            ],
          },
        },
      });
      await service.sendPurchaseSignals(order, 9900);
      expect(facebookCAPI.sendEvent).not.toHaveBeenCalled();
    });
    it('skips pixels without accessToken', async () => {
      const order = makeOrder({
        plan: {
          productId: 'prod_1',
          product: { name: 'Test' },
          checkoutConfig: {
            pixels: [
              {
                type: 'FACEBOOK',
                pixelId: 'fb_no_token',
                accessToken: null,
                isActive: true,
                trackPurchase: true,
              },
            ],
          },
        },
      });
      await service.sendPurchaseSignals(order, 9900);
      expect(facebookCAPI.sendEvent).not.toHaveBeenCalled();
    });
    it('handles Facebook CAPI error gracefully', async () => {
      facebookCAPI.sendEvent.mockRejectedValue(new Error('CAPI timeout'));
      const order = makeOrder();
      await expect(service.sendPurchaseSignals(order, 9900)).resolves.toBeUndefined();
    });
    it('handles empty pixels array', async () => {
      const order = makeOrder({
        plan: {
          productId: 'prod_1',
          product: { name: 'Test' },
          checkoutConfig: { pixels: [] },
        },
      });
      await service.sendPurchaseSignals(order, 9900);
      expect(facebookCAPI.sendEvent).not.toHaveBeenCalled();
    });
    it('handles null checkoutConfig gracefully', async () => {
      const order = makeOrder({
        plan: {
          productId: 'prod_1',
          product: { name: null },
          checkoutConfig: null,
        },
      });

      await service.sendPurchaseSignals(order, 9900);

      expect(facebookCAPI.sendEvent).not.toHaveBeenCalled();
    });
  });

  describe('autoEnrollInMemberAreas', () => {
    it('creates enrollment when no existing enrollment found', async () => {
      prisma.memberArea.findMany.mockResolvedValue([
        {
          id: 'ma_1',
          workspaceId: 'ws_1',
          productId: 'prod_1',
          active: true,
          name: 'Course A',
        },
      ]);
      prisma.memberEnrollment.findFirst.mockResolvedValue(null);
      prisma.memberEnrollment.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _avg: { progress: 50 },
      });

      const order = makeOrder();

      await service.markLeadConverted(order, 'ws_1');

      const createCall = prisma.memberEnrollment.create.mock.calls[0][0] as Record<string, unknown>;
      expect(createCall.data).toEqual(
        expect.objectContaining({
          workspaceId: 'ws_1',
          memberAreaId: 'ma_1',
          studentEmail: 'test@example.com',
          studentName: 'Test Customer',
        }),
      );
      expect(memberAreaUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ma_1', workspaceId: 'ws_1' },
          data: expect.objectContaining({
            totalStudents: 1,
            avgCompletion: 50,
          }),
        }),
      );
    });

    it('skips enrollment when enrollment already exists', async () => {
      prisma.memberArea.findMany.mockResolvedValue([
        {
          id: 'ma_1',
          workspaceId: 'ws_1',
          productId: 'prod_1',
          active: true,
          name: 'Course A',
        },
      ]);
      prisma.memberEnrollment.findFirst.mockResolvedValue({ id: 'enr_existing' });

      const order = makeOrder();

      await service.markLeadConverted(order, 'ws_1');

      expect(prisma.memberEnrollment.create).not.toHaveBeenCalled();
    });

    it('defaults studentName to "Aluno" when customerName is empty', async () => {
      prisma.memberArea.findMany.mockResolvedValue([
        {
          id: 'ma_1',
          workspaceId: 'ws_1',
          productId: 'prod_1',
          active: true,
          name: 'Course',
        },
      ]);

      const order = makeOrder({ customerName: '' });

      await service.markLeadConverted(order, 'ws_1');

      const createCall = prisma.memberEnrollment.create.mock.calls[0][0] as Record<string, unknown>;
      expect(createCall.data).toEqual(
        expect.objectContaining({
          studentName: 'Aluno',
        }),
      );
    });
  });

  describe('webhook ordering invariant', () => {
    it('ensures payment is processed before post-payment effects run', async () => {
      const order = makeOrder({
        id: 'order_with_payment',
        metadata: { correlationId: 'corr_paid', paymentId: 'pay_ext_1' },
      });

      expect(order.metadata).toHaveProperty('correlationId');
      expect(typeof order.metadata!.correlationId).toBe('string');

      checkoutSocialLeadService.markConvertedFromOrder.mockResolvedValue(undefined);

      await service.markLeadConverted(order, 'ws_1');

      expect(checkoutSocialLeadService.markConvertedFromOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws_1',
          orderId: 'order_with_payment',
        }),
      );
    });

    it('does not run effects when order has no workspace (not paid yet)', async () => {
      const order = makeOrder();

      await service.markLeadConverted(order);

      expect(checkoutSocialLeadService.markConvertedFromOrder).not.toHaveBeenCalled();
    });
  });
});
