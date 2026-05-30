/**
 * Security + idempotency contract for WebhooksController (inbound flow / finance /
 * omnichannel hooks). Complements webhook-replay.spec.ts (P2002 duplicate path):
 * here we assert the HMAC signature gate, the Meta X-Hub-Signature-256 gate, the
 * Redis dedupe replay short-circuit (downstream processor never invoked twice),
 * and the suspended-workspace guard.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { ForbiddenException, HttpException } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';

type RedisMock = { setnx: jest.Mock; expire: jest.Mock; lpush: jest.Mock; ltrim: jest.Mock };
type WebhooksServiceMock = {
  processWebhook: jest.Mock;
  processFinanceEvent: jest.Mock;
  updateMessageStatus: jest.Mock;
  processInstagramMessage: jest.Mock;
  logWebhookEvent: jest.Mock;
};
type PrismaMock = { workspace: { findUnique: jest.Mock } };

const ENV_KEYS = [
  'HOOKS_WEBHOOK_SECRET',
  'META_APP_SECRET',
  'FACEBOOK_APP_SECRET',
  'NODE_ENV',
] as const;

function sign(body: unknown, secret: string): string {
  return createHmac('sha256', secret)
    .update(Buffer.from(JSON.stringify(body)))
    .digest('hex');
}

function build() {
  const redis: RedisMock = {
    setnx: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue('OK'),
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue('OK'),
  };
  const webhooksService: WebhooksServiceMock = {
    processWebhook: jest.fn().mockResolvedValue({ executionId: 'exec-1' }),
    processFinanceEvent: jest.fn().mockResolvedValue({ status: 'paid' }),
    updateMessageStatus: jest.fn().mockResolvedValue({ updated: 1 }),
    processInstagramMessage: jest.fn().mockResolvedValue({ ok: true }),
    logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we-1', status: 'received' }),
  };
  const prisma: PrismaMock = {
    workspace: { findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }) },
  };
  const controller = new WebhooksController(
    webhooksService as never,
    redis as never,
    prisma as never,
  );
  return { controller, redis, webhooksService, prisma };
}

describe('WebhooksController — signature + replay contract', () => {
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

  it('accepts a valid HMAC signature and processes the flow webhook', async () => {
    process.env.HOOKS_WEBHOOK_SECRET = 'hooks-secret';
    const { controller, webhooksService } = build();
    const body = { phone: '5511999999999', status: 'paid' };

    const result = await controller.catchHook(
      'ws-1',
      'flow-1',
      body,
      {},
      sign(body, 'hooks-secret'),
      'evt-1',
      { body, rawBody: JSON.stringify(body) },
    );

    expect(result).toEqual(expect.objectContaining({ status: 'success', executionId: 'exec-1' }));
    expect(webhooksService.processWebhook).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid HMAC signature with ForbiddenException and processes nothing', async () => {
    process.env.HOOKS_WEBHOOK_SECRET = 'hooks-secret';
    const { controller, webhooksService } = build();
    const body = { phone: '5511999999999', status: 'paid' };

    await expect(
      controller.catchHook('ws-1', 'flow-1', body, {}, 'deadbeef', 'evt-2', {
        body,
        rawBody: JSON.stringify(body),
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(webhooksService.processWebhook).not.toHaveBeenCalled();
  });

  it('rejects a missing signature when the hooks secret is configured', async () => {
    process.env.HOOKS_WEBHOOK_SECRET = 'hooks-secret';
    const { controller, webhooksService } = build();
    const body = { status: 'paid', phone: '5511999999999' };

    await expect(
      controller.financeHook('ws-1', body, undefined, 'evt-3', {
        body,
        rawBody: JSON.stringify(body),
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(webhooksService.processFinanceEvent).not.toHaveBeenCalled();
  });

  it('is a no-op on Redis dedupe replay: returns 200 and never processes twice', async () => {
    process.env.HOOKS_WEBHOOK_SECRET = 'hooks-secret';
    const { controller, webhooksService, redis } = build();
    // SETNX returns 0 when the key already exists → duplicate delivery.
    redis.setnx.mockResolvedValueOnce(0);
    const body = { phone: '5511999999999', status: 'paid' };

    const promise = controller.catchHook(
      'ws-1',
      'flow-1',
      body,
      {},
      sign(body, 'hooks-secret'),
      'evt-dupe',
      { body, rawBody: JSON.stringify(body) },
    );

    await expect(promise).rejects.toThrow('Duplicate webhook');
    expect(webhooksService.processWebhook).not.toHaveBeenCalled();
    expect(webhooksService.logWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects a flow webhook for a billing-suspended workspace', async () => {
    process.env.HOOKS_WEBHOOK_SECRET = 'hooks-secret';
    const { controller, webhooksService, prisma } = build();
    prisma.workspace.findUnique.mockResolvedValueOnce({
      providerSettings: { billingSuspended: true },
    });
    const body = { phone: '5511999999999', status: 'paid' };

    await expect(
      controller.catchHook(
        'ws-suspended',
        'flow-1',
        body,
        {},
        sign(body, 'hooks-secret'),
        'evt-4',
        {
          body,
          rawBody: JSON.stringify(body),
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(webhooksService.processWebhook).not.toHaveBeenCalled();
  });

  it('rejects an Instagram webhook with an invalid Meta signature', async () => {
    process.env.META_APP_SECRET = 'meta-secret';
    const { controller, webhooksService } = build();
    const body = { object: 'instagram', entry: [] };

    await expect(
      controller.instagramWebhook('ws-1', body, 'sha256=badsignature', {
        body,
        rawBody: JSON.stringify(body),
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(webhooksService.processInstagramMessage).not.toHaveBeenCalled();
  });

  it('accepts an Instagram webhook with a valid Meta X-Hub-Signature-256', async () => {
    process.env.META_APP_SECRET = 'meta-secret';
    const { controller, webhooksService } = build();
    const body = { object: 'instagram', entry: [{ id: 'e1' }] };
    const rawBody = JSON.stringify(body);
    const digest = createHmac('sha256', 'meta-secret').update(Buffer.from(rawBody)).digest('hex');

    const result = await controller.instagramWebhook('ws-1', body, `sha256=${digest}`, {
      body,
      rawBody,
    });

    expect(result).toEqual(expect.objectContaining({ status: 'success' }));
    expect(webhooksService.processInstagramMessage).toHaveBeenCalledWith('ws-1', body);
  });
});
