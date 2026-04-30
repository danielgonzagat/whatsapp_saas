import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertValidOrderStatusFilter } from '../common/checkout-order-state-machine';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { ReportsAffiliateService } from './reports-affiliate.service';
import { applyCommonOrderFilters, dateRange } from './reports-orders.service';
import { ReportsOrdersService } from './reports-orders.service';

/**
 * Read-only reports service — no payment creation, no idempotencyKey needed.
 * All mutations (checkout create, payment processing) happen in their respective
 * services with idempotent guards.
 *
 * Order/payment report methods are delegated to ReportsOrdersService.
 * Affiliate report methods are delegated to ReportsAffiliateService.
 * This service owns: ad spend, churn, assinaturas, metricas.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private ordersService: ReportsOrdersService,
    private affiliateService: ReportsAffiliateService,
  ) {}

  // ── VENDAS (delegated) ──

  /** Get vendas. */
  async getVendas(workspaceId: string, f: ReportFiltersDto) {
    let affiliateIds: string[] | undefined;
    if (f.affiliateEmail) {
      affiliateIds = await this.affiliateService.resolveAffiliateIds(workspaceId, f.affiliateEmail);
    }
    return this.ordersService.getVendas(workspaceId, f, affiliateIds);
  }

  /** Get vendas summary. */
  getVendasSummary(workspaceId: string, f: ReportFiltersDto) {
    return this.ordersService.getVendasSummary(workspaceId, f);
  }

  /** Get vendas daily. */
  getVendasDaily(workspaceId: string, f: ReportFiltersDto) {
    return this.ordersService.getVendasDaily(workspaceId, f);
  }

  /** Get after pay. */
  getAfterPay(workspaceId: string, f: ReportFiltersDto) {
    return this.ordersService.getAfterPay(workspaceId, f);
  }

  /** Get abandonos. */
  getAbandonos(workspaceId: string, f: ReportFiltersDto) {
    return this.ordersService.getAbandonos(workspaceId, f);
  }

  /** Get recusa. */
  getRecusa(workspaceId: string, f: ReportFiltersDto) {
    return this.ordersService.getRecusa(workspaceId, f);
  }

  /** Get origem. */
  getOrigem(workspaceId: string, f: ReportFiltersDto) {
    return this.ordersService.getOrigem(workspaceId, f);
  }

  /** Get estornos. */
  getEstornos(workspaceId: string, f: ReportFiltersDto) {
    return this.ordersService.getEstornos(workspaceId, f);
  }

  /** Get chargeback. */
  getChargeback(workspaceId: string, f: ReportFiltersDto) {
    return this.ordersService.getChargeback(workspaceId, f);
  }

  // ── AFILIADOS (delegated) ──

  /** Get afiliados. */
  getAfiliados(workspaceId: string, f: ReportFiltersDto) {
    return this.affiliateService.getAfiliados(workspaceId, f);
  }

  /** Get indicadores. */
  getIndicadores(workspaceId: string, f: ReportFiltersDto) {
    return this.affiliateService.getIndicadores(workspaceId, f);
  }

  /** Get indicadores produto. */
  getIndicadoresProduto(workspaceId: string, f: ReportFiltersDto) {
    return this.affiliateService.getIndicadoresProduto(workspaceId, f);
  }

  // ── CHURN ──
  async getChurn(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = dateRange(f);
    const where: Prisma.CustomerSubscriptionWhereInput = {
      workspaceId,
      status: 'CANCELLED',
    };
    if (f.startDate) {
      where.cancelledAt = { gte: start, lte: end };
    }

    const [total, data] = await Promise.all([
      this.prisma.customerSubscription.count({ where: { ...where, workspaceId } }),
      this.prisma.customerSubscription.findMany({
        take: Math.min(f.perPage || 10, 100),
        skip: ((f.page || 1) - 1) * Math.min(f.perPage || 10, 100),
        where: { ...where, workspaceId },
        orderBy: { cancelledAt: 'desc' },
        select: {
          id: true,
          status: true,
          cancelledAt: true,
          amount: true,
          planId: true,
          createdAt: true,
        },
      }),
    ]);

    let monthly: unknown[] = [];
    try {
      monthly = await this.prisma.$queryRaw`
        SELECT TO_CHAR("cancelledAt", 'Mon') as month,
          COUNT(*)::int as total
        FROM "CustomerSubscription"
        WHERE "workspaceId" = ${workspaceId} AND status = 'CANCELLED'
          AND "cancelledAt" IS NOT NULL AND "cancelledAt" >= ${start}
        GROUP BY TO_CHAR("cancelledAt", 'Mon'), DATE_TRUNC('month', "cancelledAt")
        ORDER BY DATE_TRUNC('month', "cancelledAt") ASC LIMIT 12
      `;
    } catch (err: unknown) {
      // PULSE:OK — Monthly churn query failure returns partial data; not a blocking operation
      this.logger.error(`getChurn monthly query failed: ${String(err)}`);
    }

    return { total, data, monthly };
  }

  // ── ASSINATURAS ──
  async getAssinaturas(workspaceId: string, f: ReportFiltersDto) {
    const where: Prisma.CustomerSubscriptionWhereInput = { workspaceId };
    if (f.status) {
      where.status = f.status;
    }

    const [data, total, summary] = await Promise.all([
      this.prisma.customerSubscription.findMany({
        take: Math.min(f.perPage || 10, 100),
        skip: ((f.page || 1) - 1) * Math.min(f.perPage || 10, 100),
        where: { ...where, workspaceId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          amount: true,
          planId: true,
          createdAt: true,
          cancelledAt: true,
          interval: true,
        },
      }),
      this.prisma.customerSubscription.count({ where: { ...where, workspaceId } }),
      this.prisma.customerSubscription.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: true,
        _sum: { amount: true },
      }),
    ]);
    return { data, total, summary, page: f.page || 1 };
  }

  // ── AD SPEND ──

  /** Register ad spend. */
  async registerAdSpend(
    workspaceId: string,
    data: {
      amount: number;
      platform: string;
      date: string;
      campaign?: string;
      description?: string;
    },
  ) {
    // PULSE_OK: date validated via Number.isNaN(parseDate.getTime()) + BadRequestException on line below
    const parsedDate = new Date(data.date);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    const existing = await this.prisma.adSpend.findFirst({
      where: {
        workspaceId,
        platform: data.platform,
        date: parsedDate,
        campaign: data.campaign || null,
        amount: data.amount,
      },
    });

    if (existing) {
      this.logger.warn(
        `Duplicate ad spend entry skipped: ${data.platform} ${data.date} ${data.campaign}`,
      );
      return existing;
    }

    return this.prisma.adSpend.create({
      data: {
        workspaceId,
        amount: data.amount,
        platform: data.platform,
        date: parsedDate,
        campaign: data.campaign,
        description: data.description,
      },
    });
  }

  /** Get ad spends. */
  async getAdSpends(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = dateRange(f);
    const where: Prisma.AdSpendWhereInput = {
      workspaceId,
      date: { gte: start, lte: end },
    };
    const [data, total] = await Promise.all([
      this.prisma.adSpend.findMany({
        take: Math.min(f.perPage || 10, 100),
        skip: ((f.page || 1) - 1) * Math.min(f.perPage || 10, 100),
        where,
        orderBy: { date: 'desc' },
        select: {
          id: true,
          date: true,
          amount: true,
          platform: true,
          campaign: true,
          description: true,
          workspaceId: true,
        },
      }),
      this.prisma.adSpend.count({ where: { ...where, workspaceId } }),
    ]);
    return { data, total, page: f.page || 1 };
  }

  // ── METRICAS ──
  async getMetricas(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = dateRange(f);
    const where: Prisma.CheckoutOrderWhereInput = {
      workspaceId,
      createdAt: { gte: start, lte: end },
    };
    applyCommonOrderFilters(where, f);

    try {
      assertValidOrderStatusFilter('PAID', 'ReportsService.getMetricas');
      const paidStatus = 'PAID' as const;
      const [total, byMethod, paid, revenueAgg, adSpendAgg] = await Promise.all([
        this.prisma.checkoutOrder.count({ where: { ...where, workspaceId } }),
        this.prisma.checkoutOrder.groupBy({
          by: ['paymentMethod'],
          where: { ...where, workspaceId },
          _count: true,
        }),
        this.prisma.checkoutOrder.count({
          where: { ...where, workspaceId, status: paidStatus },
        }),
        this.prisma.checkoutOrder.aggregate({
          where: { ...where, workspaceId, status: paidStatus },
          _sum: { totalInCents: true },
        }),
        this.prisma.adSpend.aggregate({
          where: { workspaceId, date: { gte: start, lte: end } },
          _sum: { amount: true },
        }),
      ]);

      const methods: Record<string, number> = {};
      byMethod.forEach((m) => {
        methods[m.paymentMethod || 'unknown'] = m._count;
      });

      const totalRevenue = revenueAgg._sum.totalInCents || 0;
      const totalAdSpend = adSpendAgg._sum.amount || 0;
      const roas = totalAdSpend > 0 ? (totalRevenue / totalAdSpend).toFixed(2) : null;

      return {
        totalSales: total,
        paidSales: paid,
        conversao: total > 0 ? Number.parseFloat(((paid / total) * 100).toFixed(2)) : 0,
        byMethod: methods,
        totalRevenue,
        totalAdSpend,
        roas,
      };
    } catch (err: unknown) {
      this.logger.error(`getMetricas query failed: ${String(err)}`);
      return {
        totalSales: 0,
        paidSales: 0,
        conversao: 0,
        byMethod: {},
        totalRevenue: 0,
        totalAdSpend: 0,
        roas: null,
      };
    }
  }
}
