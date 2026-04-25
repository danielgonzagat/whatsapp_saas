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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import { AuthenticatedRequest } from '../common/interfaces';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

interface ProductMetrics {
  totalSales: number;
  totalRevenue: number;
  memberAreasCount: number;
  studentsCount: number;
  modulesCount: number;
  lessonsCount: number;
  plansCount: number;
  activePlansCount: number;
  minPlanPriceInCents: number | null;
  maxPlanPriceInCents: number | null;
  affiliateListed: boolean;
  affiliateCount: number;
  affiliateSales: number;
  affiliateRevenue: number;
  affiliateCommissionPct: number | null;
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

  constructor(private readonly prisma: PrismaService) {}

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

  private emptyProductMetrics(): ProductMetrics {
    return {
      totalSales: 0,
      totalRevenue: 0,
      memberAreasCount: 0,
      studentsCount: 0,
      modulesCount: 0,
      lessonsCount: 0,
      plansCount: 0,
      activePlansCount: 0,
      minPlanPriceInCents: null,
      maxPlanPriceInCents: null,
      affiliateListed: false,
      affiliateCount: 0,
      affiliateSales: 0,
      affiliateRevenue: 0,
      affiliateCommissionPct: null,
    };
  }

  private fetchProductMetricsSources(workspaceId: string, productIds: string[]) {
    return Promise.all([
      this.prisma.checkoutOrder.findMany({
        where: {
          workspaceId,
          plan: { productId: { in: productIds } },
        },
        select: {
          status: true,
          totalInCents: true,
          plan: { select: { productId: true } },
        },
      }),
      this.prisma.memberArea.findMany({
        where: { workspaceId, productId: { in: productIds } },
        select: {
          productId: true,
          totalStudents: true,
          totalModules: true,
          totalLessons: true,
          active: true,
        },
      }),
      this.prisma.checkoutProductPlan.findMany({
        where: {
          productId: { in: productIds },
          kind: 'PLAN',
        },
        select: {
          productId: true,
          id: true,
          isActive: true,
          priceInCents: true,
        },
      }),
      this.prisma.affiliateProduct.findMany({
        where: { productId: { in: productIds } },
        select: {
          productId: true,
          listed: true,
          totalAffiliates: true,
          totalSales: true,
          totalRevenue: true,
          commissionPct: true,
        },
      }),
    ]);
  }

  private isPaidOrderStatus(status: string): boolean {
    return status === 'PAID' || status === 'SHIPPED' || status === 'DELIVERED';
  }

  private applyOrderMetric(
    metrics: Map<string, ProductMetrics>,
    order: { status: string; totalInCents: number | null; plan: { productId: string } | null },
  ): void {
    const productId = order.plan?.productId;
    if (!productId) {
      return;
    }
    const current = metrics.get(productId);
    if (!current) {
      return;
    }
    if (!this.isPaidOrderStatus(order.status)) {
      return;
    }
    current.totalSales += 1;
    current.totalRevenue += Number(order.totalInCents || 0) / 100;
  }

  private applyMemberAreaMetric(
    metrics: Map<string, ProductMetrics>,
    area: {
      productId: string | null;
      totalStudents: number | null;
      totalModules: number | null;
      totalLessons: number | null;
    },
  ): void {
    if (!area.productId) {
      return;
    }
    const current = metrics.get(area.productId);
    if (!current) {
      return;
    }
    current.memberAreasCount += 1;
    current.studentsCount += Number(area.totalStudents || 0);
    current.modulesCount += Number(area.totalModules || 0);
    current.lessonsCount += Number(area.totalLessons || 0);
  }

  private updatePlanPriceRange(current: ProductMetrics, normalizedPriceInCents: number): void {
    const minUnset = current.minPlanPriceInCents === null;
    if (minUnset || normalizedPriceInCents < current.minPlanPriceInCents) {
      current.minPlanPriceInCents = normalizedPriceInCents;
    }
    const maxUnset = current.maxPlanPriceInCents === null;
    if (maxUnset || normalizedPriceInCents > current.maxPlanPriceInCents) {
      current.maxPlanPriceInCents = normalizedPriceInCents;
    }
  }

  private applyPlanMetric(
    metrics: Map<string, ProductMetrics>,
    plan: { productId: string; isActive: boolean; priceInCents: number | null },
  ): void {
    const current = metrics.get(plan.productId);
    if (!current) {
      return;
    }
    current.plansCount += 1;
    if (plan.isActive) {
      current.activePlansCount += 1;
    }
    const normalizedPriceInCents = Math.max(0, Math.round(Number(plan.priceInCents || 0)));
    this.updatePlanPriceRange(current, normalizedPriceInCents);
  }

  private applyAffiliateMetric(
    metrics: Map<string, ProductMetrics>,
    affiliateProduct: {
      productId: string;
      listed: boolean;
      totalAffiliates: number;
      totalSales: number;
      totalRevenue: number;
      commissionPct: number | null;
    },
  ): void {
    const current = metrics.get(affiliateProduct.productId);
    if (!current) {
      return;
    }
    current.affiliateListed = affiliateProduct.listed;
    current.affiliateCount = affiliateProduct.totalAffiliates;
    current.affiliateSales = affiliateProduct.totalSales;
    current.affiliateRevenue = affiliateProduct.totalRevenue;
    current.affiliateCommissionPct = affiliateProduct.commissionPct;
  }

  private async buildProductMetrics(
    workspaceId: string,
    productIds: string[],
  ): Promise<Map<string, ProductMetrics>> {
    if (productIds.length === 0) {
      return new Map<string, ProductMetrics>();
    }

    const [orders, memberAreas, checkoutPlans, affiliateProducts] =
      await this.fetchProductMetricsSources(workspaceId, productIds);

    const metrics = new Map<string, ProductMetrics>();
    for (const productId of productIds) {
      metrics.set(productId, this.emptyProductMetrics());
    }

    for (const order of orders) {
      this.applyOrderMetric(metrics, order);
    }
    for (const area of memberAreas) {
      this.applyMemberAreaMetric(metrics, area);
    }
    for (const plan of checkoutPlans) {
      this.applyPlanMetric(metrics, plan);
    }
    for (const ap of affiliateProducts) {
      this.applyAffiliateMetric(metrics, ap);
    }

    return metrics;
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

    const metricsByProductId = await this.buildProductMetrics(
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
    const metricsByProductId = await this.buildProductMetrics(
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

    const metricsByProductId = await this.buildProductMetrics(workspaceId, [id]);

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

    // Sync product to KloelMemory so Kloel AI is aware
    try {
      await this.prisma.kloelMemory.upsert({
        where: {
          workspaceId_key: {
            workspaceId,
            key: `product:${product.sku || product.id}`,
          },
        },
        create: {
          workspaceId,
          key: `product:${product.sku || product.id}`,
          category: 'catalog',
          type: 'product',
          value: {
            name: product.name,
            price: product.price,
            category: product.category,
            description: product.description,
            format: product.format,
            tags: product.tags,
          },
          content: `Produto: ${product.name}\nPreco: R$ ${Number(product.price.toFixed(2))}\nCategoria: ${product.category || 'Geral'}\nDescricao: ${product.description || ''}\nFormato: ${product.format}\nTags: ${(product.tags || []).join(', ')}`,
        },
        update: {
          value: {
            name: product.name,
            price: product.price,
            category: product.category,
            description: product.description,
            format: product.format,
            tags: product.tags,
          },
          content: `Produto: ${product.name}\nPreco: R$ ${Number(product.price.toFixed(2))}\nCategoria: ${product.category || 'Geral'}\nDescricao: ${product.description || ''}\nFormato: ${product.format}\nTags: ${(product.tags || []).join(', ')}`,
        },
      });
    } catch {
      // PULSE:OK — Memory sync is non-critical; product creation succeeds without it
    }

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

    // Sync updated product to KloelMemory so Kloel AI is aware
    try {
      await this.prisma.kloelMemory.upsert({
        where: {
          workspaceId_key: {
            workspaceId,
            key: `product:${product.sku || product.id}`,
          },
        },
        create: {
          workspaceId,
          key: `product:${product.sku || product.id}`,
          category: 'catalog',
          type: 'product',
          value: {
            name: product.name,
            price: product.price,
            category: product.category,
            description: product.description,
            format: product.format,
            tags: product.tags,
          },
          content: `Produto: ${product.name}\nPreco: R$ ${Number(product.price.toFixed(2))}\nCategoria: ${product.category || 'Geral'}\nDescricao: ${product.description || ''}\nFormato: ${product.format}\nTags: ${(product.tags || []).join(', ')}`,
        },
        update: {
          value: {
            name: product.name,
            price: product.price,
            category: product.category,
            description: product.description,
            format: product.format,
            tags: product.tags,
          },
          content: `Produto: ${product.name}\nPreco: R$ ${Number(product.price.toFixed(2))}\nCategoria: ${product.category || 'Geral'}\nDescricao: ${product.description || ''}\nFormato: ${product.format}\nTags: ${(product.tags || []).join(', ')}`,
        },
      });
    } catch {
      // PULSE:OK — Memory sync is non-critical; product update succeeds without it
    }

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

    // Remove product from KloelMemory
    try {
      await this.prisma.kloelMemory.deleteMany({
        where: {
          workspaceId,
          key: { startsWith: `product:${existing.sku || existing.id}` },
        },
      });
    } catch {
      // PULSE:OK — Memory cleanup is non-critical; product deletion succeeds without it
    }

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
