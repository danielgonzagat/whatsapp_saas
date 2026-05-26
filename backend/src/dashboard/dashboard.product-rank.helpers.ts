/** Input row for product ranking — a subset of the Prisma checkoutOrder shape. */
export interface ProductRankInput {
  totalInCents?: number | null;
  plan?: {
    product?: {
      id?: string | null;
      name?: string | null;
      status?: string | null;
      active?: boolean | null;
      imageUrl?: string | null;
      category?: string | null;
    } | null;
  } | null;
}
/** A ranked product entry in the home snapshot top-products list. */
export interface RankedProduct {
  id: string;
  name: string;
  status: string;
  category: string | null;
  imageUrl: string | null;
  totalRevenueInCents: number;
  totalSales: number;
  isTop: boolean;
}
/** Compute the top-4 product ranking from paid order rows. */
export function computeProductRanking(orders: ProductRankInput[]): RankedProduct[] {
  const stats = new Map<
    string,
    {
      id: string;
      name: string;
      status: string;
      category: string | null;
      imageUrl: string | null;
      totalRevenueInCents: number;
      totalSales: number;
    }
  >();

  for (const order of orders) {
    const product = order.plan?.product;
    if (!product?.id) {
      continue;
    }
    const key = product.id;
    if (!stats.has(key)) {
      stats.set(key, {
        id: product.id,
        name: product.name ?? '',
        status: product.status || (product.active ? 'ACTIVE' : 'DRAFT'),
        category: product.category || null,
        imageUrl: product.imageUrl || null,
        totalRevenueInCents: 0,
        totalSales: 0,
      });
    }
    const current = stats.get(key);
    if (!current) {
      continue;
    }
    current.totalRevenueInCents += Number(order.totalInCents || 0);
    current.totalSales += 1;
  }

  return Array.from(stats.values())
    .sort((left, right) => right.totalRevenueInCents - left.totalRevenueInCents)
    .slice(0, 4)
    .map((item, index) => ({
      ...item,
      isTop: index === 0,
    }));
}
