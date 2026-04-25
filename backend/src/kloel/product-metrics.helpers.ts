import { PrismaService } from '../prisma/prisma.service';

interface ProductMetrics {
  totalSales: number;
  totalRevenue: number;
  memberAreasCount: number;
  studentsCount: number;
  modulesCount: number;
  lessonsCount: number;
  plansCount: number;
  activePlansCount: number;
  minPlanPriceInCents: number | null;
  maxPlanPriceInCents: number | null;
  affiliateListed: boolean;
  affiliateCount: number;
  affiliateSales: number;
  affiliateRevenue: number;
  affiliateCommissionPct: number | null;
}

function emptyProductMetrics(): ProductMetrics {
  return {
    totalSales: 0,
    totalRevenue: 0,
    memberAreasCount: 0,
    studentsCount: 0,
    modulesCount: 0,
    lessonsCount: 0,
    plansCount: 0,
    activePlansCount: 0,
    minPlanPriceInCents: null,
    maxPlanPriceInCents: null,
    affiliateListed: false,
    affiliateCount: 0,
    affiliateSales: 0,
    affiliateRevenue: 0,
    affiliateCommissionPct: null,
  };
}

function fetchProductMetricsSources(
  prisma: PrismaService,
  workspaceId: string,
  productIds: string[],
) {
  return Promise.all([
    prisma.checkoutOrder.findMany({
      where: {
        workspaceId,
        plan: { productId: { in: productIds } },
      },
      select: {
        status: true,
        totalInCents: true,
        plan: { select: { productId: true } },
      },
    }),
    prisma.memberArea.findMany({
      where: { workspaceId, productId: { in: productIds } },
      select: {
        productId: true,
        totalStudents: true,
        totalModules: true,
        totalLessons: true,
        active: true,
      },
    }),
    prisma.checkoutProductPlan.findMany({
      where: {
        productId: { in: productIds },
        kind: 'PLAN',
      },
      select: {
        productId: true,
        id: true,
        isActive: true,
        priceInCents: true,
      },
    }),
    prisma.affiliateProduct.findMany({
      where: { productId: { in: productIds } },
      select: {
        productId: true,
        listed: true,
        totalAffiliates: true,
        totalSales: true,
        totalRevenue: true,
        commissionPct: true,
      },
    }),
  ]);
}

function isPaidOrderStatus(status: string): boolean {
  return status === 'PAID' || status === 'SHIPPED' || status === 'DELIVERED';
}

function applyOrderMetric(
  metrics: Map<string, ProductMetrics>,
  order: { status: string; totalInCents: number | null; plan: { productId: string } | null },
): void {
  const productId = order.plan?.productId;
  if (!productId) {
    return;
  }
  const current = metrics.get(productId);
  if (!current) {
    return;
  }
  if (!isPaidOrderStatus(order.status)) {
    return;
  }
  current.totalSales += 1;
  current.totalRevenue += Number(order.totalInCents || 0) / 100;
}

function applyMemberAreaMetric(
  metrics: Map<string, ProductMetrics>,
  area: {
    productId: string | null;
    totalStudents: number | null;
    totalModules: number | null;
    totalLessons: number | null;
  },
): void {
  if (!area.productId) {
    return;
  }
  const current = metrics.get(area.productId);
  if (!current) {
    return;
  }
  current.memberAreasCount += 1;
  current.studentsCount += Number(area.totalStudents || 0);
  current.modulesCount += Number(area.totalModules || 0);
  current.lessonsCount += Number(area.totalLessons || 0);
}

function updatePlanPriceRange(current: ProductMetrics, normalizedPriceInCents: number): void {
  const minUnset = current.minPlanPriceInCents === null;
  if (minUnset || normalizedPriceInCents < current.minPlanPriceInCents) {
    current.minPlanPriceInCents = normalizedPriceInCents;
  }
  const maxUnset = current.maxPlanPriceInCents === null;
  if (maxUnset || normalizedPriceInCents > current.maxPlanPriceInCents) {
    current.maxPlanPriceInCents = normalizedPriceInCents;
  }
}

function applyPlanMetric(
  metrics: Map<string, ProductMetrics>,
  plan: { productId: string; isActive: boolean; priceInCents: number | null },
): void {
  const current = metrics.get(plan.productId);
  if (!current) {
    return;
  }
  current.plansCount += 1;
  if (plan.isActive) {
    current.activePlansCount += 1;
  }
  const normalizedPriceInCents = Math.max(0, Math.round(Number(plan.priceInCents || 0)));
  updatePlanPriceRange(current, normalizedPriceInCents);
}

function applyAffiliateMetric(
  metrics: Map<string, ProductMetrics>,
  affiliateProduct: {
    productId: string;
    listed: boolean;
    totalAffiliates: number;
    totalSales: number;
    totalRevenue: number;
    commissionPct: number | null;
  },
): void {
  const current = metrics.get(affiliateProduct.productId);
  if (!current) {
    return;
  }
  current.affiliateListed = affiliateProduct.listed;
  current.affiliateCount = affiliateProduct.totalAffiliates;
  current.affiliateSales = affiliateProduct.totalSales;
  current.affiliateRevenue = affiliateProduct.totalRevenue;
  current.affiliateCommissionPct = affiliateProduct.commissionPct;
}

export async function buildProductMetrics(
  prisma: PrismaService,
  workspaceId: string,
  productIds: string[],
): Promise<Map<string, ProductMetrics>> {
  if (productIds.length === 0) {
    return new Map<string, ProductMetrics>();
  }

  const [orders, memberAreas, checkoutPlans, affiliateProducts] = await fetchProductMetricsSources(
    prisma,
    workspaceId,
    productIds,
  );

  const metrics = new Map<string, ProductMetrics>();
  for (const productId of productIds) {
    metrics.set(productId, emptyProductMetrics());
  }

  for (const order of orders) {
    applyOrderMetric(metrics, order);
  }
  for (const area of memberAreas) {
    applyMemberAreaMetric(metrics, area);
  }
  for (const plan of checkoutPlans) {
    applyPlanMetric(metrics, plan);
  }
  for (const ap of affiliateProducts) {
    applyAffiliateMetric(metrics, ap);
  }

  return metrics;
}
