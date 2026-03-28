import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  Query,
  UseGuards,
  Request,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { PrismaService } from '../prisma/prisma.service';
import { KycApprovedGuard } from '../kyc/kyc-approved.guard';
import { KycRequired } from '../kyc/kyc-approved.decorator';

interface ListProductDto {
  commissionPct?: number;
  commissionType?: string;
  commissionFixed?: number;
  cookieDays?: number;
  approvalMode?: string;
  category?: string;
  tags?: string[];
  thumbnailUrl?: string;
  promoMaterials?: any;
}

interface ConfigureProductDto {
  commissionPct?: number;
  commissionType?: string;
  commissionFixed?: number;
  cookieDays?: number;
  approvalMode?: string;
  category?: string;
  tags?: string[];
  listed?: boolean;
  thumbnailUrl?: string;
  promoMaterials?: any;
}

/**
 * AFFILIATE SYSTEM CONTROLLER
 *
 * Manages the affiliate marketplace: listing products,
 * requesting affiliation, tracking links and commissions.
 * All endpoints require authentication.
 */
@Controller('affiliate')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AffiliateController {
  private readonly logger = new Logger(AffiliateController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List products available on the affiliate marketplace (all workspaces, listed=true)
   */
  @Get('marketplace')
  async listMarketplace(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(parseInt(limit || '20', 10), 100);
    const skip = (Math.max(parseInt(page || '1', 10), 1) - 1) * take;

    const where: any = { listed: true };

    if (category) {
      where.category = category;
    }

    let orderBy: any = { temperature: 'desc' };
    if (sort === 'newest') {
      orderBy = { createdAt: 'desc' };
    } else if (sort === 'commission') {
      orderBy = { commissionPct: 'desc' };
    }

    const [products, total] = await Promise.all([
      this.prisma.affiliateProduct.findMany({
        where,
        orderBy,
        take,
        skip,
      }),
      this.prisma.affiliateProduct.count({ where }),
    ]);

    return {
      products,
      total,
      page: Math.max(parseInt(page || '1', 10), 1),
      totalPages: Math.ceil(total / take),
    };
  }

  /**
   * Global marketplace stats
   */
  @Get('marketplace/stats')
  async getMarketplaceStats() {
    const totalProducts = await this.prisma.affiliateProduct.count({
      where: { listed: true },
    });

    const products = await this.prisma.affiliateProduct.findMany({
      where: { listed: true },
      select: {
        totalAffiliates: true,
        totalSales: true,
        totalRevenue: true,
        commissionPct: true,
      },
    });

    const totalAffiliates = products.reduce(
      (sum, p) => sum + p.totalAffiliates,
      0,
    );
    const totalSales = products.reduce((sum, p) => sum + p.totalSales, 0);
    const totalRevenue = products.reduce((sum, p) => sum + p.totalRevenue, 0);
    const avgCommission =
      products.length > 0
        ? products.reduce((sum, p) => sum + p.commissionPct, 0) /
          products.length
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
    const products = await this.prisma.affiliateProduct.findMany({
      where: { listed: true },
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
  async getRecommended(@Query('limit') limit?: string) {
    const take = Math.min(parseInt(limit || '10', 10), 50);

    const products = await this.prisma.affiliateProduct.findMany({
      where: { listed: true },
      orderBy: { temperature: 'desc' },
      take,
    });

    return { products };
  }

  /**
   * Request affiliation with a product
   */
  @Post('request/:productId')
  @UseGuards(KycApprovedGuard)
  @KycRequired()
  async requestAffiliation(
    @Request() req: any,
    @Param('productId') productId: string,
    @Body() body: { name?: string; email?: string },
  ) {
    const workspaceId = req.user.workspaceId;

    const product = await this.prisma.affiliateProduct.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check if already requested
    const existingRequest = await this.prisma.affiliateRequest.findUnique({
      where: {
        affiliateProductId_affiliateWorkspaceId: {
          affiliateProductId: productId,
          affiliateWorkspaceId: workspaceId,
        },
      },
    });

    if (existingRequest) {
      throw new BadRequestException('Affiliation already requested');
    }

    // Auto-approve or set to pending based on product config
    const status = product.approvalMode === 'AUTO' ? 'APPROVED' : 'PENDING';

    const request = await this.prisma.affiliateRequest.create({
      data: {
        affiliateProductId: productId,
        affiliateWorkspaceId: workspaceId,
        affiliateName: body.name || null,
        affiliateEmail: body.email || null,
        status,
      },
    });

    // If auto-approved, create the affiliate link immediately
    let link = null;
    if (status === 'APPROVED') {
      link = await this.prisma.affiliateLink.create({
        data: {
          affiliateProductId: productId,
          affiliateWorkspaceId: workspaceId,
        },
      });

      // Increment affiliate count
      await this.prisma.affiliateProduct.update({
        where: { id: productId },
        data: { totalAffiliates: { increment: 1 } },
      });
    }

    this.logger.log(
      `Affiliate request: workspace ${workspaceId} -> product ${productId} (${status})`,
    );

    return { request, link, success: true };
  }

  /**
   * Get products the current workspace is affiliated with
   */
  @Get('my-products')
  async getMyProducts(@Request() req: any) {
    const workspaceId = req.user.workspaceId;

    const requests = await this.prisma.affiliateRequest.findMany({
      where: { affiliateWorkspaceId: workspaceId },
      include: { affiliateProduct: true },
      orderBy: { createdAt: 'desc' },
    });

    return { products: requests, count: requests.length };
  }

  /**
   * Get my affiliate links with metrics
   */
  @Get('my-links')
  async getMyLinks(@Request() req: any) {
    const workspaceId = req.user.workspaceId;

    const links = await this.prisma.affiliateLink.findMany({
      where: { affiliateWorkspaceId: workspaceId },
      include: { affiliateProduct: true },
      orderBy: { createdAt: 'desc' },
    });

    const totalClicks = links.reduce((sum, l) => sum + l.clicks, 0);
    const totalSales = links.reduce((sum, l) => sum + l.sales, 0);
    const totalRevenue = links.reduce((sum, l) => sum + l.revenue, 0);
    const totalCommission = links.reduce(
      (sum, l) => sum + l.commissionEarned,
      0,
    );

    return {
      links,
      count: links.length,
      totals: {
        clicks: totalClicks,
        sales: totalSales,
        revenue: totalRevenue,
        commission: totalCommission,
      },
    };
  }

  /**
   * List my product on the affiliate marketplace
   */
  @Post('list-product/:productId')
  @UseGuards(KycApprovedGuard)
  @KycRequired()
  async listProduct(
    @Request() req: any,
    @Param('productId') productId: string,
    @Body() dto: ListProductDto,
  ) {
    const workspaceId = req.user.workspaceId;

    // Verify the product belongs to this workspace
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });

    if (!product) {
      throw new NotFoundException('Product not found in your workspace');
    }

    // Check if already listed
    const existing = await this.prisma.affiliateProduct.findUnique({
      where: { productId },
    });

    if (existing) {
      throw new BadRequestException('Product already listed');
    }

    const affiliateProduct = await this.prisma.affiliateProduct.create({
      data: {
        productId,
        listed: true,
        commissionPct: dto.commissionPct ?? 30,
        commissionType: dto.commissionType || 'PERCENTAGE',
        commissionFixed: dto.commissionFixed ?? null,
        cookieDays: dto.cookieDays ?? 30,
        approvalMode: dto.approvalMode || 'AUTO',
        category: dto.category || product.category || null,
        tags: dto.tags || product.tags || [],
        thumbnailUrl: dto.thumbnailUrl || product.imageUrl || null,
        promoMaterials: dto.promoMaterials || null,
      },
    });

    this.logger.log(
      `Product listed on marketplace: ${productId} by workspace ${workspaceId}`,
    );

    return { affiliateProduct, success: true };
  }

  /**
   * Configure commission, approval mode, etc. for a listed product
   */
  @Put('config/:productId')
  async configureProduct(
    @Request() req: any,
    @Param('productId') productId: string,
    @Body() dto: ConfigureProductDto,
  ) {
    const workspaceId = req.user.workspaceId;

    // Verify the product belongs to this workspace
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });

    if (!product) {
      throw new NotFoundException('Product not found in your workspace');
    }

    const existing = await this.prisma.affiliateProduct.findUnique({
      where: { productId },
    });

    if (!existing) {
      throw new NotFoundException('Product not listed on marketplace');
    }

    const updated = await this.prisma.affiliateProduct.update({
      where: { productId },
      data: {
        ...(dto.commissionPct !== undefined && {
          commissionPct: dto.commissionPct,
        }),
        ...(dto.commissionType !== undefined && {
          commissionType: dto.commissionType,
        }),
        ...(dto.commissionFixed !== undefined && {
          commissionFixed: dto.commissionFixed,
        }),
        ...(dto.cookieDays !== undefined && { cookieDays: dto.cookieDays }),
        ...(dto.approvalMode !== undefined && {
          approvalMode: dto.approvalMode,
        }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.listed !== undefined && { listed: dto.listed }),
        ...(dto.thumbnailUrl !== undefined && {
          thumbnailUrl: dto.thumbnailUrl,
        }),
        ...(dto.promoMaterials !== undefined && {
          promoMaterials: dto.promoMaterials,
        }),
      },
    });

    return { affiliateProduct: updated, success: true };
  }

  @Post('ai-search')
  async aiSearch(@Req() req: any, @Body() body: { query: string }) {
    const workspaceId = req.user.workspaceId;
    const products = await this.prisma.affiliateProduct.findMany({
      where: {
        listed: true,
        OR: [
          { category: { contains: body.query || '', mode: 'insensitive' } },
          { tags: { has: body.query || '' } },
        ],
      },
      take: 20,
      orderBy: { temperature: 'desc' },
    });
    return { products };
  }

  @Post('suggest')
  async suggest(@Req() req: any) {
    const workspaceId = req.user.workspaceId;
    // Get workspace products to understand niche
    const myProducts = await this.prisma.product.findMany({
      where: { workspaceId },
      select: { category: true, name: true },
      take: 5,
    });
    const categories = [...new Set(myProducts.map(p => p.category).filter(Boolean))];

    const products = await this.prisma.affiliateProduct.findMany({
      where: {
        listed: true,
        ...(categories.length > 0 ? { category: { in: categories } } : {}),
      },
      take: 10,
      orderBy: { temperature: 'desc' },
    });
    return { products };
  }

  @Post('saved/:productId')
  async saveProduct(@Req() req: any, @Param('productId') productId: string) {
    const workspaceId = req.user.workspaceId;
    // Use metadata or a simple flag on affiliate request
    const existing = await this.prisma.affiliateRequest.findFirst({
      where: { affiliateWorkspaceId: workspaceId, affiliateProductId: productId },
    });
    if (existing) return { success: true, saved: true };

    await this.prisma.affiliateRequest.create({
      data: {
        affiliateWorkspaceId: workspaceId,
        affiliateProductId: productId,
        status: 'SAVED',
      },
    });
    return { success: true, saved: true };
  }

  @Delete('saved/:productId')
  async unsaveProduct(@Req() req: any, @Param('productId') productId: string) {
    const workspaceId = req.user.workspaceId;
    await this.prisma.affiliateRequest.deleteMany({
      where: { affiliateWorkspaceId: workspaceId, affiliateProductId: productId, status: 'SAVED' },
    });
    return { success: true, saved: false };
  }
}
