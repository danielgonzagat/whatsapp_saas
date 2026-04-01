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
import { isLegacyProductName } from '../common/products/legacy-products.util';
import {
  getRequestOrigin,
  normalizeStorageUrlForRequest,
} from '../common/storage/public-storage-url.util';

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

  private serializeAffiliateProductForResponse(req: any, product: any) {
    if (!product) return product;

    return {
      ...product,
      thumbnailUrl:
        normalizeStorageUrlForRequest(product.thumbnailUrl, req) || null,
    };
  }

  private buildAffiliateLinkUrl(req: any, code: string | null | undefined) {
    if (!code) return null;

    const baseUrl =
      process.env.FRONTEND_URL?.replace(/\/+$/, '') ||
      getRequestOrigin(req) ||
      '';

    if (!baseUrl) {
      return `/r/${code}`;
    }

    return `${baseUrl}/r/${code}`;
  }

  private normalizePromoMaterials(value: any) {
    if (Array.isArray(value)) {
      return value.filter((entry) => typeof entry === 'string');
    }

    if (Array.isArray(value?.items)) {
      return value.items.filter((entry: unknown) => typeof entry === 'string');
    }

    return [];
  }

  private async enrichAffiliateProducts(
    req: any,
    affiliateProducts: any[],
    viewerWorkspaceId?: string,
  ) {
    if (!affiliateProducts.length) {
      return [];
    }

    const productIds = affiliateProducts.map((item) => item.productId);
    const affiliateProductIds = affiliateProducts.map((item) => item.id);

    const [products, ratings, viewerRequests, viewerLinks] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          workspaceId: true,
          name: true,
          description: true,
          price: true,
          category: true,
          imageUrl: true,
          tags: true,
        },
      }),
      this.prisma.productReview.groupBy({
        by: ['productId'],
        where: { productId: { in: productIds } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      viewerWorkspaceId
        ? this.prisma.affiliateRequest.findMany({
            where: {
              affiliateWorkspaceId: viewerWorkspaceId,
              affiliateProductId: { in: affiliateProductIds },
            },
          })
        : Promise.resolve([]),
      viewerWorkspaceId
        ? this.prisma.affiliateLink.findMany({
            where: {
              affiliateWorkspaceId: viewerWorkspaceId,
              affiliateProductId: { in: affiliateProductIds },
            },
          })
        : Promise.resolve([]),
    ]);

    const workspaceIds = [...new Set(products.map((product) => product.workspaceId))];
    const workspaces = workspaceIds.length
      ? await this.prisma.workspace.findMany({
          where: { id: { in: workspaceIds } },
          select: { id: true, name: true },
        })
      : [];

    const productById = new Map(products.map((product) => [product.id, product]));
    const workspaceById = new Map(
      workspaces.map((workspace) => [workspace.id, workspace.name]),
    );
    const ratingByProductId = new Map(
      ratings.map((rating) => [
        rating.productId,
        {
          average: Number(rating._avg.rating || 0),
          total: rating._count._all,
        },
      ]),
    );
    const requestByAffiliateProductId = new Map(
      viewerRequests.map((request) => [request.affiliateProductId, request]),
    );
    const linkByAffiliateProductId = new Map(
      viewerLinks.map((link) => [link.affiliateProductId, link]),
    );

    return affiliateProducts.map((affiliateProduct) => {
      const product = productById.get(affiliateProduct.productId);
      const request = requestByAffiliateProductId.get(affiliateProduct.id);
      const link = linkByAffiliateProductId.get(affiliateProduct.id);
      const rating = ratingByProductId.get(affiliateProduct.productId);
      const thumbnailUrl =
        normalizeStorageUrlForRequest(
          affiliateProduct.thumbnailUrl || product?.imageUrl,
          req,
        ) || null;

      return {
        ...this.serializeAffiliateProductForResponse(req, affiliateProduct),
        name: product?.name || 'Produto',
        description: product?.description || '',
        price: Number(product?.price || 0),
        category: affiliateProduct.category || product?.category || 'Geral',
        tags:
          affiliateProduct.tags?.length > 0
            ? affiliateProduct.tags
            : product?.tags || [],
        thumbnailUrl,
        imageUrl: thumbnailUrl,
        producer: workspaceById.get(product?.workspaceId || '') || 'Kloel',
        commission: affiliateProduct.commissionPct,
        rating: Number((rating?.average || 0).toFixed(1)),
        totalReviews: rating?.total || 0,
        materials: this.normalizePromoMaterials(affiliateProduct.promoMaterials),
        requestStatus: request?.status || null,
        affiliateLink: this.buildAffiliateLinkUrl(req, link?.code),
        isSaved: request?.status === 'SAVED',
        isApproved: request?.status === 'APPROVED',
        isPending: request?.status === 'PENDING',
      };
    });
  }

  private async getLegacyProductIds() {
    const products = await this.prisma.product.findMany({
      select: { id: true, name: true },
    });

    return products
      .filter((product) => isLegacyProductName(product.name))
      .map((product) => product.id);
  }

  private async buildMarketplaceWhere(baseWhere: Record<string, any>) {
    const legacyProductIds = await this.getLegacyProductIds();

    if (legacyProductIds.length === 0) {
      return baseWhere;
    }

    return {
      AND: [baseWhere, { productId: { notIn: legacyProductIds } }],
    };
  }

  /**
   * List products available on the affiliate marketplace (all workspaces, listed=true)
   */
  @Get('marketplace')
  async listMarketplace(
    @Request() req: any,
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

    const filteredWhere = await this.buildMarketplaceWhere(where);

    let orderBy: any = { temperature: 'desc' };
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
    const enrichedProducts = await this.enrichAffiliateProducts(
      req,
      products,
      req.user.workspaceId,
    );

    return {
      products: enrichedProducts,
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
    const where = await this.buildMarketplaceWhere({ listed: true });

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
    const where = await this.buildMarketplaceWhere({ listed: true });

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
  async getRecommended(
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(parseInt(limit || '10', 10), 50);
    const where = await this.buildMarketplaceWhere({ listed: true });

    const products = await this.prisma.affiliateProduct.findMany({
      where,
      orderBy: { temperature: 'desc' },
      take,
    });
    const enrichedProducts = await this.enrichAffiliateProducts(
      req,
      products,
      req.user.workspaceId,
    );

    return {
      products: enrichedProducts,
    };
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
    const legacyProductIds = new Set(await this.getLegacyProductIds());

    const requests = (
      await this.prisma.affiliateRequest.findMany({
        where: { affiliateWorkspaceId: workspaceId },
        include: { affiliateProduct: true },
        orderBy: { createdAt: 'desc' },
      })
    ).filter(
      (request) => !legacyProductIds.has(request.affiliateProduct?.productId || ''),
    );
    const enrichedProducts = await this.enrichAffiliateProducts(
      req,
      requests.map((request) => request.affiliateProduct).filter(Boolean),
      workspaceId,
    );
    const enrichedProductsById = new Map(
      enrichedProducts.map((product) => [product.id, product]),
    );

    const items = requests.map((request) => ({
      ...request,
      affiliateProduct:
        enrichedProductsById.get(request.affiliateProduct?.id || '') ||
        this.serializeAffiliateProductForResponse(req, request.affiliateProduct),
    }));

    return { products: items, count: items.length };
  }

  /**
   * Get my affiliate links with metrics
   */
  @Get('my-links')
  async getMyLinks(@Request() req: any) {
    const workspaceId = req.user.workspaceId;
    const legacyProductIds = new Set(await this.getLegacyProductIds());

    const links = (
      await this.prisma.affiliateLink.findMany({
        where: { affiliateWorkspaceId: workspaceId },
        include: { affiliateProduct: true },
        orderBy: { createdAt: 'desc' },
      })
    ).filter(
      (link) => !legacyProductIds.has(link.affiliateProduct?.productId || ''),
    );
    const enrichedProducts = await this.enrichAffiliateProducts(
      req,
      links.map((link) => link.affiliateProduct).filter(Boolean),
      workspaceId,
    );
    const enrichedProductsById = new Map(
      enrichedProducts.map((product) => [product.id, product]),
    );

    const items = links.map((link) => ({
      ...link,
      url: this.buildAffiliateLinkUrl(req, link.code),
      affiliateProduct:
        enrichedProductsById.get(link.affiliateProduct?.id || '') ||
        this.serializeAffiliateProductForResponse(req, link.affiliateProduct),
    }));

    const totalClicks = items.reduce((sum, l) => sum + l.clicks, 0);
    const totalSales = items.reduce((sum, l) => sum + l.sales, 0);
    const totalRevenue = items.reduce((sum, l) => sum + l.revenue, 0);
    const totalCommission = items.reduce(
      (sum, l) => sum + l.commissionEarned,
      0,
    );

    return {
      links: items,
      count: items.length,
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

    if (isLegacyProductName(product.name)) {
      throw new BadRequestException('Legacy default products are disabled');
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

    return {
      affiliateProduct: this.serializeAffiliateProductForResponse(
        req,
        affiliateProduct,
      ),
      success: true,
    };
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

    if (isLegacyProductName(product.name)) {
      throw new BadRequestException('Legacy default products are disabled');
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

    return {
      affiliateProduct: this.serializeAffiliateProductForResponse(req, updated),
      success: true,
    };
  }

  @Post('ai-search')
  async aiSearch(@Req() req: any, @Body() body: { query: string }) {
    const workspaceId = req.user.workspaceId;
    const where = await this.buildMarketplaceWhere({
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
    const enrichedProducts = await this.enrichAffiliateProducts(
      req,
      products,
      workspaceId,
    );
    return {
      products: enrichedProducts,
    };
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
    const categories = [
      ...new Set(
        myProducts
          .filter((product) => !isLegacyProductName(product.name))
          .map((product) => product.category)
          .filter(Boolean),
      ),
    ];

    const where = await this.buildMarketplaceWhere({
      listed: true,
      ...(categories.length > 0 ? { category: { in: categories } } : {}),
    });

    const products = await this.prisma.affiliateProduct.findMany({
      where,
      take: 10,
      orderBy: { temperature: 'desc' },
    });
    const enrichedProducts = await this.enrichAffiliateProducts(
      req,
      products,
      workspaceId,
    );
    return {
      products: enrichedProducts,
    };
  }

  @Post('saved/:productId')
  async saveProduct(@Req() req: any, @Param('productId') productId: string) {
    const workspaceId = req.user.workspaceId;
    // Use metadata or a simple flag on affiliate request
    const existing = await this.prisma.affiliateRequest.findFirst({
      where: {
        affiliateWorkspaceId: workspaceId,
        affiliateProductId: productId,
      },
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
      where: {
        affiliateWorkspaceId: workspaceId,
        affiliateProductId: productId,
        status: 'SAVED',
      },
    });
    return { success: true, saved: false };
  }
}
