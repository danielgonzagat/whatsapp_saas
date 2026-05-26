import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * @deprecated DUPLICATE of {@link ../checkout/checkout.service.ts CheckoutService}.
 * This standalone variant is unused (0 callers, not registered in any NestJS
 * module). It returns string-error shapes (`{ success: false, error: '…' }`)
 * instead of throwing exceptions, and uses `Math.random()` for code generation —
 * both anti-patterns. The canonical service lives at
 * `backend/src/checkout/checkout.service.ts` (500 LOC façade with proper
 * sub-services and event emitter).
 *
 * Migration path: this file will be deleted in a follow-up PR once
 * `scripts/ops/check-canonical-services.mjs --strict` confirms 0 callers
 * for 7 consecutive days.
 *
 * @cluster Checkout
 * @canonical backend/src/checkout/checkout.service.ts
 * @see docs/architecture/DEPRECATION_MAP.md#cross-cutting-duplications row 33
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  constructor(private readonly prisma: PrismaService) {}

  async create(workspaceId: string, data: {
    productId: string; name: string; description?: string;
    acceptPix?: boolean; acceptCard?: boolean; acceptBoleto?: boolean;
    buttonText?: string; primaryColor?: string; bgColor?: string;
    planIds?: string[]; couponCode?: string;
    showCounter?: boolean; showSocialProof?: boolean;
    showGuarantee?: boolean; exitIntentPopup?: boolean;
  }) {
    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, workspaceId },
    });
    if (!product) return { success: false, error: 'product_not_found' };
    
    const checkout = await this.prisma.productCheckout.create({
      data: {
        productId: data.productId,
        name: data.name,
        active: true,
        code: `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
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
    if (!checkout) return { success: false, error: 'checkout_not_found' };

    const updates: Record<string, unknown> = {};
    if (data.name) updates.name = String(data.name);
    if (data.active !== undefined) updates.active = Boolean(data.active);

    await this.prisma.productCheckout.update({ where: { id: checkoutId }, data: updates });
    return { success: true, message: 'Checkout updated' };
  }

  async delete(workspaceId: string, checkoutId: string) {
    const checkout = await this.prisma.productCheckout.findFirst({
      where: { id: checkoutId, product: { workspaceId } },
    });
    if (!checkout) return { success: false, error: 'checkout_not_found' };
    await this.prisma.productCheckout.delete({ where: { id: checkoutId } });
    return { success: true, message: `Checkout "${checkout.name}" deleted` };
  }
}
