import { Prisma, PrismaClient } from '@prisma/client';

export type PaidCheckoutEffectClient = Pick<
  PrismaClient,
  | '$transaction'
  | '$executeRaw'
  | 'affiliateLink'
  | 'affiliatePartner'
  | 'affiliateProduct'
  | 'auditLog'
  | 'checkoutOrder'
  | 'checkoutSocialLead'
  | 'contact'
  | 'memberArea'
>;

type AuditEventClient = Pick<PrismaClient, 'auditLog'>;

export type PaidCheckoutScope = {
  orderId: string;
  workspaceId: string;
};

export function readPaidCheckoutOrderScope(
  args: Prisma.CheckoutOrderUpdateManyArgs,
): PaidCheckoutScope | null {
  const orderId = typeof args.where?.id === 'string' ? args.where.id : null;
  const workspaceId = typeof args.where?.workspaceId === 'string' ? args.where.workspaceId : null;
  return orderId && workspaceId ? { orderId, workspaceId } : null;
}

export function readJsonObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
}

export function readString(value: Prisma.JsonValue | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readPositiveInteger(value: Prisma.JsonValue | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

export function readPositiveNumber(value: Prisma.JsonValue | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value > 0 ? value : null;
}

export async function appendAuditEventIfMissing(
  prisma: AuditEventClient,
  input: {
    workspaceId: string;
    action: string;
    resource: string;
    resourceId: string;
    details: Record<string, unknown>;
  },
) {
  const existing = await prisma.auditLog.findFirst({
    where: {
      workspaceId: input.workspaceId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
    },
    select: { id: true },
  });

  if (existing) {
    return false;
  }

  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      details: input.details as Prisma.InputJsonValue,
    },
  });
  return true;
}
