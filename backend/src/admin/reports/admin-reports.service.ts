import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminDashboardService } from '../dashboard/admin-dashboard.service';
import { resolveAdminHomeRange, type AdminHomePeriod } from '../dashboard/range.util';
import { listAdminTransactions } from '../transactions/queries/list-transactions.query';

/** Admin reports service. */
@Injectable()
export class AdminReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: AdminDashboardService,
    private readonly audit: AdminAuditService,
  ) {}

  /** Overview. */
  async overview(period: AdminHomePeriod, from?: Date, to?: Date) {
    const [snapshot, exportHistory] = await Promise.all([
      this.dashboard.getHome(period, 'NONE', from, to),
      this.prisma.adminAuditLog.findMany({
        where: { action: { startsWith: 'admin.reports.export' } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          createdAt: true,
          adminUser: { select: { name: true } },
          details: true,
        },
      }),
    ]);

    return {
      snapshot,
      exportHistory: exportHistory.map((row) => ({
        id: row.id,
        action: row.action,
        actorName: row.adminUser?.name ?? null,
        createdAt: row.createdAt.toISOString(),
        details: row.details,
      })),
    };
  }

  /** Export csv rows. */
  async exportCsvRows(
    period: AdminHomePeriod,
    actorId: string,
    from?: Date,
    to?: Date,
  ): Promise<Array<Record<string, unknown>>> {
    const range = resolveAdminHomeRange({ period, compare: 'NONE', from, to });
    const rows = await listAdminTransactions(this.prisma, {
      from: range.from,
      to: range.to,
      take: 500,
    });

    await this.audit.append({
      adminUserId: actorId,
      action: 'admin.reports.export.csv',
      entityType: 'Report',
      entityId: 'sales-overview',
      details: {
        period,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        rowCount: rows.items.length,
      },
    });

    return rows.items.map((item) => ({
      orderNumber: item.orderNumber,
      workspace: item.workspaceName || item.workspaceId,
      customerName: item.customerName,
      customerEmail: item.customerEmail,
      paymentMethod: item.paymentMethod,
      status: item.status,
      gateway: item.gateway || '',
      totalInCents: item.totalInCents,
      totalBRL: (item.totalInCents / 100).toFixed(2),
      paidAt: item.paidAt || '',
    }));
  }
}
