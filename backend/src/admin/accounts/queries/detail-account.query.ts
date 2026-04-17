import { OrderStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { asProviderSettings } from '../../../whatsapp/provider-settings.types';

export interface AdminAccountAgent {
  id: string;
  name: string;
  email: string;
  role: string;
  kycStatus: string;
  kycSubmittedAt: string | null;
  kycApprovedAt: string | null;
  kycRejectedReason: string | null;
}

export interface AdminAccountKycDocument {
  id: string;
  type: string;
  fileUrl: string;
  fileName: string;
  status: string;
  rejectedReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AdminAccountDetail {
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  ownerAgentId: string | null;
  ownerEmail: string | null;
  lifecycle: {
    suspended: boolean;
    blocked: boolean;
    frozenBalanceInCents: number;
    reason: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  agents: AdminAccountAgent[];
  kycDocuments: AdminAccountKycDocument[];
  productCount: number;
  gmvLast30dInCents: number;
  gmvAllTimeInCents: number;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: OrderStatus;
    totalInCents: number;
    customerEmail: string;
    createdAt: string;
    paidAt: string | null;
  }>;
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PAID_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

export async function getAdminAccountDetail(
  prisma: PrismaService,
  workspaceId: string,
): Promise<AdminAccountDetail | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      providerSettings: true,
      agents: {
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          kycStatus: true,
          kycSubmittedAt: true,
          kycApprovedAt: true,
          kycRejectedReason: true,
        },
      },
      kycDocuments: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          fileUrl: true,
          fileName: true,
          status: true,
          rejectedReason: true,
          reviewedAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!workspace) return null;
  const owner =
    workspace.agents.find((agent) => agent.role === 'ADMIN') ?? workspace.agents[0] ?? null;
  const providerSettings = asProviderSettings(workspace.providerSettings);
  const accountAdminState =
    providerSettings.accountAdmin &&
    typeof providerSettings.accountAdmin === 'object' &&
    !Array.isArray(providerSettings.accountAdmin)
      ? (providerSettings.accountAdmin as Record<string, unknown>)
      : {};

  const windowFrom = new Date(Date.now() - WINDOW_MS);
  const [gmv30d, gmvAll, productCount, recentOrders] = await Promise.all([
    prisma.checkoutOrder.aggregate({
      where: {
        workspaceId,
        status: { in: PAID_STATUSES },
        paidAt: { gte: windowFrom },
      },
      _sum: { totalInCents: true },
    }),
    prisma.checkoutOrder.aggregate({
      where: { workspaceId, status: { in: PAID_STATUSES } },
      _sum: { totalInCents: true },
    }),
    prisma.product.count({ where: { workspaceId } }),
    prisma.checkoutOrder.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalInCents: true,
        customerEmail: true,
        createdAt: true,
        paidAt: true,
      },
    }),
  ]);

  return {
    workspaceId: workspace.id,
    name: workspace.name,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    ownerAgentId: owner?.id ?? null,
    ownerEmail: owner?.email ?? null,
    lifecycle: {
      suspended: accountAdminState.suspended === true,
      blocked: accountAdminState.blocked === true,
      frozenBalanceInCents: Number(accountAdminState.frozenBalanceInCents ?? 0),
      reason:
        typeof accountAdminState.reason === 'string' && accountAdminState.reason.trim()
          ? accountAdminState.reason.trim()
          : null,
      updatedAt:
        typeof accountAdminState.updatedAt === 'string' && accountAdminState.updatedAt.trim()
          ? accountAdminState.updatedAt
          : null,
      updatedBy:
        typeof accountAdminState.updatedBy === 'string' && accountAdminState.updatedBy.trim()
          ? accountAdminState.updatedBy
          : null,
    },
    agents: workspace.agents.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      role: a.role,
      kycStatus: a.kycStatus,
      kycSubmittedAt: a.kycSubmittedAt?.toISOString() ?? null,
      kycApprovedAt: a.kycApprovedAt?.toISOString() ?? null,
      kycRejectedReason: a.kycRejectedReason,
    })),
    kycDocuments: workspace.kycDocuments.map((d) => ({
      id: d.id,
      type: d.type,
      fileUrl: d.fileUrl,
      fileName: d.fileName,
      status: d.status,
      rejectedReason: d.rejectedReason,
      reviewedAt: d.reviewedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
    productCount,
    gmvLast30dInCents: Number(gmv30d._sum.totalInCents ?? 0),
    gmvAllTimeInCents: Number(gmvAll._sum.totalInCents ?? 0),
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      totalInCents: o.totalInCents,
      customerEmail: o.customerEmail,
      createdAt: o.createdAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? null,
    })),
  };
}
