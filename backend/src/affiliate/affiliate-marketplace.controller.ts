import { Body, Controller, Get, Post, Query, Req, Request, UseGuards } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../prisma/prisma.service';
import { buildMarketplaceWhere, enrichAffiliateProducts } from './affiliate-helpers';

/**
 * Affiliate Marketplace Read Controller
 *
 * Read-only endpoints for marketplace listing, stats, categories,
 * recommendations, AI search, and suggestions.
 */
@Controller('affiliate')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AffiliateMarketplaceController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List products available on the affiliate marketplace (all workspaces, listed=true)
   */
  @Get('marketplace')
  async listMarketplace(
    @Request() req: AuthenticatedRequest,
    @Query('category') category?: string,
    @Query('search') _search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Number.parseInt(limit || '20', 10), 100);
    const skip = (Math.max(Number.parseInt(page || '1', 10), 1) - 1) * take;

    const where: Prisma.AffiliateProductWhereInput = { listed: true };
    if (category) {
      where.category = category;
    }
    const filteredWhere = buildMarketplaceWhere(where);

    let orderBy: Prisma.AffiliateProductOrderByWithRelationInput = { temperature: 'desc' };
    if (sort === 'newest') {
      orderBy = { createdAt: 'desc' };
    } else if (sort === 'commission') {
      orderBy = { commissionPct: 'desc' };
    }

    const [products, total] = await Promise.all([
      this.prisma.affiliateProduct.findMany({
        where: filteredWhere,
        orderBy,
        take,
        skip,
      }),
      this.prisma.affiliateProduct.count({ where: filteredWhere }),
    ]);
    const enrichedProducts = await enrichAffiliateProducts(
      this.prisma,
      req,
      products,
      req.user.workspaceId,
    );

    return {
      products: enrichedProducts,
      total,
      page: Math.max(Number.parseInt(page || '1', 10), 1),
      totalPages: Math.ceil(total / take),
    };
  }

  /**
   * Global marketplace stats
   */
  @Get('marketplace/stats')
  async getMarketplaceStats() {
    const where = buildMarketplaceWhere({ listed: true });
    const totalProducts = await this.prisma.affiliateProduct.count({ where });

    const products = await this.prisma.affiliateProduct.findMany({
      where,
      select: {
        totalAffiliates: true,
        totalSales: true,
        totalRevenue: true,
        commissionPct: true,
      },
    });

    const totalAffiliates = products.reduce((sum, p) => sum + p.totalAffiliates, 0);
    const totalSales = products.reduce((sum, p) => sum + p.totalSales, 0);
    const totalRevenue = products.reduce((sum, p) => sum + p.totalRevenue, 0);
    const avgCommission =
      products.length > 0
        ? products.reduce((sum, p) => sum + p.commissionPct, 0) / products.length
        : 0;

    return {
      totalProducts,
      totalAffiliates,
      totalSales,
      totalRevenue,
      avgCommission: Math.round(avgCommission * 100) / 100,
    };
  }

  /**
   * Get categories with product count
   */
  @Get('marketplace/categories')
  async getCategories() {
    const where = buildMarketplaceWhere({ listed: true });
    const products = await this.prisma.affiliateProduct.findMany({
      where,
      select: { category: true },
    });

    const categoryMap: Record<string, number> = {};
    for (const p of products) {
      const cat = p.category || 'Outros';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    }

    const categories = Object.entries(categoryMap).map(([name, count]) => ({
      name,
      count,
    }));

    return { categories };
  }

  /**
   * Get recommended (top temperature) products
   */
  @Get('marketplace/recommended')
  async getRecommended(@Request() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    const take = Math.min(Number.parseInt(limit || '10', 10), 50);
    const where = buildMarketplaceWhere({ listed: true });

    const products = await this.prisma.affiliateProduct.findMany({
      where,
      orderBy: { temperature: 'desc' },
      take,
    });
    const enrichedProducts = await enrichAffiliateProducts(
      this.prisma,
      req,
      products,
      req.user.workspaceId,
    );

    return { products: enrichedProducts };
  }

  /** Ai search. */
  @Post('ai-search')
  async aiSearch(@Req() req: AuthenticatedRequest, @Body() body: { query: string }) {
    const workspaceId = req.user.workspaceId;
    const where = buildMarketplaceWhere({
      listed: true,
      OR: [
        { category: { contains: body.query || '', mode: 'insensitive' } },
        { tags: { has: body.query || '' } },
      ],
    });

    const products = await this.prisma.affiliateProduct.findMany({
      where,
      take: 20,
      orderBy: { temperature: 'desc' },
    });
    const enrichedProducts = await enrichAffiliateProducts(this.prisma, req, products, workspaceId);
    return { products: enrichedProducts };
  }

  /** Suggest. */
  @Post('suggest')
  async suggest(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.user.workspaceId;
    const myProducts = await this.prisma.product.findMany({
      where: { workspaceId },
      select: { category: true, name: true },
      take: 5,
    });
    const categories = [...new Set(myProducts.map((product) => product.category).filter(Boolean))];

    const where = buildMarketplaceWhere({
      listed: true,
      ...(categories.length > 0 ? { category: { in: categories } } : {}),
    });

    const products = await this.prisma.affiliateProduct.findMany({
      where,
      take: 10,
      orderBy: { temperature: 'desc' },
    });
    const enrichedProducts = await enrichAffiliateProducts(this.prisma, req, products, workspaceId);
    return { products: enrichedProducts };
  }
}
