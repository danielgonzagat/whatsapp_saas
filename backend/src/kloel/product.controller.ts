import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
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
import {
  filterLegacyProducts,
  isLegacyProductName,
} from '../common/products/legacy-products.util';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';

interface CreateProductDto {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  category?: string;
  imageUrl?: string;
  paymentLink?: string;
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
  metadata?: Record<string, any>;
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
 * 🛍️ PRODUCT CATALOG CONTROLLER
 *
 * Manages products for each workspace.
 * All endpoints require authentication.
 */
@Controller('products')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductController {
  private readonly logger = new Logger(ProductController.name);

  constructor(private readonly prisma: PrismaService) {}

  private serializeProductForResponse(req: any, product: any) {
    if (!product) return product;

    return {
      ...product,
      imageUrl: normalizeStorageUrlForRequest(product.imageUrl, req) || null,
    };
  }

  private async buildProductMetrics(
    workspaceId: string,
    productIds: string[],
  ) {
    if (productIds.length === 0) {
      return new Map<string, any>();
    }

    const paidStatuses = new Set(['PAID', 'SHIPPED', 'DELIVERED']);

    const [orders, memberAreas, checkoutPlans, affiliateProducts] =
      await Promise.all([
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
          where: { productId: { in: productIds } },
          select: {
            productId: true,
            id: true,
            isActive: true,
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

    const metrics = new Map<string, any>();

    for (const productId of productIds) {
      metrics.set(productId, {
        totalSales: 0,
        totalRevenue: 0,
        memberAreasCount: 0,
        studentsCount: 0,
        modulesCount: 0,
        lessonsCount: 0,
        plansCount: 0,
        activePlansCount: 0,
        affiliateListed: false,
        affiliateCount: 0,
        affiliateSales: 0,
        affiliateRevenue: 0,
        affiliateCommissionPct: null,
      });
    }

    for (const order of orders) {
      const productId = order.plan?.productId;
      if (!productId || !metrics.has(productId) || !paidStatuses.has(order.status)) {
        continue;
      }

      const current = metrics.get(productId);
      current.totalSales += 1;
      current.totalRevenue += Number(order.totalInCents || 0) / 100;
    }

    for (const area of memberAreas) {
      if (!area.productId || !metrics.has(area.productId)) continue;

      const current = metrics.get(area.productId);
      current.memberAreasCount += 1;
      current.studentsCount += Number(area.totalStudents || 0);
      current.modulesCount += Number(area.totalModules || 0);
      current.lessonsCount += Number(area.totalLessons || 0);
    }

    for (const plan of checkoutPlans) {
      if (!metrics.has(plan.productId)) continue;

      const current = metrics.get(plan.productId);
      current.plansCount += 1;
      if (plan.isActive) current.activePlansCount += 1;
    }

    for (const affiliateProduct of affiliateProducts) {
      if (!metrics.has(affiliateProduct.productId)) continue;

      const current = metrics.get(affiliateProduct.productId);
      current.affiliateListed = affiliateProduct.listed;
      current.affiliateCount = affiliateProduct.totalAffiliates;
      current.affiliateSales = affiliateProduct.totalSales;
      current.affiliateRevenue = affiliateProduct.totalRevenue;
      current.affiliateCommissionPct = affiliateProduct.commissionPct;
    }

    return metrics;
  }

  /**
   * List all products for the authenticated user's workspace
   */
  @Get()
  async listProducts(
    @Request() req: any,
    @Query('category') category?: string,
    @Query('active') active?: string,
    @Query('search') search?: string,
  ) {
    const workspaceId = req.user.workspaceId;

    const where: any = { workspaceId };

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

    const rawProducts = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const filteredProducts = filterLegacyProducts(rawProducts);
    const metricsByProductId = await this.buildProductMetrics(
      workspaceId,
      filteredProducts.map((product) => product.id),
    );

    const products = filteredProducts.map((product) =>
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
  async getProductStats(@Request() req: any) {
    const workspaceId = req.user.workspaceId;

    const products = filterLegacyProducts(
      await this.prisma.product.findMany({
        where: { workspaceId },
        select: { id: true, active: true, name: true },
      }),
    );
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
      (sum, product) =>
        sum + Number(metricsByProductId.get(product.id)?.totalRevenue || 0),
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
  async getProduct(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user.workspaceId;

    const product = await this.prisma.product.findFirst({
      where: { id, workspaceId },
    });

    if (!product || isLegacyProductName(product.name)) {
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
  @Post()
  @UseGuards(KycApprovedGuard)
  @KycRequired()
  async createProduct(@Request() req: any, @Body() dto: CreateProductDto) {
    const workspaceId = req.user.workspaceId;

    if (isLegacyProductName(dto.name)) {
      throw new BadRequestException('Legacy default products are disabled');
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
        paymentLink: dto.paymentLink,
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
        metadata: dto.metadata || {},
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
    } catch (e) {
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
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const workspaceId = req.user.workspaceId;

    if (dto.name !== undefined && isLegacyProductName(dto.name)) {
      throw new BadRequestException('Legacy default products are disabled');
    }

    // Verify product belongs to workspace
    const existing = await this.prisma.product.findFirst({
      where: { id, workspaceId },
    });

    if (!existing || isLegacyProductName(existing.name)) {
      throw new NotFoundException('Product not found');
    }

    const { active, featured, ...rest } = dto;
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...(active !== undefined && { active }),
        ...(featured !== undefined && { featured }),
        ...(rest.price !== undefined && { price: rest.price || 0 }),
      },
    });

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
    } catch (e) {
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
  async deleteProduct(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user.workspaceId;

    // Verify product belongs to workspace
    const existing = await this.prisma.product.findFirst({
      where: { id, workspaceId },
    });

    if (!existing || isLegacyProductName(existing.name)) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.product.delete({ where: { id } });

    // Remove product from KloelMemory
    try {
      await this.prisma.kloelMemory.deleteMany({
        where: {
          workspaceId,
          key: { startsWith: `product:${existing.sku || existing.id}` },
        },
      });
    } catch (e) {
      // PULSE:OK — Memory cleanup is non-critical; product deletion succeeds without it
    }

    return { success: true, deleted: id };
  }

  /**
   * Get product categories for the workspace
   */
  @Get('categories/list')
  async getCategories(@Request() req: any) {
    const workspaceId = req.user.workspaceId;

    const products = (
      await this.prisma.product.findMany({
        where: { workspaceId },
        select: { category: true, name: true },
        distinct: ['category'],
      })
    ).filter((product) => !isLegacyProductName(product.name));

    const categories = products.map((p) => p.category).filter(Boolean);

    return { categories };
  }

  /**
   * Bulk import products
   */
  @Post('import')
  async importProducts(
    @Request() req: any,
    @Body() dto: { products: CreateProductDto[] },
  ) {
    const workspaceId = req.user.workspaceId;

    const results = await Promise.all(
      dto.products.map(async (product) => {
        try {
          if (isLegacyProductName(product.name)) {
            return {
              success: false,
              error: 'Legacy default products are disabled',
              product,
            };
          }

          // PULSE:OK — import needs per-product error tracking; createMany doesn't return individual results
          const created = await this.prisma.product.create({
            data: { workspaceId, ...product, price: product.price || 0 },
          });
          return { success: true, product: created };
        } catch (error) {
          return { success: false, error: error.message, product };
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
