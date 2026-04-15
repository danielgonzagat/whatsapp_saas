import { OrderStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export interface AdminAccountRow {
  workspaceId: string;
  name: string;
  ownerEmail: string | null;
  ownerName: string | null;
  createdAt: string;
  kycStatus: string;
  gmvLast30dInCents: number;
  lastSaleAt: string | null;
  productCount: number;
}

export interface ListAccountsInput {
  search?: string;
  kycStatus?: string;
  skip?: number;
  take?: number;
}

interface ListAccountsResult {
  items: AdminAccountRow[];
  total: number;
}

const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PAID_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

/**
 * Lists workspaces (= producer accounts) with the aggregated metrics an
 * operator needs to spot problem accounts at a glance:
 *   - KYC status of the primary ADMIN agent (the owner)
 *   - 30-day rolling GMV
 *   - last sale timestamp
 *   - product count
 *
 * Paginated via skip/take (cursor pagination can be added later — skip
 * is fine up to ~10k workspaces and keeps the frontend simple).
 */
export async function listAdminAccounts(
  prisma: PrismaService,
  input: ListAccountsInput,
): Promise<ListAccountsResult> {
  const skip = Math.max(0, input.skip ?? 0);
  const take = Math.min(MAX_TAKE, Math.max(1, input.take ?? DEFAULT_TAKE));

  const workspaceWhere: Prisma.WorkspaceWhereInput = {};
  if (input.search) {
    workspaceWhere.OR = [
      { name: { contains: input.search, mode: 'insensitive' } },
      {
        agents: {
          some: {
            email: { contains: input.search, mode: 'insensitive' },
          },
        },
      },
    ];
  }
  if (input.kycStatus) {
    workspaceWhere.agents = {
      some: { role: 'ADMIN', kycStatus: input.kycStatus },
    };
  }

  const [workspaces, total] = await prisma.$transaction([
    prisma.workspace.findMany({
      where: workspaceWhere,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        createdAt: true,
        agents: {
          where: { role: 'ADMIN' },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            email: true,
            name: true,
            kycStatus: true,
            kycSubmittedAt: true,
          },
        },
        _count: { select: { agents: true } },
      },
    }),
    prisma.workspace.count({ where: workspaceWhere }),
  ]);

  if (workspaces.length === 0) {
    return { items: [], total };
  }

  // Aggregate 30-day GMV + last sale per workspace in one round trip.
  const workspaceIds = workspaces.map((w) => w.id);
  const windowFrom = new Date(Date.now() - WINDOW_MS);

  const [gmvGrouped, lastSaleGrouped, productCounts] = await Promise.all([
    prisma.checkoutOrder.groupBy({
      by: ['workspaceId'],
      where: {
        workspaceId: { in: workspaceIds },
        status: { in: PAID_STATUSES },
        paidAt: { gte: windowFrom },
      },
      _sum: { totalInCents: true },
    }),
    prisma.checkoutOrder.groupBy({
      by: ['workspaceId'],
      where: {
        workspaceId: { in: workspaceIds },
        status: { in: PAID_STATUSES },
      },
      _max: { paidAt: true },
    }),
    prisma.product.groupBy({
      by: ['workspaceId'],
      where: { workspaceId: { in: workspaceIds } },
      _count: { _all: true },
    }),
  ]);

  const gmvMap = new Map(gmvGrouped.map((row) => [row.workspaceId, row._sum.totalInCents ?? 0]));
  const lastSaleMap = new Map(lastSaleGrouped.map((row) => [row.workspaceId, row._max.paidAt]));
  const productMap = new Map(productCounts.map((row) => [row.workspaceId, row._count._all]));

  const items: AdminAccountRow[] = workspaces.map((w) => {
    const owner = w.agents[0] ?? null;
    const lastSale = lastSaleMap.get(w.id) ?? null;
    return {
      workspaceId: w.id,
      name: w.name,
      ownerEmail: owner?.email ?? null,
      ownerName: owner?.name ?? null,
      createdAt: w.createdAt.toISOString(),
      kycStatus: owner?.kycStatus ?? 'unknown',
      gmvLast30dInCents: Number(gmvMap.get(w.id) ?? 0),
      lastSaleAt: lastSale ? lastSale.toISOString() : null,
      productCount: productMap.get(w.id) ?? 0,
    };
  });

  return { items, total };
}
