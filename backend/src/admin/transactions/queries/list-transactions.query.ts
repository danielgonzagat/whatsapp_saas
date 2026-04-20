import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { toTransactionRow } from './list-transactions.row';

/** Admin transaction row shape. */
export interface AdminTransactionRow {
  /** Id property. */
  id: string;
  /** Order number property. */
  orderNumber: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Workspace name property. */
  workspaceName: string | null;
  /** Customer email property. */
  customerEmail: string;
  /** Customer name property. */
  customerName: string;
  /** Customer cpf property. */
  customerCPF: string | null;
  /** Total in cents property. */
  totalInCents: number;
  /** Subtotal in cents property. */
  subtotalInCents: number;
  /** Status property. */
  status: OrderStatus;
  /** Payment method property. */
  paymentMethod: PaymentMethod;
  /** Payment status property. */
  paymentStatus: string | null;
  /** Gateway property. */
  gateway: string | null;
  /** Card brand property. */
  cardBrand: string | null;
  /** Card last4 property. */
  cardLast4: string | null;
  /** Installments property. */
  installments: number;
  /** Created at property. */
  createdAt: string;
  /** Paid at property. */
  paidAt: string | null;
  /** Affiliate id property. */
  affiliateId: string | null;
}

/** List transactions input shape. */
export interface ListTransactionsInput {
  /** Search property. */
  search?: string;
  /** Status property. */
  status?: OrderStatus;
  /** Method property. */
  method?: PaymentMethod;
  /** Gateway property. */
  gateway?: string;
  /** Workspace id property. */
  workspaceId?: string;
  /** From property. */
  from?: Date;
  /** To property. */
  to?: Date;
  /** Skip property. */
  skip?: number;
  /** Take property. */
  take?: number;
}

/** List transactions result shape. */
export interface ListTransactionsResult {
  /** Items property. */
  items: AdminTransactionRow[];
  /** Total property. */
  total: number;
  /** Sum property. */
  sum: { totalInCents: number };
}

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

/** List admin transactions. */
export async function listAdminTransactions(
  prisma: PrismaService,
  input: ListTransactionsInput,
): Promise<ListTransactionsResult> {
  const skip = Math.max(0, input.skip ?? 0);
  const take = Math.min(MAX_TAKE, Math.max(1, input.take ?? DEFAULT_TAKE));

  const where: Prisma.CheckoutOrderWhereInput = {};
  if (input.workspaceId) {
    where.workspaceId = input.workspaceId;
  }
  if (input.status) {
    where.status = input.status;
  }
  if (input.method) {
    where.paymentMethod = input.method;
  }
  if (input.gateway) {
    where.payment = { gateway: input.gateway };
  }
  if (input.from || input.to) {
    where.createdAt = {};
    if (input.from) {
      where.createdAt.gte = input.from;
    }
    if (input.to) {
      where.createdAt.lte = input.to;
    }
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
    items: items.map((i) => toTransactionRow(i, nameMap)),
    total,
    sum: { totalInCents: Number(sum._sum.totalInCents ?? 0) },
  };
}
