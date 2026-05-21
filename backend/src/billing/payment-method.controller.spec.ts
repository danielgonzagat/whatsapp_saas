import { PaymentMethodController } from './payment-method.controller';
import { AuthenticatedRequest } from '../common/interfaces';

describe('PaymentMethodController', () => {
  const listPaymentMethods = jest.fn();
  const createSetupIntent = jest.fn();
  const detachPaymentMethod = jest.fn();
  const setDefaultPaymentMethod = jest.fn();

  let controller: PaymentMethodController;

  const mockReq = {
    user: {
      sub: 'user-1',
      email: 'test@kloel.com',
      workspaceId: 'ws-1',
      role: 'OWNER',
    },
  } as AuthenticatedRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PaymentMethodController({
      listPaymentMethods,
      createSetupIntent,
      detachPaymentMethod,
      setDefaultPaymentMethod,
    } as never);
  });

  describe('GET /billing/payment-methods', () => {
    it('returns workspace payment methods via service.listPaymentMethods', async () => {
      const mockResult = {
        paymentMethods: [
          { id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2027, isDefault: true },
        ],
      };
      listPaymentMethods.mockResolvedValue(mockResult);

      const result = await controller.listPaymentMethods(mockReq);

      expect(listPaymentMethods).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual(mockResult);
    });
  });

  describe('POST /billing/payment-methods/setup-intent', () => {
    it('returns setup-intent url and customerId from service', async () => {
      const mockResult = { url: 'https://checkout.stripe.com/setup', customerId: 'cus_1' };
      createSetupIntent.mockResolvedValue(mockResult);

      const result = await controller.createSetupIntent(mockReq);

      expect(createSetupIntent).toHaveBeenCalledWith('ws-1', undefined);
      expect(result).toEqual(mockResult);
    });

    it('passes returnUrl from body to service', async () => {
      const mockResult = { url: 'https://checkout.stripe.com/setup', customerId: 'cus_1' };
      createSetupIntent.mockResolvedValue(mockResult);

      const result = await controller.createSetupIntent(mockReq, { returnUrl: 'https://app.kloel.com/billing' });

      expect(createSetupIntent).toHaveBeenCalledWith('ws-1', 'https://app.kloel.com/billing');
      expect(result).toEqual(mockResult);
    });
  });

  describe('DELETE /billing/payment-methods/:id', () => {
    it('invokes service.detachPaymentMethod with id and workspaceId', async () => {
      detachPaymentMethod.mockResolvedValue({ ok: true });

      const result = await controller.detachPaymentMethod(mockReq, 'pm_1');

      expect(detachPaymentMethod).toHaveBeenCalledWith('ws-1', 'pm_1');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('POST /billing/payment-methods/:id/default', () => {
    it('invokes service.setDefaultPaymentMethod with id and workspaceId', async () => {
      setDefaultPaymentMethod.mockResolvedValue({ ok: true });

      const result = await controller.setDefault(mockReq, 'pm_1');

      expect(setDefaultPaymentMethod).toHaveBeenCalledWith('ws-1', 'pm_1');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('tenant isolation', () => {
    it('passes workspaceId from authenticated user to service.listPaymentMethods', async () => {
      const reqForWs2 = {
        user: {
          sub: 'user-2',
          email: 'other@kloel.com',
          workspaceId: 'ws-2',
          role: 'OWNER',
        },
      } as AuthenticatedRequest;

      listPaymentMethods.mockResolvedValue({ paymentMethods: [] });

      await controller.listPaymentMethods(reqForWs2);

      expect(listPaymentMethods).toHaveBeenCalledWith('ws-2');
    });

    it('passes workspaceId from authenticated user to service.detachPaymentMethod', async () => {
      const reqForWs2 = {
        user: {
          sub: 'user-2',
          email: 'other@kloel.com',
          workspaceId: 'ws-2',
          role: 'OWNER',
        },
      } as AuthenticatedRequest;

      detachPaymentMethod.mockResolvedValue({ ok: true });

      await controller.detachPaymentMethod(reqForWs2, 'pm_2');

      expect(detachPaymentMethod).toHaveBeenCalledWith('ws-2', 'pm_2');
    });
  });
});
