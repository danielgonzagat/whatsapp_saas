import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { assertValidOrderStatusFilter } from '../common/checkout-order-state-machine';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFiltersDto } from './dto/report-filters.dto';

const ORDER_STATUSES = new Set<string>(Object.values(OrderStatus));
const PAYMENT_METHODS = new Set<string>(Object.values(PaymentMethod));

function toOrderStatus(value: string | undefined): OrderStatus | undefined {
  return value && ORDER_STATUSES.has(value) ? (value as OrderStatus) : undefined;
}

function toPaymentMethod(value: string | undefined): PaymentMethod | undefined {
  return value && PAYMENT_METHODS.has(value) ? (value as PaymentMethod) : undefined;
}

/** Shared filter/pagination utilities for order-based reports. */
export function dateRange(f: ReportFiltersDto) {
  const start = f.startDate ? new Date(f.startDate) : new Date(Date.now() - 30 * 86400000);
  const end = f.endDate ? new Date(`${f.endDate}T23:59:59Z`) : new Date();
  return { start, end };
}

function paginate(f: ReportFiltersDto) {
  const page = f.page || 1;
  const perPage = Math.min(f.perPage || 10, 100);
  return { skip: (page - 1) * perPage, take: perPage };
}

/**
 * Apply common CheckoutOrder filters shared across multiple report methods.
 * Mutates the `where` object in place for efficiency.
 */
export function applyCommonOrderFilters(
  where: Prisma.CheckoutOrderWhereInput,
  f: ReportFiltersDto,
): void {
  if (f.orderCode) {
    where.orderNumber = { contains: f.orderCode, mode: 'insensitive' };
  }
  if (f.buyerName) {
    where.customerName = { contains: f.buyerName, mode: 'insensitive' };
  }
  if (f.buyerEmail) {
    where.customerEmail = { contains: f.buyerEmail, mode: 'insensitive' };
  }
  if (f.cpfCnpj) {
    where.customerCPF = { contains: f.cpfCnpj };
  }
  if (f.utmSource) {
    where.utmSource = { contains: f.utmSource, mode: 'insensitive' };
  }
  if (f.utmMedium) {
    where.utmMedium = { contains: f.utmMedium, mode: 'insensitive' };
  }
  if (f.planName) {
    where.plan = { name: { contains: f.planName, mode: 'insensitive' } };
  }
  if (f.isUpsell === 'true') {
    where.upsellOrders = { some: {} };
  }
  if (f.isRecovery === 'true') {
    where.couponCode = { contains: 'RECOVERY', mode: 'insensitive' };
  }
}

/**
 * Handles CheckoutOrder and CheckoutPayment report queries:
 * vendas, afterpay, abandonos, recusa, origem, estornos, chargeback.
 */
/** Idempotency: enforced at HTTP layer via @Idempotent() guard + Stripe idempotencyKey. */
@Injectable()
export class ReportsOrdersService {
  private readonly logger = new Logger(ReportsOrdersService.name);

  constructor(private prisma: PrismaService) {}

  async getVendas(workspaceId: string, f: ReportFiltersDto, affiliateIds?: string[]) {
    const { start, end } = dateRange(f);
    const where: Prisma.CheckoutOrderWhereInput = {
      workspaceId,
      createdAt: { gte: start, lte: end },
    };
    const status = toOrderStatus(f.status);
    if (status) {
      where.status = status;
    }
    const paymentMethod = toPaymentMethod(f.paymentMethod);
    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }
    applyCommonOrderFilters(where, f);

    if (f.affiliateEmail) {
      if (affiliateIds && affiliateIds.length > 0) {
        where.affiliateId = { in: affiliateIds };
      } else {
        return { data: [], total: 0, page: f.page || 1 };
      }
    }

    const { skip, take } = paginate(f);

    const [data, total] = await Promise.all([
      this.prisma.checkoutOrder.findMany({
        take,
        skip,
        where: { ...where, workspaceId },
        include: {
          payment: {
            select: { status: true, cardLast4: true, cardBrand: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.checkoutOrder.count({ where: { ...where, workspaceId } }),
    ]);

    let filtered = data;
    if (f.isFirstPurchase === 'true') {
      assertValidOrderStatusFilter('PAID', 'ReportsOrdersService.getVendas (isFirstPurchase)');
      const firstPurchaseChecks = await Promise.all(
        data.map(async (order) => {
          assertValidOrderStatusFilter('PAID', 'ReportsOrdersService.firstPurchaseCheck');
          const paidStatus = 'PAID' as const;
          // take: 1 — we only need to know if any prior order exists
          const priorCount = await this.prisma.checkoutOrder.count({
            where: {
              workspaceId,
              customerEmail: order.customerEmail,
              status: paidStatus,
              createdAt: { lt: order.createdAt },
            },
            take: 1,
          });
          return priorCount === 0;
        }),
      );
      filtered = data.filter((_, i) => firstPurchaseChecks[i]);
    }

    return { data: filtered, total, page: f.page || 1 };
  }

  async getVendasSummary(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = dateRange(f);
    const where: Prisma.CheckoutOrderWhereInput = {
      workspaceId,
      createdAt: { gte: start, lte: end },
    };
    applyCommonOrderFilters(where, f);

    const [agg, total, paid] = await Promise.all([
      this.prisma.checkoutOrder.aggregate({
        where: { ...where, workspaceId },
        _sum: { totalInCents: true },
        _avg: { totalInCents: true },
      }),
      this.prisma.checkoutOrder.count({ where: { ...where, workspaceId } }),
      (assertValidOrderStatusFilter('PAID', 'ReportsOrdersService.getVendasSummary'),
      ((filterStatus: OrderStatus) =>
        this.prisma.checkoutOrder.count({
          where: { ...where, workspaceId, status: filterStatus },
        }))('PAID')),
    ]);

    return {
      totalRevenue: agg._sum.totalInCents || 0,
      ticketMedio: Math.round(agg._avg.totalInCents || 0),
      totalCount: total,
      paidCount: paid,
      conversao: total > 0 ? Number.parseFloat(((paid / total) * 100).toFixed(2)) : 0,
    };
  }

  async getVendasDaily(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = dateRange(f);
    try {
      return await this.prisma.$queryRaw`
        SELECT DATE("createdAt") as day, COUNT(*)::int as vendas,
          COALESCE(SUM("totalInCents"), 0)::int as receita
        FROM "RAC_CheckoutOrder"
        WHERE "workspaceId" = ${workspaceId}
          AND "createdAt" >= ${start} AND "createdAt" <= ${end}
        GROUP BY DATE("createdAt") ORDER BY day ASC
      `;
    } catch (err: unknown) {
      this.logger.error(`getVendasDaily query failed: ${String(err)}`);
      return [];
    }
  }

  async getAfterPay(workspaceId: string, f: ReportFiltersDto) {
    const where: Prisma.CheckoutOrderWhereInput = {
      workspaceId,
      paymentMethod: 'CREDIT_CARD',
    };
    if (f.status === 'PAID') {
      assertValidOrderStatusFilter('PAID', 'ReportsOrdersService.getAfterPay');
      const paidStatus = 'PAID' as const;
      where.status = paidStatus;
    }
    if (f.status === 'PENDING') {
      assertValidOrderStatusFilter('PENDING', 'ReportsOrdersService.getAfterPay');
      const pendingStatus = 'PENDING' as const;
      where.status = pendingStatus;
    }
    applyCommonOrderFilters(where, f);

    const { skip, take } = paginate(f);
    const [data, total] = await Promise.all([
      this.prisma.checkoutOrder.findMany({
        take,
        skip,
        where: { ...where, workspaceId },
        include: { plan: { select: { name: true, maxInstallments: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.checkoutOrder.count({ where: { ...where, workspaceId } }),
    ]);
    return { data, total, page: f.page || 1 };
  }

  async getAbandonos(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = dateRange(f);
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000);
    const where: Prisma.CheckoutOrderWhereInput = {
      workspaceId,
      status: 'PENDING',
      createdAt: { gte: start, lte: end < thirtyMinAgo ? end : thirtyMinAgo },
    };
    applyCommonOrderFilters(where, f);

    const { skip, take } = paginate(f);
    const [data, total] = await Promise.all([
      this.prisma.checkoutOrder.findMany({
        take,
        skip,
        where: { ...where, workspaceId },
        include: {
          plan: { select: { name: true, product: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.checkoutOrder.count({ where: { ...where, workspaceId } }),
    ]);
    return { data, total, page: f.page || 1 };
  }

  async getRecusa(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = dateRange(f);
    const orderWhere: Prisma.CheckoutOrderWhereInput = {
      workspaceId,
      createdAt: { gte: start, lte: end },
    };
    applyCommonOrderFilters(orderWhere, f);

    const { skip, take } = paginate(f);
    try {
      const data = await this.prisma.checkoutPayment.findMany({
        take,
        skip,
        where: {
          status: 'DECLINED',
          order: orderWhere,
        },
        include: {
          order: {
            select: {
              orderNumber: true,
              customerName: true,
              customerEmail: true,
              createdAt: true,
              plan: {
                select: { name: true, product: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      const total = await this.prisma.checkoutPayment.count({
        where: {
          status: 'DECLINED',
          order: orderWhere,
        },
      });
      return { data, total, page: f.page || 1 };
    } catch (err: unknown) {
      this.logger.error(`getRecusa query failed: ${String(err)}`);
      return { data: [], total: 0 };
    }
  }

  async getOrigem(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = dateRange(f);
    try {
      return await this.prisma.$queryRaw`
        SELECT COALESCE(NULLIF("couponCode",''), 'Direto') as source,
          COUNT(*)::int as vendas, COALESCE(SUM("totalInCents"),0)::int as receita
        FROM "RAC_CheckoutOrder"
        WHERE "workspaceId" = ${workspaceId} AND status = 'PAID'
          AND "createdAt" >= ${start} AND "createdAt" <= ${end}
        GROUP BY source ORDER BY vendas DESC
      `;
    } catch (err: unknown) {
      this.logger.error(`getOrigem query failed: ${String(err)}`);
      return [];
    }
  }

  async getEstornos(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = dateRange(f);
    const where: Prisma.CheckoutOrderWhereInput = {
      workspaceId,
      status: 'REFUNDED',
      refundedAt: { not: null, gte: start, lte: end },
    };
    applyCommonOrderFilters(where, f);

    const { skip, take } = paginate(f);
    const [data, total] = await Promise.all([
      this.prisma.checkoutOrder.findMany({
        take,
        skip,
        where: { ...where, workspaceId },
        orderBy: { refundedAt: 'desc' },
        include: {
          plan: { select: { name: true, product: { select: { name: true } } } },
        },
      }),
      this.prisma.checkoutOrder.count({ where: { ...where, workspaceId } }),
    ]);
    return { data, total, page: f.page || 1 };
  }

  async getChargeback(workspaceId: string, f: ReportFiltersDto) {
    try {
      const data = await this.prisma.checkoutPayment.findMany({
        take: Math.min(f.perPage || 10, 100),
        skip: ((f.page || 1) - 1) * Math.min(f.perPage || 10, 100),
        where: { status: 'CHARGEBACK', order: { workspaceId } },
        include: {
          order: {
            select: { totalInCents: true, createdAt: true, customerName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      const total = await this.prisma.checkoutPayment.count({
        where: { status: 'CHARGEBACK', order: { workspaceId } },
      });
      return { data, total };
    } catch (err: unknown) {
      this.logger.error(`getChargeback query failed: ${String(err)}`);
      return { data: [], total: 0 };
    }
  }
}
