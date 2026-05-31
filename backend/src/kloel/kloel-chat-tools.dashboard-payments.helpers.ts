import { StructuredLogger } from '../logging/structured-logger';
import type { PrismaService } from '../prisma/prisma.service';
import type { SmartPaymentService } from './smart-payment.service';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';
import { centsFromUnknown } from './kloel-chat-tools.service';
export interface ToolDashboardSummaryArgs {
  period?: 'today' | 'week' | 'month';
}
const logger = StructuredLogger.from('KloelChatToolsDashboardPayments');

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
}
export async function runCreatePaymentLink(
  _prisma: PrismaService,
  smartPaymentService: SmartPaymentService,
  workspaceId: string,
  args: {
    amount: number;
    description: string;
    customerName?: string;
    executionPath?: 'dispatcher';
  },
): Promise<ToolResult> {
  if (args.executionPath !== 'dispatcher') {
    return {
      success: false,
      error: 'canonical_dispatcher_required',
      message:
        'create_payment_link must be executed through the canonical dispatcher receipt path.',
    };
  }

  logger.log('Payment operation', {
    context: 'KloelChatTools.toolCreatePaymentLink',
    action: 'createSmartPayment',
    amount: Number(args.amount) || 0,
    hasDescription: !!args.description,
  });
  const paymentResult = await smartPaymentService.createSmartPayment({
    workspaceId,
    amount: Number(args.amount) || 0,
    productName: args.description,
    customerName: args.customerName || 'Cliente',
    phone: '',
  });
  return { success: true, ...paymentResult };
}
export function runCreateOrder(
  _prisma: PrismaService,
  _workspaceId: string,
  _args: Record<string, unknown>,
): Promise<ToolResult> {
  return Promise.resolve({
    success: false,
    error: 'canonical_order_service_required',
    message:
      'create_order must be executed through the canonical CheckoutService/domain capability path before it can create a real sale.',
  });
}
