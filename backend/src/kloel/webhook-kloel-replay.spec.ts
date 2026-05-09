import { ForbiddenException } from '@nestjs/common';

jest.mock('./kloel.service', () => ({}));

describe('WhatsAppBrainController — replay safety', () => {
  let controller: InstanceType<typeof import('./whatsapp-brain.controller').WhatsAppBrainController>;
  let redis: { set: jest.Mock };
  let webhooksService: {
    logWebhookEvent: jest.Mock;
    markWebhookProcessed: jest.Mock;
    markWebhookFailed: jest.Mock;
  };
  let whatsappBrain: { processWebhook: jest.Mock };
  let ControllerClass: typeof import('./whatsapp-brain.controller').WhatsAppBrainController;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const { WhatsAppBrainController } = await import('./whatsapp-brain.controller');
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

    await expect(ctrl.receiveWebhook(req as never, payload)).rejects.toThrow(
      ForbiddenException,
    );

    delete process.env.WHATSAPP_API_WEBHOOK_SECRET;
  });
});

describe('PaymentController — replay safety', () => {
  let controller: InstanceType<typeof import('./payment.controller').PaymentController>;
  let redis: { set: jest.Mock };
  let webhooksService: {
    logWebhookEvent: jest.Mock;
    markWebhookProcessed: jest.Mock;
  };
  let paymentService: { processPaymentWebhook: jest.Mock };
  let ControllerClass: typeof import('./payment.controller').PaymentController;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const { PaymentController } = await import('./payment.controller');
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
