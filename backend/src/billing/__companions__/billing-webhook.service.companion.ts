import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinancialAlertService } from '../../common/financial-alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { StripeClient, StripeSubscription } from '../stripe-types';

export interface MarkSubscriptionStatusDeps {
  prisma: PrismaService;
  stripe: StripeClient | undefined;
  logger: Logger;
  financialAlert: FinancialAlertService | undefined;
  resolveWorkspaceId: (subscription: StripeSubscription) => Promise<string | null>;
  notifyOps: (event: string, payload: Record<string, unknown>) => Promise<void>;
}

export async function markSubscriptionStatusHelper(
  deps: MarkSubscriptionStatusDeps,
  stripeSubscriptionId: string,
  status: string,
): Promise<void> {
  let workspaceId: string | null = null;
  if (deps.stripe) {
    try {
      const sub = await deps.stripe.subscriptions.retrieve(stripeSubscriptionId);
      workspaceId = await deps.resolveWorkspaceId(sub);
    } catch {
      deps.logger.debug('Unable to resolve workspace from Stripe subscription; checking local.');
    }
  }
  if (!workspaceId) {
    const subRecord = await deps.prisma.subscription.findFirst({
      where: { stripeId: stripeSubscriptionId },
      select: { workspaceId: true },
    });
    workspaceId = subRecord?.workspaceId || null;
  }
  if (!workspaceId) return;

  if (['PAST_DUE', 'CANCELED'].includes(status)) {
    const ws = await deps.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (ws?.providerSettings as Record<string, unknown>) || {};
    const autopilot = (settings.autopilot ?? {}) as Record<string, unknown>;
    const nextSettings = {
      ...settings,
      autopilot: { ...autopilot, enabled: false },
      billingSuspended: true,
    };
    await deps.prisma.$transaction(
      async (tx) => {
        const existing = await tx.subscription.findUnique({
          where: { workspaceId },
          select: { id: true },
        });
        if (!existing) {
          deps.logger.warn(
            `markSubscriptionStatus: subscription not found for workspace ${workspaceId}`,
          );
          return;
        }
        await tx.subscription.update({ where: { workspaceId }, data: { status } });
        await tx.workspace.update({
          where: { id: workspaceId },
          data: { providerSettings: nextSettings },
        });
        await tx.auditLog.create({
          data: {
            workspaceId,
            action: 'SUBSCRIPTION_STATUS',
            resource: 'subscription',
            resourceId: stripeSubscriptionId,
            details: { status, billingSuspended: true },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
    await deps.notifyOps('billing_suspended', {
      workspaceId,
      subscription: stripeSubscriptionId,
      status,
    });
  } else if (status === 'ACTIVE') {
    const ws = await deps.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (ws?.providerSettings as Record<string, unknown>) || {};
    const nextSettings = { ...settings };
    if (settings.billingSuspended) {
      delete nextSettings.billingSuspended;
    }
    await deps.prisma.$transaction(
      async (tx) => {
        const existing = await tx.subscription.findUnique({
          where: { workspaceId },
          select: { id: true },
        });
        if (!existing) {
          deps.logger.warn(
            `markSubscriptionStatus: subscription not found for workspace ${workspaceId}`,
          );
          return;
        }
        await tx.subscription.update({ where: { workspaceId }, data: { status } });
        if (settings.billingSuspended) {
          await tx.workspace.update({
            where: { id: workspaceId },
            data: { providerSettings: nextSettings as Prisma.InputJsonValue },
          });
        }
        await tx.auditLog.create({
          data: {
            workspaceId,
            action: 'SUBSCRIPTION_STATUS',
            resource: 'subscription',
            resourceId: stripeSubscriptionId,
            details: { status, billingSuspended: false },
          },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
    await deps.notifyOps('billing_active', {
      workspaceId,
      subscription: stripeSubscriptionId,
      status,
    });
  } else {
    try {
      await deps.prisma.subscription.update({
        where: { workspaceId },
        data: { status },
      });
    } catch (error: unknown) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')) {
        throw error;
      }
      deps.logger.warn(
        `markSubscriptionStatus: subscription not found for workspace ${workspaceId}`,
      );
    }
  }
}
