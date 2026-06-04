import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import { AuthenticatedRequest } from '../common/interfaces';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildProductMetrics } from './product-metrics.helpers';
import { syncProductToMemory, deleteProductFromMemory } from './product-memory-sync.helpers';
import { MindMemoryItemService } from './mind/aliases/mind-memory-item.service';
import { ProductService } from '../products/product.service';
import {
  PRODUCT_LIST_TAKE_CAP,
  buildCreateProductData,
  buildProductListWhere,
  buildUpdateProductData,
  calculateProductStats,
  countProductImportResults,
  extractCategoriesFromProducts,
  validateUpdateProductDto,
} from './product.controller.helpers';
import { OpsAlertService } from '../observability/ops-alert.service';
import { RouteClass } from '../common/throttler/route-class.decorator';

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
@RouteClass('mutate')
export class ProductController {
  private readonly logger = StructuredLogger.from(ProductController.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly mindMemory?: MindMemoryItemService,
    @Optional() private readonly productService?: ProductService,
  ) {}

  /** Canonical Brain → Mind memory delegate (raw-Prisma fallback). */
  private get mindMemoryItems(): PrismaService['kloelMemory'] {
    return this.mindMemory?.items ?? this.prisma.kloelMemory;
  }

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

    const listInput = {
      workspaceId,
      ...(category !== undefined ? { category } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(search !== undefined ? { search } : {}),
    };
    const where = buildProductListWhere(listInput);

    // I17 — bounded read: cap at PRODUCT_LIST_TAKE_CAP products per workspace
    // for the list endpoint. Real workspaces have tens of products; 500 is
    // generous headroom. Larger catalogues would need cursor pagination.
    const rawProducts = await this.prisma.product.findMany({
      where: { workspaceId, ...where },
      orderBy: { createdAt: 'desc' },
      take: PRODUCT_LIST_TAKE_CAP,
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
      take: PRODUCT_LIST_TAKE_CAP,
    });
    const metricsByProductId = await buildProductMetrics(
      this.prisma,
      workspaceId,
      products.map((product) => product.id),
    );

    return calculateProductStats(products, metricsByProductId);
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

    const createData = buildCreateProductData(workspaceId, dto);

    // Canonical path: delegate persistence to ProductService so the human REST
    // create fires `commerce.product.*` events + writes the audit entry +
    // records to the Brain/Mind cognitive spine. The controller still owns the
    // rich field mapping (buildCreateProductData) and post-write memory sync /
    // serialization, preserving the existing API contract.
    const actor = { id: req.user.sub, email: req.user.email };
    const created = this.productService
      ? (
          await this.productService.create(
            workspaceId,
            createData as unknown as Parameters<ProductService['create']>[1],
            actor,
          )
        ).product
      : await this.prisma.product.create({
          data: createData as Prisma.ProductUncheckedCreateInput,
        });

    if (!created) {
      throw new NotFoundException('Product not found after create');
    }

    this.logger.log(`Product created: ${created.id} - ${created.name}`);

    await syncProductToMemory(this.prisma, workspaceId, created, this.mindMemoryItems);

    return {
      product: this.serializeProductForResponse(req, created),
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

    validateUpdateProductDto(dto);

    const updateData = buildUpdateProductData(dto);

    // Canonical path: delegate the write to ProductService so a human REST
    // update fires `commerce.product.updated` + audit entry + Brain/Mind spine
    // recording. The controller still owns DTO validation (buildUpdateProductData)
    // and the post-write memory sync / serialization, preserving the contract.
    const actor = { id: req.user.sub, email: req.user.email };
    let product;
    if (this.productService) {
      product = (await this.productService.update(workspaceId, id, updateData, actor)).product;
    } else {
      await this.prisma.product.updateMany({
        where: { id, workspaceId },
        data: updateData,
      });
      product =
        (await this.prisma.product.findFirst({
          where: { id, workspaceId },
        })) ?? undefined;
    }
    if (!product) {
      throw new NotFoundException('Product not found after update');
    }

    await syncProductToMemory(this.prisma, workspaceId, product, this.mindMemoryItems);

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

    // Canonical path: delegate to ProductService first so a human REST delete
    // fires `commerce.product.deleted` + audit entry + Brain/Mind spine
    // recording. ProductService performs a soft delete (status=DELETED); the
    // controller then issues its hard delete to preserve the existing
    // list-visibility + response contract.
    if (this.productService) {
      await this.productService.delete(workspaceId, id, { id: req.user.sub });
    }

    await this.prisma.product.deleteMany({ where: { id, workspaceId } });

    await deleteProductFromMemory(this.prisma, workspaceId, existing, this.mindMemoryItems);

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

    return { categories: extractCategoriesFromProducts(products) };
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

    const summary = countProductImportResults(results);

    return {
      imported: summary.imported,
      failed: summary.failed,
      results,
    };
  }
}
