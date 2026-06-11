import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { Prisma, Product } from '@prisma/client';
import { MindEventSpine } from '../kloel/mind/coordination';
import {
  assertWorkspaceId,
  buildCommercialPayload,
  buildListWhere,
  normalizeProductCreateInput,
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
    private readonly audit: AuditService,
    @Optional() private readonly brainSpine?: MindEventSpine,
  ) {}

  /**
   * Create a new product under the given workspace.
   * Records `mind.product.observed` on the Mind spine and writes an audit entry.
   */
  async create(
    workspaceId: string,
    dto: CreateProductDto | Prisma.ProductUncheckedCreateInput,
    actor?: { id: string; email?: string },
  ): Promise<ProductResult> {
    const resolvedActor = actor ?? { id: 'kloel-resolver' };
    assertWorkspaceId(workspaceId);
    if (typeof dto.price !== 'number' || !Number.isFinite(dto.price) || dto.price < 0) {
      throw new BadRequestException('price is required and must be a non-negative number');
    }

    const product = await this.prisma.product.create({
      data: { ...normalizeProductCreateInput(dto), workspaceId },
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
      const args = productIdOrArgs;
      productId = typeof args.productId === 'string' ? args.productId : '';
      const { productId: _, ...rest } = args;
      dto = rest;
      actor = { id: 'kloel-resolver' };
    } else {
      // Direct path: traditional 4-arg call
      productId = productIdOrArgs;
      dto = (dtoOrActor as UpdateProductDto) ?? {};
      actor = actorOpt ?? { id: 'kloel-resolver' };
    }

    assertWorkspaceId(workspaceId);
    await this.assertOwnedProduct(workspaceId, productId);

    const product = await this.prisma.product.update({
      where: { id: productId, workspaceId },
      data: dto,
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
  async get(workspaceId: string, args: { productId: string }): Promise<ProductResult> {
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
        where: { workspaceId, ...where },
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
   * Set marketing pixels on a product (resolver-compatible 2-arg).
   *
   * Fine-grained capability `products.set_pixels`. Reuses {@link update}; the
   * pixel array is persisted under the typed `metadata.pixels` slot so we never
   * fork a parallel write path. `args.pixels` may be an array of pixel configs.
   */
  async setPixels(
    workspaceId: string,
    args: { productId?: string; pixels?: unknown },
  ): Promise<ProductResult> {
    const productId = typeof args.productId === 'string' ? args.productId : '';
    const current = await this.findById(workspaceId, productId);
    const baseMetadata =
      current && current.metadata && typeof current.metadata === 'object'
        ? (current.metadata as Record<string, unknown>)
        : {};
    const metadata = { ...baseMetadata, pixels: args.pixels ?? [] };
    return this.update(workspaceId, { productId, metadata });
  }

  /**
   * Set shipping configuration on a product (resolver-compatible 2-arg).
   *
   * Fine-grained capability `products.set_shipping`. Reuses {@link update};
   * writes the real Product shipping columns (shippingType / shippingValue /
   * originCep / warrantyDays).
   */
  async setShipping(
    workspaceId: string,
    args: {
      productId?: string;
      shippingType?: string;
      shippingValue?: number;
      originCep?: string;
      warrantyDays?: number;
    },
  ): Promise<ProductResult> {
    const { productId: _id, ...rest } = args;
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) {
        fields[k] = v;
      }
    }
    return this.update(workspaceId, {
      productId: typeof args.productId === 'string' ? args.productId : '',
      ...fields,
    });
  }

  /**
   * Set fulfillment configuration on a product (resolver-compatible 2-arg).
   *
   * Fine-grained capability `products.set_fulfillment`. Reuses {@link update};
   * writes the real `afterPayShippingProvider` column and persists the
   * remaining fulfillment options under typed `metadata.fulfillment`.
   */
  async setFulfillment(
    workspaceId: string,
    args: { productId?: string; provider?: string; [key: string]: unknown },
  ): Promise<ProductResult> {
    const productId = typeof args.productId === 'string' ? args.productId : '';
    const { productId: _id, provider, ...rest } = args;
    const current = await this.findById(workspaceId, productId);
    const baseMetadata =
      current && current.metadata && typeof current.metadata === 'object'
        ? (current.metadata as Record<string, unknown>)
        : {};
    const fulfillment = { ...rest };
    const dto: Record<string, unknown> = {
      productId,
      metadata: { ...baseMetadata, fulfillment },
    };
    if (typeof provider === 'string') {
      dto.afterPayShippingProvider = provider;
    }
    return this.update(workspaceId, dto);
  }

  /**
   * Set the sales-page URL of a product (resolver-compatible 2-arg).
   *
   * Fine-grained capability `products.set_sales_page`. Reuses {@link update};
   * writes the real `salesPageUrl` column.
   */
  async setSalesPage(
    workspaceId: string,
    args: { productId?: string; salesPageUrl?: string },
  ): Promise<ProductResult> {
    return this.update(workspaceId, {
      productId: typeof args.productId === 'string' ? args.productId : '',
      salesPageUrl: typeof args.salesPageUrl === 'string' ? args.salesPageUrl : undefined,
    });
  }

  /**
   * Update the post-purchase / display URLs of a product (resolver-compatible).
   *
   * Fine-grained capability `products.update_urls`. Reuses {@link update};
   * writes the real Product URL columns (thankyou / boleto / pix / reclameAqui /
   * supportEmail).
   */
  async updateUrls(
    workspaceId: string,
    args: {
      productId?: string;
      thankyouUrl?: string;
      thankyouBoletoUrl?: string;
      thankyouPixUrl?: string;
      reclameAquiUrl?: string;
      supportEmail?: string;
    },
  ): Promise<ProductResult> {
    const { productId: _id, ...rest } = args;
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) {
        fields[k] = v;
      }
    }
    return this.update(workspaceId, {
      productId: typeof args.productId === 'string' ? args.productId : '',
      ...fields,
    });
  }

  /**
   * Toggle product availability for sale (resolver-compatible 2-arg).
   *
   * Fine-grained capability `products.toggle_availability`. Thin wrapper over
   * {@link toggleAvailability} so the resolver can call it as `(ws, args)`.
   */
  async toggleAvailabilityFor(
    workspaceId: string,
    args: { productId?: string; available?: boolean },
  ): Promise<ProductResult> {
    const productId = typeof args.productId === 'string' ? args.productId : '';
    const available = args.available !== false;
    return this.toggleAvailability(workspaceId, productId, available, {
      id: 'kloel-resolver',
    });
  }

  /**
   * Review & publish a product (resolver-compatible 2-arg).
   *
   * Fine-grained capability `products.review_and_publish`. Thin wrapper over
   * {@link publish} so the resolver can call it as `(ws, args)`; marks the
   * product APPROVED + active in one sensitive, confirmed step.
   */
  async reviewAndPublish(
    workspaceId: string,
    args: { productId?: string },
  ): Promise<ProductResult> {
    const productId = typeof args.productId === 'string' ? args.productId : '';
    return this.publish(workspaceId, productId, { id: 'kloel-resolver' });
  }

  /**
   * Ensure the product exists and belongs to the workspace.
   * Throws NotFound / Forbidden — callers don't need to repeat the pattern.
   *
   * The data-returning read is workspace-scoped (`findFirst({ id, workspaceId })`).
   * Only the existence-disambiguation probe is intentionally cross-workspace:
   * it selects `{ id: true }` ONLY (no PII, no business data) so the guard can
   * raise the contractually-required `ForbiddenException` for a product that
   * exists in another workspace instead of masking it as `NotFound`. This is a
   * by-design cross-tenant existence check, not an unscoped data query.
   */
  private async assertOwnedProduct(workspaceId: string, productId: string): Promise<Product> {
    const existing = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });

    if (existing) {
      return existing;
    }

    // Distinguish "does not exist" (NotFound) from "exists in another
    // workspace" (Forbidden) without leaking the other workspace's data.
    // Existence-only probe: id is selected, nothing else. workspaceId does not
    // (and must not) appear here — the whole point is to detect rows OUTSIDE
    // the caller's workspace.
    const crossWorkspace = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (crossWorkspace) {
      throw new ForbiddenException('Cross-workspace access denied');
    }
    throw new NotFoundException(`Product ${productId} not found`);
  }
}
