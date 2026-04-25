import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { dateRange } from './reports-orders.service';

/**
 * Handles affiliate and product-level report queries:
 * afiliados, indicadores, indicadores-produto.
 */
@Injectable()
export class ReportsAffiliateService {
  private readonly logger = new Logger(ReportsAffiliateService.name);

  constructor(private prisma: PrismaService) {}

  async resolveAffiliateIds(workspaceId: string, affiliateEmail: string): Promise<string[]> {
    const partners = await this.prisma.affiliatePartner.findMany({
      where: {
        workspaceId,
        partnerEmail: { contains: affiliateEmail, mode: 'insensitive' },
      },
      select: { id: true },
    });
    return partners.map((p) => p.id);
  }

  async getAfiliados(workspaceId: string, _f: ReportFiltersDto) {
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

  async getIndicadores(workspaceId: string, _f: ReportFiltersDto) {
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

  async getIndicadoresProduto(workspaceId: string, f: ReportFiltersDto) {
    const { start, end } = dateRange(f);
    try {
      if (f.product) {
        const productFilter = `%${f.product}%`;
        return await this.prisma.$queryRaw`
          SELECT DATE(co."createdAt") as day, COUNT(*)::int as vendas,
            COALESCE(SUM(co."totalInCents"), 0)::int as receita
          FROM "RAC_CheckoutOrder" co
          JOIN "RAC_CheckoutProductPlan" pp ON co."planId" = pp.id
          JOIN "RAC_Product" p ON pp."productId" = p.id
          WHERE co."workspaceId" = ${workspaceId}
            AND co."createdAt" >= ${start} AND co."createdAt" <= ${end}
            AND p.name ILIKE ${productFilter}
          GROUP BY DATE(co."createdAt") ORDER BY day ASC
        `;
      }
      return await this.prisma.$queryRaw`
        SELECT DATE(co."createdAt") as day, COUNT(*)::int as vendas,
          COALESCE(SUM(co."totalInCents"), 0)::int as receita
        FROM "RAC_CheckoutOrder" co
        JOIN "RAC_CheckoutProductPlan" pp ON co."planId" = pp.id
        JOIN "RAC_Product" p ON pp."productId" = p.id
        WHERE co."workspaceId" = ${workspaceId}
          AND co."createdAt" >= ${start} AND co."createdAt" <= ${end}
        GROUP BY DATE(co."createdAt") ORDER BY day ASC
      `;
    } catch (err) {
      this.logger.error(`getIndicadoresProduto query failed: ${err}`);
      return [];
    }
  }
}
