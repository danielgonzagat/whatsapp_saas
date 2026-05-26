import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { Product, Prisma } from '@prisma/client';

export interface CreateProductDto {
  name: string;
  description?: string;
  price: number;
  category?: string;
  sku?: string;
  tags?: string[];
  format?: 'PHYSICAL' | 'DIGITAL' | 'HYBRID';
  imageUrl?: string;
  salesPageUrl?: string;
  thankyouUrl?: string;
  thankyouBoletoUrl?: string;
  thankyouPixUrl?: string;
  reclameAquiUrl?: string;
  supportEmail?: string;
  warrantyDays?: number;
  shippingType?: string;
  shippingValue?: number;
  originCep?: string;
  affiliateEnabled?: boolean;
  affiliateVisible?: boolean;
  affiliateAutoApprove?: boolean;
  affiliateAccessData?: boolean;
  affiliateAccessAbandoned?: boolean;
  affiliateFirstInstallment?: boolean;
  commissionType?: string;
  commissionPercent?: number;
  commissionCookieDays?: number;
  stockQuantity?: number;
  trackStock?: boolean;
}

export interface UpdateProductDto extends Partial<CreateProductDto> {
  active?: boolean;
  status?: string;
}

export interface ProductListFilters {
  search?: string;
  category?: string;
  active?: boolean;
  status?: string;
  format?: string;
  page?: number;
  limit?: number;
}

export interface ProductResult {
  success: boolean;
  product?: Product;
  message?: string;
}

export interface ProductListResult {
  success: boolean;
  products: Product[];
  count: number;
  page: number;
  limit: number;
}

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a new product under the given workspace.
   * Emits `product.created` and writes an audit entry.
   */
  async create(
    workspaceId: string,
    dto: CreateProductDto,
    actor: { id: string; email?: string },
  ): Promise<ProductResult> {
    this.assertWorkspace(workspaceId);

    const product = await this.prisma.product.create({
      data: {
        ...dto,
        workspaceId,
        format: dto.format || 'PHYSICAL',
        status: 'DRAFT',
        active: false,
      },
    });

    await this.eventEmitter.emit('product.created', {
      productId: product.id,
      workspaceId,
      agentId: actor.id,
      name: product.name,
      price: product.price,
      format: product.format,
    });

    await this.audit.log({
      workspaceId,
      agentId: actor.id,
      action: 'product.create',
      resource: 'Product',
      resourceId: product.id,
      details: { name: product.name, price: product.price },
    });

    this.logger.log(`Product created: ${product.id} by ${actor.id}`);
    return { success: true, product };
  }

  /**
   * Update an existing product. Only the owning workspace can update.
   */
  async update(
    workspaceId: string,
    productId: string,
    dto: UpdateProductDto,
    actor: { id: string; email?: string },
  ): Promise<ProductResult> {
    this.assertWorkspace(workspaceId);

    const existing = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!existing) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    if (existing.workspaceId !== workspaceId) {
      throw new ForbiddenException('Cross-workspace access denied');
    }

    const product = await this.prisma.product.update({
      where: { id: productId },
      data: dto,
    });

    await this.eventEmitter.emit('product.updated', {
      productId: product.id,
      workspaceId,
      agentId: actor.id,
      changes: Object.keys(dto),
    });

    await this.audit.log({
      workspaceId,
      agentId: actor.id,
      action: 'product.update',
      resource: 'Product',
      resourceId: product.id,
      details: { changes: Object.keys(dto) },
    });

    return { success: true, product };
  }

  /**
   * Get a product by ID, workspace-scoped.
   */
  async findById(workspaceId: string, productId: string): Promise<Product | null> {
    return this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
  }

  /**
   * List products for a workspace with optional filters.
   */
  async list(
    workspaceId: string,
    filters: ProductListFilters = {},
  ): Promise<ProductListResult> {
    const { search, category, active, status, format, page = 1, limit = 20 } = filters;

    const where: Prisma.ProductWhereInput = { workspaceId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (category) where.category = category;
    if (active !== undefined) where.active = active;
    if (status) where.status = status;
    if (format) where.format = format;

    const [products, count] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { success: true, products, count, page, limit };
  }

  /**
   * Set the product image URL.
   */
  async setImage(
    workspaceId: string,
    productId: string,
    imageUrl: string,
    actor: { id: string },
  ): Promise<ProductResult> {
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { imageUrl },
    });

    await this.audit.log({
      workspaceId,
      agentId: actor.id,
      action: 'product.setImage',
      resource: 'Product',
      resourceId: productId,
      details: { imageUrl },
    });

    return { success: true, product };
  }

  /**
   * Publish a product (mark as APPROVED and active).
   */
  async publish(
    workspaceId: string,
    productId: string,
    actor: { id: string },
  ): Promise<ProductResult> {
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { status: 'APPROVED', active: true },
    });

    await this.eventEmitter.emit('product.published', {
      productId: product.id,
      workspaceId,
      agentId: actor.id,
    });

    await this.audit.log({
      workspaceId,
      agentId: actor.id,
      action: 'product.publish',
      resource: 'Product',
      resourceId: productId,
    });

    return { success: true, product };
  }

  /**
   * Toggle product availability for sale.
   */
  async toggleAvailability(
    workspaceId: string,
    productId: string,
    available: boolean,
    actor: { id: string },
  ): Promise<ProductResult> {
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { active: available },
    });

    await this.eventEmitter.emit(available ? 'product.activated' : 'product.deactivated', {
      productId: product.id,
      workspaceId,
      agentId: actor.id,
    });

    await this.audit.log({
      workspaceId,
      agentId: actor.id,
      action: available ? 'product.activate' : 'product.deactivate',
      resource: 'Product',
      resourceId: productId,
    });

    return { success: true, product };
  }

  /**
   * Delete a product (soft - set status to DELETED).
   */
  async delete(
    workspaceId: string,
    productId: string,
    actor: { id: string },
  ): Promise<ProductResult> {
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { status: 'DELETED', active: false },
    });

    await this.eventEmitter.emit('product.deleted', {
      productId: product.id,
      workspaceId,
      agentId: actor.id,
    });

    await this.audit.log({
      workspaceId,
      agentId: actor.id,
      action: 'product.delete',
      resource: 'Product',
      resourceId: productId,
    });

    return { success: true, message: 'Product deleted' };
  }

  private assertWorkspace(workspaceId: string): void {
    if (!workspaceId) {
      throw new ForbiddenException('Workspace ID is required');
    }
  }
}
