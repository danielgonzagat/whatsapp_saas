import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  listAdminTransactions,
  type AdminTransactionRow,
  type ListTransactionsInput,
  type ListTransactionsResult,
} from './queries/list-transactions.query';

@Injectable()
export class AdminTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: ListTransactionsInput): Promise<ListTransactionsResult> {
    return listAdminTransactions(this.prisma, input);
  }
}

// Re-exported so downstream types can name them. Both are already consumed
// by the service method signature above — knip sees them as used.
export type { AdminTransactionRow, ListTransactionsResult };
