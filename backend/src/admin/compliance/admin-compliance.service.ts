import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveAdminHomeRange, type AdminHomePeriod } from '../dashboard/range.util';
import { listAdminTransactions } from '../transactions/queries/list-transactions.query';

@Injectable()
export class AdminComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(period: AdminHomePeriod, from?: Date, to?: Date) {
    const range = resolveAdminHomeRange({ period, compare: 'NONE', from, to });
    const [chargebacks, refunds, auditItems, kycAgents] = await Promise.all([
      listAdminTransactions(this.prisma, {
        status: OrderStatus.CHARGEBACK,
        from: range.from,
        to: range.to,
        take: 50,
      }),
      listAdminTransactions(this.prisma, {
        status: OrderStatus.REFUNDED,
        from: range.from,
        to: range.to,
        take: 50,
      }),
      this.prisma.adminAuditLog.findMany({
        where: {
          createdAt: { gte: range.from, lte: range.to },
          action: { contains: 'kyc' },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          action: true,
          entityId: true,
          createdAt: true,
          adminUser: { select: { name: true } },
          details: true,
        },
      }),
      this.prisma.agent.findMany({
        where: {
          role: 'ADMIN',
          kycStatus: { in: ['pending', 'reverify', 'rejected'] },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          name: true,
          email: true,
          kycStatus: true,
          workspace: { select: { id: true, name: true } },
        },
      }),
    ]);

    const gatewayRisk = new Map<string, { gateway: string; count: number; totalInCents: number }>();
    const workspaceRisk = new Map<
      string,
      {
        workspaceId: string;
        workspaceName: string | null;
        chargebackCount: number;
        refundCount: number;
        totalInCents: number;
      }
    >();

    for (const item of chargebacks.items) {
      const gatewayKey = item.gateway ?? 'Sem gateway';
      const gatewayRow = gatewayRisk.get(gatewayKey) ?? {
        gateway: gatewayKey,
        count: 0,
        totalInCents: 0,
      };
      gatewayRow.count += 1;
      gatewayRow.totalInCents += item.totalInCents;
      gatewayRisk.set(gatewayKey, gatewayRow);

      const workspaceRow = workspaceRisk.get(item.workspaceId) ?? {
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        chargebackCount: 0,
        refundCount: 0,
        totalInCents: 0,
      };
      workspaceRow.chargebackCount += 1;
      workspaceRow.totalInCents += item.totalInCents;
      workspaceRisk.set(item.workspaceId, workspaceRow);
    }

    for (const item of refunds.items) {
      const workspaceRow = workspaceRisk.get(item.workspaceId) ?? {
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        chargebackCount: 0,
        refundCount: 0,
        totalInCents: 0,
      };
      workspaceRow.refundCount += 1;
      workspaceRow.totalInCents += item.totalInCents;
      workspaceRisk.set(item.workspaceId, workspaceRow);
    }

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        label: range.label,
        period: range.period,
      },
      summary: {
        chargebackCount: chargebacks.total,
        chargebackAmountInCents: chargebacks.sum.totalInCents,
        refundCount: refunds.total,
        refundAmountInCents: refunds.sum.totalInCents,
        kycEventsCount: auditItems.length,
      },
      chargebacks: chargebacks.items,
      refunds: refunds.items,
      riskByGateway: Array.from(gatewayRisk.values()).sort(
        (left, right) => right.count - left.count,
      ),
      riskByWorkspace: Array.from(workspaceRisk.values()).sort(
        (left, right) => right.totalInCents - left.totalInCents,
      ),
      kycQueue: kycAgents.map((agent) => ({
        agentId: agent.id,
        workspaceId: agent.workspace.id,
        workspaceName: agent.workspace.name,
        ownerName: agent.name,
        ownerEmail: agent.email,
        kycStatus: agent.kycStatus,
      })),
      recentKycEvents: auditItems.map((item) => ({
        id: item.id,
        action: item.action,
        entityId: item.entityId,
        actorName: item.adminUser?.name ?? null,
        details: item.details,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }
}
