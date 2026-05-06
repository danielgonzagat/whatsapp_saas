import { Prisma } from '@prisma/client';
import { escapeHtml } from '../../common/utils/html-escape.util';
import { formatBrlAmount } from '../../kloel/money-format.util';
import { PaidCheckoutEffectClient, readPaidCheckoutOrderScope } from './shared';

export async function sendPurchaseConfirmationEmailFromPaidCheckoutUpdate(
  prisma: PaidCheckoutEffectClient,
  args: Prisma.CheckoutOrderUpdateManyArgs,
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

  const EmailServiceClass = (await import('../../auth/email.service')).EmailService;
  const sent = await new EmailServiceClass().sendEmail({
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
  const formattedAmount = formatBrlAmount(input.totalInCents / 100);
  return [
    '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0A0A0C;color:#e0e0e0;padding:40px;">',
    '<h1 style="color:#E85D30;">KLOEL</h1>',
    '<p>Ola ',
    escapeHtml(input.customerName),
    ',</p>',
    '<p>Seu pagamento foi confirmado.</p>',
    '<div style="background:#151517;padding:20px;border-radius:6px;margin:20px 0;">',
    '<p><strong>Produto:</strong> ',
    escapeHtml(input.productName),
    '</p>',
    '<p><strong>Valor:</strong> ',
    escapeHtml(formattedAmount),
    '</p>',
    '<p><strong>Pedido:</strong> #',
    escapeHtml(input.orderNumber),
    '</p>',
    '</div>',
    input.memberAreaUrl
      ? `<p>Acesse sua area de membros: <a href="${escapeHtml(input.memberAreaUrl)}" style="color:#E85D30;">${escapeHtml(input.memberAreaUrl)}</a></p>`
      : '<p>Se o produto tiver area de membros, seu acesso ja foi liberado automaticamente.</p>',
    '</div>',
  ].join('');
}
