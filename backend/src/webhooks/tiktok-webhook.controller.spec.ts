import { createHmac } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { RawBodyRequest } from '../common/interfaces/authenticated-request.interface';
import { IS_PUBLIC_METADATA } from '../auth/public.decorator';
import { TikTokWebhookController } from './tiktok-webhook.controller';

describe('TikTokWebhookController', () => {
  let controller: TikTokWebhookController;

  beforeEach(() => {
    controller = new TikTokWebhookController();
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

  it('acknowledges the unsigned callback test sent from the TikTok portal', () => {
    expect(controller.handleWebhook({ ping: true })).toEqual({ received: true });
  });

  it('accepts a valid signed webhook payload', () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
    const rawBody = '{"event":"message"}';
    const timestamp = '1710000000';
    const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    expect(
      controller.handleWebhook({ event: 'message' }, `t=${timestamp},s=${signature}`, {
        rawBody: Buffer.from(rawBody, 'utf8'),
      } as RawBodyRequest),
    ).toEqual({ received: true });
  });

  it('accepts a valid base64-encoded signed webhook payload', () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
    const rawBody = '{"event":"message"}';
    const timestamp = '1710000000';
    const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('base64');

    expect(
      controller.handleWebhook({ event: 'message' }, `t=${timestamp},s=${signature}`, {
        rawBody: Buffer.from(rawBody, 'utf8'),
      } as RawBodyRequest),
    ).toEqual({ received: true });
  });

  it('accepts a valid base64url-encoded signed webhook payload', () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';
    const rawBody = '{"event":"message"}';
    const timestamp = '1710000000';
    const signature = createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('base64url');

    expect(
      controller.handleWebhook({ event: 'message' }, `t=${timestamp},s=${signature}`, {
        rawBody: Buffer.from(rawBody, 'utf8'),
      } as RawBodyRequest),
    ).toEqual({ received: true });
  });

  it('rejects malformed signature headers', () => {
    expect(() => controller.handleWebhook({ event: 'message' }, 'not-a-valid-header')).toThrow(
      ForbiddenException,
    );
  });

  it('rejects invalid signatures when the client secret is configured', () => {
    process.env.TIKTOK_CLIENT_SECRET = 'tiktok-secret';

    expect(() =>
      controller.handleWebhook({ event: 'message' }, 't=1710000000,s=deadbeefdeadbeef'),
    ).toThrow(ForbiddenException);
  });

  it('still acknowledges a signed delivery when the secret is not configured yet', () => {
    expect(
      controller.handleWebhook({ event: 'message' }, `t=1710000000,s=${'a'.repeat(64)}`),
    ).toEqual({ received: true });
  });
});
