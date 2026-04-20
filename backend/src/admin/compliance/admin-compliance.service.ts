import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveAdminHomeRange, type AdminHomePeriod } from '../dashboard/range.util';
import { listAdminTransactions } from '../transactions/queries/list-transactions.query';

type GatewayRiskRow = { gateway: string; count: number; totalInCents: number };

type WorkspaceRiskRow = {
  workspaceId: string;
  workspaceName: string | null;
  chargebackCount: number;
  refundCount: number;
  totalInCents: number;
};

type TransactionItem = {
  workspaceId: string;
  workspaceName: string | null;
  totalInCents: number;
  gateway: string | null;
};

function ensureGatewayRow(
  gatewayRisk: Map<string, GatewayRiskRow>,
  gatewayKey: string,
): GatewayRiskRow {
  const existing = gatewayRisk.get(gatewayKey);
  if (existing) {
    return existing;
  }
  const created: GatewayRiskRow = { gateway: gatewayKey, count: 0, totalInCents: 0 };
  gatewayRisk.set(gatewayKey, created);
  return created;
}

function ensureWorkspaceRow(
  workspaceRisk: Map<string, WorkspaceRiskRow>,
  item: TransactionItem,
): WorkspaceRiskRow {
  const existing = workspaceRisk.get(item.workspaceId);
  if (existing) {
    return existing;
  }
  const created: WorkspaceRiskRow = {
    workspaceId: item.workspaceId,
    workspaceName: item.workspaceName,
    chargebackCount: 0,
    refundCount: 0,
    totalInCents: 0,
  };
  workspaceRisk.set(item.workspaceId, created);
  return created;
}

function accumulateChargebacks(
  chargebackItems: TransactionItem[],
  gatewayRisk: Map<string, GatewayRiskRow>,
  workspaceRisk: Map<string, WorkspaceRiskRow>,
): void {
  for (const item of chargebackItems) {
    const gatewayKey = item.gateway ?? 'Sem gateway';
    const gatewayRow = ensureGatewayRow(gatewayRisk, gatewayKey);
    gatewayRow.count += 1;
    gatewayRow.totalInCents += item.totalInCents;

    const workspaceRow = ensureWorkspaceRow(workspaceRisk, item);
    workspaceRow.chargebackCount += 1;
    workspaceRow.totalInCents += item.totalInCents;
  }
}

function accumulateRefunds(
  refundItems: TransactionItem[],
  workspaceRisk: Map<string, WorkspaceRiskRow>,
): void {
  for (const item of refundItems) {
    const workspaceRow = ensureWorkspaceRow(workspaceRisk, item);
    workspaceRow.refundCount += 1;
    workspaceRow.totalInCents += item.totalInCents;
  }
}

type KycAgent = {
  id: string;
  name: string | null;
  email: string | null;
  kycStatus: string | null;
  workspace: { id: string; name: string | null };
};

type AuditItem = {
  id: string;
  action: string;
  entityId: string | null;
  createdAt: Date;
  adminUser: { name: string | null } | null;
  details: unknown;
};

function mapKycQueue(kycAgents: KycAgent[]) {
  return kycAgents.map((agent) => ({
    agentId: agent.id,
    workspaceId: agent.workspace.id,
    workspaceName: agent.workspace.name,
    ownerName: agent.name,
    ownerEmail: agent.email,
    kycStatus: agent.kycStatus,
  }));
}

function mapRecentKycEvents(auditItems: AuditItem[]) {
  return auditItems.map((item) => ({
    id: item.id,
    action: item.action,
    entityId: item.entityId,
    actorName: item.adminUser?.name ?? null,
    details: item.details,
    createdAt: item.createdAt.toISOString(),
  }));
}

/** Admin compliance service. */
@Injectable()
export class AdminComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(period: AdminHomePeriod, from?: Date, to?: Date) {
    const range = resolveAdminHomeRange({ period, compare: 'NONE', from, to });
    const [chargebacks, refunds, auditItems, kycAgents] = await Promise.all([
      this.fetchChargebacks(range),
      this.fetchRefunds(range),
      this.fetchKycAuditItems(range),
      this.fetchKycAgents(),
    ]);

    const gatewayRisk = new Map<string, GatewayRiskRow>();
    const workspaceRisk = new Map<string, WorkspaceRiskRow>();

    accumulateChargebacks(chargebacks.items, gatewayRisk, workspaceRisk);
    accumulateRefunds(refunds.items, workspaceRisk);

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
      kycQueue: mapKycQueue(kycAgents),
      recentKycEvents: mapRecentKycEvents(auditItems),
    };
  }

  private fetchChargebacks(range: { from: Date; to: Date }) {
    return listAdminTransactions(this.prisma, {
      status: OrderStatus.CHARGEBACK,
      from: range.from,
      to: range.to,
      take: 50,
    });
  }

  private fetchRefunds(range: { from: Date; to: Date }) {
    return listAdminTransactions(this.prisma, {
      status: OrderStatus.REFUNDED,
      from: range.from,
      to: range.to,
      take: 50,
    });
  }

  private fetchKycAuditItems(range: { from: Date; to: Date }) {
    return this.prisma.adminAuditLog.findMany({
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
    });
  }

  private fetchKycAgents() {
    return this.prisma.agent.findMany({
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
    });
  }
}
