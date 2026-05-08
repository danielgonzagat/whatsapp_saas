import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { MindPolicyService } from './mind-policy.service';
import {
  buildListUnsubscribeHeader,
  buildUnsubscribeFooterHtml,
} from '../common/utils/unsubscribe-footer.util';

type CartRecoveryMetadata = Record<string, unknown>;

function readCartRecoveryMetadata(value: unknown): CartRecoveryMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as CartRecoveryMetadata;
}

function resolvePriceBand(price: unknown): string {
  const n = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(n) || n <= 0) return 'unknown';
  if (n <= 50) return 'under_50';
  if (n <= 100) return 'under_100';
  if (n <= 300) return 'under_300';
  if (n <= 500) return 'under_500';
  return 'over_500';
}

function renderRecoveryEmail(productName: string, orderNumber: string, action: string): string {
  const bodyByAction: Record<string, string> = {
    proof:
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Centenas de clientes ja transformaram seus resultados com <strong>' +
      productName +
      '</strong>. Junte-se a eles!</p>',
    urgency:
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Seu pedido de <strong>' +
      productName +
      '</strong> expira em breve. Garanta agora antes que acabe!</p>',
    help:
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Notamos que voce iniciou a compra de <strong>' +
      productName +
      '</strong> mas nao finalizou. Seu pedido ainda esta disponivel.</p>',
    faq:
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Tem duvidas sobre <strong>' +
      productName +
      '</strong>? Acesse nossa pagina de perguntas frequentes ou responda este email.</p>',
    discount:
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Temos uma oferta especial para voce! Use o codigo <strong>VOLTEI10</strong> e ganhe 10% de desconto em <strong>' +
      productName +
      '</strong>.</p>',
    pause:
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Seu pedido de <strong>' +
      productName +
      '</strong> esta aguardando. Sem pressa — quando estiver pronto, e so voltar.</p>',
  };

  const body = bodyByAction[action] ?? bodyByAction.help ?? '';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        <div style="font-size: 24px; font-weight: bold; color: #E85D30; margin-bottom: 20px;">KLOEL</div>
        <h1 style="font-size: 22px; color: #1a1a1a; margin-bottom: 16px;">Voce deixou algo no carrinho!</h1>
        ${body}
        <p style="color: #666; line-height: 1.6; margin-bottom: 24px;">
          Pedido #${orderNumber}
        </p>
        <div style="margin-top: 32px; font-size: 12px; color: #999;">
          <p>KLOEL - Inteligencia Comercial Autonoma</p>
        </div>
      </div>
    </div>
  `;
}

/** Cart recovery service with MIND-driven recovery action decisions. */
@Injectable()
export class CartRecoveryService {
  private readonly logger = new Logger(CartRecoveryService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly mindPolicy?: MindPolicyService,
  ) {}

  /** Check abandoned carts and dispatch MIND-chosen recovery actions. */
  @Cron('0 */30 * * * *')
  async checkAbandonedCarts() {
    try {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      const workspaces = await this.prisma.workspace.findMany({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      const workspaceIds = workspaces.map((workspace) => workspace.id);
      const abandoned =
        workspaceIds.length > 0
          ? await this.prisma.checkoutOrder.findMany({
              where: {
                workspaceId: { in: workspaceIds },
                status: 'PENDING',
                createdAt: { lt: thirtyMinAgo },
              },
              include: { plan: { include: { product: true } } },
              orderBy: { createdAt: 'asc' },
              take: 50,
            })
          : [];

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
          const wsId = order.workspaceId;
          const product = order.plan?.product;
          const priceBand = resolvePriceBand(product?.price);
          const ageMinutes = Math.round((Date.now() - order.createdAt.getTime()) / 60000);

          let recoveryAction = 'help';
          let mindDecisionMeta: Record<string, unknown> = {};

          if (wsId && this.mindPolicy) {
            try {
              const recoveryResult = await this.mindPolicy.choose({
                workspaceId: wsId,
                subject: `order:${order.id}`,
                decisionType: 'cart_recovery',
                context: {
                  channel: 'email',
                  price_band: priceBand,
                  age_minutes: ageMinutes,
                  product: productName,
                },
                options: [
                  {
                    action: 'proof',
                    predicate: 'P(payment|cart_recovery_action,channel,price_band)',
                    context: {},
                  },
                  {
                    action: 'urgency',
                    predicate: 'P(payment|cart_recovery_action,channel,price_band)',
                    context: {},
                  },
                  {
                    action: 'help',
                    predicate: 'P(payment|cart_recovery_action,channel,price_band)',
                    context: {},
                  },
                  {
                    action: 'faq',
                    predicate: 'P(payment|cart_recovery_action,channel,price_band)',
                    context: {},
                  },
                  {
                    action: 'discount',
                    predicate: 'P(payment|cart_recovery_action,channel,price_band)',
                    context: {},
                  },
                  {
                    action: 'pause',
                    predicate: 'P(payment|cart_recovery_action,channel,price_band)',
                    context: {},
                  },
                ],
                baseline: 'help',
                outcomeKey: `cart_recovery:${wsId}:${order.id}`,
                utilitySuccess: 1,
                utilityFail: -0.1,
              });
              recoveryAction = recoveryResult.chosen;
              mindDecisionMeta = {
                mindRecoveryAction: recoveryResult.chosen,
                mindReason: recoveryResult.decision.reasonInternal,
              };
            } catch (mindErr: unknown) {
              this.logger.warn(
                `MIND cart_recovery fallback for order ${order.id}: ${String(mindErr)}`,
              );
            }
          }

          const emailBody = renderRecoveryEmail(productName, order.orderNumber, recoveryAction);
          const unsubscribeFooter = buildUnsubscribeFooterHtml({
            email: customerEmail,
            workspaceId: wsId,
          });
          const listUnsubscribe = buildListUnsubscribeHeader({
            email: customerEmail,
            workspaceId: wsId,
          });

          await emailService.sendEmail({
            to: customerEmail,
            subject: `Voce esqueceu algo — ${productName}`,
            html: `${emailBody}${unsubscribeFooter}`,
            headers: {
              'List-Unsubscribe': listUnsubscribe,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });

          await this.prisma.checkoutOrder.updateMany({
            where: { id: order.id, workspaceId: order.workspaceId },
            data: {
              metadata: {
                ...readCartRecoveryMetadata(order.metadata),
                recoveryEmailSent: true,
                recoveryEmailSentAt: new Date().toISOString(),
                ...mindDecisionMeta,
              },
            },
          });

          this.logger.log(`Recovery email sent for order ${order.id} (action=${recoveryAction})`);
        } catch (e: unknown) {
          this.logger.error(`Cart recovery failed for ${order.id}: ${String(e)}`);
        }
      });
    } catch (e: unknown) {
      void this.opsAlert?.alertOnCriticalError(e, 'CartRecoveryService.checkAbandonedCarts');
      this.logger.error(`checkAbandonedCarts cron failed: ${String(e)}`);
    }
  }
}
