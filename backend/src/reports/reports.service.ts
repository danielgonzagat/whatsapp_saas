import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFiltersDto } from './dto/report-filters.dto';

/**
 * Read-only reports service — no payment creation, no idempotencyKey needed.
 * All mutations (checkout create, payment processing) happen in their respective
 * services with idempotent guards.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  private dateRange(f: ReportFiltersDto) {
    const start = f.startDate ? new Date(f.startDate) : new Date(Date.now() - 30 * 86400000);
    const end = f.endDate ? new Date(f.endDate + 'T23:59:59Z') : new Date();
    return { start, end };
  }

  private paginate(f: ReportFiltersDto) {
    const page = f.page || 1;
    const perPage = Math.min(f.perPage || 10, 100);
    return { skip: (page - 1) * perPage, take: perPage };
  }

  // ── VENDAS ──
  async getVendas(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = this.dateRange(f);
    const where: any = { workspaceId, createdAt: { gte: start, lte: end } };
    if (f.status) where.status = f.status;
    if (f.paymentMethod) where.paymentMethod = f.paymentMethod;
    if (f.buyerEmail) where.customerEmail = { contains: f.buyerEmail, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.checkoutOrder.findMany({
        take: Math.min(f.perPage || 10, 100),
        skip: ((f.page || 1) - 1) * Math.min(f.perPage || 10, 100),
        where,
        include: {
          payment: {
            select: { status: true, cardLast4: true, cardBrand: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.checkoutOrder.count({ where }),
    ]);
    return { data, total, page: f.page || 1 };
  }

  async getVendasSummary(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = this.dateRange(f);
    const where: any = { workspaceId, createdAt: { gte: start, lte: end } };

    const [agg, total, paid] = await Promise.all([
      this.prisma.checkoutOrder.aggregate({
        where,
        _sum: { totalInCents: true },
        _avg: { totalInCents: true },
      }),
      this.prisma.checkoutOrder.count({ where }),
      this.prisma.checkoutOrder.count({ where: { ...where, status: 'PAID' } }),
    ]);

    return {
      totalRevenue: agg._sum.totalInCents || 0,
      ticketMedio: Math.round(agg._avg.totalInCents || 0),
      totalCount: total,
      paidCount: paid,
      conversao: total > 0 ? parseFloat(((paid / total) * 100).toFixed(2)) : 0,
    };
  }

  async getVendasDaily(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = this.dateRange(f);
    try {
      return await this.prisma.$queryRaw`
        SELECT DATE("createdAt") as day, COUNT(*)::int as vendas,
          COALESCE(SUM("totalInCents"), 0)::int as receita
        FROM "CheckoutOrder"
        WHERE "workspaceId" = ${workspaceId}
          AND "createdAt" >= ${start} AND "createdAt" <= ${end}
        GROUP BY DATE("createdAt") ORDER BY day ASC
      `;
    } catch (err) {
      this.logger.error(`getVendasDaily query failed: ${err}`);
      return [];
    }
  }

  // ── AFTER PAY (installment orders) ──
  async getAfterPay(workspaceId: string, f: ReportFiltersDto) {
    const where: any = { workspaceId, paymentMethod: 'CREDIT_CARD' };
    if (f.status === 'PAID') where.status = 'PAID';
    if (f.status === 'PENDING') where.status = 'PENDING';

    const [data, total] = await Promise.all([
      this.prisma.checkoutOrder.findMany({
        take: Math.min(f.perPage || 10, 100),
        skip: ((f.page || 1) - 1) * Math.min(f.perPage || 10, 100),
        where,
        include: { plan: { select: { name: true, maxInstallments: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.checkoutOrder.count({ where }),
    ]);
    return { data, total, page: f.page || 1 };
  }

  // ── CHURN ──
  async getChurn(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = this.dateRange(f);
    const where: any = { workspaceId, status: 'CANCELLED' };
    if (f.startDate) where.cancelledAt = { gte: start, lte: end };

    const [total, data] = await Promise.all([
      this.prisma.customerSubscription.count({ where }),
      this.prisma.customerSubscription.findMany({
        take: Math.min(f.perPage || 10, 100),
        skip: ((f.page || 1) - 1) * Math.min(f.perPage || 10, 100),
        where,
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

    let monthly: any[] = [];
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
    } catch (err) {
      // PULSE:OK — Monthly churn query failure returns partial data; not a blocking operation
      this.logger.error(`getChurn monthly query failed: ${err}`);
    }

    return { total, data, monthly };
  }

  // ── ABANDONOS ──
  async getAbandonos(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = this.dateRange(f);
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000);
    const where: any = {
      workspaceId,
      status: 'PENDING',
      createdAt: { gte: start, lte: end < thirtyMinAgo ? end : thirtyMinAgo },
    };

    const [data, total] = await Promise.all([
      this.prisma.checkoutOrder.findMany({
        take: Math.min(f.perPage || 10, 100),
        skip: ((f.page || 1) - 1) * Math.min(f.perPage || 10, 100),
        where,
        include: {
          plan: { select: { name: true, product: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.checkoutOrder.count({ where }),
    ]);
    return { data, total, page: f.page || 1 };
  }

  // ── AFILIADOS ──
  async getAfiliados(workspaceId: string, f: ReportFiltersDto) {
    try {
      const partners = await this.prisma.affiliatePartner.findMany({
        where: { workspaceId, status: 'active' },
        orderBy: { totalRevenue: 'desc' },
        take: 50,
      });
      return partners;
    } catch (err) {
      this.logger.error(`getAfiliados query failed: ${err}`);
      return [];
    }
  }

  // ── INDICADORES ──
  async getIndicadores(workspaceId: string, f: ReportFiltersDto) {
    try {
      const partners = await this.prisma.affiliatePartner.findMany({
        where: { workspaceId },
        orderBy: { totalCommission: 'desc' },
        take: 50,
        select: {
          partnerName: true,
          partnerEmail: true,
          totalSales: true,
          totalRevenue: true,
          totalCommission: true,
        },
      });
      return partners;
    } catch (err) {
      this.logger.error(`getIndicadores query failed: ${err}`);
      return [];
    }
  }

  // ── ASSINATURAS ──
  async getAssinaturas(workspaceId: string, f: ReportFiltersDto) {
    const where: any = { workspaceId };
    if (f.status) where.status = f.status;

    const [data, total, summary] = await Promise.all([
      this.prisma.customerSubscription.findMany({
        take: Math.min(f.perPage || 10, 100),
        skip: ((f.page || 1) - 1) * Math.min(f.perPage || 10, 100),
        where,
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
      this.prisma.customerSubscription.count({ where }),
      this.prisma.customerSubscription.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: true,
        _sum: { amount: true },
      }),
    ]);
    return { data, total, summary, page: f.page || 1 };
  }

  // ── INDICADORES PRODUTO ──
  async getIndicadoresProduto(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = this.dateRange(f);
    try {
      if (f.product) {
        const productFilter = `%${f.product}%`;
        return await this.prisma.$queryRaw`
          SELECT DATE(co."createdAt") as day, COUNT(*)::int as vendas,
            COALESCE(SUM(co."totalInCents"), 0)::int as receita
          FROM "CheckoutOrder" co
          JOIN "CheckoutProductPlan" pp ON co."planId" = pp.id
          JOIN "Product" p ON pp."productId" = p.id
          WHERE co."workspaceId" = ${workspaceId}
            AND co."createdAt" >= ${start} AND co."createdAt" <= ${end}
            AND p.name ILIKE ${productFilter}
          GROUP BY DATE(co."createdAt") ORDER BY day ASC
        `;
      }
      return await this.prisma.$queryRaw`
        SELECT DATE(co."createdAt") as day, COUNT(*)::int as vendas,
          COALESCE(SUM(co."totalInCents"), 0)::int as receita
        FROM "CheckoutOrder" co
        JOIN "CheckoutProductPlan" pp ON co."planId" = pp.id
        JOIN "Product" p ON pp."productId" = p.id
        WHERE co."workspaceId" = ${workspaceId}
          AND co."createdAt" >= ${start} AND co."createdAt" <= ${end}
        GROUP BY DATE(co."createdAt") ORDER BY day ASC
      `;
    } catch (err) {
      this.logger.error(`getIndicadoresProduto query failed: ${err}`);
      return [];
    }
  }

  // ── RECUSA ──
  async getRecusa(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = this.dateRange(f);
    try {
      const data = await this.prisma.checkoutPayment.findMany({
        take: Math.min(f.perPage || 10, 100),
        skip: ((f.page || 1) - 1) * Math.min(f.perPage || 10, 100),
        where: {
          status: 'DECLINED',
          order: { workspaceId, createdAt: { gte: start, lte: end } },
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
          order: { workspaceId, createdAt: { gte: start, lte: end } },
        },
      });
      return { data, total, page: f.page || 1 };
    } catch (err) {
      this.logger.error(`getRecusa query failed: ${err}`);
      return { data: [], total: 0 };
    }
  }

  // ── ORIGEM ──
  async getOrigem(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = this.dateRange(f);
    try {
      return await this.prisma.$queryRaw`
        SELECT COALESCE(NULLIF("couponCode",''), 'Direto') as source,
          COUNT(*)::int as vendas, COALESCE(SUM("totalInCents"),0)::int as receita
        FROM "CheckoutOrder"
        WHERE "workspaceId" = ${workspaceId} AND status = 'PAID'
          AND "createdAt" >= ${start} AND "createdAt" <= ${end}
        GROUP BY source ORDER BY vendas DESC
      `;
    } catch (err) {
      this.logger.error(`getOrigem query failed: ${err}`);
      return [];
    }
  }

  // ── AD SPEND ──
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
    // Idempotency: prevent duplicate ad spend entries for the same
    // workspace+platform+date+campaign combination within a short window.
    const parsedDate = new Date(data.date);
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

  async getAdSpends(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = this.dateRange(f);
    const where: any = { workspaceId, date: { gte: start, lte: end } };
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
      this.prisma.adSpend.count({ where }),
    ]);
    return { data, total, page: f.page || 1 };
  }

  // ── METRICAS ──
  async getMetricas(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = this.dateRange(f);
    const where: any = { workspaceId, createdAt: { gte: start, lte: end } };

    try {
      const [total, byMethod, paid, revenueAgg, adSpendAgg] = await Promise.all([
        this.prisma.checkoutOrder.count({ where }),
        this.prisma.checkoutOrder.groupBy({
          by: ['paymentMethod'],
          where,
          _count: true,
        }),
        this.prisma.checkoutOrder.count({
          where: { ...where, status: 'PAID' },
        }),
        this.prisma.checkoutOrder.aggregate({
          where: { ...where, status: 'PAID' },
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
        conversao: total > 0 ? parseFloat(((paid / total) * 100).toFixed(2)) : 0,
        byMethod: methods,
        totalRevenue,
        totalAdSpend,
        roas,
      };
    } catch (err) {
      this.logger.error(`getMetricas query failed: ${err}`);
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

  // ── ESTORNOS ──
  async getEstornos(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = this.dateRange(f);
    const where: any = {
      workspaceId,
      status: 'REFUNDED',
      refundedAt: { not: null, gte: start, lte: end },
    };

    const [data, total] = await Promise.all([
      this.prisma.checkoutOrder.findMany({
        take: Math.min(f.perPage || 10, 100),
        skip: ((f.page || 1) - 1) * Math.min(f.perPage || 10, 100),
        where,
        orderBy: { refundedAt: 'desc' },
        include: {
          plan: { select: { name: true, product: { select: { name: true } } } },
        },
      }),
      this.prisma.checkoutOrder.count({ where }),
    ]);
    return { data, total, page: f.page || 1 };
  }

  // ── CHARGEBACK ──
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
    } catch (err) {
      this.logger.error(`getChargeback query failed: ${err}`);
      return { data: [], total: 0 };
    }
  }
}
