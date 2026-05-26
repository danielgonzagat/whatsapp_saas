import { StructuredLogger } from '../logging/structured-logger';
import { randomIdSegment } from '../common/random-id';
import * as QRCode from 'qrcode';
import type { PrismaService } from '../prisma/prisma.service';
import type { SmartPaymentService } from './smart-payment.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';
import { centsFromUnknown } from './kloel-chat-tools.service';export interface ToolDashboardSummaryArgs {
  period?: 'today' | 'week' | 'month';
}const logger = StructuredLogger.from('KloelChatToolsDashboardPayments');

export async function runGetDashboardSummary(
  prisma: PrismaService,
  workspaceId: string,
  args: ToolDashboardSummaryArgs,
): Promise<ToolResult> {
  const period = args.period || 'today';
  let dateFilter: Date;
  switch (period) {
    case 'week':
      dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      dateFilter = new Date();
      dateFilter.setHours(0, 0, 0, 0);
  }
  const [contacts, messages, flows, paidOrders, wallet] = await Promise.all([
    prisma.contact.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
    prisma.message.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
    prisma.flow.count({ where: { workspaceId, isActive: true } }),
    prisma.checkoutOrder.aggregate({
      where: { workspaceId, status: 'PAID', paidAt: { gte: dateFilter } },
      _count: { _all: true },
      _sum: { totalInCents: true },
    }),
    prisma.kloelWallet.findUnique({
      where: { workspaceId },
      select: {
        availableBalanceInCents: true,
        pendingBalanceInCents: true,
        blockedBalanceInCents: true,
      },
    }),
  ]);
  const revenueInCents = paidOrders._sum.totalInCents || 0;
  const availableInCents = centsFromUnknown(wallet?.availableBalanceInCents);
  const pendingInCents = centsFromUnknown(wallet?.pendingBalanceInCents);
  const blockedInCents = centsFromUnknown(wallet?.blockedBalanceInCents);
  const totalInCents = availableInCents + pendingInCents + blockedInCents;
  return {
    success: true,
    period,
    stats: {
      newContacts: contacts,
      messages,
      activeFlows: flows,
      paidOrders: paidOrders._count._all,
      revenueInCents,
      revenue: revenueInCents / 100,
      wallet: {
        availableInCents,
        pendingInCents,
        blockedInCents,
        totalInCents,
        available: availableInCents / 100,
        pending: pendingInCents / 100,
        blocked: blockedInCents / 100,
        total: totalInCents / 100,
      },
    },
  };
}export async function runCreatePaymentLink(
  prisma: PrismaService,
  smartPaymentService: SmartPaymentService,
  workspaceId: string,
  args: { amount: number; description: string; customerName?: string },
): Promise<ToolResult> {
  logger.log('Payment operation', {
    context: 'KloelChatTools.toolCreatePaymentLink',
    action: 'createSmartPayment',
    amount: Number(args.amount) || 0,
    hasDescription: !!args.description,
  });
  // Dev mode: skip real payment processing, return mock PIX + create sale record
  if (process.env.NODE_ENV !== 'production') {
    const mockAmount = Number(args.amount) || 0;
    const mockId = `pay_dev_${Date.now().toString(36)}`;
    const customerName = args.customerName || 'Cliente';
    // Create contact for buyer (CRM memory)
    if (args.customerName) {
      try {
        const existing = await prisma.contact.findFirst({
          where: { workspaceId, name: customerName },
        });
        if (existing) {
          await prisma.contact.update({
            where: { id: existing.id },
            data: { updatedAt: new Date() },
          });
        } else {
          await prisma.contact.create({
            data: { workspaceId, name: customerName, phone: '', leadScore: 30 },
          });
        }
      } catch { /* non-blocking */ }
    }
    // Create sale record for reporting
    try {
      await prisma.kloelSale.create({
        data: {
          workspaceId,
          externalPaymentId: mockId,
          productName: args.description || 'Produto',
          amount: mockAmount,
          status: 'pending',
          paymentMethod: 'PIX',
          ...(args.customerName ? { leadPhone: args.customerName } : {}),
        },
      });
    } catch { /* non-blocking */ }
    // Generate real QR code as base64
    let qrCodeBase64 = '';
    const pixPayload = `00020126580014BR.GOV.BCB.PIX0136${mockId}520400005303986540${mockAmount.toFixed(2)}5802BR5925${customerName}6009SAO PAULO62070503***6304${randomIdSegment(4).toUpperCase()}`;
    try {
      qrCodeBase64 = await QRCode.toDataURL(pixPayload, { width: 300, margin: 2 });
    } catch { /* non-blocking */ }
    return {
      success: true,
      paymentId: mockId,
      pixCopyPaste: pixPayload,
      pixQrCode: qrCodeBase64 || undefined,
      billingType: 'PIX',
      customerName,
      message: `PIX de R$ ${mockAmount.toFixed(2)} gerado para ${customerName}.`,
    };
  }
  const paymentResult = await smartPaymentService.createSmartPayment({
    workspaceId,
    amount: Number(args.amount) || 0,
    productName: args.description,
    customerName: args.customerName || 'Cliente',
    phone: '',
  });
  return { success: true, ...paymentResult };
}export async function runCreateOrder(
  prisma: PrismaService,
  workspaceId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const amount = typeof args.amount === 'number' ? args.amount : 0;
  const productName = typeof args.productName === 'string' ? args.productName : typeof args.description === 'string' ? args.description : 'Produto';
  const customerName = typeof args.customerName === 'string' ? args.customerName : 'Cliente';
  if (!amount) {return { success: false, error: 'Informe o valor da venda (ex: R$ 147).' };}
  try {
    const sale = await prisma.kloelSale.create({
      data: {
        workspaceId,
        externalPaymentId: `ord_${Date.now().toString(36)}`,
        productName,
        amount,
        status: 'pending',
        paymentMethod: 'MANUAL',
        leadPhone: customerName,
      },
    });
    if (customerName && customerName !== 'Cliente') {
      try {
        const existing = await prisma.contact.findFirst({ where: { workspaceId, name: customerName } });
        if (!existing) {
          await prisma.contact.create({ data: { workspaceId, name: customerName, phone: '', leadScore: 50 } });
        }
      } catch { /* non-blocking */ }
    }
    return { success: true, saleId: sale.id, amount, customerName, productName, message: `Venda criada: ${productName} - R$ ${amount.toFixed(2)} para ${customerName}.` };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro ao criar venda.' };
  }
}