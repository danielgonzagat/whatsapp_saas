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
  Request,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import { AuthenticatedRequest } from '../common/interfaces';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildProductMetrics } from './product-metrics.helpers';
import { syncProductToMemory, deleteProductFromMemory } from './product-memory-sync.helpers';
import { OpsAlertService } from '../observability/ops-alert.service';

interface CreateProductDto {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  category?: string;
  imageUrl?: string;
  sku?: string;
  tags?: string[];
  format?: string;
  status?: string;
  salesPageUrl?: string;
  thankyouUrl?: string;
  thankyouBoletoUrl?: string;
  thankyouPixUrl?: string;
  reclameAquiUrl?: string;
  supportEmail?: string;
  warrantyDays?: number;
  isSample?: boolean;
  shippingType?: string;
  shippingValue?: number;
  originCep?: string;
  slug?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

interface UpdateProductDto extends Partial<CreateProductDto> {
  active?: boolean;
  featured?: boolean;
  affiliateEnabled?: boolean;
  affiliateVisible?: boolean;
  affiliateAutoApprove?: boolean;
  affiliateAccessData?: boolean;
  affiliateAccessAbandoned?: boolean;
  affiliateFirstInstallment?: boolean;
  commissionType?: string;
  commissionCookieDays?: number;
  commissionPercent?: number;
  commissionLastClickPercent?: number;
  commissionOtherClicksPercent?: number;
  merchandContent?: string;
  affiliateTerms?: string;
  afterPayDuplicateAddress?: boolean;
  afterPayAffiliateCharge?: boolean;
  afterPayChargeValue?: number;
  afterPayShippingProvider?: string;
}

/**
 * Product catalog controller.
 *
 * Manages products for each workspace.
 * All endpoints require authentication.
 */
@Controller('products')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private serializeProductForResponse(
    req: AuthenticatedRequest,
    product: Record<string, unknown> | null,
  ) {
    if (!product) {
      return product;
    }

    return {
      ...product,
      imageUrl:
        normalizeStorageUrlForRequest(product.imageUrl as string | null | undefined, req) || null,
    };
  }

  private validateUpdateProductDto(dto: UpdateProductDto): void {
    if (
      dto.commissionPercent !== undefined &&
      (dto.commissionPercent < 0 || dto.commissionPercent > 100)
    ) {
      throw new BadRequestException('commissionPercent precisa ficar entre 0 e 100');
    }

    if (
      dto.commissionCookieDays !== undefined &&
      (dto.commissionCookieDays < 1 || dto.commissionCookieDays > 3650)
    ) {
      throw new BadRequestException('commissionCookieDays precisa ficar entre 1 e 3650');
    }

    if (
      dto.afterPayChargeValue !== undefined &&
      dto.afterPayChargeValue !== null &&
      dto.afterPayChargeValue < 0
    ) {
      throw new BadRequestException('afterPayChargeValue não pode ser negativo');
    }

    if (
      dto.afterPayShippingProvider !== undefined &&
      dto.afterPayShippingProvider !== null &&
      dto.afterPayShippingProvider !== '' &&
      !['correios', 'jadlog', 'melhor_envio', 'outro'].includes(dto.afterPayShippingProvider)
    ) {
      throw new BadRequestException('afterPayShippingProvider é inválido');
    }
  }

  /**
   * List all products for the authenticated user's workspace
   */
  @Get()
  async listProducts(
    @Request() req: AuthenticatedRequest,
    @Query('category') category?: string,
    @Query('active') active?: string,
    @Query('search') search?: string,
  ) {
    const workspaceId = req.user.workspaceId;

    const where: Record<string, unknown> = { workspaceId };

    if (category) {
      where.category = category;
    }

    if (active !== undefined) {
      where.active = active === 'true';
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // I17 — bounded read: cap at 500 products per workspace for the list
    // endpoint. Real workspaces have tens of products; 500 is generous
    // headroom. Larger catalogues would need cursor pagination (follow-up).
    const rawProducts = await this.prisma.product.findMany({
      where: { workspaceId, ...where },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const metricsByProductId = await buildProductMetrics(
      this.prisma,
      workspaceId,
      rawProducts.map((product) => product.id),
    );

    const products = rawProducts.map((product) =>
      this.serializeProductForResponse(req, {
        ...product,
        ...(metricsByProductId.get(product.id) || {}),
      }),
    );

    return { products, count: products.length };
  }

  /**
   * Get product stats for the workspace
   */
  @Get('stats')
  async getProductStats(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user.workspaceId;

    // I17 — bounded read: same ceiling as listProducts for consistency.
    const products = await this.prisma.product.findMany({
      where: { workspaceId },
      select: { id: true, active: true, name: true },
      take: 500,
    });
    const metricsByProductId = await buildProductMetrics(
      this.prisma,
      workspaceId,
      products.map((product) => product.id),
    );

    const totalProducts = products.length;
    const activeProducts = products.filter((product) => product.active).length;
    const totalSales = products.reduce(
      (sum, product) => sum + Number(metricsByProductId.get(product.id)?.totalSales || 0),
      0,
    );
    const totalRevenue = products.reduce(
      (sum, product) => sum + Number(metricsByProductId.get(product.id)?.totalRevenue || 0),
      0,
    );

    return {
      totalProducts,
      activeProducts,
      totalSales,
      totalRevenue,
    };
  }

  /**
   * Get a single product by ID
   */
  @Get(':id')
  async getProduct(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user.workspaceId;

    const product = await this.prisma.product.findFirst({
      where: { id, workspaceId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const metricsByProductId = await buildProductMetrics(this.prisma, workspaceId, [id]);

    return {
      product: this.serializeProductForResponse(req, {
        ...product,
        ...(metricsByProductId.get(id) || {}),
      }),
    };
  }

  /**
   * Create a new product
   */
  // idempotent: retry-safe via unique constraint (idempotencyKey + workspace name check)
  @Post()
  async createProduct(@Request() req: AuthenticatedRequest, @Body() dto: CreateProductDto) {
    // Accepts optional idempotencyKey via DTO for safe client retry
    const workspaceId = req.user.workspaceId;

    // Idempotency: check for existingRecord with same name + workspace to prevent duplicates on retry
    if (dto.idempotencyKey) {
      const existingRecord = await this.prisma.product.findFirst({
        where: { workspaceId, name: dto.name },
      });
      if (existingRecord) {
        return { data: existingRecord };
      }
    }

    const product = await this.prisma.product.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description || null,
        price: dto.price || 0,
        currency: dto.currency || 'BRL',
        category: dto.category || null,
        imageUrl: dto.imageUrl || null,
        sku: dto.sku,
        tags: dto.tags || [],
        format: dto.format || 'DIGITAL',
        status: dto.status || 'DRAFT',
        active: dto.status === 'APPROVED',
        salesPageUrl: dto.salesPageUrl || null,
        thankyouUrl: dto.thankyouUrl || null,
        thankyouBoletoUrl: dto.thankyouBoletoUrl,
        thankyouPixUrl: dto.thankyouPixUrl,
        reclameAquiUrl: dto.reclameAquiUrl,
        supportEmail: dto.supportEmail || null,
        warrantyDays: dto.warrantyDays || null,
        isSample: dto.isSample || false,
        shippingType: dto.shippingType || null,
        shippingValue: dto.shippingValue || null,
        originCep: dto.originCep || null,
        slug: dto.slug,
        metadata: (dto.metadata || {}) as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Product created: ${product.id} - ${product.name}`);

    await syncProductToMemory(this.prisma, workspaceId, product);

    return {
      product: this.serializeProductForResponse(req, product),
      success: true,
    };
  }

  /**
   * Update an existing product
   */
  @Put(':id')
  async updateProduct(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const workspaceId = req.user.workspaceId;

    // Verify product belongs to workspace
    const existing = await this.prisma.product.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    this.validateUpdateProductDto(dto);

    const { active, featured, ...rest } = dto;
    const normalizedRest = {
      ...rest,
      ...(rest.afterPayAffiliateCharge === false ? { afterPayChargeValue: null } : {}),
    };
    await this.prisma.product.updateMany({
      where: { id, workspaceId },
      data: {
        ...normalizedRest,
        ...(active !== undefined && { active }),
        ...(featured !== undefined && { featured }),
        ...(normalizedRest.price !== undefined && {
          price: normalizedRest.price || 0,
        }),
        ...(normalizedRest.metadata !== undefined && {
          metadata: normalizedRest.metadata as Prisma.InputJsonValue,
        }),
      } as Prisma.ProductUncheckedUpdateInput,
    });
    const product = await this.prisma.product.findFirst({
      where: { id, workspaceId },
    });
    if (!product) {
      throw new NotFoundException('Product not found after update');
    }

    await syncProductToMemory(this.prisma, workspaceId, product);

    return {
      product: this.serializeProductForResponse(req, product),
      success: true,
    };
  }

  /**
   * Delete a product
   */
  @Delete(':id')
  async deleteProduct(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user.workspaceId;

    // Verify product belongs to workspace
    const existing = await this.prisma.product.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.product.deleteMany({ where: { id, workspaceId } });

    await deleteProductFromMemory(this.prisma, workspaceId, existing);

    return { success: true, deleted: id };
  }

  /**
   * Get product categories for the workspace
   */
  @Get('categories/list')
  async getCategories(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user.workspaceId;

    const products = await this.prisma.product.findMany({
      where: { workspaceId },
      select: { category: true },
      distinct: ['category'],
    });

    const categories = products.map((p) => p.category).filter(Boolean);

    return { categories };
  }

  /**
   * Bulk import products
   */
  @Post('import')
  async importProducts(
    @Request() req: AuthenticatedRequest,
    @Body() dto: { products: CreateProductDto[]; idempotencyKey?: string },
  ) {
    const workspaceId = req.user.workspaceId;

    const results = await Promise.all(
      dto.products.map(async (product) => {
        try {
          // PULSE:OK — import needs per-product error tracking; createMany doesn't return individual results
          const created = await this.prisma.product.create({
            data: {
              workspaceId,
              ...product,
              price: product.price || 0,
              metadata: (product.metadata || {}) as Prisma.InputJsonValue,
            },
          });
          return { success: true, product: created };
        } catch (error: unknown) {
          void this.opsAlert?.alertOnCriticalError(error, 'ProductController.create');
          const message = error instanceof Error ? error.message : 'unknown error';
          return { success: false, error: message, product };
        }
      }),
    );

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return {
      imported: successCount,
      failed: failCount,
      results,
    };
  }
}
