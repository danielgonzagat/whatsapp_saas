import { OrderStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export interface AdminProductDetail {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  name: string;
  description: string | null;
  priceInCents: number;
  currency: string;
  category: string | null;
  sku: string | null;
  tags: string[];
  format: string;
  imageUrl: string | null;
  status: string;
  active: boolean;
  featured: boolean;
  stockQuantity: number | null;
  trackStock: boolean;
  salesPageUrl: string | null;
  supportEmail: string | null;
  createdAt: string;
  updatedAt: string;
  commerce: {
    approvedOrders: number;
    pendingOrders: number;
    refundedOrders: number;
    chargebackOrders: number;
    gmvInCents: number;
    last30dGmvInCents: number;
  };
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const APPROVED: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

/**
 * Single-product detail with commerce KPIs. The Product → CheckoutOrder
 * relation goes through CheckoutProductPlan, so we aggregate by matching
 * plan.productId in a single groupBy over orders filtered by that plan's
 * product id.
 */
export async function getAdminProductDetail(
  prisma: PrismaService,
  productId: string,
): Promise<AdminProductDetail | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product) return null;

  const workspace = await prisma.workspace.findUnique({
    where: { id: product.workspaceId },
    select: { name: true },
  });

  const plans = await prisma.checkoutProductPlan.findMany({
    where: { productId },
    select: { id: true },
  });
  const planIds = plans.map((p) => p.id);

  if (planIds.length === 0) {
    return toDetail(product, workspace?.name ?? null, {
      approvedOrders: 0,
      pendingOrders: 0,
      refundedOrders: 0,
      chargebackOrders: 0,
      gmvInCents: 0,
      last30dGmvInCents: 0,
    });
  }

  const windowFrom = new Date(Date.now() - WINDOW_MS);
  const [approved, pending, refunded, chargeback, gmvAll, gmv30d] = await Promise.all([
    prisma.checkoutOrder.count({
      where: { planId: { in: planIds }, status: { in: APPROVED } },
    }),
    prisma.checkoutOrder.count({
      where: {
        planId: { in: planIds },
        status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
      },
    }),
    prisma.checkoutOrder.count({
      where: { planId: { in: planIds }, status: OrderStatus.REFUNDED },
    }),
    prisma.checkoutOrder.count({
      where: { planId: { in: planIds }, status: OrderStatus.CHARGEBACK },
    }),
    prisma.checkoutOrder.aggregate({
      where: { planId: { in: planIds }, status: { in: APPROVED } },
      _sum: { totalInCents: true },
    }),
    prisma.checkoutOrder.aggregate({
      where: {
        planId: { in: planIds },
        status: { in: APPROVED },
        paidAt: { gte: windowFrom },
      },
      _sum: { totalInCents: true },
    }),
  ]);

  return toDetail(product, workspace?.name ?? null, {
    approvedOrders: approved,
    pendingOrders: pending,
    refundedOrders: refunded,
    chargebackOrders: chargeback,
    gmvInCents: Number(gmvAll._sum.totalInCents ?? 0),
    last30dGmvInCents: Number(gmv30d._sum.totalInCents ?? 0),
  });
}

function toDetail(
  product: Awaited<ReturnType<PrismaService['product']['findUnique']>>,
  workspaceName: string | null,
  commerce: AdminProductDetail['commerce'],
): AdminProductDetail | null {
  if (!product) return null;
  return {
    id: product.id,
    workspaceId: product.workspaceId,
    workspaceName,
    name: product.name,
    description: product.description,
    priceInCents: Math.round(product.price * 100),
    currency: product.currency,
    category: product.category,
    sku: product.sku,
    tags: product.tags,
    format: product.format,
    imageUrl: product.imageUrl,
    status: product.status,
    active: product.active,
    featured: product.featured,
    stockQuantity: product.stockQuantity,
    trackStock: product.trackStock,
    salesPageUrl: product.salesPageUrl,
    supportEmail: product.supportEmail,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    commerce,
  };
}
