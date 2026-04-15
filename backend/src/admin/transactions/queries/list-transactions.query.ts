import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export interface AdminTransactionRow {
  id: string;
  orderNumber: string;
  workspaceId: string;
  workspaceName: string | null;
  customerEmail: string;
  customerName: string;
  customerCPF: string | null;
  totalInCents: number;
  subtotalInCents: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: string | null;
  gateway: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  installments: number;
  createdAt: string;
  paidAt: string | null;
  affiliateId: string | null;
}

export interface ListTransactionsInput {
  search?: string;
  status?: OrderStatus;
  method?: PaymentMethod;
  gateway?: string;
  workspaceId?: string;
  from?: Date;
  to?: Date;
  skip?: number;
  take?: number;
}

export interface ListTransactionsResult {
  items: AdminTransactionRow[];
  total: number;
  sum: { totalInCents: number };
}

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

export async function listAdminTransactions(
  prisma: PrismaService,
  input: ListTransactionsInput,
): Promise<ListTransactionsResult> {
  const skip = Math.max(0, input.skip ?? 0);
  const take = Math.min(MAX_TAKE, Math.max(1, input.take ?? DEFAULT_TAKE));

  const where: Prisma.CheckoutOrderWhereInput = {};
  if (input.workspaceId) where.workspaceId = input.workspaceId;
  if (input.status) where.status = input.status;
  if (input.method) where.paymentMethod = input.method;
  if (input.gateway) where.payment = { gateway: input.gateway };
  if (input.from || input.to) {
    where.createdAt = {};
    if (input.from) where.createdAt.gte = input.from;
    if (input.to) where.createdAt.lte = input.to;
  }
  if (input.search) {
    where.OR = [
      { orderNumber: { contains: input.search, mode: 'insensitive' } },
      { customerEmail: { contains: input.search, mode: 'insensitive' } },
      { customerName: { contains: input.search, mode: 'insensitive' } },
    ];
  }

  const [items, total, sum] = await prisma.$transaction([
    prisma.checkoutOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        orderNumber: true,
        workspaceId: true,
        customerEmail: true,
        customerName: true,
        customerCPF: true,
        totalInCents: true,
        subtotalInCents: true,
        status: true,
        paymentMethod: true,
        installments: true,
        affiliateId: true,
        createdAt: true,
        paidAt: true,
        payment: {
          select: {
            gateway: true,
            status: true,
            cardBrand: true,
            cardLast4: true,
          },
        },
      },
    }),
    prisma.checkoutOrder.count({ where }),
    prisma.checkoutOrder.aggregate({
      where,
      _sum: { totalInCents: true },
    }),
  ]);

  if (items.length === 0) {
    return {
      items: [],
      total,
      sum: { totalInCents: Number(sum._sum.totalInCents ?? 0) },
    };
  }

  // Hydrate workspace names in one batch.
  const workspaceIds = Array.from(new Set(items.map((i) => i.workspaceId)));
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: workspaceIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(workspaces.map((w) => [w.id, w.name]));

  return {
    items: items.map((i) => ({
      id: i.id,
      orderNumber: i.orderNumber,
      workspaceId: i.workspaceId,
      workspaceName: nameMap.get(i.workspaceId) ?? null,
      customerEmail: i.customerEmail,
      customerName: i.customerName,
      customerCPF: i.customerCPF,
      totalInCents: i.totalInCents,
      subtotalInCents: i.subtotalInCents,
      status: i.status,
      paymentMethod: i.paymentMethod,
      paymentStatus: i.payment?.status ?? null,
      gateway: i.payment?.gateway ?? null,
      cardBrand: i.payment?.cardBrand ?? null,
      cardLast4: i.payment?.cardLast4 ?? null,
      installments: i.installments,
      createdAt: i.createdAt.toISOString(),
      paidAt: i.paidAt?.toISOString() ?? null,
      affiliateId: i.affiliateId,
    })),
    total,
    sum: { totalInCents: Number(sum._sum.totalInCents ?? 0) },
  };
}
