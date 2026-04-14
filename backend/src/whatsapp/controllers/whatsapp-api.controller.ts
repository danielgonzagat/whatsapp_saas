import { Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces';
import { WorkspaceService } from '../../workspaces/workspace.service';
import { AccountAgentService } from '../account-agent.service';
import { AgentEventsService } from '../agent-events.service';
import { CiaRuntimeService } from '../cia-runtime.service';
import { WhatsAppProviderRegistry } from '../providers/provider-registry';
import { WhatsAppApiProvider } from '../providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from '../whatsapp-catchup.service';
import { WhatsAppWatchdogService } from '../whatsapp-watchdog.service';
import { WhatsappService } from '../whatsapp.service';

/**
 * =====================================================================
 * WhatsApp API Session Controller
 *
 * Endpoints para gerenciar sessões do WhatsApp via browser runtime.
 * WAHA permanece apenas como legado até a remoção definitiva.
 * =====================================================================
 */
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

  private buildMetaUnsupportedResponse(feature: string, extra?: Record<string, any>) {
    return {
      success: false,
      provider: 'meta-cloud',
      notSupported: true,
      message: `${feature}_not_supported_for_meta_cloud`,
      ...(extra || {}),
    };
  }

  private async getSessionDiagnostics(workspaceId: string) {
    const workspace = await this.workspaces.getWorkspace(workspaceId);
    const settings = (workspace?.providerSettings as Record<string, any>) || {};
    const sessionSnapshot = (settings?.whatsappWebSession ||
      settings?.whatsappApiSession ||
      {}) as Record<string, any>;
    const providerType = await this.providerRegistry.getProviderType(workspaceId);
    const sessionName =
      String(sessionSnapshot?.sessionName || '').trim() ||
      this.whatsappApi.getResolvedSessionId(workspaceId);

    const [status, configDiagnostics, clientInfo, operationalIntelligence] = await Promise.all([
      this.providerRegistry.getSessionStatus(workspaceId).catch(() => null),
      this.whatsappApi.getSessionConfigDiagnostics(sessionName).catch((error: any) => ({
        available: false,
        error: String(error?.message || error || 'unknown_error'),
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

  /**
   * POST /whatsapp-api/session/start
   * Inicia nova sessão WhatsApp para o workspace
   */
  @Post('session/start')
  async startSession(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId;
    const result = await this.providerRegistry.startSession(workspaceId);

    if (result.success && result.message === 'already_connected') {
      await this.catchupService.triggerCatchup(workspaceId, 'session_start_already_connected');
    }

    return result;
  }

  /**
   * GET /whatsapp-api/session/status
   * Retorna status da sessão (CONNECTED, DISCONNECTED, QR_CODE, etc)
   */
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

  @Get('session/diagnostics')
  async getDiagnostics(@Req() req: AuthenticatedRequest) {
    return this.getSessionDiagnostics(req.workspaceId);
  }

  @Post('session/force-check')
  async forceCheck(@Req() req: AuthenticatedRequest) {
    const workspace = await this.workspaces.getWorkspace(req.workspaceId);
    await this.watchdog.checkWorkspaceSession(req.workspaceId, workspace?.name || req.workspaceId);

    return {
      success: true,
      diagnostics: await this.getSessionDiagnostics(req.workspaceId),
    };
  }

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

  /**
   * POST /whatsapp-api/session/bootstrap
   * Inicia o runtime CIA observável: valida conexão, conta backlog e emite prompt.
   */
  @Post('session/bootstrap')
  async bootstrapSession(@Req() req: AuthenticatedRequest) {
    return this.ciaRuntime.bootstrap(req.workspaceId);
  }

  /**
   * POST /whatsapp-api/session/link
   * Vincula uma sessionName existente no WAHA ao workspace atual.
   */
  @Post('session/link')
  async linkSession(
    @Req() req: AuthenticatedRequest,
    @Body() body: { sessionName?: string; session?: string },
  ) {
    void req;
    void body;
    const status = await this.providerRegistry.getSessionStatus(req.workspaceId).catch(() => null);
    return this.buildMetaUnsupportedResponse('legacy_session_link', {
      authUrl: status?.authUrl || null,
    });
  }

  /**
   * POST /whatsapp-api/session/claim
   * Reivindica uma sessão conectada criada em um workspace guest/anônimo
   * e a vincula permanentemente ao workspace autenticado atual.
   */
  @Post('session/claim')
  async claimSession(
    @Req() req: AuthenticatedRequest,
    @Body() body: { sourceWorkspaceId?: string },
  ) {
    void req;
    void body;
    const status = await this.providerRegistry.getSessionStatus(req.workspaceId).catch(() => null);
    return this.buildMetaUnsupportedResponse('legacy_session_claim', {
      authUrl: status?.authUrl || null,
    });
  }

  /**
   * POST /whatsapp-api/session/backlog/start
   * Owner aprova a execução do backlog ou ativa apenas o live mode.
   */
  @Post('session/backlog/start')
  async startBacklog(
    @Req() req: AuthenticatedRequest,
    @Body() body: { mode?: string; limit?: number },
  ) {
    if (body?.mode === 'pause_autonomy') {
      return this.ciaRuntime.pauseAutonomy(req.workspaceId);
    }
    return this.ciaRuntime.startBacklogRun(req.workspaceId, body?.mode as any, body?.limit);
  }

  @Post('cia/conversations/:conversationId/resume')
  async resumeConversationAutonomy(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    return this.ciaRuntime.resumeConversationAutonomy(req.workspaceId, conversationId);
  }

  @Get('cia/intelligence')
  async getOperationalIntelligence(@Req() req: AuthenticatedRequest) {
    return this.ciaRuntime.getOperationalIntelligence(req.workspaceId);
  }

  /**
   * GET /whatsapp-api/agent/stream
   * Stream SSE dos pensamentos/eventos operacionais do CIA.
   */
  @Get('agent/stream')
  async streamAgent(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const workspaceId = req.workspaceId;
    const safeWrite = (data: any) => {
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
        } catch {}
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

  /**
   * GET /whatsapp-api/live
   * Stream SSE dedicado para espelhar ao vivo conta + WhatsApp + prova operacional.
   */
  @Get('live')
  async streamLive(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const workspaceId = req.workspaceId;
    const safeWrite = (data: any) => {
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
        } catch {}
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

  /**
   * GET /whatsapp-api/session/qr
   * Retorna QR Code como base64 para autenticação
   */
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

  @Post('session/action')
  async performSessionAction(
    @Req() req: AuthenticatedRequest,
    @Body() body: { action?: Record<string, unknown> },
  ) {
    void req;
    void body;
    return this.buildMetaUnsupportedResponse('session_action');
  }

  @Post('session/takeover')
  async takeover(@Req() req: AuthenticatedRequest) {
    void req;
    return this.buildMetaUnsupportedResponse('session_takeover');
  }

  @Post('session/resume-agent')
  async resumeAgent(@Req() req: AuthenticatedRequest) {
    void req;
    return this.buildMetaUnsupportedResponse('resume_agent');
  }

  @Post('session/pause-agent')
  async pauseAgent(@Req() req: AuthenticatedRequest, @Body() body: { paused?: boolean }) {
    void req;
    void body;
    return this.buildMetaUnsupportedResponse('pause_agent');
  }

  @Post('session/reconcile')
  async reconcileSession(@Req() req: AuthenticatedRequest, @Body() body: { objective?: string }) {
    void req;
    void body;
    return this.buildMetaUnsupportedResponse('session_reconcile');
  }

  @Get('session/proofs')
  async getSessionProofs(@Req() req: AuthenticatedRequest) {
    void req;
    return {
      ...this.buildMetaUnsupportedResponse('session_proofs'),
      proofs: [],
    };
  }

  @Post('session/stream-token')
  async getSessionStreamToken(@Req() req: AuthenticatedRequest) {
    void req;
    return this.buildMetaUnsupportedResponse('session_stream_token');
  }

  @Get('session/stream-health')
  async getSessionStreamHealth(@Req() req: AuthenticatedRequest) {
    const providerType = await this.providerRegistry.getProviderType(req.workspaceId);
    return {
      success: true,
      provider: providerType,
      workerAvailable: false,
      degraded: false,
      health: { enabled: false, reason: 'meta_cloud_has_no_browser_stream' },
    };
  }

  @Post('session/action-turn')
  async runSessionActionTurn(
    @Req() req: AuthenticatedRequest,
    @Body() body: { objective?: string; dryRun?: boolean; mode?: string },
  ) {
    void req;
    void body;
    return this.buildMetaUnsupportedResponse('session_action_turn');
  }

  /**
   * DELETE /whatsapp-api/session/disconnect
   * Encerra sessão do WhatsApp
   */
  @Delete('session/disconnect')
  async disconnect(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId;
    return this.providerRegistry.disconnect(workspaceId);
  }

  /**
   * POST /whatsapp-api/session/logout
   * Faz logout/reset completo da sessão do WhatsApp
   */
  @Post('session/logout')
  async logout(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId;
    return this.providerRegistry.logout(workspaceId);
  }

  @Get('contacts')
  async getContacts(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.listContacts(req.workspaceId);
  }

  @Post('contacts')
  async createContact(
    @Req() req: AuthenticatedRequest,
    @Body() body: { phone: string; name?: string; email?: string },
  ) {
    return this.whatsappService.createContact(req.workspaceId, body);
  }

  @Get('chats')
  async getChats(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.listChats(req.workspaceId);
  }

  @Get('chats/:chatId/messages')
  async getChatMessages(@Req() req: AuthenticatedRequest, @Param('chatId') chatId: string) {
    const limit = Number(req.query?.limit || req.body?.limit || 100) || 100;
    const offset = Number(req.query?.offset || req.body?.offset || 0) || 0;
    const downloadMedia = String(req.query?.downloadMedia || '').toLowerCase() === 'true';

    return this.whatsappService.getChatMessages(req.workspaceId, decodeURIComponent(chatId), {
      limit,
      offset,
      downloadMedia,
    });
  }

  @Post('chats/:chatId/presence')
  async setPresence(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: string,
    @Body()
    body: { presence?: 'typing' | 'paused' | 'seen' | 'available' | 'offline' },
  ) {
    return this.whatsappService.setPresence(
      req.workspaceId,
      decodeURIComponent(chatId),
      body?.presence,
    );
  }

  @Get('backlog/report')
  async getOperationalBacklogReport(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.getOperationalBacklogReport(req.workspaceId, {
      limit: this.readNumberQuery(req.query?.limit, 100, 1, 500),
      includeResolved: this.readBooleanQuery(req.query?.includeResolved, false),
    });
  }

  @Get('backlog')
  async getBacklog(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.getBacklog(req.workspaceId);
  }

  @Get('catalog/contacts')
  async getCatalogContacts(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.listCatalogContacts(req.workspaceId, {
      days: this.readNumberQuery(req.query?.days, 30, 1, 365),
      page: this.readNumberQuery(req.query?.page, 1, 1, 10000),
      limit: this.readNumberQuery(req.query?.limit, 50, 1, 200),
      onlyCataloged: this.readBooleanQuery(req.query?.onlyCataloged, true),
    });
  }

  @Get('catalog/ranking')
  async getCatalogRanking(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.listPurchaseProbabilityRanking(req.workspaceId, {
      days: this.readNumberQuery(req.query?.days, 30, 1, 365),
      limit: this.readNumberQuery(req.query?.limit, 50, 1, 200),
      minLeadScore: this.readNumberQuery(req.query?.minLeadScore, 0, 0, 100),
      minProbabilityScore: this.readNumberQuery(req.query?.minProbabilityScore, 0, 0, 1),
      onlyCataloged: this.readBooleanQuery(req.query?.onlyCataloged, true),
      excludeBuyers: this.readBooleanQuery(req.query?.excludeBuyers, false),
    });
  }

  @Post('catalog/refresh')
  async triggerCatalogRefresh(
    @Req() req: AuthenticatedRequest,
    @Body() body: { days?: number; reason?: string },
  ) {
    return this.whatsappService.triggerCatalogRefresh(req.workspaceId, {
      days: this.readNumberQuery(body?.days, 30, 1, 365),
      reason: String(body?.reason || 'manual_catalog_refresh'),
    });
  }

  @Post('catalog/score')
  async triggerCatalogScore(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      contactId?: string;
      days?: number;
      limit?: number;
      reason?: string;
    },
  ) {
    return this.whatsappService.triggerCatalogRescore(req.workspaceId, {
      contactId: body?.contactId ? String(body.contactId) : undefined,
      days: this.readNumberQuery(body?.days, 30, 1, 365),
      limit: this.readNumberQuery(body?.limit, 100, 1, 500),
      reason: String(body?.reason || 'manual_catalog_rescore'),
    });
  }

  @Post('backlog/rebuild')
  async rebuildBacklog(
    @Req() req: AuthenticatedRequest,
    @Body() body: { limit?: number; reason?: string },
  ) {
    return this.whatsappService.triggerBacklogRebuild(req.workspaceId, {
      limit: this.readNumberQuery(body?.limit, 500, 1, 2000),
      reason: String(body?.reason || 'manual_backlog_rebuild'),
    });
  }

  @Post('session/recreate-if-invalid')
  async recreateSessionIfInvalid(@Req() req: AuthenticatedRequest) {
    return this.whatsappService.recreateSessionIfInvalid(req.workspaceId);
  }

  @Post('sync')
  async sync(@Req() req: AuthenticatedRequest, @Body() body: { reason?: string }) {
    return this.whatsappService.triggerSync(req.workspaceId, body?.reason || 'manual_sync');
  }

  /**
   * POST /whatsapp-api/send/:phone
   * Envia mensagem de texto para o número especificado
   */
  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('send/:phone')
  async sendMessage(@Req() req: AuthenticatedRequest, @Param('phone') phone: string) {
    const workspaceId = req.workspaceId;
    const { message, mediaUrl, caption, mediaType } = req.body || {};
    const providerType = await this.providerRegistry.getProviderType(workspaceId);

    if (mediaUrl) {
      return this.whatsappApi.sendMediaFromUrl(workspaceId, phone, mediaUrl, caption, mediaType);
    }

    return this.whatsappApi.sendMessage(workspaceId, phone, message);
  }

  /**
   * GET /whatsapp-api/check/:phone
   * Verifica se número está registrado no WhatsApp
   */
  @Get('check/:phone')
  async checkRegistration(@Req() req: AuthenticatedRequest, @Param('phone') phone: string) {
    const workspaceId = req.workspaceId;
    await this.providerRegistry.getProviderType(workspaceId);
    const isRegistered = await this.whatsappApi.isRegisteredUser(workspaceId, phone);
    return { phone, registered: isRegistered };
  }

  /**
   * GET /whatsapp-api/health
   * Health check da API whatsapp-api
   */
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

  /**
   * GET /whatsapp-api/provider-status
   * Status unificado do provider registry para o workspace
   */
  @Get('provider-status')
  async getProviderStatus(@Req() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId;
    const workspace = await this.workspaces.getWorkspace(workspaceId).catch(() => null);
    const settings = (workspace?.providerSettings as Record<string, any>) || {};
    const sessionMeta = (settings?.whatsappWebSession ||
      settings?.whatsappApiSession ||
      {}) as Record<string, any>;
    const providerType = await this.providerRegistry.getProviderType(workspaceId);
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    const health = await this.providerRegistry.healthCheck();

    const runtimeDiagnostics = this.whatsappApi.getRuntimeConfigDiagnostics();
    const sessionDiagnostics = await this.whatsappApi.getSessionConfigDiagnostics(workspaceId);
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

    if (sessionMeta?.recoveryBlockedReason) {
      degradedReasons.push(String(sessionMeta.recoveryBlockedReason));
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

  private readNumberQuery(value: any, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  private readBooleanQuery(value: any, fallback = false) {
    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
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
}
