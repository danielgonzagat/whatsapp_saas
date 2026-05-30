import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_METADATA } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { ROUTE_CLASS_METADATA_KEY } from '../common/throttler/route-class.decorator';
import { PaymentController } from './payment.controller';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { castMock } from '../../test/helpers/cast-mock';

function handlerOf(method: keyof PaymentController): object {
  return Object.getOwnPropertyDescriptor(PaymentController.prototype, method)?.value as object;
}
function guardsOf(method: keyof PaymentController): unknown[] {
  return Reflect.getMetadata(GUARDS_METADATA, handlerOf(method)) as unknown[];
}
function isPublicHandler(method: keyof PaymentController): boolean | undefined {
  return Reflect.getMetadata(IS_PUBLIC_METADATA, handlerOf(method)) as boolean | undefined;
}

describe('PaymentController', () => {
  const processPaymentWebhook = jest.fn();
  const createPayment = jest.fn();
  const getSalesReport = jest.fn();
  const getPublicPayment = jest.fn();
  const logWebhookEvent = jest.fn();
  const markWebhookProcessed = jest.fn();
  const redisSet = jest.fn();

  let controller: PaymentController;
  const originalEnv = { ...process.env };

  const req = castMock<AuthenticatedRequest>({
    user: { sub: 'user-1', workspaceId: 'ws-1' },
    headers: {},
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    redisSet.mockResolvedValue('OK');
    logWebhookEvent.mockResolvedValue({ id: 'evt-1' });
    markWebhookProcessed.mockResolvedValue(undefined);
    processPaymentWebhook.mockResolvedValue(undefined);

    controller = new PaymentController(
      castMock({
        processPaymentWebhook,
        createPayment,
        getSalesReport,
        getPublicPayment,
      }),
      castMock({ logWebhookEvent, markWebhookProcessed }),
      castMock({ set: redisSet }),
    );
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('route + governance wiring', () => {
    it('mounts under kloel/payments and is a mutate route class', () => {
      expect(Reflect.getMetadata('path', PaymentController)).toBe('kloel/payments');
      expect(Reflect.getMetadata(ROUTE_CLASS_METADATA_KEY, PaymentController)).toBe('mutate');
    });

    it('guards createPayment with the JWT + workspace guards', () => {
      const guards = guardsOf('createPayment');
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(WorkspaceGuard);
    });

    it('guards salesReport with the JWT + workspace guards', () => {
      const guards = guardsOf('salesReport');
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(WorkspaceGuard);
    });

    it('marks the webhook + public-payment routes as @Public()', () => {
      expect(isPublicHandler('paymentWebhook')).toBe(true);
      expect(isPublicHandler('getPublicPayment')).toBe(true);
    });
  });

  describe('paymentWebhook', () => {
    const body = {
      event: 'payment.confirmed',
      payment: { id: 'pay-1', workspaceId: 'ws-1' },
    };

    it('delegates to the service and acknowledges receipt (not a placebo)', async () => {
      const result = await controller.paymentWebhook(undefined, 'event-1', body);

      expect(processPaymentWebhook).toHaveBeenCalledWith('ws-1', 'payment.confirmed', body.payment);
      expect(markWebhookProcessed).toHaveBeenCalledWith('evt-1');
      expect(result).toEqual({ received: true });
    });

    it('short-circuits as duplicate when the Redis NX lock is already held', async () => {
      redisSet.mockResolvedValue(null);

      const result = await controller.paymentWebhook(undefined, 'event-1', body);

      expect(result).toEqual({ received: true, duplicate: true });
      expect(processPaymentWebhook).not.toHaveBeenCalled();
    });

    it('rejects when the configured webhook secret does not match', async () => {
      process.env.PAYMENT_WEBHOOK_SECRET = 'topsecret';

      await expect(controller.paymentWebhook('wrong', 'event-1', body)).rejects.toThrow(
        ForbiddenException,
      );
      expect(processPaymentWebhook).not.toHaveBeenCalled();
    });

    it('throws BadRequest when no workspaceId can be resolved', async () => {
      await expect(
        controller.paymentWebhook(undefined, 'event-2', {
          event: 'payment.confirmed',
          payment: { id: 'pay-2' },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createPayment', () => {
    it('forwards the resolved workspace + body to the service and returns the link', async () => {
      createPayment.mockResolvedValue({ id: 'pay-9', paymentLink: 'https://pay/abc' });

      const result = await controller.createPayment(req, 'ws-1', {
        leadId: 'lead-1',
        customerName: 'Maria',
        customerPhone: '5511999998888',
        amount: 100,
        productName: 'Plano Pro',
      });

      const arg = castMock<[Record<string, unknown>][]>(createPayment.mock.calls)[0]?.[0];
      expect(arg.workspaceId).toBe('ws-1');
      expect(arg.customerName).toBe('Maria');
      expect(arg.description).toBe('Plano Pro');
      expect(result).toEqual({
        success: true,
        paymentLink: 'https://pay/abc',
        payment: { id: 'pay-9', paymentLink: 'https://pay/abc' },
      });
    });
  });

  describe('salesReport', () => {
    it('returns the real service report for the resolved workspace', async () => {
      const report = { period: 'week', total: 4200 };
      getSalesReport.mockResolvedValue(report);

      const result = await controller.salesReport(req, 'ws-1', 'week');

      expect(getSalesReport).toHaveBeenCalledWith('ws-1', 'week');
      expect(result).toBe(report);
    });
  });

  describe('getStatus', () => {
    it('reports the payment service online', () => {
      expect(controller.getStatus()).toEqual({
        status: 'online',
        service: 'KLOEL Payment Service',
      });
    });
  });

  describe('getPublicPayment', () => {
    it('returns the public payment when found', async () => {
      const payment = { id: 'pay-7', amount: 100 };
      getPublicPayment.mockResolvedValue(payment);

      const result = await controller.getPublicPayment('pay-7');

      expect(getPublicPayment).toHaveBeenCalledWith('pay-7');
      expect(result).toBe(payment);
    });

    it('throws NotFound when the payment does not exist (honest 404)', async () => {
      getPublicPayment.mockResolvedValue(null);

      await expect(controller.getPublicPayment('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
