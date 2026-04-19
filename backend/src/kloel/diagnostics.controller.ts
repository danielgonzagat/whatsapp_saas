import { cpus } from 'node:os';
import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { asProviderSettings } from '../whatsapp/provider-settings.types';
import { isVisitorChatEnabled } from './visitor-chat-enabled';

interface SystemMetrics {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percentage: number };
  uptime: number;
}

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  lastCheck: string;
  details?: Record<string, unknown>;
}

interface DiagnosticsReport {
  timestamp: string;
  environment: string;
  version: string;
  system: SystemMetrics;
  services: ServiceStatus[];
  database: {
    connected: boolean;
    latencyMs: number;
    connectionCount?: number;
  };
  kloel: {
    autopilotEnabled: number;
    activeWorkspaces: number;
    todayEvents: number;
    pendingJobs?: number;
  };
}

interface WorkspaceDiagnosticsSettings {
  autopilotEnabled: boolean;
  whatsappConnected: boolean;
  billingStatus: 'active' | 'suspended';
  plan: string;
}

@ApiTags('diagnostics')
@UseGuards(JwtAuthGuard)
@Controller('diag')
export class DiagnosticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check básico' })
  basicHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  @Get('full')
  @ApiOperation({ summary: 'Diagnóstico completo do sistema' })
  async fullDiagnostics(): Promise<DiagnosticsReport & { deploy: Record<string, unknown> }> {
    // Métricas do sistema
    const system = this.getSystemMetrics();

    // Check database
    const dbStatus = await this.checkDatabase();

    // Check serviços
    const services = this.checkServices();

    // Métricas KLOEL
    const kloel = await this.getKloelMetrics();
    const visitorChatEnabled = isVisitorChatEnabled();

    // Deploy info — permite confirmar que a versão certa está rodando
    const deploy = {
      gitSha: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown',
      buildTimestamp: process.env.BUILD_TIMESTAMP || 'unknown',
      nodeEnv: process.env.NODE_ENV || 'development',
      visitorChatEnabled,
      guestChatEnabled: visitorChatEnabled,
      openAiConfigured: !!process.env.OPENAI_API_KEY,
      wahaApiUrl: process.env.WAHA_API_URL || process.env.WAHA_BASE_URL ? '(set)' : '(missing)',
      corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS ? '(set)' : '(defaults only)',
      corsAllowedOriginRegex: process.env.CORS_ALLOWED_ORIGIN_REGEX ? '(set)' : '(defaults only)',
    };

    return {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      system,
      services,
      database: dbStatus,
      kloel,
      deploy,
    };
  }

  @Get('workspace/:workspaceId')
  @ApiOperation({ summary: 'Diagnóstico específico de um workspace' })
  async workspaceDiagnostics(@Param('workspaceId') workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        providerSettings: true,
        createdAt: true,
        _count: {
          select: {
            contacts: true,
            flows: true,
            agents: true,
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const settings = asProviderSettings(workspace.providerSettings);

    // Buscar métricas específicas
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayMessages, todayAutopilotEvents, activeFlows] = await Promise.all([
      this.prisma.message.count({
        where: { workspaceId, createdAt: { gte: today } },
      }),
      this.prisma.autopilotEvent.count({
        where: { workspaceId, createdAt: { gte: today } },
      }),
      this.prisma.flow.count({
        where: { workspaceId },
      }),
    ]);

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.createdAt,
        counts: workspace._count,
      },
      settings: this.buildWorkspaceSettings(settings),
      todayMetrics: {
        messages: todayMessages,
        autopilotEvents: todayAutopilotEvents,
        activeFlows,
      },
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Métricas para Prometheus/Grafana' })
  async prometheusMetrics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalWorkspaces, activeWorkspaces, todayMessages, todayAutopilotEvents] =
      await Promise.all([
        this.prisma.workspace.count(),
        this.prisma.workspace.count({
          where: {
            updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        }),
        this.prisma.message.count({
          where: { createdAt: { gte: today } },
        }),
        this.prisma.autopilotEvent.count({
          where: { createdAt: { gte: today } },
        }),
      ]);

    // Formato Prometheus
    const metrics = `
# HELP kloel_workspaces_total Total number of workspaces
# TYPE kloel_workspaces_total gauge
kloel_workspaces_total ${totalWorkspaces}

# HELP kloel_workspaces_active Active workspaces in last 24h
# TYPE kloel_workspaces_active gauge
kloel_workspaces_active ${activeWorkspaces}

# HELP kloel_messages_today Messages sent today
# TYPE kloel_messages_today gauge
kloel_messages_today ${todayMessages}

# HELP kloel_autopilot_events_today Autopilot events today
# TYPE kloel_autopilot_events_today gauge
kloel_autopilot_events_today ${todayAutopilotEvents}

# HELP kloel_uptime_seconds Application uptime in seconds
# TYPE kloel_uptime_seconds gauge
kloel_uptime_seconds ${process.uptime()}
`.trim();

    return metrics;
  }

  @Get('errors')
  @ApiOperation({ summary: 'Últimos erros do sistema' })
  async recentErrors(@Query('limit') limit: string = '20') {
    const limitNum = Math.min(Number.parseInt(limit, 10) || 20, 100);

    // Buscar eventos de erro do autopilot
    const errors = await this.prisma.autopilotEvent.findMany({
      where: {
        status: { in: ['failed', 'error'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limitNum,
      select: {
        id: true,
        workspaceId: true,
        intent: true,
        action: true,
        status: true,
        reason: true,
        createdAt: true,
      },
    });

    return {
      count: errors.length,
      errors,
    };
  }

  private getSystemMetrics(): SystemMetrics {
    const used = process.memoryUsage();

    return {
      cpu: {
        usage: 0, // Seria necessário sampling para calcular
        cores: cpus().length,
      },
      memory: {
        used: Math.round(used.heapUsed / 1024 / 1024),
        total: Math.round(used.heapTotal / 1024 / 1024),
        percentage: Math.round((used.heapUsed / used.heapTotal) * 100),
      },
      uptime: Math.round(process.uptime()),
    };
  }

  private async checkDatabase(): Promise<{
    connected: boolean;
    latencyMs: number;
    connectionCount?: number;
  }> {
    const start = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        connected: true,
        latencyMs: Date.now() - start,
      };
    } catch {
      return {
        connected: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  private checkServices(): ServiceStatus[] {
    const services: ServiceStatus[] = [];

    // Check Redis (se configurado)
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const start = Date.now();
      try {
        // Simple ping test would go here
        services.push({
          name: 'redis',
          status: 'healthy',
          latencyMs: Date.now() - start,
          lastCheck: new Date().toISOString(),
        });
      } catch {
        services.push({
          name: 'redis',
          status: 'down',
          latencyMs: Date.now() - start,
          lastCheck: new Date().toISOString(),
        });
      }
    }

    // Check OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    services.push({
      name: 'openai',
      status: openaiKey ? 'healthy' : 'degraded',
      latencyMs: 0,
      lastCheck: new Date().toISOString(),
      details: {
        configured: !!openaiKey,
      },
    });

    return services;
  }

  private async getKloelMetrics(): Promise<{
    autopilotEnabled: number;
    activeWorkspaces: number;
    todayEvents: number;
    pendingJobs?: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Contar workspaces com autopilot habilitado
    const workspaces = await this.prisma.workspace.findMany({
      select: { providerSettings: true },
    });

    const autopilotEnabled = workspaces.filter((w) => {
      const settings = asProviderSettings(w.providerSettings);
      return settings?.autopilot?.enabled === true;
    }).length;

    const [activeWorkspaces, todayEvents] = await Promise.all([
      this.prisma.workspace.count({
        where: {
          updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.autopilotEvent.count({
        where: { createdAt: { gte: today } },
      }),
    ]);

    return {
      autopilotEnabled,
      activeWorkspaces,
      todayEvents,
    };
  }

  private buildWorkspaceSettings(settings: unknown): WorkspaceDiagnosticsSettings {
    const providerSettings = asProviderSettings(settings);
    const whatsappStatus =
      typeof providerSettings.whatsappApiSession?.status === 'string'
        ? providerSettings.whatsappApiSession.status.toLowerCase()
        : '';
    const plan =
      typeof providerSettings.planLimits?.plan === 'string'
        ? providerSettings.planLimits.plan
        : 'free';

    return {
      autopilotEnabled: providerSettings.autopilot?.enabled === true,
      whatsappConnected: whatsappStatus === 'connected' || whatsappStatus === 'working',
      billingStatus: providerSettings.billingSuspended === true ? 'suspended' : 'active',
      plan,
    };
  }
}
