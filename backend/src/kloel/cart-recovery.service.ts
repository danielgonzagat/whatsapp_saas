import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CartRecoveryService {
  private readonly logger = new Logger(CartRecoveryService.name);
  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 */30 * * * *') // Every 30 minutes
  async checkAbandonedCarts() {
    try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Find PENDING orders older than 30 minutes that haven't received recovery emails
    const abandoned = await this.prisma.checkoutOrder.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: thirtyMinAgo },
      },
      include: { plan: { include: { product: true } } },
      take: 50,
    });

    // Filter out orders that already had recovery email sent (stored in metadata)
    const toRecover = abandoned.filter((order) => {
      const meta = (order.metadata as any) || {};
      return !meta.recoveryEmailSent;
    });

    if (toRecover.length === 0) return;
    this.logger.log(`Found ${toRecover.length} abandoned carts to recover`);

    for (const order of toRecover) {
      try {
        if (!order.customerEmail) continue;

        const emailService = new (
          await import('../auth/email.service')
        ).EmailService();
        const productName = order.plan?.product?.name || 'Seu pedido';

        await emailService.sendEmail({
          to: order.customerEmail,
          subject: `Voce esqueceu algo — ${productName}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px;">
              <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                <div style="font-size: 24px; font-weight: bold; color: #E85D30; margin-bottom: 20px;">KLOEL</div>
                <h1 style="font-size: 22px; color: #1a1a1a; margin-bottom: 16px;">Voce deixou algo no carrinho!</h1>
                <p style="color: #666; line-height: 1.6; margin-bottom: 24px;">
                  Notamos que voce iniciou a compra de <strong>${productName}</strong> mas nao finalizou.
                  Seu pedido ainda esta disponivel — complete sua compra agora!
                </p>
                <p style="color: #666; line-height: 1.6; margin-bottom: 24px;">
                  Pedido #${order.orderNumber}
                </p>
                <div style="margin-top: 32px; font-size: 12px; color: #999;">
                  <p>KLOEL - Inteligencia Comercial Autonoma</p>
                </div>
              </div>
            </div>
          `,
        });

        // Mark as sent using metadata field
        await this.prisma.checkoutOrder.update({
          where: { id: order.id },
          data: {
            metadata: {
              ...((order.metadata as any) || {}),
              recoveryEmailSent: true,
              recoveryEmailSentAt: new Date().toISOString(),
            },
          },
        });

        this.logger.log(`Recovery email sent for order ${order.id}`);
      } catch (e) {
        // PULSE:OK — Cart recovery is best-effort background job; other orders still processed
        this.logger.error(`Cart recovery failed for ${order.id}: ${e}`);
      }
    }
    } catch (e) {
      // PULSE:OK — cart recovery is non-critical background cron; errors logged and retried next cycle
      this.logger.error(`checkAbandonedCarts cron failed: ${e}`);
    }
  }
}
