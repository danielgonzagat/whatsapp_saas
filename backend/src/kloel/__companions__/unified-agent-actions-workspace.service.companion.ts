type UnknownRecord = Record<string, unknown>;

export async function actionGetWorkspaceStatus(deps: {
  workspaceId: string;
  args: any;
  prisma: any;
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

  if (includeConnections) {
    const workspace = await deps.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as UnknownRecord) || {};
    const wapiSession = (settings.whatsappApiSession ?? {}) as UnknownRecord;
    const autopilotSettings = (settings.autopilot ?? {}) as UnknownRecord;
    result.connections = {
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

  if (includeMetrics) {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    result.metrics = {
      totalContacts: await deps.prisma.contact.count({ where: { workspaceId } }),
      totalMessages: await deps.prisma.message.count({
        where: { workspaceId, createdAt: { gte: last30Days } },
      }),
      activeFlows: await deps.prisma.flow.count({ where: { workspaceId, isActive: true } }),
      products: await deps.prisma.product.count({ where: { workspaceId } }),
    };
  }

  if (includeHealth) {
    result.health = { status: 'healthy', lastActivity: new Date().toISOString(), warnings: [] };
    const conn = result.connections as UnknownRecord | undefined;
    const wa = conn ? (conn.whatsapp as UnknownRecord) : undefined;
    if (!wa?.sessionId) {
      result.health.warnings.push('WhatsApp não conectado');
      result.health.status = 'warning';
    }
    const met = result.metrics as { activeFlows?: number } | undefined;
    if (met?.activeFlows === 0) result.health.warnings.push('Nenhum fluxo ativo');
  }
  return { success: true, ...result };
}
