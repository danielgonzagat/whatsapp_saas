import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';

interface NotificationPreferences {
  chargebacks: boolean;
  kyc: boolean;
  support: boolean;
  security: boolean;
  growth: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  chargebacks: true,
  kyc: true,
  support: true,
  security: true,
  growth: true,
};

/** Admin notifications service. */
@Injectable()
export class AdminNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(adminUserId: string) {
    const [chargebacks, pendingKyc, support, failedLogins, workspaceGrowth, readAudit, prefAudit] =
      await Promise.all([
        this.prisma.checkoutOrder.findMany({
          where: { status: 'CHARGEBACK' },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            orderNumber: true,
            totalInCents: true,
            workspaceId: true,
            updatedAt: true,
          },
        }),
        this.prisma.agent.findMany({
          where: { role: 'ADMIN', kycStatus: { in: ['pending', 'reverify'] } },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            name: true,
            updatedAt: true,
            workspace: { select: { id: true, name: true } },
          },
        }),
        this.prisma.conversation.findMany({
          where: { unreadCount: { gt: 0 } },
          orderBy: { lastMessageAt: 'desc' },
          take: 5,
          select: {
            id: true,
            lastMessageAt: true,
            workspace: { select: { id: true, name: true } },
            contact: { select: { name: true } },
          },
        }),
        this.prisma.adminLoginAttempt.count({
          where: {
            success: false,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        }),
        this.prisma.workspace.count({
          where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }),
        this.prisma.adminAuditLog.findMany({
          where: {
            adminUserId,
            action: 'admin.notifications.read',
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: { entityId: true },
        }),
        this.prisma.adminAuditLog.findFirst({
          where: {
            adminUserId,
            action: 'admin.notifications.preferences.updated',
          },
          orderBy: { createdAt: 'desc' },
          select: { details: true },
        }),
      ]);

    const chargebackWorkspaceIds = Array.from(new Set(chargebacks.map((row) => row.workspaceId)));
    const chargebackWorkspaces = await this.prisma.workspace.findMany({
      where: { id: { in: chargebackWorkspaceIds } },
      select: { id: true, name: true },
    });
    const chargebackWorkspaceMap = new Map(chargebackWorkspaces.map((row) => [row.id, row.name]));

    const readIds = new Set(readAudit.map((row) => row.entityId).filter(Boolean));
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...(prefAudit?.details &&
      typeof prefAudit.details === 'object' &&
      !Array.isArray(prefAudit.details)
        ? (prefAudit.details as Record<string, boolean>)
        : {}),
    } satisfies NotificationPreferences;

    const items = [
      ...chargebacks.map((row) => ({
        id: `chargeback:${row.id}`,
        type: 'chargeback',
        title: `Chargeback em ${chargebackWorkspaceMap.get(row.workspaceId) ?? row.workspaceId}`,
        body: `${row.orderNumber} em disputa por ${(row.totalInCents / 100).toFixed(2)} BRL`,
        createdAt: row.updatedAt.toISOString(),
        enabled: preferences.chargebacks,
      })),
      ...pendingKyc.map((row) => ({
        id: `kyc:${row.id}`,
        type: 'kyc',
        title: `KYC pendente em ${row.workspace.name}`,
        body: `${row.name} aguardando revisão operacional`,
        createdAt: row.updatedAt.toISOString(),
        enabled: preferences.kyc,
      })),
      ...support.map((row) => ({
        id: `support:${row.id}`,
        type: 'support',
        title: `Suporte pendente em ${row.workspace.name}`,
        body: `${row.contact.name || 'Contato'} com mensagens não lidas`,
        createdAt: row.lastMessageAt.toISOString(),
        enabled: preferences.support,
      })),
      failedLogins > 0
        ? {
            id: `security:failed-logins`,
            type: 'security',
            title: 'Tentativas falhas de login admin',
            body: `${failedLogins} tentativa(s) nas últimas 24h`,
            createdAt: new Date().toISOString(),
            enabled: preferences.security,
          }
        : null,
      workspaceGrowth > 0
        ? {
            id: `growth:new-workspaces`,
            type: 'growth',
            title: 'Novas contas criadas hoje',
            body: `${workspaceGrowth} workspace(s) novos nas últimas 24h`,
            createdAt: new Date().toISOString(),
            enabled: preferences.growth,
          }
        : null,
    ]
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => item.enabled)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => ({
        ...item,
        read: readIds.has(item.id),
      }));

    return {
      items,
      unreadCount: items.filter((item) => !item.read).length,
      preferences,
    };
  }

  async markRead(adminUserId: string, notificationId: string) {
    await this.audit.append({
      adminUserId,
      action: 'admin.notifications.read',
      entityType: 'AdminNotification',
      entityId: notificationId,
      details: { notificationId },
    });
    return { ok: true as const };
  }

  async updatePreferences(adminUserId: string, preferences: Partial<NotificationPreferences>) {
    await this.audit.append({
      adminUserId,
      action: 'admin.notifications.preferences.updated',
      entityType: 'AdminNotificationPreferences',
      entityId: adminUserId,
      details: {
        ...DEFAULT_PREFERENCES,
        ...preferences,
      },
    });
    return { ok: true as const };
  }
}
