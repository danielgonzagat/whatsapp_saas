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
  Req,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { generateUniquePublicCheckoutCode } from '../checkout/checkout-code.util';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Idempotent } from '../common/idempotency.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { KycRequired } from '../kyc/kyc-approved.decorator';
import { KycApprovedGuard } from '../kyc/kyc-approved.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildAffiliateLinkUrl,
  enrichAffiliateProducts,
  serializeAffiliateProductForResponse,
} from './affiliate-helpers';

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
 * Manages affiliate requests, links, saved products, and producer-side
 * listing/configuration. Marketplace read endpoints live in
 * AffiliateMarketplaceController.
 */
@Controller('affiliate')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AffiliateController {
  private readonly logger = new Logger(AffiliateController.name);

  constructor(private readonly prisma: PrismaService) {}

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
    const enrichedProducts = await enrichAffiliateProducts(
      this.prisma,
      req,
      requests.map((request) => request.affiliateProduct).filter(Boolean),
      workspaceId,
    );
    const enrichedProductsById = new Map(enrichedProducts.map((product) => [product.id, product]));

    const items = requests.map((request) => ({
      ...request,
      affiliateProduct:
        enrichedProductsById.get(request.affiliateProduct?.id || '') ||
        serializeAffiliateProductForResponse(req, request.affiliateProduct),
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
    const enrichedProducts = await enrichAffiliateProducts(
      this.prisma,
      req,
      links.map((link) => link.affiliateProduct).filter(Boolean),
      workspaceId,
    );
    const enrichedProductsById = new Map(enrichedProducts.map((product) => [product.id, product]));

    const items = links.map((link) => ({
      ...link,
      url: buildAffiliateLinkUrl(req, link.code),
      affiliateProduct:
        enrichedProductsById.get(link.affiliateProduct?.id || '') ||
        serializeAffiliateProductForResponse(req, link.affiliateProduct),
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
  @Idempotent()
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
      affiliateProduct: serializeAffiliateProductForResponse(req, affiliateProduct),
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
      affiliateProduct: serializeAffiliateProductForResponse(req, updated),
      success: true,
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
