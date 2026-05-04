import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { StripeClient, StripeSubscription } from '../stripe-types';

export interface CancelSubscriptionDeps {
  prisma: PrismaService;
  stripe: StripeClient | undefined;
  logger: Logger;
  resolveWorkspaceId: (sub: StripeSubscription) => Promise<string | null>;
}

export async function cancelSubscriptionByStripeId(deps: CancelSubscriptionDeps, stripeId: string) {
  const { prisma, stripe, logger, resolveWorkspaceId } = deps;
  let workspaceId: string | null = null;

  if (stripe) {
    try {
      const sub = await stripe.subscriptions.retrieve(stripeId);
      workspaceId = await resolveWorkspaceId(sub);
    } catch {
      logger.debug('Unable to resolve workspace from Stripe subscription; checking local record.');
    }
  }

  if (workspaceId) {
    await prisma.$transaction(async (tx) => {
      try {
        await tx.subscription.updateMany({
          where: { stripeId, workspaceId },
          data: { status: 'CANCELED' },
        });
        await tx.auditLog.create({
          data: {
            workspaceId,
            action: 'subscription.cancelled',
            resource: 'subscription',
            resourceId: stripeId,
            details: { mode: 'stripe_webhook', stripeId },
          },
        });
        logger.log(`Subscription CANCELED: ${stripeId}`);
      } catch (error: unknown) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')) {
          throw error;
        }
        logger.warn(
          `cancelSubscriptionByStripeId: subscription not found for stripeId ${stripeId}`,
        );
      }
    });
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.subscription.findFirst({
        where: { stripeId },
        select: { workspaceId: true, updatedAt: true },
      });

      if (!existing) {
        logger.warn(
          `cancelSubscriptionByStripeId: subscription not found for stripeId ${stripeId}`,
        );
        return;
      }

      await tx.subscription.updateMany({
        where: {
          stripeId,
          workspaceId: existing.workspaceId,
          updatedAt: existing.updatedAt,
        },
        data: { status: 'CANCELED' },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: existing.workspaceId,
          action: 'subscription.cancelled',
          resource: 'subscription',
          resourceId: stripeId,
          details: { mode: 'stripe_webhook_fallback', stripeId },
        },
      });

      logger.log(`Subscription CANCELED: ${stripeId}`);
    },
    { isolationLevel: 'ReadCommitted' },
  );
}
