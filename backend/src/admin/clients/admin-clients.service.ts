import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { type AdminClientMetricMaps, buildAdminClientRow } from './admin-client-row.builder';

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

function applySearchFilter(where: Prisma.WorkspaceWhereInput, search: string | undefined): void {
  if (!search) return;
  where.OR = [
    { name: { contains: search, mode: 'insensitive' } },
    { customDomain: { contains: search, mode: 'insensitive' } },
    {
      agents: {
        some: {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        },
      },
    },
  ];
}

function applyKycFilter(where: Prisma.WorkspaceWhereInput, kycStatus: string | undefined): void {
  if (!kycStatus) return;
  where.agents = {
    some: { role: 'ADMIN', kycStatus },
  };
}

function buildListClientsWhere(input: ListClientsInput): Prisma.WorkspaceWhereInput {
  const where: Prisma.WorkspaceWhereInput = {};
  applySearchFilter(where, input.search);
  applyKycFilter(where, input.kycStatus);
  return where;
}

function resolveListClientsPagination(input: ListClientsInput): { skip: number; take: number } {
  return {
    skip: Math.max(0, input.skip ?? 0),
    take: Math.min(MAX_TAKE, Math.max(1, input.take ?? DEFAULT_TAKE)),
  };
}

@Injectable()
export class AdminClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: ListClientsInput): Promise<ListClientsResponse> {
    const { skip, take } = resolveListClientsPagination(input);
    const workspaceWhere = buildListClientsWhere(input);

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

    const maps: AdminClientMetricMaps = {
      currentGmvMap,
      previousGmvMap,
      lastSaleMap,
      productMap,
    };

    const items = workspaces.map((workspace) => buildAdminClientRow(workspace, maps));

    return { items, total };
  }
}
