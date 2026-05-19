import { Prisma } from '@prisma/client';
import { flowQueue } from '../../queue/queue';
import { formatBrlAmount } from '../../kloel/money-format.util';
import { PaidCheckoutEffectClient, readPaidCheckoutOrderScope } from './shared';

const DIGITS_RE = /\D/g;

function normalizePhone(phone: string | null) {
  const digits = String(phone || '').replace(DIGITS_RE, '');
  return digits.length >= 10 ? digits : null;
}

function readOptInFlag(customFields: Prisma.JsonValue | null | undefined) {
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) {
    return false;
  }
  return customFields.optin === true || customFields.optin_whatsapp === true;
}

function canSendTransactionalWhatsapp(input: {
  contact: {
    optIn: boolean | null;
    tags: { name: string }[];
    customFields: Prisma.JsonValue | null;
  } | null;
}) {
  if (input.contact?.optIn === false) {
    return false;
  }
  if (process.env.ENFORCE_OPTIN !== 'true') {
    return true;
  }
  const hasOptIn =
    input.contact?.optIn === true ||
    input.contact?.tags.some((tag) => tag.name === 'optin_whatsapp') ||
    readOptInFlag(input.contact?.customFields);
  return Boolean(hasOptIn);
}

function buildPurchaseWhatsappMessage(input: {
  customerName: string;
  productName: string;
  orderNumber: string;
  totalInCents: number;
  memberAreaUrl?: string;
}) {
  const lines = [
    `Pagamento confirmado, ${input.customerName}.`,
    `Produto: ${input.productName}`,
    `Valor: ${formatBrlAmount(input.totalInCents / 100)}`,
    `Pedido: #${input.orderNumber}`,
  ];
  if (input.memberAreaUrl) {
    lines.push(`Acesso: ${input.memberAreaUrl}`);
  }
  return lines.join('\n');
}

export async function enqueuePurchaseWhatsappFromPaidCheckoutUpdate(
  prisma: PaidCheckoutEffectClient,
  args: Prisma.CheckoutOrderUpdateManyArgs,
) {
  const scope = args.data.status === 'PAID' ? readPaidCheckoutOrderScope(args) : null;
  if (!scope) {
    return;
  }

  const existing = await prisma.auditLog.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      action: 'whatsapp_purchase_notification_enqueued',
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
      customerPhone: true,
      totalInCents: true,
      plan: {
        select: {
          productId: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  const phone = normalizePhone(order?.customerPhone || null);
  if (!order || order.workspaceId !== scope.workspaceId || !phone) {
    return;
  }

  const contact = await prisma.contact.findUnique({
    where: { workspaceId_phone: { workspaceId: scope.workspaceId, phone } },
    select: {
      optIn: true,
      customFields: true,
      tags: { select: { name: true } },
    },
  });
  if (!canSendTransactionalWhatsapp({ contact })) {
    await prisma.auditLog.create({
      data: {
        workspaceId: scope.workspaceId,
        action: 'whatsapp_purchase_notification_skipped',
        resource: 'CheckoutOrder',
        resourceId: order.id,
        details: { reason: 'opt_in_required_or_opted_out', phoneLast4: phone.slice(-4) },
      },
    });
    return;
  }

  const memberArea = await prisma.memberArea.findFirst({
    where: { workspaceId: scope.workspaceId, productId: order.plan.productId, active: true },
    select: { slug: true },
  });
  const jobId = `checkout-paid-whatsapp:${scope.workspaceId}:${order.id}`;
  await flowQueue.add(
    'send-message',
    {
      workspaceId: scope.workspaceId,
      to: phone,
      user: phone,
      message: buildPurchaseWhatsappMessage({
        customerName: order.customerName || 'cliente',
        productName: order.plan.product?.name || 'Seu pedido',
        orderNumber: order.orderNumber || order.id,
        totalInCents: order.totalInCents,
        ...(memberArea?.slug ? { memberAreaUrl: `/area/${memberArea.slug}` } : {}),
      }),
      externalId: jobId,
    },
    { jobId, removeOnComplete: true },
  );

  await prisma.auditLog.create({
    data: {
      workspaceId: scope.workspaceId,
      action: 'whatsapp_purchase_notification_enqueued',
      resource: 'CheckoutOrder',
      resourceId: order.id,
      details: {
        jobId,
        orderNumber: order.orderNumber,
        phoneLast4: phone.slice(-4),
      },
    },
  });
}
