import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AdminClientRow {
  workspaceId: string;
  name: string;
  ownerEmail: string | null;
  ownerName: string | null;
  createdAt: string;
  kycStatus: string;
  gmvLast30dInCents: number;
  previousGmvLast30dInCents: number;
  growthRate: number | null;
  lastSaleAt: string | null;
  productCount: number;
  plan: string | null;
  subscriptionStatus: string | null;
  customDomain: string | null;
  healthScore: number;
}

export interface ListClientsResponse {
  items: AdminClientRow[];
  total: number;
}

interface ListClientsInput {
  search?: string;
  kycStatus?: string;
  skip?: number;
  take?: number;
}

const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PAID_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

function computeGrowthRate(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return (current - previous) / previous;
}

function computeHealthScore(input: {
  gmvLast30dInCents: number;
  previousGmvLast30dInCents: number;
  lastSaleAt: string | null;
  kycStatus: string;
  customDomain: string | null;
  productCount: number;
}): number {
  let score = 35;
  if (input.gmvLast30dInCents > 0) score += 25;
  if (input.previousGmvLast30dInCents <= input.gmvLast30dInCents) score += 10;
  if (input.lastSaleAt) score += 10;
  if (input.kycStatus === 'approved') score += 10;
  if (input.customDomain) score += 5;
  if (input.productCount > 0) score += 5;
  return Math.max(0, Math.min(100, score));
}

@Injectable()
export class AdminClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: ListClientsInput): Promise<ListClientsResponse> {
    const skip = Math.max(0, input.skip ?? 0);
    const take = Math.min(MAX_TAKE, Math.max(1, input.take ?? DEFAULT_TAKE));

    const workspaceWhere: Prisma.WorkspaceWhereInput = {};
    if (input.search) {
      workspaceWhere.OR = [
        { name: { contains: input.search, mode: 'insensitive' } },
        { customDomain: { contains: input.search, mode: 'insensitive' } },
        {
          agents: {
            some: {
              OR: [
                { email: { contains: input.search, mode: 'insensitive' } },
                { name: { contains: input.search, mode: 'insensitive' } },
              ],
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

    const [workspaces, total] = await this.prisma.$transaction([
      this.prisma.workspace.findMany({
        where: workspaceWhere,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          customDomain: true,
          createdAt: true,
          agents: {
            where: { role: 'ADMIN' },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: {
              email: true,
              name: true,
              kycStatus: true,
            },
          },
          subscription: {
            select: {
              plan: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.workspace.count({ where: workspaceWhere }),
    ]);

    if (workspaces.length === 0) {
      return { items: [], total };
    }

    const workspaceIds = workspaces.map((workspace) => workspace.id);
    const now = Date.now();
    const currentFrom = new Date(now - WINDOW_MS);
    const previousFrom = new Date(now - WINDOW_MS * 2);
    const previousTo = currentFrom;

    const [currentGmvRows, previousGmvRows, lastSaleRows, productRows] = await Promise.all([
      this.prisma.checkoutOrder.groupBy({
        by: ['workspaceId'],
        where: {
          workspaceId: { in: workspaceIds },
          status: { in: PAID_STATUSES },
          paidAt: { gte: currentFrom },
        },
        _sum: { totalInCents: true },
      }),
      this.prisma.checkoutOrder.groupBy({
        by: ['workspaceId'],
        where: {
          workspaceId: { in: workspaceIds },
          status: { in: PAID_STATUSES },
          paidAt: { gte: previousFrom, lt: previousTo },
        },
        _sum: { totalInCents: true },
      }),
      this.prisma.checkoutOrder.groupBy({
        by: ['workspaceId'],
        where: {
          workspaceId: { in: workspaceIds },
          status: { in: PAID_STATUSES },
        },
        _max: { paidAt: true },
      }),
      this.prisma.product.groupBy({
        by: ['workspaceId'],
        where: { workspaceId: { in: workspaceIds } },
        _count: { _all: true },
      }),
    ]);

    const currentGmvMap = new Map(
      currentGmvRows.map((row) => [row.workspaceId, Number(row._sum.totalInCents ?? 0)]),
    );
    const previousGmvMap = new Map(
      previousGmvRows.map((row) => [row.workspaceId, Number(row._sum.totalInCents ?? 0)]),
    );
    const lastSaleMap = new Map(
      lastSaleRows.map((row) => [row.workspaceId, row._max.paidAt?.toISOString() ?? null]),
    );
    const productMap = new Map(productRows.map((row) => [row.workspaceId, row._count._all]));

    const items = workspaces.map((workspace) => {
      const owner = workspace.agents[0] ?? null;
      const currentGmv = currentGmvMap.get(workspace.id) ?? 0;
      const previousGmv = previousGmvMap.get(workspace.id) ?? 0;
      const kycStatus = owner?.kycStatus ?? 'unknown';
      const lastSaleAt = lastSaleMap.get(workspace.id) ?? null;
      const productCount = productMap.get(workspace.id) ?? 0;

      return {
        workspaceId: workspace.id,
        name: workspace.name,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.name ?? null,
        createdAt: workspace.createdAt.toISOString(),
        kycStatus,
        gmvLast30dInCents: currentGmv,
        previousGmvLast30dInCents: previousGmv,
        growthRate: computeGrowthRate(currentGmv, previousGmv),
        lastSaleAt,
        productCount,
        plan: workspace.subscription?.plan ?? null,
        subscriptionStatus: workspace.subscription?.status ?? null,
        customDomain: workspace.customDomain ?? null,
        healthScore: computeHealthScore({
          gmvLast30dInCents: currentGmv,
          previousGmvLast30dInCents: previousGmv,
          lastSaleAt,
          kycStatus,
          customDomain: workspace.customDomain ?? null,
          productCount,
        }),
      };
    });

    return { items, total };
  }
}
