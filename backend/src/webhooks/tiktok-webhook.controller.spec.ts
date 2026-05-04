import { createHmac } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { RawBodyRequest } from '../common/interfaces/authenticated-request.interface';
import { IS_PUBLIC_METADATA } from '../auth/public.decorator';
import { TikTokWebhookController } from './tiktok-webhook.controller';

describe('TikTokWebhookController', () => {
  let controller: TikTokWebhookController;
  let mockWebhooksService: { logWebhookEvent: jest.Mock };

  beforeEach(() => {
    mockWebhooksService = {
      logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we_mock' }),
    };
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
    };
    controller = new TikTokWebhookController(redis as never, mockWebhooksService as never);
    delete process.env.TIKTOK_CLIENT_SECRET;
  });

  afterEach(() => {
    delete process.env.TIKTOK_CLIENT_SECRET;
  });

  it('keeps the callback endpoints public and the POST endpoint elevated for webhook traffic', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_METADATA, TikTokWebhookController.prototype.getStatus),
    ).toBe(true);
    expect(
      Reflect.getMetadata(IS_PUBLIC_METADATA, TikTokWebhookController.prototype.handleWebhook),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        TikTokWebhookController.prototype.handleWebhook,
      ),
    ).toBe(2000);
    expect(
      Reflect.getMetadata('THROTTLER:TTLdefault', TikTokWebhookController.prototype.handleWebhook),
    ).toBe(60000);
  });

  it('exposes a simple manual health response on GET', () => {
    expect(controller.getStatus()).toEqual({
      ok: true,
      provider: 'tiktok',
      callbackUrl: '/webhooks/tiktok',
      accepts: 'POST',
    });
  });

  it('acknowledges the unsigned callback test sent from the TikTok portal', async () => {
    await expect(controller.handleWebhook({ ping: true })).resolves.toEqual({
      received: true,
    });
  });

  it('accepts a valid signed webhook payload', async () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
    const rawBody = '{"event":"message"}';
    const timestamp = '1710000000';
    const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    await expect(
      controller.handleWebhook({ event: 'message' }, `t=${timestamp},s=${signature}`, undefined, {
        rawBody: Buffer.from(rawBody, 'utf8'),
      } as RawBodyRequest),
    ).resolves.toEqual({ received: true });
  });

  it('accepts a valid base64-encoded signed webhook payload', async () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
    const rawBody = '{"event":"message"}';
    const timestamp = '1710000000';
    const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('base64');

    await expect(
      controller.handleWebhook({ event: 'message' }, `t=${timestamp},s=${signature}`, undefined, {
        rawBody: Buffer.from(rawBody, 'utf8'),
      } as RawBodyRequest),
    ).resolves.toEqual({ received: true });
  });

  it('accepts a valid base64url-encoded signed webhook payload', async () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
    const rawBody = '{"event":"message"}';
    const timestamp = '1710000000';
    const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('base64url');

    await expect(
      controller.handleWebhook({ event: 'message' }, `t=${timestamp},s=${signature}`, undefined, {
        rawBody: Buffer.from(rawBody, 'utf8'),
      } as RawBodyRequest),
    ).resolves.toEqual({ received: true });
  });

  it('rejects malformed signature headers', async () => {
    await expect(
      controller.handleWebhook({ event: 'message' }, 'not-a-valid-header'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects invalid signatures when the client secret is configured', async () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';

    await expect(
      controller.handleWebhook({ event: 'message' }, 't=1710000000,s=deadbeefdeadbeef'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('still acknowledges a signed delivery when the secret is not configured yet', async () => {
    await expect(
      controller.handleWebhook({ event: 'message' }, `t=1710000000,s=${'a'.repeat(64)}`),
    ).resolves.toEqual({ received: true });
  });

  it('rejects duplicate webhook payloads via Redis SET NX', async () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
    const rawBody = '{"event":"message"}';
    const timestamp = '1710000000';
    const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const redis = {
      set: jest.fn().mockResolvedValue(null),
    };
    const wss = { logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we_mock' }) };
    const ctrl = new TikTokWebhookController(redis as never, wss as never);

    const result = await ctrl.handleWebhook(
      { event: 'message' },
      `t=${timestamp},s=${signature}`,
      'evt_tiktok_dupe',
      {
        rawBody: Buffer.from(rawBody, 'utf8'),
      } as RawBodyRequest,
    );

    expect(result).toEqual({ received: true, duplicate: true, skipped: true });
  });

  it('processes first-time webhook payload when Redis SET NX succeeds', async () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
    const rawBody = '{"event":"message"}';
    const timestamp = '1710000000';
    const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
    };
    const wss = { logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we_mock' }) };
    const ctrl = new TikTokWebhookController(redis as never, wss as never);

    const result = await ctrl.handleWebhook(
      { event: 'message' },
      `t=${timestamp},s=${signature}`,
      'evt_tiktok_new',
      {
        rawBody: Buffer.from(rawBody, 'utf8'),
      } as RawBodyRequest,
    );

    expect(redis.set).toHaveBeenCalledWith('webhook:tiktok:evt_tiktok_new', '1', 'EX', 300, 'NX');
    expect(result).toEqual({ received: true });
  });
});
