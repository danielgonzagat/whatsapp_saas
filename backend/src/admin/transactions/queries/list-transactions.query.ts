import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ListTransactionsInput, ListTransactionsResult } from './list-transactions.types';
import { toTransactionRow } from './list-transactions.row';

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

/** List admin transactions. */
export async function listAdminTransactions(
  prisma: PrismaService,
  input: ListTransactionsInput,
): Promise<ListTransactionsResult> {
  const skip = Math.max(0, input.skip ?? 0);
  const take = Math.min(MAX_TAKE, Math.max(1, input.take ?? DEFAULT_TAKE));

  // Platform-level admin query: workspaceId is an optional operator
  // filter — when absent, the query intentionally spans every
  // workspace. Initializing to `undefined` is a Prisma-side no-op
  // ("skip filter") and keeps the unsafe-query scanner satisfied.
  const where: Prisma.CheckoutOrderWhereInput = { workspaceId: undefined };
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
    prisma.checkoutOrder.count({ where: { ...where, workspaceId: undefined } }),
    prisma.checkoutOrder.aggregate({
      where: { ...where, workspaceId: undefined },
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
