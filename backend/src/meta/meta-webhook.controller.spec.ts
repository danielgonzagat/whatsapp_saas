import { createHmac } from 'node:crypto';
import type { WebhooksService } from '../webhooks/webhooks.service';
import { MetaWebhookController } from './meta-webhook.controller';

function signWebhookBody(body: unknown, secret = 'test-secret') {
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return { rawBody, signature };
}

describe('MetaWebhookController', () => {
  let controller: MetaWebhookController;
  let mockWebhooksService: {
    logWebhookEvent: jest.Mock;
    markWebhookProcessed: jest.Mock;
  };

  beforeEach(() => {
    mockWebhooksService = {
      logWebhookEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
    };

    controller = new MetaWebhookController(mockWebhooksService as never as WebhooksService);
  });

  afterEach(() => {
    delete process.env.META_APP_SECRET;
    delete process.env.META_MARKETING_VERIFY_TOKEN;
  });

  describe('verifyWebhook', () => {
    it('returns 403 when mode is not subscribe', () => {
      const res = { send: jest.fn(), status: jest.fn().mockReturnThis() };

      expect(() => controller.verifyWebhook('invalid', 'token', 'challenge', res as never)).toThrow(
        'Verification failed',
      );
    });

    it('returns 403 when verify token does not match', () => {
      process.env.META_MARKETING_VERIFY_TOKEN = 'correct-token';
      const res = { send: jest.fn(), status: jest.fn().mockReturnThis() };

      expect(() =>
        controller.verifyWebhook('subscribe', 'wrong-token', 'challenge', res as never),
      ).toThrow('Verification failed');

      delete process.env.META_MARKETING_VERIFY_TOKEN;
    });

    it('returns challenge when verification succeeds', () => {
      process.env.META_MARKETING_VERIFY_TOKEN = 'valid-token';
      const res = {
        end: jest.fn(),
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      controller.verifyWebhook('subscribe', 'valid-token', 'test-challenge', res as never);

      expect(res.end).toHaveBeenCalledWith('test-challenge', 'utf8');

      delete process.env.META_MARKETING_VERIFY_TOKEN;
    });

    it('rejects empty challenge after sanitization', () => {
      process.env.META_MARKETING_VERIFY_TOKEN = 'token';
      const res = { send: jest.fn(), status: jest.fn().mockReturnThis() };

      expect(() => controller.verifyWebhook('subscribe', 'token', '', res as never)).toThrow(
        'Verification failed',
      );

      delete process.env.META_MARKETING_VERIFY_TOKEN;
    });
  });

  describe('handleWebhook', () => {
    it('logs webhook event and returns ok', async () => {
      process.env.META_APP_SECRET = 'test-secret';
      const body = { object: 'ad_account', entry: [] };
      const { rawBody, signature } = signWebhookBody(body);

      const result = await controller.handleWebhook(body, signature, { rawBody });

      expect(result).toBe('ok');
      const logArgs = mockWebhooksService.logWebhookEvent.mock.calls[0];
      expect(logArgs[0]).toBe('meta-marketing');
      expect(logArgs[1]).toBe('ad_account');
      expect(typeof logArgs[2]).toBe('string');
      expect(logArgs[3]).toBe(body);
    });

    it('handles duplicate webhook gracefully (P2002)', async () => {
      process.env.META_APP_SECRET = 'test-secret';
      mockWebhooksService.logWebhookEvent.mockRejectedValue({ code: 'P2002' });

      const body = { object: 'ad_account', entry: [] };
      const { rawBody, signature } = signWebhookBody(body);

      const result = await controller.handleWebhook(body, signature, { rawBody });

      expect(result).toBe('ok');
    });

    it('handles unknown webhook event type', async () => {
      process.env.META_APP_SECRET = 'test-secret';
      const body = { object: 'unknown_type', entry: [] };
      const { rawBody, signature } = signWebhookBody(body);

      const result = await controller.handleWebhook(body, signature, { rawBody });

      expect(result).toBe('ok');
      const logArgs = mockWebhooksService.logWebhookEvent.mock.calls[0];
      expect(logArgs[0]).toBe('meta-marketing');
      expect(logArgs[1]).toBe('unknown_type');
      expect(typeof logArgs[2]).toBe('string');
      expect(logArgs[3]).toBe(body);
    });

    it('rejects with 403 on signature mismatch', async () => {
      process.env.META_APP_SECRET = 'test-secret';
      const body = { object: 'ad_account', entry: [] };

      await expect(
        controller.handleWebhook(body, 'sha256=invalidhash', {
          rawBody: Buffer.from(JSON.stringify(body)),
        }),
      ).rejects.toThrow('Invalid Meta webhook signature');
    });

    it('rejects when app secret is configured and signature is missing', async () => {
      process.env.META_APP_SECRET = 'test-secret';
      const body = { object: 'ad_account', entry: [] };

      await expect(
        controller.handleWebhook(body, '', {
          rawBody: Buffer.from(JSON.stringify(body)),
        }),
      ).rejects.toThrow('Missing Meta webhook signature');
    });

    it('skips signature check when no app secret set outside CI', async () => {
      const previousCi = process.env.CI;
      delete process.env.META_APP_SECRET;
      process.env.CI = 'false';

      try {
        const body = { object: 'ad_account', entry: [] };

        const result = await controller.handleWebhook(body, 'sha256=anything', {
          rawBody: undefined,
        });

        expect(result).toBe('ok');
      } finally {
        if (previousCi === undefined) {
          delete process.env.CI;
        } else {
          process.env.CI = previousCi;
        }
      }
    });
  });
});
