import { PaymentWebhookGenericController } from '../payment-webhook-generic.controller';
import * as crypto from 'node:crypto';

export function registerWooCommerceIdempotencyTests(): void {
  describe('PaymentWebhookGenericController — WooCommerce idempotency', () => {
    beforeEach(() => {
      delete process.env.WC_WEBHOOK_SECRET;
    });

    function buildWooController() {
      const autopilot = { markConversion: jest.fn().mockResolvedValue(undefined) };
      const whatsapp = { sendMessage: jest.fn().mockResolvedValue(undefined) };
      const prisma = {
        workspace: {
          findUnique: jest.fn().mockResolvedValue({ id: 'ws-woo' }),
        },
      };
      const redis = {
        set: jest.fn().mockResolvedValue('OK'),
        lpush: jest.fn().mockResolvedValue(1),
        ltrim: jest.fn().mockResolvedValue('OK'),
      };
      const webhooksService = {
        logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we_woo_1' }),
        markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
      };
      const controller = new PaymentWebhookGenericController(
        autopilot as never,
        whatsapp as never,
        prisma as never,
        redis as never,
        webhooksService as never,
      );
      return { controller, redis, prisma, autopilot };
    }

    it('detects duplicate WooCommerce webhook via Redis SET NX and skips processing', async () => {
      process.env.WC_WEBHOOK_SECRET = 'woo_test_secret';
      const { controller, redis, prisma } = buildWooController();

      redis.set.mockResolvedValueOnce(null);

      const rawBody = JSON.stringify({
        id: 42,
        status: 'completed',
        total: '99.90',
        workspaceId: 'ws-woo',
        billing: { phone: '5511999999999' },
      });
      const validHmac = crypto
        .createHmac('sha256', 'woo_test_secret')
        .update(Buffer.from(rawBody, 'utf8'))
        .digest('base64');

      const result = await controller.handleWoo(
        {
          body: JSON.parse(rawBody),
          rawBody,
          url: '/webhook/payment/woocommerce',
        },
        validHmac,
        'evt_woo_dupe',
        JSON.parse(rawBody) as never,
      );

      expect(redis.set).toHaveBeenCalledWith('webhook:payment:evt_woo_dupe', '1', 'EX', 300, 'NX');
      expect(result).toEqual({
        ok: true,
        received: true,
        duplicate: true,
        reason: 'duplicate_event',
      });
      expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
    });

    it('processes first WooCommerce webhook normally when Redis SET NX succeeds', async () => {
      process.env.WC_WEBHOOK_SECRET = 'woo_test_secret';
      const { controller, redis, prisma, autopilot } = buildWooController();

      redis.set.mockResolvedValueOnce('OK');

      const rawBody = JSON.stringify({
        id: 43,
        status: 'completed',
        total: '149.90',
        workspaceId: 'ws-woo',
        billing: { phone: '5511999999999' },
      });
      const validHmac = crypto
        .createHmac('sha256', 'woo_test_secret')
        .update(Buffer.from(rawBody, 'utf8'))
        .digest('base64');

      const result = await controller.handleWoo(
        {
          body: JSON.parse(rawBody),
          rawBody,
          url: '/webhook/payment/woocommerce',
        },
        validHmac,
        'evt_woo_new',
        JSON.parse(rawBody) as never,
      );

      expect(redis.set).toHaveBeenCalledWith('webhook:payment:evt_woo_new', '1', 'EX', 300, 'NX');
      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({ where: { id: 'ws-woo' } });
      expect(autopilot.markConversion).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'woocommerce_paid' }),
      );
      expect(result).toEqual({ ok: true });
    });
  });
}
