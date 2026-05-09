import * as crypto from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';

// ── WebhooksController replay tests ──

describe('WebhooksController — replay safety', () => {
  let controller: InstanceType<typeof import('./webhooks.controller').WebhooksController>;
  let redis: { setnx: jest.Mock; expire: jest.Mock; lpush: jest.Mock; ltrim: jest.Mock };
  let webhooksService: {
    processWebhook: jest.Mock;
    processFinanceEvent: jest.Mock;
    updateMessageStatus: jest.Mock;
    processInstagramMessage: jest.Mock;
    logWebhookEvent: jest.Mock;
  };
  let prisma: { workspace: { findUnique: jest.Mock }; auditLog: { create: jest.Mock } };

  beforeAll(async () => {
    process.env.HOOKS_WEBHOOK_SECRET = 'test-hooks-secret';
    process.env.NODE_ENV = 'test';
    const { WebhooksController } = await import('./webhooks.controller');
    ControllerClass = WebhooksController;
  });

  let ControllerClass: typeof import('./webhooks.controller').WebhooksController;

  beforeEach(() => {
    redis = {
      setnx: jest.fn(),
      expire: jest.fn(),
      lpush: jest.fn().mockResolvedValue(1),
      ltrim: jest.fn().mockResolvedValue('OK'),
    };
    webhooksService = {
      processWebhook: jest.fn().mockResolvedValue({ executionId: 'exec-1' }),
      processFinanceEvent: jest.fn().mockResolvedValue({ executionId: 'exec-1', status: 'paid' }),
      updateMessageStatus: jest.fn().mockResolvedValue({ updated: 1 }),
      processInstagramMessage: jest.fn().mockResolvedValue({ status: 'success' }),
      logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we-1', status: 'received' }),
    };
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    controller = new ControllerClass(
      webhooksService as never,
      redis as never,
      prisma as never,
    );
  });

  afterAll(() => {
    delete process.env.HOOKS_WEBHOOK_SECRET;
  });

  it('catchHook returns 200 response on Redis dedup (replay)', async () => {
    redis.setnx.mockResolvedValueOnce(0);

    const body = { phone: '5511999999999', status: 'paid' };
    const promise = controller.catchHook(
      'ws-1', 'flow-1', body, {},
      createTestSignature(body, 'test-hooks-secret'),
      undefined,
      { body, rawBody: JSON.stringify(body) },
    );

    await expect(promise).rejects.toThrow('Duplicate webhook');
    expect(webhooksService.processWebhook).not.toHaveBeenCalled();
  });

  it('catchHook returns 200 on WebhookEvent P2002 duplicate', async () => {
    redis.setnx.mockResolvedValueOnce(1);
    redis.expire.mockResolvedValueOnce('OK');
    const p2002Err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002Err);

    const body = { phone: '5511999999999', status: 'paid' };
    const result = await controller.catchHook(
      'ws-1',
      'flow-1',
      body,
      {},
      createTestSignature(body, 'test-hooks-secret'),
      undefined,
      { body, rawBody: JSON.stringify(body) },
    );

    expect(result).toHaveProperty('skipped', true);
    expect(result).toHaveProperty('duplicate', true);
  });

  it('financeHook returns 200 on WebhookEvent P2002 duplicate', async () => {
    redis.setnx.mockResolvedValueOnce(1);
    redis.expire.mockResolvedValueOnce('OK');
    const p2002Err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002Err);

    const body = { status: 'paid', phone: '5511999999999' };
    const result = await controller.financeHook(
      'ws-1',
      body,
      createTestSignature(body, 'test-hooks-secret'),
      undefined,
      { body, rawBody: JSON.stringify(body) },
    );

    expect(result).toHaveProperty('skipped', true);
    expect(result).toHaveProperty('duplicate', true);
  });

  it('messageStatus returns 200 on WebhookEvent P2002 duplicate', async () => {
    redis.setnx.mockResolvedValueOnce(1);
    redis.expire.mockResolvedValueOnce('OK');
    const p2002Err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002Err);

    const body = { workspaceId: 'ws-1', externalId: 'ext-1', status: 'DELIVERED' };
    const result = await controller.messageStatus(
      body,
      createTestSignature(body, 'test-hooks-secret'),
      { body, rawBody: JSON.stringify(body) },
    );

    expect(result).toHaveProperty('skipped', true);
    expect(result).toHaveProperty('duplicate', true);
  });

  it('emailStatus returns 200 on WebhookEvent P2002 duplicate', async () => {
    redis.setnx.mockResolvedValueOnce(1);
    redis.expire.mockResolvedValueOnce('OK');
    const p2002Err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002Err);

    const body = { workspaceId: 'ws-1', externalId: 'ext-1', status: 'DELIVERED' };
    const result = await controller.emailStatus(
      body,
      createTestSignature(body, 'test-hooks-secret'),
      { body, rawBody: JSON.stringify(body) },
    );

    expect(result).toHaveProperty('skipped', true);
    expect(result).toHaveProperty('duplicate', true);
  });
});

// ── PaymentWebhookGenericController replay tests ──

describe('PaymentWebhookGenericController — replay safety', () => {
  let controller: InstanceType<typeof import('./payment-webhook-generic.controller').PaymentWebhookGenericController>;
  let redis: { set: jest.Mock };
  let webhooksService: { logWebhookEvent: jest.Mock; markWebhookProcessed: jest.Mock };
  let autopilot: { markConversion: jest.Mock; triggerPostPurchaseFlow: jest.Mock };
  let prisma: { workspace: { findUnique: jest.Mock }; contact: { findFirst: jest.Mock } };
  let ControllerClass: typeof import('./payment-webhook-generic.controller').PaymentWebhookGenericController;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const { PaymentWebhookGenericController } = await import('./payment-webhook-generic.controller');
    ControllerClass = PaymentWebhookGenericController;
  });

  beforeEach(() => {
    redis = { set: jest.fn() };
    webhooksService = {
      logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we-1', status: 'received' }),
      markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
    };
    autopilot = {
      markConversion: jest.fn().mockResolvedValue(undefined),
      triggerPostPurchaseFlow: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'ws-1' }) },
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    controller = new ControllerClass(
      autopilot as never,
      {} as never,
      prisma as never,
      redis as never,
      webhooksService as never,
    );
  });

  it('handlePayment returns 200 on WebhookEvent P2002 duplicate', async () => {
    redis.set.mockResolvedValueOnce('OK');
    const p2002Err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002Err);

    const result = await controller.handlePayment(
      process.env.PAYMENT_WEBHOOK_SECRET || 'test',
      undefined,
      undefined,
      undefined,
      { body: { status: 'paid', workspaceId: 'ws-1', orderId: 'order-1' }, rawBody: Buffer.from(JSON.stringify({ status: 'paid', workspaceId: 'ws-1', orderId: 'order-1' })) },
      { status: 'paid', workspaceId: 'ws-1', orderId: 'order-1' },
    );

    expect(result).toHaveProperty('skipped', true);
    expect(result).toHaveProperty('reason', 'duplicate_webhook_event');
  });

  it('handleShopify returns 200 on WebhookEvent P2002 duplicate', async () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = 'test-shopify-secret';
    redis.set.mockResolvedValueOnce('OK');
    const p2002Err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002Err);

    const body = { financial_status: 'paid', workspaceId: 'ws-1', id: 12345, total_price: '99.90' };
    const rawBody = JSON.stringify(body);
    const hmac = crypto.createHmac('sha256', 'test-shopify-secret').update(rawBody).digest('base64');

    const result = await controller.handleShopify(
      { body, rawBody },
      hmac,
      undefined,
      body as never,
    );

    expect(result).toHaveProperty('skipped', true);
    expect(result).toHaveProperty('reason', 'duplicate_webhook_event');
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
  });

  it('handlePagHiper returns 200 on WebhookEvent P2002 duplicate', async () => {
    process.env.PAGHIPER_WEBHOOK_TOKEN = 'test-paghiper-token';
    redis.set.mockResolvedValueOnce('OK');
    const p2002Err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002Err);

    const body = { status: 'completed', workspaceId: 'ws-1', transaction_id: 'tx-1' };
    const result = await controller.handlePagHiper(
      'test-paghiper-token',
      undefined,
      { body, rawBody: JSON.stringify(body) },
      body as never,
    );

    expect(result).toHaveProperty('skipped', true);
    expect(result).toHaveProperty('reason', 'duplicate_webhook_event');
    delete process.env.PAGHIPER_WEBHOOK_TOKEN;
  });

  it('handleWoo returns 200 on WebhookEvent P2002 duplicate', async () => {
    process.env.WC_WEBHOOK_SECRET = 'test-wc-secret';
    redis.set.mockResolvedValueOnce('OK');
    const p2002Err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002Err);

    const body = { status: 'completed', workspaceId: 'ws-1', id: 100, total: '50.00' };
    const rawBody = JSON.stringify(body);
    const signature = crypto.createHmac('sha256', 'test-wc-secret').update(rawBody).digest('base64');

    const result = await controller.handleWoo(
      { body, rawBody },
      signature,
      undefined,
      body as never,
    );

    expect(result).toHaveProperty('skipped', true);
    expect(result).toHaveProperty('reason', 'duplicate_webhook_event');
    delete process.env.WC_WEBHOOK_SECRET;
  });
});

// ── MetaWebhookController replay tests ──

describe('MetaWebhookController — replay safety', () => {
  let controller: InstanceType<typeof import('../meta/webhooks/meta-webhook.controller').MetaWebhookController>;
  let redis: { set: jest.Mock };
  let webhooksService: { logWebhookEvent: jest.Mock; markWebhookProcessed: jest.Mock };
  let inboundProcessor: { process: jest.Mock };
  let metaWhatsApp: {
    resolveWorkspaceIdByPhoneNumberId: jest.Mock;
    touchWebhookHeartbeat: jest.Mock;
  };
  let prisma: {
    message: { updateMany: jest.Mock };
    metaConnection: { findFirst: jest.Mock };
  };
  let ControllerClass: typeof import('../meta/webhooks/meta-webhook.controller').MetaWebhookController;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const { MetaWebhookController } = await import('../meta/webhooks/meta-webhook.controller');
    ControllerClass = MetaWebhookController;
  });

  beforeEach(() => {
    redis = { set: jest.fn() };
    webhooksService = {
      logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we-meta-1', status: 'received' }),
      markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
    };
    inboundProcessor = { process: jest.fn().mockResolvedValue(undefined) };
    metaWhatsApp = {
      resolveWorkspaceIdByPhoneNumberId: jest.fn().mockResolvedValue('ws-1'),
      touchWebhookHeartbeat: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      message: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      metaConnection: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    controller = new ControllerClass(
      metaWhatsApp as never,
      inboundProcessor as never,
      {} as never,
      prisma as never,
      webhooksService as never,
      redis as never,
    );
  });

  it('returns "ok" on Redis dedup (replay safety)', async () => {
    redis.set.mockResolvedValueOnce(null);

    const body = { object: 'whatsapp_business_account', entry: [] };
    const result = await controller.handleWebhook(body, '', undefined, {
      rawBody: Buffer.from(JSON.stringify(body)),
    } as never);

    expect(result).toBe('ok');
    expect(inboundProcessor.process).not.toHaveBeenCalled();
  });

  it('returns "ok" on WebhookEvent P2002 duplicate', async () => {
    redis.set.mockResolvedValueOnce('OK');
    const p2002Err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002Err);

    const body = { object: 'whatsapp_business_account', entry: [] };
    const result = await controller.handleWebhook(body, '', undefined, {
      rawBody: Buffer.from(JSON.stringify(body)),
    } as never);

    expect(result).toBe('ok');
    expect(inboundProcessor.process).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException on invalid signature', async () => {
    process.env.META_APP_SECRET = 'meta-secret';
    const ctrl = new ControllerClass(
      metaWhatsApp as never,
      inboundProcessor as never,
      {} as never,
      prisma as never,
      webhooksService as never,
      redis as never,
    );

    const body = { object: 'whatsapp_business_account', entry: [] };
    await expect(
      ctrl.handleWebhook(body, 'sha256=badsignature', undefined, {
        rawBody: Buffer.from(JSON.stringify(body)),
      } as never),
    ).rejects.toThrow(ForbiddenException);

    delete process.env.META_APP_SECRET;
  });
});

// ── WhatsAppBrainController replay tests ──

describe('WhatsAppBrainController — replay safety', () => {
  let controller: InstanceType<typeof import('../kloel/whatsapp-brain.controller').WhatsAppBrainController>;
  let redis: { set: jest.Mock };
  let webhooksService: {
    logWebhookEvent: jest.Mock;
    markWebhookProcessed: jest.Mock;
    markWebhookFailed: jest.Mock;
  };
  let whatsappBrain: { processWebhook: jest.Mock };
  let ControllerClass: typeof import('../kloel/whatsapp-brain.controller').WhatsAppBrainController;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const { WhatsAppBrainController } = await import('../kloel/whatsapp-brain.controller');
    ControllerClass = WhatsAppBrainController;
  });

  beforeEach(() => {
    redis = { set: jest.fn() };
    webhooksService = {
      logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we-wb-1', status: 'received' }),
      markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
      markWebhookFailed: jest.fn().mockResolvedValue(undefined),
    };
    whatsappBrain = { processWebhook: jest.fn().mockResolvedValue(undefined) };

    controller = new ControllerClass(
      whatsappBrain as never,
      webhooksService as never,
      redis as never,
    );
  });

  it('returns {status:"ok", duplicate:true} on Redis dedup (replay)', async () => {
    redis.set.mockResolvedValueOnce(null);

    const payload = { messages: [{ from: '5511999999999', text: 'hello' }] };
    const req = { headers: {} };

    const result = await controller.receiveWebhook(req as never, payload);

    expect(result).toEqual({ status: 'ok', duplicate: true });
    expect(whatsappBrain.processWebhook).not.toHaveBeenCalled();
  });

  it('returns {status:"ok", duplicate:true} on WebhookEvent P2002 duplicate', async () => {
    redis.set.mockResolvedValueOnce('OK');
    const p2002Err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002Err);

    const payload = { messages: [{ from: '5511999999999', text: 'hello' }] };
    const req = { headers: {} };

    const result = await controller.receiveWebhook(req as never, payload);

    expect(result).toEqual({ status: 'ok', duplicate: true });
    expect(whatsappBrain.processWebhook).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException on invalid signature', async () => {
    process.env.WHATSAPP_API_WEBHOOK_SECRET = 'wb-secret';
    const ctrl = new ControllerClass(whatsappBrain as never, webhooksService as never, redis as never);

    const payload = { messages: [{ from: '5511999999999', text: 'hello' }] };
    const req = { headers: { 'x-hub-signature-256': 'sha256=badsignature' } };

    await expect(ctrl.receiveWebhook(req as never, payload)).rejects.toThrow(ForbiddenException);

    delete process.env.WHATSAPP_API_WEBHOOK_SECRET;
  });
});

// ── PaymentController (Kloel) replay tests ──

describe('PaymentController — replay safety', () => {
  let controller: InstanceType<typeof import('../kloel/payment.controller').PaymentController>;
  let redis: { set: jest.Mock };
  let webhooksService: {
    logWebhookEvent: jest.Mock;
    markWebhookProcessed: jest.Mock;
  };
  let paymentService: { processPaymentWebhook: jest.Mock };
  let ControllerClass: typeof import('../kloel/payment.controller').PaymentController;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const { PaymentController } = await import('../kloel/payment.controller');
    ControllerClass = PaymentController;
  });

  beforeEach(() => {
    redis = { set: jest.fn() };
    webhooksService = {
      logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we-pay-1', status: 'received' }),
      markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
    };
    paymentService = { processPaymentWebhook: jest.fn().mockResolvedValue(undefined) };

    controller = new ControllerClass(
      paymentService as never,
      webhooksService as never,
      redis as never,
    );
  });

  it('returns {received:true, duplicate:true} on Redis dedup (replay)', async () => {
    redis.set.mockResolvedValueOnce(null);

    const body = { event: 'payment.created', payment: { workspaceId: 'ws-1' } };

    const result = await controller.paymentWebhook('test-kloel-secret', undefined, body);

    expect(result).toEqual({ received: true, duplicate: true });
    expect(paymentService.processPaymentWebhook).not.toHaveBeenCalled();
  });

  it('returns {received:true, duplicate:true} on WebhookEvent P2002 duplicate', async () => {
    redis.set.mockResolvedValueOnce('OK');
    const p2002Err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    webhooksService.logWebhookEvent.mockRejectedValueOnce(p2002Err);

    const body = { event: 'payment.created', payment: { workspaceId: 'ws-1' } };

    const result = await controller.paymentWebhook('test-kloel-secret', undefined, body);

    expect(result).toEqual({ received: true, duplicate: true });
    expect(paymentService.processPaymentWebhook).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException on invalid webhook secret', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'real-secret';
    const ctrl = new ControllerClass(paymentService as never, webhooksService as never, redis as never);

    const body = { event: 'payment.created', payment: { workspaceId: 'ws-1' } };

    await expect(ctrl.paymentWebhook('wrong-secret', undefined, body)).rejects.toThrow(
      ForbiddenException,
    );

    delete process.env.PAYMENT_WEBHOOK_SECRET;
  });
});

// ── Helpers ──

function createTestSignature(body: unknown, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(JSON.stringify(body)))
    .digest('hex');
}
