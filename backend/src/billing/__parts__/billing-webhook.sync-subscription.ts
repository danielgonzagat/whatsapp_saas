import { mapStripeStatus } from '../billing-webhook.helpers';
import { PrismaService } from '../../prisma/prisma.service';
import type { StripeSubscription } from '../stripe-types';
import type { StripeSubscriptionWithPeriodEnd } from '../billing-webhook.types';

export interface SyncSubscriptionDeps {
  prisma: PrismaService;
  resolveWorkspaceId: (subscription: StripeSubscription) => Promise<string | null>;
}

export async function syncSubscriptionStatus(
  deps: SyncSubscriptionDeps,
  subscription: StripeSubscription,
): Promise<void> {
  const workspaceId = await deps.resolveWorkspaceId(subscription);
  if (!workspaceId) {
    return;
  }
  const status = mapStripeStatus(subscription.status);
  const currentPeriodEndRaw = (subscription as StripeSubscriptionWithPeriodEnd).current_period_end;
  const periodEnd = currentPeriodEndRaw ? new Date(currentPeriodEndRaw * 1000) : undefined;

  await deps.prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({
      where: { workspaceId },
      select: { plan: true },
    });

    const inferredPlan =
      existing?.plan || (subscription.metadata as Record<string, string> | null)?.plan || 'PRO';

    await tx.subscription.upsert({
      where: { workspaceId },
      update: {
        status,
        stripeId: subscription.id,
        currentPeriodEnd: periodEnd || new Date(),
      },
      create: {
        workspaceId,
        status,
        plan: inferredPlan,
        stripeId: subscription.id,
        currentPeriodEnd: periodEnd || new Date(),
      },
    });
  });
}
