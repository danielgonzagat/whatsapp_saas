import { OrderStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/** Admin product row shape. */
export interface AdminProductRow {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  name: string;
  description: string | null;
  priceInCents: number;
  currency: string;
  category: string | null;
  format: string;
  status: string;
  active: boolean;
  featured: boolean;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  commerce: CommerceMetrics;
}

interface CommerceMetrics {
  approvedOrders: number;
  pendingOrders: number;
  refundedOrders: number;
  chargebackOrders: number;
  gmvInCents: number;
  last30dGmvInCents: number;
}

/** List products input shape. */
export interface ListProductsInput {
  search?: string;
  status?: string;
  workspaceId?: string;
  skip?: number;
  take?: number;
}

/** List products result shape. */
export interface ListProductsResult {
  items: AdminProductRow[];
  total: number;
}

const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const APPROVED: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

function emptyCommerceMetrics(): CommerceMetrics {
  return {
    approvedOrders: 0,
    pendingOrders: 0,
    refundedOrders: 0,
    chargebackOrders: 0,
    gmvInCents: 0,
    last30dGmvInCents: 0,
  };
}

function buildProductWhere(input: ListProductsInput): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  if (input.workspaceId) {
    where.workspaceId = input.workspaceId;
  }
  if (input.status) {
    where.status = input.status;
  }
  if (input.search) {
    where.OR = [
      { name: { contains: input.search, mode: 'insensitive' } },
      { description: { contains: input.search, mode: 'insensitive' } },
      { category: { contains: input.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

function applyOrderGroupToMetrics(
  current: CommerceMetrics,
  group: {
    status: OrderStatus;
    _count: { _all: number };
    _sum: { totalInCents: number | null };
  },
): void {
  if (APPROVED.includes(group.status)) {
    current.approvedOrders += group._count._all;
    current.gmvInCents += Number(group._sum.totalInCents ?? 0);
    return;
  }
  if (group.status === OrderStatus.PENDING || group.status === OrderStatus.PROCESSING) {
    current.pendingOrders += group._count._all;
    return;
  }
  if (group.status === OrderStatus.REFUNDED) {
    current.refundedOrders += group._count._all;
    return;
  }
  if (group.status === OrderStatus.CHARGEBACK) {
    current.chargebackOrders += group._count._all;
  }
}

async function fetchCommerceGroups(
  prisma: PrismaService,
  planIds: string[],
): Promise<{
  orderGroups: Array<{
    planId: string;
    status: OrderStatus;
    _count: { _all: number };
    _sum: { totalInCents: number | null };
  }>;
  last30dGroups: Array<{ planId: string; _sum: { totalInCents: number | null } }>;
}> {
  const [orderGroups, last30dGroups] = await Promise.all([
    prisma.checkoutOrder.groupBy({
      by: ['planId', 'status'],
      where: { planId: { in: planIds } },
      _count: { _all: true },
      _sum: { totalInCents: true },
    }),
    prisma.checkoutOrder.groupBy({
      by: ['planId'],
      where: {
        planId: { in: planIds },
        status: { in: APPROVED },
        paidAt: { gte: new Date(Date.now() - WINDOW_MS) },
      },
      _sum: { totalInCents: true },
    }),
  ]);
  return { orderGroups, last30dGroups };
}

async function buildCommerceByProduct(
  prisma: PrismaService,
  productIds: string[],
): Promise<Map<string, CommerceMetrics>> {
  const commerceByProduct = new Map<string, CommerceMetrics>();
  for (const productId of productIds) {
    commerceByProduct.set(productId, emptyCommerceMetrics());
  }

  const plans = await prisma.checkoutProductPlan.findMany({
    where: { productId: { in: productIds } },
    select: { id: true, productId: true },
  });
  if (plans.length === 0) {
    return commerceByProduct;
  }

  const planToProduct = new Map(plans.map((plan) => [plan.id, plan.productId]));
  const planIds = plans.map((plan) => plan.id);
  const { orderGroups, last30dGroups } = await fetchCommerceGroups(prisma, planIds);

  for (const group of orderGroups) {
    const productId = planToProduct.get(group.planId);
    if (!productId) {
      continue;
    }
    const current = commerceByProduct.get(productId);
    if (!current) {
      continue;
    }
    applyOrderGroupToMetrics(current, group);
  }

  for (const group of last30dGroups) {
    const productId = planToProduct.get(group.planId);
    if (!productId) {
      continue;
    }
    const current = commerceByProduct.get(productId);
    if (!current) {
      continue;
    }
    current.last30dGmvInCents += Number(group._sum.totalInCents ?? 0);
  }

  return commerceByProduct;
}

async function fetchWorkspaceNameMap(
  prisma: PrismaService,
  workspaceIds: string[],
): Promise<Map<string, string>> {
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: workspaceIds } },
    select: { id: true, name: true },
  });
  return new Map(workspaces.map((w) => [w.id, w.name]));
}

type ProductRow = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  category: string | null;
  format: string;
  status: string;
  active: boolean;
  featured: boolean;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapProductToRow(
  p: ProductRow,
  nameMap: Map<string, string>,
  commerceByProduct: Map<string, CommerceMetrics>,
): AdminProductRow {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    workspaceName: nameMap.get(p.workspaceId) ?? null,
    name: p.name,
    description: p.description,
    priceInCents: Math.round(p.price * 100),
    currency: p.currency,
    category: p.category,
    format: p.format,
    status: p.status,
    active: p.active,
    featured: p.featured,
    imageUrl: p.imageUrl,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    commerce: commerceByProduct.get(p.id) || emptyCommerceMetrics(),
  };
}

/** List admin products. */
export async function listAdminProducts(
  prisma: PrismaService,
  input: ListProductsInput,
): Promise<ListProductsResult> {
  const skip = Math.max(0, input.skip ?? 0);
  const take = Math.min(MAX_TAKE, Math.max(1, input.take ?? DEFAULT_TAKE));
  const where = buildProductWhere(input);

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        workspaceId: true,
        name: true,
        description: true,
        price: true,
        currency: true,
        category: true,
        format: true,
        status: true,
        active: true,
        featured: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  if (items.length === 0) {
    return { items: [], total };
  }

  const workspaceIds = Array.from(new Set(items.map((i) => i.workspaceId)));
  const productIds = items.map((item) => item.id);

  const [nameMap, commerceByProduct] = await Promise.all([
    fetchWorkspaceNameMap(prisma, workspaceIds),
    buildCommerceByProduct(prisma, productIds),
  ]);

  return {
    items: items.map((p) => mapProductToRow(p, nameMap, commerceByProduct)),
    total,
  };
}
