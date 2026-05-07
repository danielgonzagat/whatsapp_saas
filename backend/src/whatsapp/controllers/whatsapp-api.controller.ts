import { Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces';
import { WorkspaceService } from '../../workspaces/workspace.service';
import { AccountAgentService } from '../account-agent.service';
import { AgentEventsService } from '../agent-events.service';
import { CiaRuntimeService } from '../cia-runtime.service';
import { asProviderSettings, type ProviderSessionSnapshot } from '../provider-settings.types';
import { WhatsAppProviderRegistry } from '../providers/provider-registry';
import { WhatsAppApiProvider } from '../providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from '../whatsapp-catchup.service';
import { WhatsAppWatchdogService } from '../whatsapp-watchdog.service';
import { WhatsappService } from '../whatsapp.service';
type BacklogMode = Exclude<Parameters<CiaRuntimeService['startBacklogRun']>[1], undefined>;

/** Whats app api controller. */
@Controller('whatsapp-api')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class WhatsAppApiController {
  constructor(
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly agentEvents: AgentEventsService,
    private readonly ciaRuntime: CiaRuntimeService,
    private readonly whatsappService: WhatsappService,
    private readonly accountAgent: AccountAgentService,
    private readonly workspaces: WorkspaceService,
    private readonly watchdog: WhatsAppWatchdogService,
  ) {}
  private async getSessionDiagnostics(workspaceId: string) {
    const workspace = await this.workspaces.getWorkspace(workspaceId);
    const sessionSnapshot = this.readSessionSnapshot(workspace?.providerSettings);
    const providerType = await this.providerRegistry.getProviderType(workspaceId);
    const sessionName =
      this.readText(sessionSnapshot?.sessionName).trim() ||
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
  async startSession(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId;
    const result = await this.providerRegistry.startSession(workspaceId);
    if (result.success && result.message === 'already_connected') {
      await this.catchupService.triggerCatchup(workspaceId, 'session_start_already_connected');
    }
    return result;
  }
  /** Get status. */
  @Get('session/status')
  async getStatus(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId;
    const [providerType, status] = await Promise.all([
      this.providerRegistry.getProviderType(workspaceId),
      this.providerRegistry.getSessionStatus(workspaceId),
    ]);
    return {
      ...status,
      provider: providerType,
    };
  }
  /** Get diagnostics. */
  // PULSE_OK: internal route, called by worker process for WhatsApp session diagnostics
  @Get('session/diagnostics')
  async getDiagnostics(@Req() req: AuthenticatedRequest) {
    return this.getSessionDiagnostics(req.workspaceId);
  }
  /** Force check. */
  // PULSE_OK: internal route, called by worker process for WhatsApp session health check
  @Post('session/force-check')
  async forceCheck(@Req() req: AuthenticatedRequest) {
    const workspace = await this.workspaces.getWorkspace(req.workspaceId);
    await this.watchdog.checkWorkspaceSession(req.workspaceId, workspace?.name || req.workspaceId);
    return {
      success: true,
      diagnostics: await this.getSessionDiagnostics(req.workspaceId),
    };
  }
  /** Force reconnect. */
  // PULSE_OK: internal route, called by worker process for WhatsApp session reconnect
  @Post('session/force-reconnect')
  async forceReconnect(@Req() req: AuthenticatedRequest) {
    const diagnosticsBefore = await this.getSessionDiagnostics(req.workspaceId);
    const providerType = await this.providerRegistry.getProviderType(req.workspaceId);
    const reconnectResult = diagnosticsBefore?.status?.connected
      ? { success: true, message: 'already_connected' }
      : await this.providerRegistry.restartSession(req.workspaceId);
    return {
      success: Boolean(reconnectResult?.success),
      providerType,
      reconnectResult,
      diagnostics: await this.getSessionDiagnostics(req.workspaceId),
    };
  }
  /** Repair config. */
  /** Repair config. */
  // PULSE_OK: internal route, called by worker process for WhatsApp session config repair
  @Post('session/repair-config')
  async repairConfig(@Req() req: AuthenticatedRequest) {
    const providerType = await this.providerRegistry.getProviderType(req.workspaceId);
    await this.providerRegistry.syncSessionConfig(req.workspaceId);
    return {
      success: true,
      repaired: true,
      providerType,
      diagnostics: await this.getSessionDiagnostics(req.workspaceId),
    };
  }
  /** Bootstrap session. */
  // PULSE_OK: internal route, called by worker process for WhatsApp session bootstrap
  @Post('session/bootstrap')
  async bootstrapSession(@Req() req: AuthenticatedRequest) {
    return this.ciaRuntime.bootstrap(req.workspaceId);
  }
  /** Start backlog. */
  // PULSE_OK: internal route, called by worker process for WhatsApp session backlog processing
  @Post('session/backlog/start')
  async startBacklog(
    @Req() req: AuthenticatedRequest,
    @Body() body: { mode?: string; limit?: number },
  ) {
    if (body?.mode === 'pause_autonomy') {
      return this.ciaRuntime.pauseAutonomy(req.workspaceId);
    }
    return this.ciaRuntime.startBacklogRun(
      req.workspaceId,
      this.readBacklogMode(body?.mode),
      body?.limit,
    );
  }
  /** Resume conversation autonomy. */
  @Post('cia/conversations/:conversationId/resume')
  async resumeConversationAutonomy(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    return this.ciaRuntime.resumeConversationAutonomy(req.workspaceId, conversationId);
  }
  /** Get operational intelligence. */
  // PULSE_OK: internal route, called by worker process for CIA operational intelligence
  @Get('cia/intelligence')
  async getOperationalIntelligence(@Req() req: AuthenticatedRequest) {
    return this.ciaRuntime.getOperationalIntelligence(req.workspaceId);
  }
  /** Stream agent. */
  @Get('agent/stream')
  streamAgent(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const workspaceId = req.workspaceId;
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
    const workspaceId = req.workspaceId;
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
  /** Get qr code. */
  @Get('session/qr')
  async getQrCode(@Req() req: AuthenticatedRequest) {
    const sessionStatus = await this.providerRegistry.getSessionStatus(req.workspaceId);
    if (sessionStatus?.connected) {
      return {
        available: false,
        connected: true,
        status: 'connected',
        message: 'Sessão já conectada.',
      };
    }
    const fallbackQr = sessionStatus?.qrCode || null;
    if (fallbackQr) {
      return {
        available: true,
        status: sessionStatus?.status || 'pending',
        qr: fallbackQr,
        message: 'QR Code recuperado do snapshot da sessão.',
      };
    }
    const result = await this.providerRegistry.getQrCode(req.workspaceId);
    if (result.qr) {
      return {
        available: true,
        qr: result.qr, // base64 data URL
      };
    }
    return {
      available: false,
      connected: false,
      message: result.message || 'QR Code não disponível. Verifique se a sessão foi iniciada.',
    };
  }
  /** Get session view. */
  @Get('session/view')
  async getSessionView(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId;
    const providerType = await this.providerRegistry.getProviderType(workspaceId);
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    return {
      success: true,
      provider: providerType,
      workerAvailable: false,
      degraded: false,
      snapshot: {
        workspaceId,
        state: status.connected ? 'CONNECTED' : status.status || 'DISCONNECTED',
        connected: status.connected,
        screenshotDataUrl: null,
        viewerAvailable: false,
        takeoverActive: false,
        agentPaused: false,
        viewport: null,
      },
      image: null,
      message: 'meta_cloud_uses_official_api_no_qr_viewer',
    };
  }
  /** Disconnect. */
  @Delete('session/disconnect')
  async disconnect(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId;
    return this.providerRegistry.disconnect(workspaceId);
  }
  /** Logout. */
  @Post('session/logout')
  async logout(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId;
    return this.providerRegistry.logout(workspaceId);
  }
  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('send/:phone')
  async sendMessage(@Req() req: AuthenticatedRequest, @Param('phone') phone: string) {
    const workspaceId = req.workspaceId;
    const { message, mediaUrl, caption, mediaType } = req.body || {};
    await this.providerRegistry.getProviderType(workspaceId);
    if (mediaUrl) {
      return this.whatsappApi.sendMediaFromUrl(workspaceId, phone, mediaUrl, caption, mediaType);
    }
    return this.whatsappApi.sendMessage(workspaceId, phone, message);
  }
  /** Check registration. */
  // PULSE_OK: internal route, called by worker process for WhatsApp phone registration check
  @Get('check/:phone')
  async checkRegistration(@Req() req: AuthenticatedRequest, @Param('phone') phone: string) {
    const workspaceId = req.workspaceId;
    await this.providerRegistry.getProviderType(workspaceId);
    const isRegistered = await this.whatsappApi.isRegisteredUser(workspaceId, phone);
    return { phone, registered: isRegistered };
  }
  /** Health check. */
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
  // PULSE_OK: internal route, called by worker process for WhatsApp provider status
  @Get('provider-status')
  async getProviderStatus(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId;
    const workspace = await this.workspaces.getWorkspace(workspaceId).catch(() => null);
    const sessionMeta = this.readSessionSnapshot(workspace?.providerSettings);
    const sessionName =
      this.readText(sessionMeta?.sessionName).trim() ||
      this.whatsappApi.getResolvedSessionId(workspaceId);
    const providerType = await this.providerRegistry.getProviderType(workspaceId);
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    const health = await this.providerRegistry.healthCheck();
    const runtimeDiagnostics = this.whatsappApi.getRuntimeConfigDiagnostics();
    const sessionDiagnostics = await this.whatsappApi.getSessionConfigDiagnostics(sessionName);
    const backlog = await this.whatsappService.getBacklog(workspaceId).catch(() => null);
    const degradedReasons: string[] = [];
    if (!runtimeDiagnostics.webhookConfigured) {
      degradedReasons.push('meta_webhook_missing');
    } else if (!runtimeDiagnostics.inboundEventsConfigured) {
      degradedReasons.push('meta_webhook_events_missing_inbound');
    }
    if (!runtimeDiagnostics.storeEnabled) {
      degradedReasons.push('meta_store_disabled_in_runtime');
    }
    if (!runtimeDiagnostics.storeFullSync) {
      degradedReasons.push('meta_store_full_sync_disabled_in_runtime');
    }
    if (sessionDiagnostics.available) {
      if (!sessionDiagnostics.configPresent) {
        degradedReasons.push('meta_session_config_missing');
      }
      if (!sessionDiagnostics.webhookConfigured) {
        degradedReasons.push('meta_session_webhook_missing');
      } else if (!sessionDiagnostics.inboundEventsConfigured) {
        degradedReasons.push('meta_session_webhook_events_missing_inbound');
      }
      if (sessionDiagnostics.storeEnabled === false) {
        degradedReasons.push('meta_session_store_disabled');
      }
      if (sessionDiagnostics.storeFullSync === false) {
        degradedReasons.push('meta_session_store_full_sync_disabled');
      }
    } else if (status.connected) {
      degradedReasons.push('meta_session_config_unavailable');
    }
    const recoveryBlockedReason = this.readText(sessionMeta?.recoveryBlockedReason).trim();
    if (recoveryBlockedReason) {
      degradedReasons.push(recoveryBlockedReason);
    }
    if (
      status.connected &&
      backlog &&
      Number(backlog.pendingConversations || 0) === 0 &&
      sessionMeta?.lastCatchupError
    ) {
      degradedReasons.push('backlog_empty_after_catchup_error');
    }
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
        catchup: {
          lastCatchupAt: sessionMeta?.lastCatchupAt || null,
          lastCatchupReason: sessionMeta?.lastCatchupReason || null,
          lastCatchupImportedMessages: sessionMeta?.lastCatchupImportedMessages ?? null,
          lastCatchupTouchedChats: sessionMeta?.lastCatchupTouchedChats ?? null,
          lastCatchupProcessedChats: sessionMeta?.lastCatchupProcessedChats ?? null,
          lastCatchupOverflow: sessionMeta?.lastCatchupOverflow ?? null,
          lastCatchupError: sessionMeta?.lastCatchupError || null,
          lastCatchupFailedAt: sessionMeta?.lastCatchupFailedAt || null,
          recoveryBlockedReason: sessionMeta?.recoveryBlockedReason || null,
          recoveryBlockedAt: sessionMeta?.recoveryBlockedAt || null,
          backfillCursor: sessionMeta?.backfillCursor || null,
        },
        backlog,
      },
    };
  }
  private readNumberQuery(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
  }
  private readBooleanQuery(value: unknown, fallback = false) {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = (typeof value === 'string' ? value : '').trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }
  private readText(value: unknown, fallback = '') {
    return typeof value === 'string' ? value : fallback;
  }
  private readSessionSnapshot(providerSettings: unknown): ProviderSessionSnapshot | null {
    const settings = asProviderSettings(providerSettings);
    return settings.whatsappWebSession ?? settings.whatsappApiSession ?? null;
  }
  private readBacklogMode(value: unknown): BacklogMode {
    switch (value) {
      case 'reply_only_new':
      case 'prioritize_hot':
      case 'reply_all_recent_first':
        return value;
      default:
        return 'reply_all_recent_first';
    }
  }
}
