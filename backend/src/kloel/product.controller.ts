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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { PrismaService } from '../prisma/prisma.service';

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

    const products = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return { products, count: products.length };
  }

  /**
   * Get product stats for the workspace
   */
  @Get('stats')
  async getProductStats(@Request() req: any) {
    const workspaceId = req.user.workspaceId;

    const totalProducts = await this.prisma.product.count({
      where: { workspaceId },
    });

    const activeProducts = await this.prisma.product.count({
      where: { workspaceId, active: true },
    });

    return {
      totalProducts,
      activeProducts,
      totalSales: 0,
      totalRevenue: 0,
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

    if (!product) {
      return { error: 'Product not found', product: null };
    }

    return { product };
  }

  /**
   * Create a new product
   */
  @Post()
  async createProduct(@Request() req: any, @Body() dto: CreateProductDto) {
    const workspaceId = req.user.workspaceId;

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

    return { product, success: true };
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

    // Verify product belongs to workspace
    const existing = await this.prisma.product.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      return { error: 'Product not found', success: false };
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

    return { product, success: true };
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

    if (!existing) {
      return { error: 'Product not found', success: false };
    }

    await this.prisma.product.delete({ where: { id } });

    return { success: true, deleted: id };
  }

  /**
   * Get product categories for the workspace
   */
  @Get('categories/list')
  async getCategories(@Request() req: any) {
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
    @Request() req: any,
    @Body() dto: { products: CreateProductDto[] },
  ) {
    const workspaceId = req.user.workspaceId;

    const results = await Promise.all(
      dto.products.map(async (product) => {
        try {
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
