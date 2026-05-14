import { Injectable, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StructuredLogger } from '../logging/structured-logger';
import { forEachSequential } from '../common/async-sequence';
import { EmailService } from '../auth/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { ChannelTransportRegistry } from './channel-transport.registry';
import { MindBanditService } from './mind-bandit.service';
import { MindCaseMemoryService } from './mind-case-memory.service';
import { MindGuardsService } from './mind-guards.service';
import { MindPolicyService } from './mind-policy.service';
import { resolveCartRecoveryDecision } from './mind-recovery-decision-resolvers';
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
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Se a sua duvida for confianca, podemos te mostrar informacoes claras sobre <strong>' +
      productName +
      '</strong> para voce decidir com calma.</p>',
    urgency:
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Seu pedido de <strong>' +
      productName +
      '</strong> ficou em aberto. Se ainda fizer sentido para voce, pode retomar quando estiver pronto.</p>',
    help:
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Notamos que voce iniciou a compra de <strong>' +
      productName +
      '</strong> mas nao finalizou. Se ficou alguma duvida real, responda este email e ajudamos sem pressa.</p>',
    faq:
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Tem duvidas sobre <strong>' +
      productName +
      '</strong>? Acesse nossa pagina de perguntas frequentes ou responda este email.</p>',
    discount:
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Se o valor foi a principal duvida sobre <strong>' +
      productName +
      '</strong>, responda este email para avaliarmos a melhor condicao disponivel antes de voce decidir.</p>',
    pause:
      '<p style="color: #666; line-height: 1.6; margin-bottom: 24px;">Seu pedido de <strong>' +
      productName +
      '</strong> esta aguardando. Sem pressa — quando estiver pronto, e so voltar.</p>',
  };

  const body = bodyByAction[action] ?? bodyByAction.help ?? '';
  const outerStyle =
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px;";
  const containerStyle =
    'max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);';
  const brandStyle = 'font-size: 24px; font-weight: bold; color: #E85D30; margin-bottom: 20px;';
  const titleStyle = 'font-size: 22px; color: #1a1a1a; margin-bottom: 16px;';
  const orderStyle = 'color: #666; line-height: 1.6; margin-bottom: 24px;';
  const footerStyle = 'margin-top: 32px; font-size: 12px; color: #999;';

  return [
    '<div style="' + outerStyle + '">',
    '<div style="' + containerStyle + '">',
    '<div style="' + brandStyle + '">KLOEL</div>',
    '<h1 style="' + titleStyle + '">Sua compra ficou em aberto</h1>',
    body,
    '<p style="' + orderStyle + '">Pedido #' + orderNumber + '</p>',
    '<div style="' + footerStyle + '"><p>KLOEL - Inteligencia Comercial Autonoma</p></div>',
    '</div>',
    '</div>',
  ].join('');
}

/** Cart recovery service with MIND-driven recovery action decisions. */
@Injectable()
export class CartRecoveryService {
  private readonly logger = StructuredLogger.from(CartRecoveryService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly mindPolicy?: MindPolicyService,
    @Optional() private readonly cases?: MindCaseMemoryService,
    @Optional() private readonly guards?: MindGuardsService,
    @Optional() private readonly transportRegistry?: ChannelTransportRegistry,
    @Optional() private readonly bandit?: MindBanditService,
  ) {}

  /** Check abandoned carts and dispatch MIND-chosen recovery actions. */
  @Cron('0 */30 * * * *')
  async checkAbandonedCarts() {
    try {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

      const workspaces = await this.prisma.workspace.findMany({
        select: { id: true },
        take: 500,
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

      await forEachSequential(toRecover, async (order) => {
        try {
          if (!order.customerEmail) {
            return;
          }

          const orderWithPlan = order;
          const productName = orderWithPlan.plan?.product?.name || 'Seu pedido';
          const customerEmail = order.customerEmail;
          const wsId = order.workspaceId;
          const product = order.plan?.product;
          const priceBand = resolvePriceBand(product?.price);
          const ageMinutes = Math.round((Date.now() - order.createdAt.getTime()) / 60000);

          const emailCapable = await this.transportRegistry
            ?.getCapability(wsId, 'email')
            .then((cap) => cap.sendAvailable)
            .catch(() => false);
          if (this.transportRegistry && !emailCapable) {
            this.logger.warn(
              `Email channel not available for workspace ${wsId} — skipping cart recovery for order ${order.id}`,
            );
            return;
          }

          let recoveryAction = 'help';
          let mindDecisionMeta: Record<string, unknown> = {};

          if (wsId && this.mindPolicy) {
            try {
              const recoveryResult = await resolveCartRecoveryDecision(
                this.mindPolicy,
                this.cases,
                this.bandit,
                wsId,
                order.id,
                productName,
                priceBand,
                ageMinutes,
              );
              recoveryAction = recoveryResult.action;
              mindDecisionMeta = {
                ...(recoveryResult.memoryAction
                  ? { mindCaseMemoryAction: recoveryResult.memoryAction }
                  : {}),
                ...(recoveryResult.banditAction ? { banditArm: recoveryResult.banditAction } : {}),
                mindRecoveryAction: recoveryResult.action,
                mindReason: recoveryResult.reasonInternal,
              };
            } catch (mindErr: unknown) {
              this.logger.warn(
                `MIND cart_recovery fallback for order ${order.id}: ${String(mindErr)}`,
              );
            }
          }

          if (this.guards && !this.transportRegistry) {
            try {
              const guardResult = await this.guards.evaluate({
                workspaceId: wsId,
                decisionType: 'cart_recovery',
                action: `send_recovery_email:${recoveryAction}`,
                context: {
                  channel: 'email',
                  withinComplianceWindow: true,
                  productId: product?.id,
                },
              });
              if (!guardResult.allowed) {
                this.logger.warn(
                  `Cart recovery blocked by guard ${guardResult.guardName} for order ${order.id}: ${guardResult.reason}`,
                );
                return;
              }
            } catch (guardErr: unknown) {
              this.logger.warn(
                `Guard evaluation failed for cart recovery order ${order.id}: ${String(guardErr)}`,
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
          const html = emailBody + unsubscribeFooter;

          if (this.transportRegistry) {
            const sendResult = await this.transportRegistry.send(wsId, {
              workspaceId: wsId,
              channel: 'email',
              recipientId: customerEmail,
              content: html,
              externalId: `cart-recovery:${order.id}`,
              complianceMode: 'proactive',
              guardContext: {
                channel: 'email',
                withinComplianceWindow: true,
                productId: product?.id,
              },
            });
            if (!sendResult.success) {
              this.logger.warn(
                `Cart recovery transport failed for order ${order.id}: ${
                  sendResult.error || sendResult.blockedReason || 'unknown_error'
                }`,
              );
              return;
            }
          } else {
            const emailService = new EmailService();
            await emailService.sendEmail({
              to: customerEmail,
              subject: `Seu pedido ainda esta aberto - ${productName}`,
              html,
              headers: {
                'List-Unsubscribe': listUnsubscribe,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            });
          }

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
