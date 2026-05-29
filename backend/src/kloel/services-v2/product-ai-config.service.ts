import { Injectable, NotFoundException } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface ProductAIConfigGetArgs {
  productId: string;
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
}
