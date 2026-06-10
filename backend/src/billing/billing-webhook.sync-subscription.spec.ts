import { castMock } from '../../test/helpers/cast-mock';
import { partialMatch } from '../../test/helpers/match-instance';
import { syncSubscriptionStatus } from './billing-webhook.sync-subscription';
import type { PrismaService } from '../prisma/prisma.service';
import type { StripeSubscription } from './stripe-types';

interface TxShape {
  subscription: { findUnique: jest.Mock; upsert: jest.Mock };
}

function buildSubscription(overrides: Record<string, unknown> = {}): StripeSubscription {
  return castMock<StripeSubscription>({
    id: 'sub_1',
    status: 'active',
    metadata: {},
    current_period_end: 1_767_225_600, // 2026-01-01T00:00:00Z
    ...overrides,
  });
}

describe('syncSubscriptionStatus', () => {
  let tx: TxShape;
  let prisma: { $transaction: jest.Mock };
  let resolveWorkspaceId: jest.Mock;
  let deps: Parameters<typeof syncSubscriptionStatus>[0];

  beforeEach(() => {
    tx = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    prisma = { $transaction: jest.fn((fn: (t: TxShape) => unknown) => fn(tx)) };
    resolveWorkspaceId = jest.fn().mockResolvedValue('ws-1');
    deps = { prisma: castMock<PrismaService>(prisma), resolveWorkspaceId };
  });

  it('does nothing when the subscription cannot be mapped to a workspace', async () => {
    resolveWorkspaceId.mockResolvedValue(null);

    await syncSubscriptionStatus(deps, buildSubscription());

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps the Stripe status and converts current_period_end (seconds) to a Date', async () => {
    await syncSubscriptionStatus(deps, buildSubscription({ status: 'past_due' }));

    expect(tx.subscription.upsert).toHaveBeenCalledWith(
      partialMatch({
        where: { workspaceId: 'ws-1' },
        update: partialMatch({
          status: 'PAST_DUE',
          stripeId: 'sub_1',
          currentPeriodEnd: new Date(1_767_225_600 * 1000),
        }),
      }),
    );
  });

  it('preserves the existing local plan over the Stripe metadata plan', async () => {
    tx.subscription.findUnique.mockResolvedValue({ plan: 'SCALE' });

    await syncSubscriptionStatus(deps, buildSubscription({ metadata: { plan: 'STARTER' } }));

    expect(tx.subscription.upsert).toHaveBeenCalledWith(
      partialMatch({ create: partialMatch({ plan: 'SCALE' }) }),
    );
  });

  it('falls back to the metadata plan, then PRO, when no local subscription exists', async () => {
    await syncSubscriptionStatus(deps, buildSubscription({ metadata: { plan: 'STARTER' } }));
    expect(tx.subscription.upsert).toHaveBeenCalledWith(
      partialMatch({ create: partialMatch({ plan: 'STARTER' }) }),
    );

    tx.subscription.upsert.mockClear();
    await syncSubscriptionStatus(deps, buildSubscription({ metadata: null }));
    expect(tx.subscription.upsert).toHaveBeenCalledWith(
      partialMatch({ create: partialMatch({ plan: 'PRO' }) }),
    );
  });

  it('treats canceled status as CANCELED and a missing period end as "now"', async () => {
    const before = Date.now();
    await syncSubscriptionStatus(
      deps,
      buildSubscription({ status: 'canceled', current_period_end: null }),
    );
    const after = Date.now();

    type UpsertArg = { update: { status: string; currentPeriodEnd: Date } };
    const calls = castMock<Array<[UpsertArg] | undefined>>(tx.subscription.upsert.mock.calls);
    const upsertArg = castMock<UpsertArg>(calls[0]?.[0]);
    expect(upsertArg.update.status).toBe('CANCELED');
    const periodEnd = upsertArg.update.currentPeriodEnd.getTime();
    expect(periodEnd).toBeGreaterThanOrEqual(before);
    expect(periodEnd).toBeLessThanOrEqual(after);
  });
});
