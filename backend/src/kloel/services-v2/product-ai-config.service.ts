import { Injectable, NotFoundException } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface ProductAIConfigGetArgs {
  productId: string;
  [key: string]: unknown;
}

export interface ProductAIConfigUpdateArgs {
  productId: string;
  persona?: string;
  instructions?: string;
  knowledgeBase?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

/**
 * ProductAIConfigService — per-product AI config (wraps Prisma ProductAIConfig model).
 *
 * domainService alias: ProductAIConfigService.get
 * Workspace isolation: validates product belongs to workspace before reading.
 */
@Injectable()
export class ProductAIConfigService {
  private readonly logger = StructuredLogger.from(ProductAIConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Get AI config for a product. */
  async get(
    workspaceId: string,
    args: ProductAIConfigGetArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const productId = String(args.productId ?? '');
    if (!productId) {
      return { success: false, data: null };
    }

    // Workspace isolation check
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(`Produto ${productId} não encontrado no workspace`);
    }

    const config = await this.prisma.productAIConfig.findUnique({
      where: { productId },
    });

    this.logger.log(`ProductAIConfigService.get ws=${workspaceId} product=${productId}`);
    return { success: true, data: config };
  }

  /**
   * Set per-product AI config from a chat capability.
   *
   * domainService alias: `ProductAIConfigService.update` — backs the canonical
   * capability `products.set_ai_config`. The cap declares the free-text guidance
   * fields persona / instructions / knowledgeBase plus an `enabled` flag. The
   * Prisma `ProductAIConfig` model has no scalar columns for these, so they are
   * persisted inside the persona-bearing `customerProfile` Json column under
   * explicit keys — merged with any existing config so other keys
   * (idealCustomer, pains, etc.) are never clobbered. Workspace-isolated:
   * validates product ownership before writing. Idempotent via upsert keyed on
   * the unique `productId`.
   */
  async update(
    workspaceId: string,
    args: ProductAIConfigUpdateArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const productId = String(args.productId ?? '');
    if (!productId) {
      return { success: false, data: null };
    }

    // Workspace isolation check
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(`Produto ${productId} não encontrado no workspace`);
    }

    const existing = await this.prisma.productAIConfig.findUnique({
      where: { productId },
      select: { customerProfile: true },
    });
    const currentProfile =
      existing?.customerProfile && typeof existing.customerProfile === 'object'
        ? (existing.customerProfile as Record<string, unknown>)
        : {};

    const profilePatch: Record<string, unknown> = { ...currentProfile };
    if (typeof args.persona === 'string') {
      profilePatch.persona = args.persona;
    }
    if (typeof args.instructions === 'string') {
      profilePatch.instructions = args.instructions;
    }
    if (typeof args.knowledgeBase === 'string') {
      profilePatch.knowledgeBase = args.knowledgeBase;
    }
    if (typeof args.enabled === 'boolean') {
      profilePatch.aiEnabled = args.enabled;
    }

    const config = await this.prisma.productAIConfig.upsert({
      where: { productId },
      create: {
        productId,
        customerProfile: profilePatch as Prisma.InputJsonValue,
      },
      update: {
        customerProfile: profilePatch as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`ProductAIConfigService.update ws=${workspaceId} product=${productId}`);
    return { success: true, data: config };
  }
}
