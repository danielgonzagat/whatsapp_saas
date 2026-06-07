/**
 * Security + idempotency contract for PaymentWebhookGenericController.
 *
 * Focus (complements webhook-replay.spec.ts which covers the WebhookEvent P2002
 * duplicate path): shared-secret / HMAC acceptance + rejection, missing-config
 * guards, Redis replay short-circuit (no double conversion), and graceful
 * handling of non-paid / unknown statuses.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentWebhookGenericController } from './payment-webhook-generic.controller';

type AutopilotMock = { markConversion: jest.Mock; triggerPostPurchaseFlow: jest.Mock };
type RedisMock = { set: jest.Mock; publish: jest.Mock };
type WebhooksServiceMock = { logWebhookEvent: jest.Mock; markWebhookProcessed: jest.Mock };
type PrismaMock = {
  workspace: { findUnique: jest.Mock };
  contact: { findFirst: jest.Mock };
  kloelSale: { updateMany: jest.Mock };
  payment: { findFirst: jest.Mock; updateMany: jest.Mock };
};

const ENV_KEYS = ['PAYMENT_WEBHOOK_SECRET', 'SHOPIFY_WEBHOOK_SECRET', 'NODE_ENV'] as const;

function build() {
  const autopilot: AutopilotMock = {
    markConversion: jest.fn().mockResolvedValue(undefined),
    triggerPostPurchaseFlow: jest.fn().mockResolvedValue(undefined),
  };
  const redis: RedisMock = {
    set: jest.fn().mockResolvedValue('OK'),
    publish: jest.fn().mockResolvedValue(1),
  };
  const webhooksService: WebhooksServiceMock = {
    logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we-1', status: 'received' }),
    markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
  };
  const prisma: PrismaMock = {
    workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'ws-1' }) },
    contact: { findFirst: jest.fn().mockResolvedValue(null) },
    kloelSale: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    payment: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const channelTransports = { send: jest.fn().mockResolvedValue(null) };
  const controller = new PaymentWebhookGenericController(
    autopilot as never,
    channelTransports as never,
    prisma as never,
    redis as never,
    webhooksService as never,
  );
  return { controller, autopilot, redis, webhooksService, prisma };
}

describe('PaymentWebhookGenericController — auth + idempotency contract', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('accepts a matching shared secret and marks a paid conversion', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'shh';
    const { controller, autopilot, webhooksService } = build();
    const body = {
      status: 'paid',
      workspaceId: 'ws-1',
      orderId: 'order-1',
      phone: '5511999999999',
    };

    const result = await controller.handlePayment(
      'shh',
      undefined,
      undefined,
      'evt-1',
      { body, rawBody: JSON.stringify(body) },
      body,
    );

    expect(result).toEqual({ ok: true });
    expect(autopilot.markConversion).toHaveBeenCalledTimes(1);
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we-1');
  });

  it('rejects a wrong shared secret with ForbiddenException and processes nothing', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'correct-secret';
    const { controller, autopilot, webhooksService } = build();
    const body = { status: 'paid', workspaceId: 'ws-1', orderId: 'order-1' };

    await expect(
      controller.handlePayment(
        'wrong-secret',
        undefined,
        undefined,
        'evt-2',
        { body, rawBody: JSON.stringify(body) },
        body,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(autopilot.markConversion).not.toHaveBeenCalled();
    expect(webhooksService.logWebhookEvent).not.toHaveBeenCalled();
  });

  it('accepts a valid HMAC signature when the shared secret header is absent', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'hmac-secret';
    const { controller, autopilot } = build();
    const body = { status: 'paid', workspaceId: 'ws-1', orderId: 'order-3' };
    const rawBody = JSON.stringify(body);
    const signature = createHmac('sha256', 'hmac-secret').update(rawBody).digest('hex');

    const result = await controller.handlePayment(
      undefined,
      signature,
      undefined,
      'evt-3',
      { body, rawBody },
      body,
    );

    expect(result).toEqual({ ok: true });
    expect(autopilot.markConversion).toHaveBeenCalledTimes(1);
  });

  it('refuses to process in production when PAYMENT_WEBHOOK_SECRET is unset', async () => {
    process.env.NODE_ENV = 'production';
    const { controller, autopilot } = build();
    const body = { status: 'paid', workspaceId: 'ws-1', orderId: 'order-4' };

    await expect(
      controller.handlePayment(
        undefined as never,
        undefined,
        undefined,
        'evt-4',
        { body, rawBody: JSON.stringify(body) },
        body,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(autopilot.markConversion).not.toHaveBeenCalled();
  });

  it('is a no-op on Redis replay (duplicate event): no second conversion', async () => {
    const { controller, autopilot, redis, webhooksService } = build();
    // SET NX returns a non-'OK' value when the key already exists → duplicate.
    redis.set.mockResolvedValueOnce(null);
    const body = { status: 'paid', workspaceId: 'ws-1', orderId: 'order-5' };

    const result = await controller.handlePayment(
      undefined,
      undefined,
      undefined,
      'evt-5',
      { body, rawBody: JSON.stringify(body) },
      body,
    );

    expect(result).toEqual({ ok: true, duplicate: true });
    expect(autopilot.markConversion).not.toHaveBeenCalled();
    expect(webhooksService.logWebhookEvent).not.toHaveBeenCalled();
    expect(redis.publish).toHaveBeenCalled();
  });

  it('ignores a non-paid status without marking a conversion', async () => {
    const { controller, autopilot } = build();
    const body = { status: 'pending', workspaceId: 'ws-1', orderId: 'order-6' };

    const result = await controller.handlePayment(
      undefined,
      undefined,
      undefined,
      'evt-6',
      { body, rawBody: JSON.stringify(body) },
      body,
    );

    expect(result).toEqual({ ok: true, ignored: true, reason: 'status_not_paid' });
    expect(autopilot.markConversion).not.toHaveBeenCalled();
  });

  it('rejects a paid event missing workspaceId with BadRequestException', async () => {
    const { controller, autopilot } = build();
    const body = { status: 'paid', orderId: 'order-7' };

    await expect(
      controller.handlePayment(
        undefined as never,
        undefined,
        undefined,
        'evt-7',
        { body, rawBody: JSON.stringify(body) },
        body,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(autopilot.markConversion).not.toHaveBeenCalled();
  });

  it('rejects a Shopify webhook with an invalid HMAC and processes nothing', async () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = 'shopify-secret';
    const { controller, autopilot } = build();
    const body = { financial_status: 'paid', workspaceId: 'ws-1', id: 42, total_price: '99.90' };

    await expect(
      controller.handleShopify(
        { body, rawBody: JSON.stringify(body) },
        'not-the-real-hmac',
        'evt-shopify-bad',
        body,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(autopilot.markConversion).not.toHaveBeenCalled();
  });

  it('accepts a Shopify webhook with a valid HMAC and marks the conversion', async () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = 'shopify-secret';
    const { controller, autopilot } = build();
    const body = { financial_status: 'paid', workspaceId: 'ws-1', id: 42, total_price: '99.90' };
    const rawBody = JSON.stringify(body);
    const hmac = createHmac('sha256', 'shopify-secret').update(rawBody).digest('base64');

    const result = await controller.handleShopify({ body, rawBody }, hmac, 'evt-shopify-ok', body);

    expect(result).toEqual({ ok: true });
    expect(autopilot.markConversion).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', reason: 'shopify_paid' }),
    );
  });
});
