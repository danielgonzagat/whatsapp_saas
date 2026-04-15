import { Test, TestingModule } from '@nestjs/testing';
import { IDEMPOTENCY_KEY } from '../common/idempotency.guard';
import { CheckoutPublicController } from './checkout-public.controller';
import { CreateOrderDto } from './dto/create-order.dto';
import { CheckoutService } from './checkout.service';
import { CheckoutSocialLeadService } from './checkout-social-lead.service';

describe('CheckoutPublicController', () => {
  let controller: CheckoutPublicController;
  let checkoutService: {
    getCheckoutByCode: jest.Mock;
    getCheckoutBySlug: jest.Mock;
    createOrder: jest.Mock;
    getRecentPaidOrders: jest.Mock;
    getOrderStatus: jest.Mock;
    acceptUpsell: jest.Mock;
    declineUpsell: jest.Mock;
    calculateShipping: jest.Mock;
    validateCoupon: jest.Mock;
  };
  let socialLeadService: {
    captureLead: jest.Mock;
    getLeadPrefill: jest.Mock;
    updateLead: jest.Mock;
  };

  beforeEach(async () => {
    checkoutService = {
      getCheckoutByCode: jest.fn(),
      getCheckoutBySlug: jest.fn(),
      createOrder: jest.fn(),
      getRecentPaidOrders: jest.fn(),
      getOrderStatus: jest.fn(),
      acceptUpsell: jest.fn(),
      declineUpsell: jest.fn(),
      calculateShipping: jest.fn(),
      validateCoupon: jest.fn(),
    };
    socialLeadService = {
      captureLead: jest.fn(),
      getLeadPrefill: jest.fn(),
      updateLead: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CheckoutPublicController],
      providers: [
        { provide: CheckoutService, useValue: checkoutService },
        { provide: CheckoutSocialLeadService, useValue: socialLeadService },
      ],
    }).compile();

    controller = moduleRef.get(CheckoutPublicController);
  });

  it('generates a correlation id for public checkout lookups when headers are missing', async () => {
    await controller.getCheckoutByCode('MPX9Q2Z7');

    expect(checkoutService.getCheckoutByCode).toHaveBeenCalledWith(
      'MPX9Q2Z7',
      expect.objectContaining({
        correlationId: expect.any(String),
      }),
    );

    const correlationId = checkoutService.getCheckoutByCode.mock.calls[0][1]?.correlationId;
    expect(correlationId).toBeTruthy();
  });

  it('prefers the explicit correlation header when creating an order', async () => {
    const dto: CreateOrderDto = {
      planId: 'plan_1',
      workspaceId: 'ws_1',
      customerName: 'Maria',
      customerEmail: 'maria@example.com',
      shippingAddress: {},
      subtotalInCents: 1000,
      totalInCents: 1000,
      paymentMethod: 'PIX' as CreateOrderDto['paymentMethod'],
    };

    await controller.createOrder(
      dto,
      '127.0.0.1',
      'Mozilla/5.0',
      'meli-session-1',
      'req-header',
      'corr-header',
    );

    expect(checkoutService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan_1',
        workspaceId: 'ws_1',
        correlationId: 'corr-header',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        meliSessionId: 'meli-session-1',
      }),
    );
  });

  it('marks createOrder as idempotent for safe retry on duplicate payment requests', () => {
    const isIdempotent = Reflect.getMetadata(
      IDEMPOTENCY_KEY,
      CheckoutPublicController.prototype.createOrder,
    );

    expect(isIdempotent).toBe(true);
  });

  it('delegates social prefill lookup with slug, code, and fingerprint', async () => {
    await controller.getSocialLeadPrefill('checkout-demo', 'MPX9Q2Z7', 'device-123');

    expect(socialLeadService.getLeadPrefill).toHaveBeenCalledWith({
      slug: 'checkout-demo',
      checkoutCode: 'MPX9Q2Z7',
      deviceFingerprint: 'device-123',
    });
  });
});
