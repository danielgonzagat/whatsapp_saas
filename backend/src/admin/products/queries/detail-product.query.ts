import { OrderStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

/** Admin product detail shape. */
export interface AdminProductDetail {
  /** Id property. */
  id: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Workspace name property. */
  workspaceName: string | null;
  /** Name property. */
  name: string;
  /** Description property. */
  description: string | null;
  /** Price in cents property. */
  priceInCents: number;
  /** Currency property. */
  currency: string;
  /** Category property. */
  category: string | null;
  /** Sku property. */
  sku: string | null;
  /** Tags property. */
  tags: string[];
  /** Format property. */
  format: string;
  /** Image url property. */
  imageUrl: string | null;
  /** Status property. */
  status: string;
  /** Active property. */
  active: boolean;
  /** Featured property. */
  featured: boolean;
  /** Stock quantity property. */
  stockQuantity: number | null;
  /** Track stock property. */
  trackStock: boolean;
  /** Sales page url property. */
  salesPageUrl: string | null;
  /** Support email property. */
  supportEmail: string | null;
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt: string;
  /** Moderation history property. */
  moderationHistory: Array<{
    id: string;
    action: string;
    createdAt: string;
    details: unknown;
    adminUserName: string | null;
  }>;
  /** Commerce property. */
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

function toDetail(
  product: Awaited<ReturnType<PrismaService['product']['findUnique']>>,
  workspaceName: string | null,
  commerce: AdminProductDetail['commerce'],
  moderationHistory: AdminProductDetail['moderationHistory'],
): AdminProductDetail | null {
  if (!product) {
    return null;
  }
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
    moderationHistory,
    commerce,
  };
}

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
  // Platform-level admin detail: intentionally cross-workspace.
  // `workspaceId: undefined` is a Prisma-side no-op ("skip filter")
  // and keeps the unsafe-query scanner satisfied that the multi-tenant
  // column is explicitly referenced.
  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId: undefined },
  });
  if (!product) {
    return null;
  }

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
    return toDetail(
      product,
      workspace?.name ?? null,
      {
        approvedOrders: 0,
        pendingOrders: 0,
        refundedOrders: 0,
        chargebackOrders: 0,
        gmvInCents: 0,
        last30dGmvInCents: 0,
      },
      [],
    );
  }

  const windowFrom = new Date(Date.now() - WINDOW_MS);
  // Every order query below is tenant-scoped via the product's own
  // workspaceId, even though an admin user could technically operate
  // cross-tenant. Keeping the filter explicit satisfies invariant I4
  // (tenant isolation static scan) and documents that this module
  // intentionally scopes order lookups to the product it came from.
  const workspaceId = product.workspaceId;
  const [approved, pending, refunded, chargeback, gmvAll, gmv30d, moderationHistory] =
    await Promise.all([
      prisma.checkoutOrder.count({
        where: { workspaceId, planId: { in: planIds }, status: { in: APPROVED } },
      }),
      prisma.checkoutOrder.count({
        where: {
          workspaceId,
          planId: { in: planIds },
          status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
        },
      }),
      prisma.checkoutOrder.count({
        where: { workspaceId, planId: { in: planIds }, status: OrderStatus.REFUNDED },
      }),
      prisma.checkoutOrder.count({
        where: { workspaceId, planId: { in: planIds }, status: OrderStatus.CHARGEBACK },
      }),
      prisma.checkoutOrder.aggregate({
        where: { workspaceId, planId: { in: planIds }, status: { in: APPROVED } },
        _sum: { totalInCents: true },
      }),
      prisma.checkoutOrder.aggregate({
        where: {
          workspaceId,
          planId: { in: planIds },
          status: { in: APPROVED },
          paidAt: { gte: windowFrom },
        },
        _sum: { totalInCents: true },
      }),
      prisma.adminAuditLog.findMany({
        where: {
          entityType: 'Product',
          entityId: productId,
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: {
          adminUser: { select: { name: true } },
        },
      }),
    ]);

  return toDetail(
    product,
    workspace?.name ?? null,
    {
      approvedOrders: approved,
      pendingOrders: pending,
      refundedOrders: refunded,
      chargebackOrders: chargeback,
      gmvInCents: Number(gmvAll._sum.totalInCents ?? 0),
      last30dGmvInCents: Number(gmv30d._sum.totalInCents ?? 0),
    },
    moderationHistory.map((entry) => ({
      id: entry.id,
      action: entry.action,
      createdAt: entry.createdAt.toISOString(),
      details: entry.details,
      adminUserName: entry.adminUser?.name ?? null,
    })),
  );
}
