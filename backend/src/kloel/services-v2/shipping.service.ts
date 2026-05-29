import { Injectable, NotFoundException } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

export interface ShippingConfigureArgs {
  productId: string;
  shippingType?: string; // VARIABLE, FIXED, FREE, NONE
  shippingValue?: number;
  provider?: string;
  [key: string]: unknown;
}

/**
 * ShippingService — configures shipping settings on a Product.
 *
 * domainService alias: ShippingService.configure
 * Workspace isolation: validates product belongs to workspace.
 *
 * Updates the shippingType / shippingValue / afterPayShippingProvider fields
 * on the Product model (no dedicated Shipping model exists).
 */
@Injectable()
export class ShippingService {
  private readonly logger = StructuredLogger.from(ShippingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Configure shipping for a product. */
  async configure(
    workspaceId: string,
    args: ShippingConfigureArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const productId = String(args.productId ?? '');
    if (!productId) return { success: false, data: null };

    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(`Produto ${productId} não encontrado no workspace`);
    }

    const patch: Record<string, unknown> = {};
    const VALID_TYPES = new Set(['VARIABLE', 'FIXED', 'FREE', 'NONE']);

    if (args.shippingType !== undefined) {
      const type = String(args.shippingType).toUpperCase();
      patch.shippingType = VALID_TYPES.has(type) ? type : 'NONE';
    }
    if (args.shippingValue !== undefined) {
      patch.shippingValue = Number(args.shippingValue);
    }
    if (args.provider !== undefined) {
      patch.afterPayShippingProvider = String(args.provider);
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: patch,
      select: {
        id: true,
        shippingType: true,
        shippingValue: true,
        afterPayShippingProvider: true,
      },
    });

    this.logger.log(`ShippingService.configure ws=${workspaceId} product=${productId}`, patch);
    return { success: true, data: updated };
  }
}
