import type { Prisma, PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';

const logger = new Logger('BillingPlanFeatures');

/**
 * Minimal Prisma surface that this module needs: the interactive
 * `$transaction(fn, options)` overload — including `isolationLevel` —
 * plus the `workspace` delegate. Typing the parameter to this interface
 * avoids the previous `as PrismaClient` force-cast and keeps the contract
 * explicit at every call site.
 */
type PrismaTxLike = {
  $transaction: <R>(
    fn: (tx: Pick<PrismaClient, 'workspace'>) => Promise<R>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) => Promise<R>;
  workspace: PrismaClient['workspace'];
};

const PLAN_LIMITS: Record<
  string,
  {
    monthlyMessages: number;
    whatsappNumbers: number;
    autopilotLimit: number;
    flowsLimit: number;
    campaignsUnlimited: boolean;
    apiAccess: boolean;
    prioritySupport: boolean;
  }
> = {
  STARTER: {
    monthlyMessages: 1000,
    whatsappNumbers: 1,
    autopilotLimit: 100,
    flowsLimit: 3,
    campaignsUnlimited: false,
    apiAccess: false,
    prioritySupport: false,
  },
  PRO: {
    monthlyMessages: 10000,
    whatsappNumbers: 3,
    autopilotLimit: -1,
    flowsLimit: -1,
    campaignsUnlimited: true,
    apiAccess: true,
    prioritySupport: false,
  },
  ENTERPRISE: {
    monthlyMessages: -1,
    whatsappNumbers: -1,
    autopilotLimit: -1,
    flowsLimit: -1,
    campaignsUnlimited: true,
    apiAccess: true,
    prioritySupport: true,
  },
};

/** Activate plan features for a workspace. */
export async function activatePlanFeatures(
  prisma: PrismaTxLike,
  workspaceId: string,
  plan: string,
): Promise<void> {
  const limits = PLAN_LIMITS[plan.toUpperCase()] || PLAN_LIMITS.STARTER;
  await prisma.$transaction(
    async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
      await tx.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: {
            ...currentSettings,
            billingSuspended: false,
            plan: { name: plan, limits, activatedAt: new Date().toISOString() },
            autopilot: {
              ...((currentSettings.autopilot ?? {}) as Record<string, unknown>),
              enabled: true,
              monthlyLimit: limits.autopilotLimit,
            },
          } as Prisma.InputJsonValue,
        },
      });
    },
    { isolationLevel: 'ReadCommitted' },
  );
  logger.log(`Plan features activated for ${workspaceId}: ${plan} ${JSON.stringify(limits)}`);
}
