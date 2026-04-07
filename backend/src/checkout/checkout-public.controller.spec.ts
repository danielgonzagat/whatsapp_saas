import { CheckoutPublicController } from './checkout-public.controller';

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

  beforeEach(() => {
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

    controller = new CheckoutPublicController(checkoutService as any);
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
    await controller.createOrder(
      {
        planId: 'plan_1',
        workspaceId: 'ws_1',
      } as any,
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
});
