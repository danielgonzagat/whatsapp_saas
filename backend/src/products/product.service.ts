import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { Product } from '@prisma/client';
import { MindEventSpine } from '../kloel/mind/coordination';
import {
  assertWorkspaceId,
  buildCommercialPayload,
  buildListWhere,
  resolvePagination,
} from './product.helpers';
import type {
  CreateProductDto,
  UpdateProductDto,
  ProductListFilters,
  ProductResult,
  ProductListResult,
} from './product.types';

// Re-export DTOs / result shapes to preserve the historical import surface.
export type {
  CreateProductDto,
  UpdateProductDto,
  ProductListFilters,
  ProductResult,
  ProductListResult,
};

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly audit: AuditService,
    @Optional() private readonly brainSpine?: MindEventSpine,
  ) {}

  /**
   * Create a new product under the given workspace.
   * Emits `mind.product.observed` and writes an audit entry.
   */
  async create(
    workspaceId: string,
    dto: CreateProductDto,
    actor?: { id: string; email?: string },
  ): Promise<ProductResult> {
    const resolvedActor = actor ?? { id: 'kloel-resolver' };
    assertWorkspaceId(workspaceId);

    const product = await this.prisma.product.create({
      data: {
        ...dto,
        workspaceId,
        format: dto.format || 'PHYSICAL',
        status: 'DRAFT',
        active: false,
      },
    });

    await this.eventEmitter.emit('mind.product.observed', {
      productId: product.id,
      workspaceId,
      agentId: resolvedActor.id,
      name: product.name,
      price: product.price,
      format: product.format,
    });

    await this.audit.log({
      workspaceId,
      agentId: resolvedActor.id,
      action: 'product.create',
      resource: 'Product',
      resourceId: product.id,
      details: { name: product.name, price: product.price },
    });

    // Feed the cognitive spine: product creation → belief/prediction cycle
    await this.brainSpine?.recordCommercial({
      workspaceId,
      subject: `product:${product.id}`,
      eventType: 'mind.product.observed',
      occurredAt: new Date(),
      payload: buildCommercialPayload(product),
    });

    this.logger.log(`Product created: ${product.id} by ${resolvedActor.id}`);
    return { success: true, product };
  }

  /**
   * Update an existing product. Only the owning workspace can update.
   */
  async update(
    workspaceId: string,
    productIdOrArgs: string | Record<string, unknown>,
    dtoOrActor?: UpdateProductDto | { id: string; email?: string },
    actorOpt?: { id: string; email?: string },
  ): Promise<ProductResult> {
    // Resolve calling convention:
    //  - Old (direct): update(ws, productId, dto, actor)
    //  - New (resolver): update(ws, { productId, ...dtoFields })
    let productId: string;
    let dto: UpdateProductDto;
    let actor: { id: string; email?: string };

    if (typeof productIdOrArgs === 'object') {
      // Resolver path: extract productId from args, remaining fields = dto
      const args = productIdOrArgs as Record<string, unknown>;
      productId = String(args.productId ?? '');
      const { productId: _, ...rest } = args;
      dto = rest as UpdateProductDto;
      actor = { id: 'kloel-resolver' };
    } else {
      // Direct path: traditional 4-arg call
      productId = productIdOrArgs;
      dto = (dtoOrActor as UpdateProductDto) ?? {};
      actor = (actorOpt as { id: string; email?: string }) ?? { id: 'kloel-resolver' };
    }

    assertWorkspaceId(workspaceId);
    await this.assertOwnedProduct(workspaceId, productId);

    const product = await this.prisma.product.update({
      where: { id: productId, workspaceId },
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

    await this.brainSpine?.recordCommercial({
      workspaceId,
      subject: `product:${product.id}`,
      eventType: 'product.updated',
      occurredAt: new Date(),
      payload: buildCommercialPayload(product, { changes: Object.keys(dto) }),
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
   * Get a product by ID (resolver-compatible 2-arg thin wrapper).
   * Extracts `productId` from args, workspace-scoped lookup, throws on missing.
   */
  async get(
    workspaceId: string,
    args: { productId: string },
  ): Promise<ProductResult> {
    assertWorkspaceId(workspaceId);
    const product = await this.findById(workspaceId, args.productId);
    if (!product) {
      throw new NotFoundException(`Product ${args.productId} not found`);
    }
    return { success: true, product };
  }

  /**
   * List products for a workspace with optional filters.
   */
  async list(workspaceId: string, filters: ProductListFilters = {}): Promise<ProductListResult> {
    const where = buildListWhere(workspaceId, filters);
    const { page, limit, skip } = resolvePagination(filters);

    const [products, count] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where: { ...where, workspaceId } }),
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
    assertWorkspaceId(workspaceId);
    await this.assertOwnedProduct(workspaceId, productId);

    const product = await this.prisma.product.update({
      where: { id: productId, workspaceId },
      data: { imageUrl },
    });

    this.eventEmitter.emit('product.updated', {
      productId: product.id,
      workspaceId,
      agentId: actor.id,
      changes: ['imageUrl'],
    });

    await this.audit.log({
      workspaceId,
      agentId: actor.id,
      action: 'product.setImage',
      resource: 'Product',
      resourceId: productId,
      details: { imageUrl },
    });

    await this.brainSpine?.recordCommercial({
      workspaceId,
      subject: `product:${product.id}`,
      eventType: 'product.updated',
      occurredAt: new Date(),
      payload: buildCommercialPayload(product, { imageUrl, changes: ['imageUrl'] }),
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
    assertWorkspaceId(workspaceId);
    await this.assertOwnedProduct(workspaceId, productId);

    const product = await this.prisma.product.update({
      where: { id: productId, workspaceId },
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

    await this.brainSpine?.recordCommercial({
      workspaceId,
      subject: `product:${product.id}`,
      eventType: 'product.published',
      occurredAt: new Date(),
      payload: buildCommercialPayload(product),
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
    assertWorkspaceId(workspaceId);
    await this.assertOwnedProduct(workspaceId, productId);

    const product = await this.prisma.product.update({
      where: { id: productId, workspaceId },
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

    await this.brainSpine?.recordCommercial({
      workspaceId,
      subject: `product:${product.id}`,
      eventType: 'product.updated',
      occurredAt: new Date(),
      payload: buildCommercialPayload(product, { changes: ['active'] }),
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
    assertWorkspaceId(workspaceId);
    await this.assertOwnedProduct(workspaceId, productId);

    const product = await this.prisma.product.update({
      where: { id: productId, workspaceId },
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

    await this.brainSpine?.recordCommercial({
      workspaceId,
      subject: `product:${product.id}`,
      eventType: 'product.deleted',
      occurredAt: new Date(),
      payload: buildCommercialPayload(product),
    });

    return { success: true, message: 'Product deleted' };
  }

  /**
   * Ensure the product exists and belongs to the workspace.
   * Throws NotFound / Forbidden — callers don't need to repeat the pattern.
   */
  private async assertOwnedProduct(
    workspaceId: string,
    productId: string,
  ): Promise<Product> {
    const existing = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!existing) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    if (existing.workspaceId !== workspaceId) {
      throw new ForbiddenException('Cross-workspace access denied');
    }

    return existing;
  }
}
