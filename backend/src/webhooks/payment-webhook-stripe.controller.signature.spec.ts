/**
 * Security + idempotency contract for PaymentWebhookStripeController.handleStripe.
 *
 * Focus (complements payment-webhook.controller.{spec,idempotency.spec}.ts which
 * cover the happy-path sale/refund/dispute flows):
 *   - invalid signature is rejected (BadRequestException) before processing begins
 *   - missing signature header is rejected when a secret is configured
 *   - production with no configured secret is rejected (ForbiddenException)
 *   - already-processed WebhookEvent short-circuits a post-TTL replay (no double
 *     sale processing, no second markWebhookProcessed)
 *   - an unknown event type is acknowledged without invoking a sale handler
 */
const mockConstructEvent = jest.fn();

jest.mock('../billing/stripe-runtime', () => ({
  StripeRuntime: jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  })),
}));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { buildPaymentWebhookController as buildController } from '../../test/payment-webhook-controller-harness';

const ENV_KEYS = [
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRETS',
  'STRIPE_SECRET_KEY',
  'NODE_ENV',
] as const;

describe('PaymentWebhookStripeController.handleStripe — signature + replay contract', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mockConstructEvent.mockReset();
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

  it('rejects an invalid signature with BadRequestException and never processes the sale', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_local';
    mockConstructEvent.mockImplementation(() => {
      throw new Error('no signatures found matching the expected signature for payload');
    });

    const { controller, stripeWebhookProcessor, webhooksService, redis } = buildController();

    await expect(
      controller.handleStripe(
        {
          body: {},
          rawBody: Buffer.from('{"id":"evt_bad"}'),
          url: '/webhook/payment/stripe',
        },
        't=1,v1=forged',
        undefined,
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(stripeWebhookProcessor.processSaleSucceeded).not.toHaveBeenCalled();
    expect(webhooksService.logWebhookEvent).not.toHaveBeenCalled();
    // signature failure happens before idempotency reservation
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('rejects a missing stripe-signature header when a secret is configured', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_local';

    const { controller, stripeWebhookProcessor } = buildController();

    await expect(
      controller.handleStripe(
        {
          body: {},
          rawBody: Buffer.from('{"id":"evt_no_sig"}'),
          url: '/webhook/payment/stripe',
        },
        undefined,
        undefined,
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockConstructEvent).not.toHaveBeenCalled();
    expect(stripeWebhookProcessor.processSaleSucceeded).not.toHaveBeenCalled();
  });

  it('refuses to process in production when no webhook secret is configured', async () => {
    process.env.NODE_ENV = 'production';

    const { controller, webhooksService } = buildController();

    await expect(
      controller.handleStripe(
        {
          body: { id: 'evt_prod', type: 'payment_intent.succeeded' },
          rawBody: Buffer.from('{"id":"evt_prod"}'),
          url: '/webhook/payment/stripe',
        },
        't=1,v1=anything',
        undefined,
        { id: 'evt_prod', type: 'payment_intent.succeeded' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(webhooksService.logWebhookEvent).not.toHaveBeenCalled();
  });

  it('short-circuits a post-TTL replay when the WebhookEvent is already processed', async () => {
    // No secret configured (dev): event is taken verbatim from the body, signature
    // verification is bypassed, so we exercise the replay guard directly.
    const { controller, redis, webhooksService, stripeWebhookProcessor } = buildController();
    // Redis NX returns OK (key expired after the 300s TTL) so the request is not
    // caught by the Redis dedupe and reaches the WebhookEvent.status guard.
    redis.set.mockResolvedValueOnce('OK');
    webhooksService.logWebhookEvent.mockResolvedValueOnce({
      id: 'we_replayed',
      status: 'processed',
    });

    const event = {
      id: 'evt_replay_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_replay_1',
          status: 'succeeded',
          metadata: { type: 'sale', workspace_id: 'ws-1', kloel_order_id: 'order-1' },
        },
      },
    };

    const result = await controller.handleStripe(
      { body: event, rawBody: '', url: '/webhook/payment/stripe' },
      undefined,
      'evt_replay_1',
      event,
    );

    expect(result).toEqual({
      received: true,
      skipped: true,
      reason: 'already_processed',
    });
    // The whole point of the guard: the sale is not re-processed on replay,
    // so no double ledger/transfer effect and no second processed-mark.
    expect(stripeWebhookProcessor.processSaleSucceeded).not.toHaveBeenCalled();
    expect(webhooksService.markWebhookProcessed).not.toHaveBeenCalled();
  });

  it('acknowledges an unknown event type without invoking a sale handler', async () => {
    const { controller, redis, webhooksService, stripeWebhookProcessor, connectReversalService } =
      buildController();
    redis.set.mockResolvedValueOnce('OK');
    webhooksService.logWebhookEvent.mockResolvedValueOnce({ id: 'we_unknown', status: 'received' });

    const event = {
      id: 'evt_unknown_1',
      type: 'invoice.finalized',
      data: { object: { id: 'in_1' } },
    };

    const result = await controller.handleStripe(
      { body: event, rawBody: '', url: '/webhook/payment/stripe' },
      undefined,
      'evt_unknown_1',
      event,
    );

    expect(result).toEqual({ received: true });
    expect(stripeWebhookProcessor.processSaleSucceeded).not.toHaveBeenCalled();
    expect(connectReversalService.processRefund).not.toHaveBeenCalled();
    expect(connectReversalService.processDispute).not.toHaveBeenCalled();
    // Unknown-but-acknowledged events are still marked processed for the audit trail.
    expect(webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_unknown');
  });
});
