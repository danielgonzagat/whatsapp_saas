import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FinancialAlertService } from '../../common/financial-alert.service';
import { activatePlanFeatures } from '../billing-plan-features';
import { notifyCustomerPaymentConfirmedHelper } from '../billing-webhook.helpers';
import type { StripeCheckoutSession } from '../stripe-types';
import type { WhatsappNotifier } from '../billing-webhook.types';

export interface FulfillCheckoutDeps {
  prisma: PrismaService;
  logger: Logger;
  financialAlert: FinancialAlertService | undefined;
  resolveWhatsappService: () => Promise<WhatsappNotifier | null>;
}

export async function fulfillCheckout(deps: FulfillCheckoutDeps, session: StripeCheckoutSession) {
  const workspaceId = session.metadata?.workspaceId;
  const plan = session.metadata?.plan || 'PRO';
  const subscriptionId = session.subscription as string;
  if (!workspaceId) {
    return;
  }

  const { prisma, logger, financialAlert, resolveWhatsappService } = deps;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    logger.warn(
      `fulfillCheckout: workspace ${workspaceId} not found, skipping subscription upsert`,
    );
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.subscription.upsert({
        where: { workspaceId },
        update: {
          status: 'ACTIVE',
          plan,
          stripeId: subscriptionId,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
        },
        create: {
          workspaceId,
          status: 'ACTIVE',
          plan,
          stripeId: subscriptionId,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
        },
      });
      await activatePlanFeatures(tx, workspaceId, plan);
      await tx.auditLog.create({
        data: {
          workspaceId,
          action: 'subscription.created',
          resource: 'subscription',
          resourceId: subscriptionId,
          details: { plan, mode: 'stripe_checkout' },
        },
      });
    },
    { isolationLevel: 'ReadCommitted' },
  );

  const whatsappService = await resolveWhatsappService();
  await notifyCustomerPaymentConfirmedHelper(
    logger,
    prisma,
    whatsappService,
    workspaceId,
    session,
    plan,
    financialAlert,
  );
  logger.log(`Subscription ACTIVATED for Workspace ${workspaceId} - Plan: ${plan}`);
}
