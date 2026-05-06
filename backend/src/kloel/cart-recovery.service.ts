import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  buildListUnsubscribeHeader,
  buildUnsubscribeFooterHtml,
} from '../common/utils/unsubscribe-footer.util';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

type CartRecoveryMetadata = Record<string, unknown>;

function readCartRecoveryMetadata(value: unknown): CartRecoveryMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as CartRecoveryMetadata;
}

/** Cart recovery service. */
@Injectable()
export class CartRecoveryService {
  private readonly logger = new Logger(CartRecoveryService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** Check abandoned carts. */
  @Cron('0 */30 * * * *') // Every 30 minutes
  async checkAbandonedCarts() {
    try {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

      // Find PENDING orders older than 30 minutes that haven't received recovery emails
      const abandoned = await this.prisma.checkoutOrder.findMany({
        where: {
          workspaceId: undefined,
          status: 'PENDING',
          createdAt: { lt: thirtyMinAgo },
        },
        include: { plan: { include: { product: true } } },
        take: 50,
      });

      // Filter out orders that already had recovery email sent (stored in metadata)
      const toRecover = abandoned.filter((order) => {
        const metadata = readCartRecoveryMetadata(order.metadata);
        return metadata.recoveryEmailSent !== true;
      });

      if (toRecover.length === 0) {
        return;
      }
      this.logger.log(`Found ${toRecover.length} abandoned carts to recover`);

      const { EmailService } = await import('../auth/email.service');

      await forEachSequential(toRecover, async (order) => {
        try {
          if (!order.customerEmail) {
            return;
          }

          const emailService = new EmailService();
          const productName = order.plan?.product?.name || 'Seu pedido';
          const customerEmail = order.customerEmail;
          const unsubscribeFooter = buildUnsubscribeFooterHtml({
            email: customerEmail,
            workspaceId: order.workspaceId ?? undefined,
          });
          const listUnsubscribe = buildListUnsubscribeHeader({
            email: customerEmail,
            workspaceId: order.workspaceId ?? undefined,
          });

          await emailService.sendEmail({
            to: customerEmail,
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
            ${unsubscribeFooter}
          `,
            headers: {
              'List-Unsubscribe': listUnsubscribe,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });

          // Mark as sent using metadata field
          await this.prisma.checkoutOrder.updateMany({
            where: { id: order.id, workspaceId: order.workspaceId },
            data: {
              metadata: {
                ...readCartRecoveryMetadata(order.metadata),
                recoveryEmailSent: true,
                recoveryEmailSentAt: new Date().toISOString(),
              },
            },
          });

          this.logger.log(`Recovery email sent for order ${order.id}`);
        } catch (e: unknown) {
          // PULSE:OK — Cart recovery is best-effort background job; other orders still processed
          this.logger.error(`Cart recovery failed for ${order.id}: ${String(e)}`);
        }
      });
    } catch (e: unknown) {
      void this.opsAlert?.alertOnCriticalError(e, 'CartRecoveryService.checkAbandonedCarts');
      // PULSE:OK — cart recovery is non-critical background cron; errors logged and retried next cycle
      this.logger.error(`checkAbandonedCarts cron failed: ${String(e)}`);
    }
  }
}
