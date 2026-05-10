import { Prisma } from '@prisma/client';
import { escapeHtml } from '../../common/utils/html-escape.util';
import { BRAND_COLORS } from '../../common/kloel-colors';
import { formatBrlAmount } from '../../kloel/money-format.util';
import { PaidCheckoutEffectClient, readPaidCheckoutOrderScope } from './shared';

export type CheckoutEmailSender = (input: {
  to: string;
  subject: string;
  html: string;
}) => Promise<boolean>;

export async function sendPurchaseConfirmationEmailFromPaidCheckoutUpdate(
  prisma: PaidCheckoutEffectClient,
  args: Prisma.CheckoutOrderUpdateManyArgs,
  sendEmail?: CheckoutEmailSender,
) {
  const scope = args.data.status === 'PAID' ? readPaidCheckoutOrderScope(args) : null;
  if (!scope) return;

  const existing = await prisma.auditLog.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      action: 'purchase_confirmation_email_sent',
      resource: 'CheckoutOrder',
      resourceId: scope.orderId,
    },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  const order = await prisma.checkoutOrder.findUnique({
    where: { id: scope.orderId },
    select: {
      id: true,
      workspaceId: true,
      orderNumber: true,
      customerName: true,
      customerEmail: true,
      totalInCents: true,
      plan: {
        select: {
          productId: true,
          product: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (!order || order.workspaceId !== scope.workspaceId || !order.customerEmail) {
    return;
  }
  const memberArea = await prisma.memberArea.findFirst({
    where: { workspaceId: scope.workspaceId, productId: order.plan.productId, active: true },
    select: { slug: true },
  });

  if (!sendEmail) return;

  const sent = await sendEmail({
    to: order.customerEmail,
    subject: `Pagamento confirmado - ${order.plan.product?.name || 'Seu pedido'}`,
    html: buildPurchaseConfirmationEmailHtml({
      customerName: order.customerName || order.customerEmail,
      productName: order.plan.product?.name || 'Seu pedido',
      orderNumber: order.orderNumber || order.id,
      totalInCents: order.totalInCents,
      memberAreaUrl: memberArea?.slug ? `/area/${memberArea.slug}` : undefined,
    }),
  });

  if (!sent) {
    return;
  }

  await prisma.auditLog.create({
    data: {
      workspaceId: scope.workspaceId,
      action: 'purchase_confirmation_email_sent',
      resource: 'CheckoutOrder',
      resourceId: order.id,
      details: {
        customerEmail: order.customerEmail,
        orderNumber: order.orderNumber,
      },
    },
  });
}

function buildPurchaseConfirmationEmailHtml(input: {
  customerName: string;
  productName: string;
  orderNumber: string;
  totalInCents: number;
  memberAreaUrl?: string;
}) {
  const { renderEmailTemplate } = require('../../common/utils/email-template-renderer.util');
  const formattedAmount = formatBrlAmount(input.totalInCents / 100);
  const memberAreaSection = input.memberAreaUrl
    ? [
      '<p>Acesse sua area de membros: <a href="',
      escapeHtml(input.memberAreaUrl),
      '" style="color:',
      BRAND_COLORS.EMBER,
      ';">',
      escapeHtml(input.memberAreaUrl),
      '</a></p>',
    ].join('')
    : '<p>Se o produto tiver area de membros, seu acesso ja foi liberado automaticamente.</p>';
  return renderEmailTemplate('payment-confirmation', {
    customerName: input.customerName,
    productName: input.productName,
    orderNumber: input.orderNumber,
    formattedAmount,
    memberAreaSection,
  });
}
