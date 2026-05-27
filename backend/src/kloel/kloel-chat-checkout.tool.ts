import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomIdSegment } from '../common/random-id';

/**
 * AI-chat tool surface that creates/lists/updates/deletes records on the
 * **legacy** `ProductCheckout` Prisma model (mapped to `RAC_ProductCheckout`).
 *
 * NOT the canonical checkout service. The canonical HTTP-facing checkout
 * façade lives at `backend/src/checkout/checkout.service.ts` and operates on
 * the current `CheckoutProductPlan` (kind='CHECKOUT') model with sub-services,
 * event emission, and HTTP-layer idempotency.
 *
 * This tool exists because:
 *   1. The kloel AI tool dispatcher (`kloel-tool-dispatcher.service.ts`)
 *      executes the `checkout_create` chat tool against the legacy product
 *      checkout model that some controllers and
 *      `kloel-product-sub-resource-tools.service.ts` still maintain.
 *   2. Returning a `{ success, error }` shape (rather than throwing) is the
 *      kloel chat-tool contract — chat tools never throw because the LLM
 *      needs a parseable result to relay to the user.
 *
 * If/when the legacy `ProductCheckout` model is decommissioned and all chat
 * tools migrate onto the canonical `CheckoutProductPlan` surface, this file
 * can be deleted. Until then, it is a deliberate, named, single-purpose tool
 * — NOT a duplicate of `CheckoutService`. Renamed from `CheckoutService` on
 * 2026-05-27 to remove the class-name collision (P0 dup #33).
 *
 * @cluster Kloel/ChatTools
 * @canonicalSibling backend/src/checkout/checkout.service.ts (different surface, different model)
 * @see backend/src/kloel/kloel-tool-dispatcher.service.ts (only caller)
 * @see docs/architecture/DEPRECATION_MAP.md (rename history)
 */
@Injectable()
export class KloelChatCheckoutTool {
  private readonly logger = new Logger(KloelChatCheckoutTool.name);
  constructor(private readonly prisma: PrismaService) {}

  async create(
    workspaceId: string,
    data: {
      productId: string;
      name: string;
      description?: string;
      acceptPix?: boolean;
      acceptCard?: boolean;
      acceptBoleto?: boolean;
      buttonText?: string;
      primaryColor?: string;
      bgColor?: string;
      planIds?: string[];
      couponCode?: string;
      showCounter?: boolean;
      showSocialProof?: boolean;
      showGuarantee?: boolean;
      exitIntentPopup?: boolean;
    },
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, workspaceId },
    });
    if (!product) {
      return { success: false, error: 'product_not_found' };
    }

    const checkout = await this.prisma.productCheckout.create({
      data: {
        productId: data.productId,
        name: data.name,
        active: true,
        code: `chk_${Date.now().toString(36)}_${randomIdSegment(5)}`,
        config: {
          buttonText: data.buttonText || 'Comprar Agora',
          primaryColor: data.primaryColor || '#6366f1',
          bgColor: data.bgColor || '#ffffff',
          paymentMethods: {
            pix: data.acceptPix ?? true,
            card: data.acceptCard ?? true,
            boleto: data.acceptBoleto ?? false,
          },
          showCounter: data.showCounter ?? false,
          showSocialProof: data.showSocialProof ?? false,
          showGuarantee: data.showGuarantee ?? false,
          exitIntentPopup: data.exitIntentPopup ?? false,
        },
      },
    });

    if (data.planIds?.length) {
      await this.prisma.checkoutPlanLink.createMany({
        data: data.planIds.map((planId) => ({ checkoutId: checkout.id, planId })),
      });
    }

    this.logger.log(`Checkout created: ${checkout.id} "${checkout.name}"`);
    return { success: true, checkout: { id: checkout.id, name: checkout.name } };
  }

  async list(workspaceId: string) {
    const checkouts = await this.prisma.productCheckout.findMany({
      where: { product: { workspaceId } },
      select: { id: true, name: true, active: true, createdAt: true },
    });
    return { success: true, checkouts };
  }

  async update(workspaceId: string, checkoutId: string, data: Record<string, unknown>) {
    const checkout = await this.prisma.productCheckout.findFirst({
      where: { id: checkoutId, product: { workspaceId } },
    });
    if (!checkout) {
      return { success: false, error: 'checkout_not_found' };
    }

    const updates: Record<string, unknown> = {};
    if (typeof data.name === 'string') {
      updates.name = data.name;
    }
    if (data.active !== undefined) {
      updates.active = Boolean(data.active);
    }

    await this.prisma.productCheckout.update({ where: { id: checkoutId }, data: updates });
    return { success: true, message: 'Checkout updated' };
  }

  async delete(workspaceId: string, checkoutId: string) {
    const checkout = await this.prisma.productCheckout.findFirst({
      where: { id: checkoutId, product: { workspaceId } },
    });
    if (!checkout) {
      return { success: false, error: 'checkout_not_found' };
    }
    await this.prisma.productCheckout.delete({ where: { id: checkoutId } });
    return { success: true, message: `Checkout "${checkout.name}" deleted` };
  }
}
