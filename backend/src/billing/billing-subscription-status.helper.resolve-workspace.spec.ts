import { resolveWorkspaceIdHelper } from './billing-subscription-status.helper';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
import { castMock } from '../../test/helpers/cast-mock';
import type { PrismaService } from '../prisma/prisma.service';
import type { StripeSubscription } from './stripe-types';

const asSubscription = (s: Record<string, unknown>): StripeSubscription =>
  castMock<StripeSubscription>(s);

describe('resolveWorkspaceIdHelper', () => {
  it('returns the workspaceId stamped on subscription metadata without hitting the DB', async () => {
    const prisma = createPartialPrismaMock({ workspace: ['findFirst'] });
    const subscription = asSubscription({
      metadata: { workspaceId: 'ws_meta' },
      customer: 'cus_123',
    });

    const result = await resolveWorkspaceIdHelper(castMock<PrismaService>(prisma), subscription);

    expect(result).toBe('ws_meta');
    expect(prisma.workspace.findFirst).not.toHaveBeenCalled();
  });

  it('maps the Stripe customer id to the owning workspace when metadata is absent', async () => {
    const prisma = createPartialPrismaMock({ workspace: ['findFirst'] });
    prisma.workspace.findFirst.mockResolvedValue({ id: 'ws_from_customer' });
    const subscription = asSubscription({
      metadata: {},
      customer: 'cus_456',
    });

    const result = await resolveWorkspaceIdHelper(castMock<PrismaService>(prisma), subscription);

    expect(result).toBe('ws_from_customer');
    expect(prisma.workspace.findFirst).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_456' },
      select: { id: true },
    });
  });

  it('returns null when there is no metadata workspaceId and no customer id', async () => {
    const prisma = createPartialPrismaMock({ workspace: ['findFirst'] });
    const subscription = asSubscription({ metadata: {}, customer: null });

    const result = await resolveWorkspaceIdHelper(castMock<PrismaService>(prisma), subscription);

    expect(result).toBeNull();
    expect(prisma.workspace.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when the customer id maps to no workspace (never leaks the cus_ id)', async () => {
    const prisma = createPartialPrismaMock({ workspace: ['findFirst'] });
    prisma.workspace.findFirst.mockResolvedValue(null);
    const subscription = asSubscription({ metadata: {}, customer: 'cus_orphan' });

    const result = await resolveWorkspaceIdHelper(castMock<PrismaService>(prisma), subscription);

    expect(result).toBeNull();
  });
});
