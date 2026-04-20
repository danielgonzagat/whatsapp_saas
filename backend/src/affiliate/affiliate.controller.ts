import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { AffiliateProduct, Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { generateUniquePublicCheckoutCode } from '../checkout/checkout-code.util';
import { buildPayCheckoutUrl } from '../checkout/checkout-public-url.util';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import { KycRequired } from '../kyc/kyc-approved.decorator';
import { KycApprovedGuard } from '../kyc/kyc-approved.guard';
import { PrismaService } from '../prisma/prisma.service';

interface ListProductDto {
  commissionPct?: number;
  commissionType?: string;
  commissionFixed?: number;
  cookieDays?: number;
  approvalMode?: string;
  category?: string;
  tags?: string[];
  thumbnailUrl?: string;
  promoMaterials?: Prisma.InputJsonValue;
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
  promoMaterials?: Prisma.InputJsonValue;
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

  private serializeAffiliateProductForResponse<T extends { thumbnailUrl: string | null }>(
    req: AuthenticatedRequest,
    product: T | null | undefined,
  ): (T & { thumbnailUrl: string | null }) | null {
    if (!product) {
      return null;
    }

    return {
      ...product,
      thumbnailUrl: normalizeStorageUrlForRequest(product.thumbnailUrl, req) || null,
    };
  }

  private buildAffiliateLinkUrl(req: AuthenticatedRequest, code: string | null | undefined) {
    return buildPayCheckoutUrl(req, code);
  }

  private async isPublicCodeTaken(code: string) {
    const [plan, checkoutLink, affiliateLink] = await Promise.all([
      this.prisma.checkoutProductPlan.findFirst({
        where: { referenceCode: code },
        select: { id: true },
      }),
      this.prisma.checkoutPlanLink.findFirst({
        where: { referenceCode: code },
        select: { id: true },
      }),
      this.prisma.affiliateLink.findFirst({
        where: { code },
        select: { id: true },
      }),
    ]);

    return Boolean(plan || checkoutLink || affiliateLink);
  }

  private async generateAffiliateLinkCode() {
    return generateUniquePublicCheckoutCode((candidate) => this.isPublicCodeTaken(candidate));
  }

  private normalizePromoMaterials(value: unknown) {
    if (Array.isArray(value)) {
      return value.filter((entry) => typeof entry === 'string');
    }

    if (
      value &&
      typeof value === 'object' &&
      'items' in value &&
      Array.isArray((value as { items?: unknown[] }).items)
    ) {
      return ((value as { items: unknown[] }).items || []).filter(
        (entry): entry is string => typeof entry === 'string',
      );
    }

    return [];
  }

  private async enrichAffiliateProducts(
    req: AuthenticatedRequest,
    affiliateProducts: AffiliateProduct[],
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
    const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
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

    return affiliateProducts.map((affiliateProduct) =>
      this.buildEnrichedAffiliateProduct(req, affiliateProduct, {
        productById,
        workspaceById,
        ratingByProductId,
        requestByAffiliateProductId,
        linkByAffiliateProductId,
      }),
    );
  }

  private buildEnrichedAffiliateProduct(
    req: AuthenticatedRequest,
    affiliateProduct: AffiliateProduct,
    lookup: {
      productById: Map<
        string,
        {
          id: string;
          workspaceId: string;
          name: string;
          description: string | null;
          price: number | null;
          category: string | null;
          imageUrl: string | null;
          tags: string[];
        }
      >;
      workspaceById: Map<string, string>;
      ratingByProductId: Map<string, { average: number; total: number }>;
      requestByAffiliateProductId: Map<string, { affiliateProductId: string; status: string }>;
      linkByAffiliateProductId: Map<string, { affiliateProductId: string; code: string }>;
    },
  ) {
    const product = lookup.productById.get(affiliateProduct.productId);
    const request = lookup.requestByAffiliateProductId.get(affiliateProduct.id);
    const link = lookup.linkByAffiliateProductId.get(affiliateProduct.id);
    const rating = lookup.ratingByProductId.get(affiliateProduct.productId);
    const thumbnailUrl =
      normalizeStorageUrlForRequest(affiliateProduct.thumbnailUrl || product?.imageUrl, req) ||
      null;
    const status = request?.status;

    return {
      ...this.serializeAffiliateProductForResponse(req, affiliateProduct),
      name: product?.name || 'Produto',
      description: product?.description || '',
      price: Number(product?.price || 0),
      category: affiliateProduct.category || product?.category || 'Geral',
      tags: affiliateProduct.tags?.length > 0 ? affiliateProduct.tags : product?.tags || [],
      thumbnailUrl,
      imageUrl: thumbnailUrl,
      producer: lookup.workspaceById.get(product?.workspaceId || '') || 'Kloel',
      commission: affiliateProduct.commissionPct,
      rating: Number((rating?.average || 0).toFixed(1)),
      totalReviews: rating?.total || 0,
      materials: this.normalizePromoMaterials(affiliateProduct.promoMaterials),
      requestStatus: status || null,
      affiliateLink: this.buildAffiliateLinkUrl(req, link?.code),
      isSaved: status === 'SAVED',
      isApproved: status === 'APPROVED',
      isPending: status === 'PENDING',
    };
  }

  private buildMarketplaceWhere(
    baseWhere: Prisma.AffiliateProductWhereInput,
  ): Promise<Prisma.AffiliateProductWhereInput> {
    return Promise.resolve(baseWhere);
  }

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

    const filteredWhere = await this.buildMarketplaceWhere(where);

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
    const enrichedProducts = await this.enrichAffiliateProducts(
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
  async getRecommended(@Request() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    const take = Math.min(Number.parseInt(limit || '10', 10), 50);
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
    @Request() req: AuthenticatedRequest,
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
      const code = await this.generateAffiliateLinkCode();
      link = await this.prisma.affiliateLink.create({
        data: {
          affiliateProductId: productId,
          affiliateWorkspaceId: workspaceId,
          code,
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
  async getMyProducts(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user.workspaceId;

    const requests = await this.prisma.affiliateRequest.findMany({
      where: { affiliateWorkspaceId: workspaceId },
      include: { affiliateProduct: true },
      orderBy: { createdAt: 'desc' },
    });
    const enrichedProducts = await this.enrichAffiliateProducts(
      req,
      requests.map((request) => request.affiliateProduct).filter(Boolean),
      workspaceId,
    );
    const enrichedProductsById = new Map(enrichedProducts.map((product) => [product.id, product]));

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
  async getMyLinks(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user.workspaceId;

    const links = await this.prisma.affiliateLink.findMany({
      where: { affiliateWorkspaceId: workspaceId },
      include: { affiliateProduct: true },
      orderBy: { createdAt: 'desc' },
    });
    const enrichedProducts = await this.enrichAffiliateProducts(
      req,
      links.map((link) => link.affiliateProduct).filter(Boolean),
      workspaceId,
    );
    const enrichedProductsById = new Map(enrichedProducts.map((product) => [product.id, product]));

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
    const totalCommission = items.reduce((sum, l) => sum + l.commissionEarned, 0);

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
    @Request() req: AuthenticatedRequest,
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

    this.logger.log(`Product listed on marketplace: ${productId} by workspace ${workspaceId}`);

    return {
      affiliateProduct: this.serializeAffiliateProductForResponse(req, affiliateProduct),
      success: true,
    };
  }

  /**
   * Configure commission, approval mode, etc. for a listed product
   */
  @Put('config/:productId')
  async configureProduct(
    @Request() req: AuthenticatedRequest,
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

    return {
      affiliateProduct: this.serializeAffiliateProductForResponse(req, updated),
      success: true,
    };
  }

  /** Ai search. */
  @Post('ai-search')
  async aiSearch(@Req() req: AuthenticatedRequest, @Body() body: { query: string }) {
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
    const enrichedProducts = await this.enrichAffiliateProducts(req, products, workspaceId);
    return {
      products: enrichedProducts,
    };
  }

  /** Suggest. */
  @Post('suggest')
  async suggest(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.user.workspaceId;
    // Get workspace products to understand niche
    const myProducts = await this.prisma.product.findMany({
      where: { workspaceId },
      select: { category: true, name: true },
      take: 5,
    });
    const categories = [...new Set(myProducts.map((product) => product.category).filter(Boolean))];

    const where = await this.buildMarketplaceWhere({
      listed: true,
      ...(categories.length > 0 ? { category: { in: categories } } : {}),
    });

    const products = await this.prisma.affiliateProduct.findMany({
      where,
      take: 10,
      orderBy: { temperature: 'desc' },
    });
    const enrichedProducts = await this.enrichAffiliateProducts(req, products, workspaceId);
    return {
      products: enrichedProducts,
    };
  }

  /** Save product. */
  @Post('saved/:productId')
  async saveProduct(@Req() req: AuthenticatedRequest, @Param('productId') productId: string) {
    const workspaceId = req.user.workspaceId;
    // Idempotency: check existingRecord before creating
    const existingRecord = await this.prisma.affiliateRequest.findFirst({
      where: {
        affiliateWorkspaceId: workspaceId,
        affiliateProductId: productId,
      },
    });
    if (existingRecord) {
      return { success: true, saved: true };
    }

    await this.prisma.affiliateRequest.create({
      data: {
        affiliateWorkspaceId: workspaceId,
        affiliateProductId: productId,
        status: 'SAVED',
      },
    });
    return { success: true, saved: true };
  }

  /** Unsave product. */
  @Delete('saved/:productId')
  async unsaveProduct(@Req() req: AuthenticatedRequest, @Param('productId') productId: string) {
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
