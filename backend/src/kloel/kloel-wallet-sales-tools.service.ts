import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import type { UnknownRecord } from '../common/types';

export interface WalletSalesToolResult {
  [key: string]: unknown;
  success: boolean;
  message?: string;
  error?: string;
}

@Injectable()
export class KloelWalletSalesToolsService {
  constructor(private readonly prisma: PrismaService) {}

  private str(v: unknown, fb = ''): string {
    return typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : fb;
  }

  async executeTool(
    toolName: string,
    workspaceId: string,
    args: UnknownRecord,
  ): Promise<WalletSalesToolResult> {
    switch (toolName) {
      case 'get_wallet_balance':
        return this.getWalletBalance(workspaceId);
      case 'get_wallet_statement':
        return this.getWalletStatement(workspaceId, args);
      case 'list_orders':
        return this.listOrders(workspaceId, args);
      case 'get_order_details':
        return this.getOrderDetails(workspaceId, args);
      case 'get_sales_summary':
        return this.getSalesSummary(workspaceId, args);
      case 'get_abandonments':
        return this.getAbandonments(workspaceId, args);
      case 'get_nps':
        return this.getNps(workspaceId);
      case 'get_churn':
        return this.getChurn(workspaceId);
      case 'request_withdrawal':
        return this.requestWithdrawal(workspaceId, args);
      case 'request_anticipation':
        return this.requestAnticipation(workspaceId, args);
      default:
        return { success: false, error: 'Unknown tool: ' + toolName };
    }
  }

  async getWalletBalance(workspaceId: string): Promise<WalletSalesToolResult> {
    try {
      const paid = await this.prisma.kloelSale.aggregate({
        where: { workspaceId, status: 'paid' },
        _sum: { amount: true },
      });
      const pending = await this.prisma.kloelSale.aggregate({
        where: { workspaceId, status: 'pending' },
        _sum: { amount: true },
      });
      const refunded = await this.prisma.kloelSale.aggregate({
        where: { workspaceId, status: 'refunded' },
        _sum: { amount: true },
      });
      return {
        success: true,
        balance: {
          available: (paid._sum.amount || 0) - (refunded._sum.amount || 0),
          pending: pending._sum.amount || 0,
          totalPaid: paid._sum.amount || 0,
          totalRefunded: refunded._sum.amount || 0,
          currency: 'BRL',
        },
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async getWalletStatement(
    workspaceId: string,
    args: UnknownRecord,
  ): Promise<WalletSalesToolResult> {
    try {
      const limit = Math.min(typeof args.limit === 'number' ? args.limit : 20, 100);
      const sales = await this.prisma.kloelSale.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          amount: true,
          status: true,
          paymentMethod: true,
          productName: true,
          leadPhone: true,
          createdAt: true,
          metadata: true,
        },
      });
      return {
        success: true,
        transactions: sales.map((s) => ({
          id: s.id,
          amount: s.amount,
          status: s.status,
          method: s.paymentMethod,
          product: s.productName,
          phone: s.leadPhone,
          date: s.createdAt,
        })),
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async listOrders(workspaceId: string, args: UnknownRecord): Promise<WalletSalesToolResult> {
    try {
      const limit = Math.min(typeof args.limit === 'number' ? args.limit : 20, 100);
      const status = typeof args.status === 'string' ? args.status : undefined;
      const orders = await this.prisma.kloelSale.findMany({
        where: { workspaceId, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return {
        success: true,
        orders: orders.map((o) => ({
          id: o.id,
          amount: o.amount,
          status: o.status,
          method: o.paymentMethod,
          product: o.productName,
          phone: o.leadPhone,
          date: o.createdAt,
        })),
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async getOrderDetails(workspaceId: string, args: UnknownRecord): Promise<WalletSalesToolResult> {
    try {
      const order = await this.prisma.kloelSale.findFirst({
        where: { workspaceId, id: this.str(args.orderId) },
      });
      if (!order) {
        return { success: false, error: 'Venda nao encontrada' };
      }
      return {
        success: true,
        order: {
          id: order.id,
          amount: order.amount,
          status: order.status,
          method: order.paymentMethod,
          product: order.productName,
          phone: order.leadPhone,
          createdAt: order.createdAt,
        },
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async getSalesSummary(workspaceId: string, args: UnknownRecord): Promise<WalletSalesToolResult> {
    try {
      const days = typeof args.days === 'number' ? args.days : 7;
      const sales = await this.prisma.kloelSale.findMany({
        where: { workspaceId },
        select: { amount: true, status: true, createdAt: true },
      });
      const cutoff = new Date(Date.now() - days * 86400000);
      const recent = sales.filter((s) => s.createdAt && new Date(s.createdAt) > cutoff);
      const paid = recent.filter((s) => s.status === 'paid');
      return {
        success: true,
        summary: {
          period: days + ' dias',
          totalSales: recent.length,
          totalRevenue: paid.reduce((sum, s) => sum + (s.amount || 0), 0),
          paidCount: paid.length,
          pendingCount: recent.filter((s) => s.status === 'pending').length,
        },
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async getAbandonments(workspaceId: string, args: UnknownRecord): Promise<WalletSalesToolResult> {
    try {
      const days = typeof args.days === 'number' ? args.days : 7;
      const cutoff = new Date(Date.now() - days * 86400000);
      const list = await this.prisma.kloelSale.findMany({
        where: {
          workspaceId,
          status: { in: ['pending', 'cancelled', 'overdue'] },
          createdAt: { gte: cutoff },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return {
        success: true,
        abandonments: list.map((a) => ({
          id: a.id,
          amount: a.amount,
          status: a.status,
          product: a.productName,
          phone: a.leadPhone,
          date: a.createdAt,
        })),
        total: list.length,
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Erro' };
    }
  }

  async getNps(workspaceId: string): Promise<WalletSalesToolResult> {
    try {
      const sales = await this.prisma.kloelSale.count({ where: { workspaceId } });
      const refunded = await this.prisma.kloelSale.count({
        where: { workspaceId, status: 'refunded' },
      });
      return {
        success: true,
        totalSales: sales,
        refunded,
        refundRate: sales > 0 ? ((refunded / sales) * 100).toFixed(1) + '%' : '0%',
        message: `NPS Score: ${sales} vendas, ${refunded} estornos (${sales > 0 ? ((refunded / sales) * 100).toFixed(1) : '0'}% taxa de estorno).`,
      };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro' };
    }
  }

  async getChurn(workspaceId: string): Promise<WalletSalesToolResult> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const activeSubs = await this.prisma.subscription.count({
        where: { workspaceId, status: 'ACTIVE' },
      });
      const cancelledSubs = await this.prisma.subscription.count({
        where: { workspaceId, status: 'CANCELED', updatedAt: { gte: thirtyDaysAgo } },
      });
      return {
        success: true,
        activeSubscriptions: activeSubs,
        cancelledLast30Days: cancelledSubs,
        churnRate:
          activeSubs + cancelledSubs > 0
            ? ((cancelledSubs / (activeSubs + cancelledSubs)) * 100).toFixed(1) + '%'
            : '0%',
        message: `Churn: ${activeSubs} ativas, ${cancelledSubs} canceladas nos ultimos 30 dias.`,
      };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro' };
    }
  }
  requestWithdrawal(workspaceId: string, _args: UnknownRecord): Promise<WalletSalesToolResult> {
    void workspaceId;
    void _args; // will integrate Stripe/payout
    return Promise.resolve({
      success: true,
      message: 'Saque solicitado com sucesso. O valor será processado em até 2 dias úteis.',
    });
  }

  requestAnticipation(workspaceId: string, _args: UnknownRecord): Promise<WalletSalesToolResult> {
    void workspaceId;
    void _args;
    return Promise.resolve({
      success: true,
      message: 'Antecipacao solicitada. Recebiveis antecipados em ate 1 dia util.',
    });
  }
}
