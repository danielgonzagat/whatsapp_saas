import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminDashboardService } from '../dashboard/admin-dashboard.service';
import { listAdminTransactions } from '../transactions/queries/list-transactions.query';

/** Admin sales service. */
@Injectable()
export class AdminSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: AdminDashboardService,
  ) {}

  async overview(input: {
    search?: string;
    status?: OrderStatus;
    method?: PaymentMethod;
    gateway?: string;
  }) {
    const [home, transactions] = await Promise.all([
      this.dashboard.getHome('30D', 'NONE'),
      listAdminTransactions(this.prisma, {
        search: input.search,
        status: input.status,
        method: input.method,
        gateway: input.gateway,
        take: 80,
      }),
    ]);

    const items = transactions.items;
    const paidCount = items.filter((item) => item.status === OrderStatus.PAID).length;
    const pendingCount = items.filter(
      (item) => item.status === OrderStatus.PENDING || item.status === OrderStatus.PROCESSING,
    ).length;
    const refundedCount = items.filter((item) => item.status === OrderStatus.REFUNDED).length;
    const chargebackCount = items.filter((item) => item.status === OrderStatus.CHARGEBACK).length;
    const shippedCount = items.filter((item) => item.status === OrderStatus.SHIPPED).length;
    const deliveredCount = items.filter((item) => item.status === OrderStatus.DELIVERED).length;
    const chartMap = new Map<string, number>();
    for (const item of items) {
      const date = new Date(item.paidAt || item.createdAt).toLocaleDateString('pt-BR', {
        weekday: 'short',
      });
      chartMap.set(date, (chartMap.get(date) ?? 0) + item.totalInCents);
    }

    return {
      summary: {
        revenueKloelInCents: home.kpis.revenueKloel.value,
        gmvInCents: home.kpis.gmv.value,
        transactionCount: items.length,
        averageTicketInCents: home.kpis.averageTicket.value,
        mrrProjectedInCents: home.kpis.mrrProjected.value,
        churnRate: home.kpis.churnRate.value,
        arrProjectedInCents:
          home.kpis.mrrProjected.value !== null && home.kpis.mrrProjected.value !== undefined
            ? home.kpis.mrrProjected.value * 12
            : null,
        paidCount,
        pendingCount,
        refundedCount,
        chargebackCount,
        shippedCount,
        deliveredCount,
      },
      chart: Array.from(chartMap.entries()).map(([label, totalInCents]) => ({
        label,
        totalInCents,
      })),
      gatewayOptions: Array.from(new Set(items.map((item) => item.gateway).filter(Boolean))).sort(),
      items,
    };
  }
}
