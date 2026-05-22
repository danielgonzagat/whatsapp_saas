import type { PrismaClient } from '@prisma/client';

import type { UnknownRecord } from '../common/types';

interface WorkspaceActionArgs {
  includeMetrics?: boolean;
  includeConnections?: boolean;
  includeHealth?: boolean;
}

interface WorkspacePrismaDelegate {
  workspace: PrismaClient['workspace'];
  contact: PrismaClient['contact'];
  message: PrismaClient['message'];
  flow: PrismaClient['flow'];
  product: PrismaClient['product'];
}

interface WorkspaceStatusConnections {
  whatsapp: {
    provider: unknown;
    status: unknown;
    sessionId: unknown;
  };
  autopilot: {
    enabled: boolean;
    mode: unknown;
  };
}

interface WorkspaceStatusMetrics {
  totalContacts: number;
  totalMessages: number;
  activeFlows: number;
  products: number;
}

async function readWorkspaceProviderSettings(
  workspaceId: string,
  prisma: WorkspacePrismaDelegate,
): Promise<UnknownRecord> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  return (workspace?.providerSettings as UnknownRecord) || {};
}

function buildConnections(settings: UnknownRecord): WorkspaceStatusConnections {
  const wapiSession = (settings.whatsappApiSession ?? {}) as UnknownRecord;
  const autopilotSettings = (settings.autopilot ?? {}) as UnknownRecord;
  return {
    whatsapp: {
      provider: settings.whatsappProvider || 'none',
      status: wapiSession.status || settings.connectionStatus || 'disconnected',
      sessionId: wapiSession.sessionName || settings.sessionId,
    },
    autopilot: {
      enabled: autopilotSettings.enabled === true,
      mode: autopilotSettings.mode || 'off',
    },
  };
}

async function readWorkspaceMetrics(
  workspaceId: string,
  prisma: WorkspacePrismaDelegate,
): Promise<WorkspaceStatusMetrics> {
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return {
    totalContacts: await prisma.contact.count({ where: { workspaceId } }),
    totalMessages: await prisma.message.count({
      where: { workspaceId, createdAt: { gte: last30Days } },
    }),
    activeFlows: await prisma.flow.count({ where: { workspaceId, isActive: true } }),
    products: await prisma.product.count({ where: { workspaceId } }),
  };
}

export async function actionGetWorkspaceStatus(deps: {
  workspaceId: string;
  args: WorkspaceActionArgs;
  prisma: WorkspacePrismaDelegate;
}) {
  const { workspaceId, args } = deps;
  const includeMetrics = args?.includeMetrics !== false;
  const includeConnections = args?.includeConnections !== false;
  const includeHealth = args?.includeHealth !== false;
  const result: {
    workspaceId: string;
    connections?: unknown;
    metrics?: unknown;
    health?: { status: 'healthy' | 'warning'; lastActivity: string; warnings: string[] };
  } = { workspaceId };
  let connections: WorkspaceStatusConnections | undefined;
  let metrics: WorkspaceStatusMetrics | undefined;

  if (includeConnections) {
    const settings = await readWorkspaceProviderSettings(workspaceId, deps.prisma);
    connections = buildConnections(settings);
    result.connections = connections;
  }

  if (includeMetrics) {
    metrics = await readWorkspaceMetrics(workspaceId, deps.prisma);
    result.metrics = metrics;
  }

  if (includeHealth) {
    result.health = { status: 'healthy', lastActivity: new Date().toISOString(), warnings: [] };
    if (!connections) {
      const settings = await readWorkspaceProviderSettings(workspaceId, deps.prisma);
      connections = buildConnections(settings);
    }
    if (!metrics) {
      metrics = await readWorkspaceMetrics(workspaceId, deps.prisma);
    }
    const wa = connections.whatsapp;
    if (!wa?.sessionId) {
      result.health.warnings.push('WhatsApp não conectado');
      result.health.status = 'warning';
    }
    if (metrics.activeFlows === 0) {
      result.health.warnings.push('Nenhum fluxo ativo');
      result.health.status = 'warning';
    }
  }
  return { success: true, ...result };
}
