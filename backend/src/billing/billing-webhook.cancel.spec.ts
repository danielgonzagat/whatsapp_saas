import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { castMock } from '../../test/helpers/cast-mock';
import { partialMatch } from '../../test/helpers/match-instance';
import { cancelSubscriptionByStripeId } from './billing-webhook.cancel';
import type { PrismaService } from '../prisma/prisma.service';
import type { StripeClient } from './stripe-types';

interface TxShape {
  subscription: { updateMany: jest.Mock; findFirst: jest.Mock };
  auditLog: { create: jest.Mock };
}

describe('cancelSubscriptionByStripeId', () => {
  let tx: TxShape;
  let prisma: { $transaction: jest.Mock };
  let retrieve: jest.Mock;
  let resolveWorkspaceId: jest.Mock;
  let deps: Parameters<typeof cancelSubscriptionByStripeId>[0];

  beforeEach(() => {
    tx = {
      subscription: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = { $transaction: jest.fn((fn: (t: TxShape) => unknown) => fn(tx)) };
    retrieve = jest.fn().mockResolvedValue({ id: 'sub_1' });
    resolveWorkspaceId = jest.fn().mockResolvedValue('ws-1');
    deps = {
      prisma: castMock<PrismaService>(prisma),
      stripe: castMock<StripeClient>({ subscriptions: { retrieve } }),
      logger: new Logger('cancel-test'),
      resolveWorkspaceId,
    };
  });

  it('cancels scoped to the workspace resolved from the live Stripe subscription', async () => {
    await cancelSubscriptionByStripeId(deps, 'sub_1');

    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(tx.subscription.updateMany).toHaveBeenCalledWith(
      partialMatch({
        where: { stripeId: 'sub_1', workspaceId: 'ws-1' },
        data: { status: 'CANCELED' },
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      partialMatch({
        data: partialMatch({
          workspaceId: 'ws-1',
          action: 'subscription.cancelled',
          details: partialMatch({ mode: 'stripe_webhook' }),
        }),
      }),
    );
    // Workspace was resolved → no fallback lookup.
    expect(tx.subscription.findFirst).not.toHaveBeenCalled();
  });

  it('swallows a P2025 (record not found) instead of failing the webhook', async () => {
    tx.auditLog.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(cancelSubscriptionByStripeId(deps, 'sub_1')).resolves.toBeUndefined();
  });

  it('rethrows non-P2025 database failures', async () => {
    tx.subscription.updateMany.mockRejectedValue(new Error('db down'));

    await expect(cancelSubscriptionByStripeId(deps, 'sub_1')).rejects.toThrow('db down');
  });

  it('falls back to the local record when Stripe lookup fails', async () => {
    retrieve.mockRejectedValue(new Error('stripe unreachable'));
    tx.subscription.findFirst.mockResolvedValue({
      workspaceId: 'ws-9',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    await cancelSubscriptionByStripeId(deps, 'sub_1');

    // Optimistic-concurrency guard: scoped by workspace AND last-seen updatedAt.
    expect(tx.subscription.updateMany).toHaveBeenCalledWith(
      partialMatch({
        where: {
          stripeId: 'sub_1',
          workspaceId: 'ws-9',
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
        data: { status: 'CANCELED' },
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      partialMatch({
        data: partialMatch({ details: partialMatch({ mode: 'stripe_webhook_fallback' }) }),
      }),
    );
  });

  it('uses the fallback path directly when no Stripe client is configured', async () => {
    deps = { ...deps, stripe: undefined };
    tx.subscription.findFirst.mockResolvedValue({ workspaceId: 'ws-2', updatedAt: new Date() });

    await cancelSubscriptionByStripeId(deps, 'sub_2');

    expect(retrieve).not.toHaveBeenCalled();
    expect(resolveWorkspaceId).not.toHaveBeenCalled();
    expect(tx.subscription.updateMany).toHaveBeenCalledWith(
      partialMatch({ where: partialMatch({ stripeId: 'sub_2', workspaceId: 'ws-2' }) }),
    );
  });

  it('is a no-op (warn only) when neither Stripe nor the local DB know the subscription', async () => {
    deps = { ...deps, stripe: undefined };
    tx.subscription.findFirst.mockResolvedValue(null);

    await cancelSubscriptionByStripeId(deps, 'sub_ghost');

    expect(tx.subscription.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
