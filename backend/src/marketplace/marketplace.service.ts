import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { priceInCentsOf } from '../products/product.helpers';

function requireTemplateJson(value: Prisma.JsonValue, field: string): Prisma.InputJsonValue {
  if (value === null) {
    throw new Error(`Template ${field} is missing`);
  }
  return value;
}

/** Marketplace service. */
@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('MarketplaceService initialized');
  }

  /** List templates. */
  async listTemplates(category?: string) {
    return this.prisma.flowTemplate.findMany({
      where: { isPublic: true, ...(category ? { category } : {}) },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        downloads: true,
        isPublic: true,
        nodes: true,
        edges: true,
        createdAt: true,
      },
      orderBy: { downloads: 'desc' },
      take: 100,
    });
  }

  /** List marketplace products. */
  async list(
    workspaceId: string,
    filter?: { category?: string; search?: string; limit?: number },
  ): Promise<{
    items: Array<{
      id: string;
      name: string;
      description: string;
      price: bigint;
      vendor: string;
    }>;
    total: number;
  }> {
    const where: Prisma.ProductWhereInput = {
      workspaceId,
      active: true,
      ...(filter?.category ? { category: filter.category } : {}),
      ...(filter?.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const limit = filter?.limit ?? 20;

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where: { ...where, workspaceId },
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        // Money source: Product.price is a Float column (no integer-cents
        // column exists on Product), so convert through the single canonical
        // float->cents helper instead of an ad-hoc inline round. Returned as
        // bigint cents to keep the money-safe response contract. See
        // sharedFileNeeds: Product needs a priceInCents bigint column for true
        // money-safety (eliminating the float round-trip entirely).
        price: BigInt(priceInCentsOf(p.price)),
        vendor: p.workspaceId,
      })),
      total,
    };
  }

  /**
   * List public affiliate-marketplace products (listed across all workspaces).
   *
   * Chat-surfaced via the Kloel capability `marketplace.list_public_products`.
   * Read-only; returns the canonical AffiliateProduct catalog.
   */
  async listPublicProducts(
    _workspaceId: string,
    args?: { category?: string; search?: string; limit?: number },
  ): Promise<{
    success: true;
    products: Array<{
      id: string;
      productId: string;
      category: string | null;
      commissionPct: number;
      commissionType: string;
      cookieDays: number;
      approvalMode: string;
      totalAffiliates: number;
      totalSales: number;
    }>;
    total: number;
  }> {
    const where: Prisma.AffiliateProductWhereInput = {
      listed: true,
      ...(args?.category ? { category: args.category } : {}),
      ...(args?.search
        ? {
            OR: [
              { category: { contains: args.search, mode: 'insensitive' } },
              { tags: { has: args.search } },
            ],
          }
        : {}),
    };
    const take = Math.min(Math.max(args?.limit ?? 20, 1), 100);

    const [products, total] = await Promise.all([
      this.prisma.affiliateProduct.findMany({
        where,
        orderBy: { temperature: 'desc' },
        take,
      }),
      this.prisma.affiliateProduct.count({ where }),
    ]);

    return {
      success: true,
      products: products.map((p) => ({
        id: p.id,
        productId: p.productId,
        category: p.category,
        commissionPct: p.commissionPct,
        commissionType: p.commissionType,
        cookieDays: p.cookieDays,
        approvalMode: p.approvalMode,
        totalAffiliates: p.totalAffiliates,
        totalSales: p.totalSales,
      })),
      total,
    };
  }

  /**
   * Apply this workspace as an affiliate for a marketplace product.
   *
   * Chat-surfaced via `marketplace.apply_as_affiliate`. Idempotent on
   * (affiliateProductId, affiliateWorkspaceId). When the product is in AUTO
   * approval mode, the affiliate link is generated immediately.
   */
  async applyAsAffiliate(
    workspaceId: string,
    args: { productId: string; affiliateName?: string; affiliateEmail?: string },
  ): Promise<{
    success: true;
    status: string;
    requestId: string;
    code: string | null;
  }> {
    const productId = typeof args.productId === 'string' ? args.productId : '';
    if (!productId) {
      throw new Error('productId é obrigatório');
    }

    const affiliateProduct = await this.prisma.affiliateProduct.findFirst({
      where: { productId, listed: true },
    });
    if (!affiliateProduct) {
      throw new Error('Produto não disponível no marketplace de afiliados');
    }

    const existing = await this.prisma.affiliateRequest.findUnique({
      where: {
        affiliateProductId_affiliateWorkspaceId: {
          affiliateProductId: affiliateProduct.id,
          affiliateWorkspaceId: workspaceId,
        },
      },
    });

    const status = affiliateProduct.approvalMode === 'AUTO' ? 'APPROVED' : 'PENDING';

    const request =
      existing ??
      (await this.prisma.affiliateRequest.create({
        data: {
          affiliateProductId: affiliateProduct.id,
          affiliateWorkspaceId: workspaceId,
          affiliateName: args.affiliateName ?? null,
          affiliateEmail: args.affiliateEmail ?? null,
          status,
        },
      }));

    let code: string | null = null;
    if (request.status === 'APPROVED') {
      const existingLink = await this.prisma.affiliateLink.findFirst({
        where: { affiliateProductId: affiliateProduct.id, affiliateWorkspaceId: workspaceId },
        select: { code: true },
      });
      const link =
        existingLink ??
        (await this.prisma.affiliateLink.create({
          data: {
            affiliateProductId: affiliateProduct.id,
            affiliateWorkspaceId: workspaceId,
          },
          select: { code: true },
        }));
      code = link.code;
    }

    return { success: true, status: request.status, requestId: request.id, code };
  }

  /**
   * Return the affiliate link/code this workspace holds for a marketplace product.
   *
   * Chat-surfaced via `marketplace.get_affiliate_link`. Read-only.
   *
   * `clicks` and `sales` are the persisted counters on the workspace's own
   * {@link AffiliateLink} row — these are real, production-tracked metrics, not
   * placeholders. `clicks` is incremented when the affiliate link is resolved at
   * checkout ({@link CheckoutCodeLookupHelper}) and `sales` is incremented when a
   * checkout attributed to the link is paid (`checkout-paid-effects/affiliate`).
   * The `0` returned in the early-exit branches (no marketplace product, or this
   * workspace holds no link) is an HONEST empty baseline: there genuinely is no
   * link, so there are zero clicks and zero sales — not fabricated data.
   */
  async getAffiliateLink(
    workspaceId: string,
    args: { productId: string },
  ): Promise<{
    success: true;
    code: string | null;
    path: string | null;
    clicks: number;
    sales: number;
  }> {
    const productId = typeof args.productId === 'string' ? args.productId : '';
    if (!productId) {
      throw new Error('productId é obrigatório');
    }
    const affiliateProduct = await this.prisma.affiliateProduct.findFirst({
      where: { productId },
      select: { id: true },
    });
    if (!affiliateProduct) {
      return { success: true, code: null, path: null, clicks: 0, sales: 0 };
    }
    const link = await this.prisma.affiliateLink.findFirst({
      where: { affiliateProductId: affiliateProduct.id, affiliateWorkspaceId: workspaceId },
    });
    if (!link) {
      return { success: true, code: null, path: null, clicks: 0, sales: 0 };
    }
    return {
      success: true,
      code: link.code,
      path: `/pay/${link.code}`,
      clicks: link.clicks,
      sales: link.sales,
    };
  }

  /** Install template. */
  async installTemplate(workspaceId: string, templateId: string) {
    const template = await this.prisma.flowTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const nodes = requireTemplateJson(template.nodes, 'nodes');
    const edges = requireTemplateJson(template.edges, 'edges');
    const newFlow = await this.prisma.flow.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        name: template.name,
        description: template.description,
        nodes,
        edges,
        isActive: false,
        triggerType: 'MANUAL',
      },
    });

    // Increment downloads
    await this.prisma.flowTemplate.update({
      where: { id: templateId },
      data: { downloads: { increment: 1 } },
    });

    return newFlow;
  }
}
