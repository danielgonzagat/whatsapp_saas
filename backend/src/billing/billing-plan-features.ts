import { Logger } from '@nestjs/common';

const logger = new Logger('BillingPlanFeatures');

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

/** Activate plan features for a workspace.
 *  Caller is responsible for wrapping in a transaction when needed. */
export async function activatePlanFeatures(
  prisma: { workspace: { findUnique(args: any): Promise<any>; update(args: any): Promise<any> } },
  workspaceId: string,
  plan: string,
): Promise<void> {
  const limits = PLAN_LIMITS[plan.toUpperCase()] || PLAN_LIMITS.STARTER;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
  await prisma.workspace.update({
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
      },
    },
  });
  logger.log(`Plan features activated for ${workspaceId}: ${plan} ${JSON.stringify(limits)}`);
}
