import {
  Body,
  Controller,
  Delete,
  Get,
  GoneException,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../../../common/interfaces';
import { WorkspaceService } from '../../../../workspaces/workspace.service';
import { AccountAgentService } from '../account-agent.service';
import { AgentEventsService } from '../agent-events.service';
import {
  CIA_RUNTIME_SERVICE,
  type CiaRuntimePort,
} from '../../../../kloel/mind/cia/cia-runtime.port';
import { WhatsAppProviderRegistry } from '../providers/provider-registry';
import { WhatsAppApiProvider } from '../providers/whatsapp-api.provider';
import { WhatsappService } from '../whatsapp.service';
import { InternalEndpoint } from '../../../../common/decorators/internal-endpoint.decorator';
import { RouteClass } from '../../../../common/throttler/route-class.decorator';
import {
  buildProviderStatusCatchup,
  deriveProviderStatusDegradedReasons,
  readBacklogMode,
  readSessionSnapshot,
  readText,
} from './whatsapp-api.controller.helpers';

/** Whats app api controller. */
@Controller('whatsapp-api')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class WhatsAppApiController {
  constructor(
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly agentEvents: AgentEventsService,
    @Inject(CIA_RUNTIME_SERVICE) private readonly ciaRuntime: CiaRuntimePort,
    private readonly whatsappService: WhatsappService,
    private readonly accountAgent: AccountAgentService,
    private readonly workspaces: WorkspaceService,
  ) {}

  private throwMetaOnlyGone(feature: string): never {
    throw new GoneException({
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      feature,
      message: 'WhatsApp agora conecta somente pela API oficial da Meta.',
      use: '/meta/auth/url?channel=whatsapp&returnTo=/whatsapp',
    });
  }

  private async getSessionDiagnostics(workspaceId: string) {
    const workspace = await this.workspaces.getWorkspace(workspaceId);
    const sessionSnapshot = readSessionSnapshot(workspace?.providerSettings);
    const providerType = await this.providerRegistry.getProviderType(workspaceId);
    const sessionName =
      readText(sessionSnapshot?.sessionName).trim() ||
      this.whatsappApi.getResolvedSessionId(workspaceId);
    const [status, configDiagnostics, clientInfo, operationalIntelligence] = await Promise.all([
      this.providerRegistry.getSessionStatus(workspaceId).catch(() => null),
      this.whatsappApi.getSessionConfigDiagnostics(sessionName).catch((error: unknown) => ({
        available: false,
        error: error instanceof Error ? error.message : 'unknown_error',
      })),
      this.whatsappApi.getClientInfo(sessionName).catch(() => null),
      this.ciaRuntime.getOperationalIntelligence(workspaceId).catch(() => null),
    ]);
    return {
      workspaceId,
      workspaceName: workspace?.name || null,
      sessionName,
      providerType,
      status,
      sessionSnapshot,
      configDiagnostics,
      clientInfo,
      operationalIntelligence,
      generatedAt: new Date().toISOString(),
    };
  }
  /** Start session. */
  @Post('session/start')
  startSession() {
    return this.throwMetaOnlyGone('legacy_session_start');
  }
  /** Get status. */
  @Get('session/status')
  getStatus() {
    return this.throwMetaOnlyGone('legacy_session_status');
  }
  /** Get diagnostics. */
  @InternalEndpoint('whatsapp session diagnostics')
  @Get('session/diagnostics')
  async getDiagnostics(@Req() req: AuthenticatedRequest) {
    return this.getSessionDiagnostics(req.workspaceId!);
  }
  /** Force check. */
  @InternalEndpoint('whatsapp session force-check')
  @Post('session/force-check')
  forceCheck() {
    return this.throwMetaOnlyGone('legacy_session_force_check');
  }
  /** Force reconnect. */
  @InternalEndpoint('whatsapp session force-reconnect')
  @Post('session/force-reconnect')
  forceReconnect() {
    return this.throwMetaOnlyGone('legacy_session_force_reconnect');
  }
  /** Repair config. */
  @InternalEndpoint('whatsapp session repair-config')
  @Post('session/repair-config')
  repairConfig() {
    return this.throwMetaOnlyGone('legacy_session_repair_config');
  }
  /** Bootstrap session. */
  @InternalEndpoint('whatsapp session bootstrap')
  @Post('session/bootstrap')
  async bootstrapSession(@Req() req: AuthenticatedRequest) {
    return this.ciaRuntime.bootstrap(req.workspaceId!);
  }
  /** Start backlog. */
  @InternalEndpoint('whatsapp session backlog start')
  @Post('session/backlog/start')
  async startBacklog(
    @Req() req: AuthenticatedRequest,
    @Body() body: { mode?: string; limit?: number },
  ) {
    if (body?.mode === 'pause_autonomy') {
      return this.ciaRuntime.pauseAutonomy(req.workspaceId!);
    }
    return this.ciaRuntime.startBacklogRun(
      req.workspaceId!,
      readBacklogMode(body?.mode),
      body?.limit,
    );
  }
  /** Start backlog. */
  @InternalEndpoint('whatsapp CIA intelligence')
  @Get('cia/intelligence')
  async getOperationalIntelligence(@Req() req: AuthenticatedRequest) {
    return this.ciaRuntime.getOperationalIntelligence(req.workspaceId!);
  }
  /** Stream agent. */
  @Get('agent/stream')
  streamAgent(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const workspaceId = req.workspaceId!;
    const safeWrite = (data: unknown) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        // ignore disconnect races
      }
    };
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    safeWrite({
      type: 'status',
      workspaceId,
      phase: 'stream_ready',
      message: 'Console CIA conectada.',
      ts: new Date().toISOString(),
    });
    for (const event of this.agentEvents.getRecent(workspaceId)) {
      safeWrite(event);
    }
    const unsubscribe = this.agentEvents.subscribe(workspaceId, safeWrite);
    const keepAlive = setInterval(() => {
      safeWrite({
        type: 'heartbeat',
        workspaceId,
        message: 'heartbeat',
        ts: new Date().toISOString(),
      });
    }, 15000);
    const maxTimeout = setTimeout(
      () => {
        clearInterval(keepAlive);
        unsubscribe();
        try {
          res.end();
        } catch {
          return;
        }
      },
      30 * 60 * 1000,
    ); // 30 minutes max
    req.on('close', () => {
      clearTimeout(maxTimeout);
      clearInterval(keepAlive);
      unsubscribe();
      try {
        res.end();
      } catch {
        // ignore
      }
    });
  }
  /** Stream live. */
  @Get('live')
  async streamLive(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const workspaceId = req.workspaceId!;
    const safeWrite = (data: unknown) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        // ignore disconnect races
      }
    };
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const [sessionStatus, accountRuntime] = await Promise.all([
      this.providerRegistry.getSessionStatus(workspaceId).catch(() => null),
      this.accountAgent.getRuntime(workspaceId).catch(() => null),
    ]);
    safeWrite({
      type: 'status',
      workspaceId,
      phase: 'live_stream_ready',
      message: 'Painel live do WhatsApp conectado.',
      ts: new Date().toISOString(),
      meta: {
        sessionStatus,
        accountRuntime,
      },
    });
    for (const event of this.agentEvents.getRecent(workspaceId)) {
      safeWrite(event);
    }
    const unsubscribe = this.agentEvents.subscribe(workspaceId, safeWrite);
    const keepAlive = setInterval(() => {
      safeWrite({
        type: 'heartbeat',
        workspaceId,
        phase: 'live_heartbeat',
        message: 'heartbeat',
        ts: new Date().toISOString(),
      });
    }, 15000);
    const maxTimeout = setTimeout(
      () => {
        clearInterval(keepAlive);
        unsubscribe();
        try {
          res.end();
        } catch {
          return;
        }
      },
      30 * 60 * 1000,
    ); // 30 minutes max
    req.on('close', () => {
      clearTimeout(maxTimeout);
      clearInterval(keepAlive);
      unsubscribe();
      try {
        res.end();
      } catch {
        // ignore
      }
    });
  }
  /** Retired non-Meta session-code endpoint. */
  @Get('session/qr')
  getRetiredSessionCode() {
    return this.throwMetaOnlyGone('legacy_session_code');
  }
  /** Get session view. */
  @Get('session/view')
  getSessionView() {
    return this.throwMetaOnlyGone('legacy_session_view');
  }
  /** Disconnect. */
  @Delete('session/disconnect')
  disconnect() {
    return this.throwMetaOnlyGone('legacy_session_disconnect');
  }
  /** Logout. */
  @Post('session/logout')
  logout() {
    return this.throwMetaOnlyGone('legacy_session_logout');
  }
  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  /** Check registration. */
  @InternalEndpoint('whatsapp phone check')
  @Get('check/:phone')
  async checkRegistration(@Req() req: AuthenticatedRequest, @Param('phone') phone: string) {
    const workspaceId = req.workspaceId!;
    await this.providerRegistry.getProviderType(workspaceId);
    const isRegistered = await this.whatsappApi.isRegisteredUser(workspaceId, phone);
    return { phone, registered: isRegistered };
  }
  /** Health check. */
  @InternalEndpoint('whatsapp health check')
  @Get('health')
  async healthCheck() {
    const health = await this.providerRegistry.healthCheck();
    return {
      service: 'whatsapp-api',
      healthy: health.whatsappApi,
      providers: health,
      timestamp: new Date().toISOString(),
    };
  }
  /** Get provider status. */
  @InternalEndpoint('whatsapp provider status')
  @Get('provider-status')
  async getProviderStatus(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId!;
    const workspace = await this.workspaces.getWorkspace(workspaceId).catch(() => null);
    const sessionMeta = readSessionSnapshot(workspace?.providerSettings);
    const sessionName =
      readText(sessionMeta?.sessionName).trim() ||
      this.whatsappApi.getResolvedSessionId(workspaceId);
    const providerType = await this.providerRegistry.getProviderType(workspaceId);
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    const health = await this.providerRegistry.healthCheck();
    const runtimeDiagnostics = this.whatsappApi.getRuntimeConfigDiagnostics();
    const sessionDiagnostics = await this.whatsappApi.getSessionConfigDiagnostics(sessionName);
    const backlog = await this.whatsappService.getBacklog(workspaceId).catch(() => null);
    const degradedReasons = deriveProviderStatusDegradedReasons({
      runtimeDiagnostics,
      sessionDiagnostics,
      sessionStatus: status,
      sessionMeta,
      backlog,
    });
    return {
      workspaceId,
      configuredProvider: providerType,
      session: status,
      health,
      degradedMode: degradedReasons.length > 0,
      degradedReasons,
      diagnostics: {
        runtime: runtimeDiagnostics,
        sessionConfig: sessionDiagnostics,
        catchup: buildProviderStatusCatchup(sessionMeta),
        backlog,
      },
    };
  }
}
