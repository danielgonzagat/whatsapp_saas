import { Injectable, NotFoundException } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { ProductService } from '../../products/product.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface PixelConfigureArgs {
  productId?: string;
  pixels?: unknown;
  pixelType?: string;
  pixelId?: string;
  accessToken?: string;
  [key: string]: unknown;
}

/**
 * PixelService — wraps ProductService.setPixels for capability resolution.
 *
 * domainService alias: PixelService.configure
 *
 * Normalises the legacy per-pixel input shape `{ pixelType, pixelId, accessToken? }`
 * into the canonical `pixels[]` array accepted by ProductService.setPixels.
 * Workspace isolation is enforced by ProductService.
 */
@Injectable()
export class PixelService {
  private readonly logger = StructuredLogger.from(PixelService.name);

  constructor(
    private readonly productService: ProductService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Configure pixels for a product.
   *
   * Accepts either:
   *  - `args.pixels` — full canonical array (forwarded as-is)
   *  - `args.pixelType` + `args.pixelId` — legacy single-pixel shape
   *    (normalised into a one-element array before forwarding)
   */
  async configure(
    workspaceId: string,
    args: PixelConfigureArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const productId = String(args.productId ?? '').trim();
    if (!productId) {
      return { success: false, data: null };
    }

    // Workspace isolation — confirm product belongs to workspace
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(`Produto ${productId} não encontrado no workspace`);
    }

    // Normalise pixel payload
    let pixels: unknown;
    if (Array.isArray(args.pixels)) {
      pixels = args.pixels;
    } else if (args.pixelType && args.pixelId) {
      pixels = [
        {
          type: String(args.pixelType),
          pixelId: String(args.pixelId),
          ...(args.accessToken ? { accessToken: String(args.accessToken) } : {}),
        },
      ];
    } else {
      pixels = [];
    }

    const result = await this.productService.setPixels(workspaceId, { productId, pixels });

    this.logger.log(`PixelService.configure ws=${workspaceId} product=${productId}`);
    return { success: true, data: result };
  }
}
