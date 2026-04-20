import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { asProviderSettings } from '../../whatsapp/provider-settings.types';
import { AdminAuditService } from '../audit/admin-audit.service';
import { adminErrors } from '../common/admin-api-errors';

/** Admin config workspace row shape. */
export interface AdminConfigWorkspaceRow {
  /** Workspace id property. */
  workspaceId: string;
  /** Name property. */
  name: string;
  /** Custom domain property. */
  customDomain: string | null;
  /** Guest mode property. */
  guestMode: boolean;
  /** Autopilot enabled property. */
  autopilotEnabled: boolean;
  /** Auth mode property. */
  authMode: string | null;
  /** Api keys count property. */
  apiKeysCount: number;
  /** Webhook subscriptions count property. */
  webhookSubscriptionsCount: number;
  /** Updated at property. */
  updatedAt: string;
}

/** Admin config overview response shape. */
export interface AdminConfigOverviewResponse {
  /** Metrics property. */
  metrics: {
    totalWorkspaces: number;
    customDomainsActive: number;
    apiKeysActive: number;
    webhookSubscriptions: number;
    autopilotEnabled: number;
  };
  /** Workspaces property. */
  workspaces: AdminConfigWorkspaceRow[];
}

/** Admin config service. */
@Injectable()
export class AdminConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  /** Overview. */
  async overview(search?: string): Promise<AdminConfigOverviewResponse> {
    const where: Prisma.WorkspaceWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { customDomain: { contains: search, mode: 'insensitive' } },
            {
              agents: {
                some: {
                  email: { contains: search, mode: 'insensitive' },
                },
              },
            },
          ],
        }
      : {};

    const [totalWorkspaces, customDomainsActive, apiKeysActive, webhookSubscriptions, workspaces] =
      await this.prisma.$transaction([
        this.prisma.workspace.count({ where }),
        this.prisma.workspace.count({
          where: {
            ...where,
            customDomain: { not: null },
          },
        }),
        this.prisma.apiKey.count({
          where: {
            workspace: where,
          },
        }),
        this.prisma.webhookSubscription.count({
          where: {
            workspace: where,
          },
        }),
        this.prisma.workspace.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take: 24,
          select: {
            id: true,
            name: true,
            customDomain: true,
            providerSettings: true,
            updatedAt: true,
            _count: {
              select: {
                apiKeys: true,
                webhookSubscriptions: true,
              },
            },
          },
        }),
      ]);

    const rows = workspaces.map((workspace) => {
      const settings = asProviderSettings(workspace.providerSettings);
      const autopilot =
        settings.autopilot && typeof settings.autopilot === 'object'
          ? (settings.autopilot as Record<string, unknown>)
          : {};
      return {
        workspaceId: workspace.id,
        name: workspace.name,
        customDomain: workspace.customDomain ?? null,
        guestMode: settings.guestMode === true,
        autopilotEnabled: autopilot.enabled === true,
        authMode: typeof settings.authMode === 'string' ? settings.authMode : null,
        apiKeysCount: workspace._count.apiKeys,
        webhookSubscriptionsCount: workspace._count.webhookSubscriptions,
        updatedAt: workspace.updatedAt.toISOString(),
      };
    });

    return {
      metrics: {
        totalWorkspaces,
        customDomainsActive,
        apiKeysActive,
        webhookSubscriptions,
        autopilotEnabled: rows.filter((row) => row.autopilotEnabled).length,
      },
      workspaces: rows,
    };
  }

  /** Update workspace config. */
  async updateWorkspaceConfig(
    workspaceId: string,
    actorId: string,
    input: {
      customDomain?: string;
      guestMode?: boolean;
      autopilotEnabled?: boolean;
      authMode?: string;
    },
  ): Promise<AdminConfigWorkspaceRow> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        customDomain: true,
        providerSettings: true,
        updatedAt: true,
        _count: { select: { apiKeys: true, webhookSubscriptions: true } },
      },
    });
    if (!workspace) {
      throw adminErrors.userNotFound();
    }

    const currentSettings = asProviderSettings(workspace.providerSettings);
    const currentAutopilot =
      currentSettings.autopilot && typeof currentSettings.autopilot === 'object'
        ? (currentSettings.autopilot as Record<string, unknown>)
        : {};

    const nextSettings = {
      ...currentSettings,
      ...(input.guestMode !== undefined ? { guestMode: input.guestMode } : {}),
      ...(input.authMode !== undefined ? { authMode: input.authMode.trim() || null } : {}),
      ...(input.autopilotEnabled !== undefined
        ? {
            autopilot: {
              ...currentAutopilot,
              enabled: input.autopilotEnabled,
            },
          }
        : {}),
    };

    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(input.customDomain !== undefined
          ? { customDomain: input.customDomain.trim() || null }
          : {}),
        providerSettings: JSON.parse(JSON.stringify(nextSettings)) as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        customDomain: true,
        providerSettings: true,
        updatedAt: true,
        _count: {
          select: {
            apiKeys: true,
            webhookSubscriptions: true,
          },
        },
      },
    });

    await this.audit.append({
      adminUserId: actorId,
      action: 'admin.config.workspace_updated',
      entityType: 'Workspace',
      entityId: workspaceId,
      details: {
        workspaceName: workspace.name,
        before: {
          customDomain: workspace.customDomain,
          guestMode: currentSettings.guestMode === true,
          autopilotEnabled: currentAutopilot.enabled === true,
          authMode: typeof currentSettings.authMode === 'string' ? currentSettings.authMode : null,
        },
        after: input,
      },
    });

    const updatedSettings = asProviderSettings(updated.providerSettings);
    const updatedAutopilot =
      updatedSettings.autopilot && typeof updatedSettings.autopilot === 'object'
        ? (updatedSettings.autopilot as Record<string, unknown>)
        : {};

    return {
      workspaceId: updated.id,
      name: updated.name,
      customDomain: updated.customDomain ?? null,
      guestMode: updatedSettings.guestMode === true,
      autopilotEnabled: updatedAutopilot.enabled === true,
      authMode: typeof updatedSettings.authMode === 'string' ? updatedSettings.authMode : null,
      apiKeysCount: updated._count.apiKeys,
      webhookSubscriptionsCount: updated._count.webhookSubscriptions,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
