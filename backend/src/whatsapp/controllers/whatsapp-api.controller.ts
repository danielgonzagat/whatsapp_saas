import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { WhatsAppProviderRegistry } from '../providers/provider-registry';
import { WhatsAppApiProvider } from '../providers/whatsapp-api.provider';
import { WhatsAppWebAgentProvider } from '../providers/web-agent.provider';
import { WhatsAppCatchupService } from '../whatsapp-catchup.service';
import { AgentEventsService } from '../agent-events.service';
import { CiaRuntimeService } from '../cia-runtime.service';
import { WhatsappService } from '../whatsapp.service';
import { AccountAgentService } from '../account-agent.service';
import { WorkspaceService } from '../../workspaces/workspace.service';
import { WhatsAppWatchdogService } from '../whatsapp-watchdog.service';
import { WorkerBrowserRuntimeService } from '../worker-browser-runtime.service';

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
    private readonly whatsappWebAgent: WhatsAppWebAgentProvider,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly agentEvents: AgentEventsService,
    private readonly ciaRuntime: CiaRuntimeService,
    private readonly whatsappService: WhatsappService,
    private readonly accountAgent: AccountAgentService,
    private readonly workspaces: WorkspaceService,
    private readonly watchdog: WhatsAppWatchdogService,
    private readonly workerBrowserRuntime: WorkerBrowserRuntimeService,
  ) {}

  private resolveScreencastSecret(): string {
    return String(
      process.env.SCREENCAST_SHARED_SECRET ||
        process.env.INTERNAL_API_KEY ||
        '',
    ).trim();
  }

  private signScreencastPayload(payloadPart: string): string {
    const secret = this.resolveScreencastSecret();
    if (!secret) {
      return '';
    }

    return createHmac('sha256', secret).update(payloadPart).digest('base64url');
  }

  private isBrowserOnlyMode(): boolean {
    const explicit = String(process.env.WHATSAPP_BROWSER_ONLY || '')
      .trim()
      .toLowerCase();
    if (explicit) {
      return explicit !== 'false';
    }

    return (
      String(process.env.WHATSAPP_PROVIDER_DEFAULT || '').trim() ===
      'whatsapp-web-agent'
    );
  }

  private normalizeBrowserSnapshotState(
    status: {
      connected?: boolean;
      status?: string;
    } | null,
  ): string {
    if (status?.connected) {
      return 'CONNECTED';
    }

    const raw = String(status?.status || '')
      .trim()
      .toUpperCase();
    if (raw === 'QR_PENDING' || raw === 'SCAN_QR_CODE') {
      return 'QR_PENDING';
    }
    if (raw === 'STARTING' || raw === 'OPENING') {
      return 'BOOTING';
    }

    return raw || 'DISCONNECTED';
  }

  private buildWorkerUnavailableResponse(
    error: any,
    extra?: Record<string, any>,
  ) {
    return {
      success: false,
      workerAvailable: false,
      degraded: true,
      error: this.workerBrowserRuntime.getErrorCode(error),
      ...(extra || {}),
    };
  }

  private async getBrowserRuntimeState(workspaceId: string): Promise<{
    workerAvailable: boolean;
    workerError: string | null;
    viewerSnapshot: Record<string, any> | null;
    viewerImage: string | null;
    screencastHealth: Record<string, any> | null;
    screencastStatus: 'streaming' | 'ready' | 'disabled' | 'unavailable';
  }> {
    let workerError: string | null = null;
    let viewerSnapshot: Record<string, any> | null = null;
    let viewerImage: string | null = null;
    let screencastHealth: Record<string, any> | null = null;

    try {
      const viewer = await this.workerBrowserRuntime.getViewer(workspaceId);
      viewerSnapshot = (viewer?.snapshot as Record<string, any>) || null;
      viewerImage =
        viewer?.image || viewer?.snapshot?.screenshotDataUrl || null;
    } catch (error: any) {
      workerError = this.workerBrowserRuntime.getErrorCode(error);
    }

    try {
      screencastHealth = await this.workerBrowserRuntime.getScreencastHealth();
    } catch (error: any) {
      workerError ||= this.workerBrowserRuntime.getErrorCode(error);
    }

    const workerAvailable = Boolean(viewerSnapshot || screencastHealth);
    const screencastStatus: 'streaming' | 'ready' | 'disabled' | 'unavailable' =
      !workerAvailable
        ? 'unavailable'
        : screencastHealth?.enabled === false
          ? 'disabled'
          : Number(screencastHealth?.activeStreams || 0) > 0 ||
              Number(screencastHealth?.viewers || 0) > 0
            ? 'streaming'
            : 'ready';

    return {
      workerAvailable,
      workerError,
      viewerSnapshot,
      viewerImage,
      screencastHealth,
      screencastStatus,
    };
  }

  private async getSessionDiagnostics(workspaceId: string) {
    const workspace = await this.workspaces.getWorkspace(workspaceId);
    const settings = (workspace?.providerSettings as Record<string, any>) || {};
    const sessionSnapshot = (settings?.whatsappWebSession ||
      settings?.whatsappApiSession ||
      {}) as Record<string, any>;
    const providerType =
      await this.providerRegistry.getProviderType(workspaceId);
    const sessionName =
      String(sessionSnapshot?.sessionName || '').trim() ||
      (providerType === 'whatsapp-web-agent'
        ? this.whatsappWebAgent.getResolvedSessionId(workspaceId)
        : this.whatsappApi.getResolvedSessionId(workspaceId));

    if (providerType === 'whatsapp-web-agent') {
      const [status, runtime] = await Promise.all([
        this.providerRegistry.getSessionStatus(workspaceId).catch(() => null),
        this.getBrowserRuntimeState(workspaceId),
      ]);

      return {
        workspaceId,
        workspaceName: workspace?.name || null,
        sessionName,
        providerType,
        status,
        sessionSnapshot,
        browserSnapshot: runtime.viewerSnapshot || null,
        workerAvailable: runtime.workerAvailable,
        workerError: runtime.workerError,
        screencastHealth: runtime.screencastHealth,
        screencastStatus: runtime.screencastStatus,
        generatedAt: new Date().toISOString(),
      };
    }

    const [status, configDiagnostics, clientInfo, operationalIntelligence] =
      await Promise.all([
        this.providerRegistry.getSessionStatus(workspaceId).catch(() => null),
        this.whatsappApi
          .getSessionConfigDiagnostics(sessionName)
          .catch((error: any) => ({
            available: false,
            error: String(error?.message || error || 'unknown_error'),
          })),
        this.whatsappApi.getClientInfo(sessionName).catch(() => null),
        this.ciaRuntime
          .getOperationalIntelligence(workspaceId)
          .catch(() => null),
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
  async startSession(@Req() req: any) {
    const workspaceId = req.workspaceId;
    const result = await this.providerRegistry.startSession(workspaceId);

    if (result.success && result.message === 'already_connected') {
      await this.catchupService.triggerCatchup(
        workspaceId,
        'session_start_already_connected',
      );
    }

    return result;
  }

  /**
   * GET /whatsapp-api/session/status
   * Retorna status da sessão (CONNECTED, DISCONNECTED, QR_CODE, etc)
   */
  @Get('session/status')
  async getStatus(@Req() req: any) {
    const workspaceId = req.workspaceId;
    const [providerType, status] = await Promise.all([
      this.providerRegistry.getProviderType(workspaceId),
      this.providerRegistry.getSessionStatus(workspaceId),
    ]);

    if (providerType === 'whatsapp-web-agent') {
      const runtime = await this.getBrowserRuntimeState(workspaceId);
      const qrCode =
        status.qrCode ||
        runtime.viewerImage ||
        runtime.viewerSnapshot?.screenshotDataUrl ||
        null;

      return {
        ...status,
        provider: providerType,
        workerAvailable: runtime.workerAvailable,
        workerHealthy: runtime.workerAvailable,
        workerError: runtime.workerError,
        degraded: !runtime.workerAvailable,
        browserSessionStatus:
          runtime.viewerSnapshot?.state ||
          this.normalizeBrowserSnapshotState(status),
        screencastStatus: runtime.screencastStatus,
        qrAvailable: Boolean(qrCode),
        viewerAvailable: Boolean(
          runtime.viewerSnapshot?.viewerAvailable || runtime.viewerImage,
        ),
        takeoverActive: Boolean(runtime.viewerSnapshot?.takeoverActive),
        agentPaused: Boolean(runtime.viewerSnapshot?.agentPaused),
        lastObservationAt: runtime.viewerSnapshot?.lastObservationAt || null,
        lastActionAt: runtime.viewerSnapshot?.lastActionAt || null,
        observationSummary: runtime.viewerSnapshot?.observationSummary || null,
        activeProvider: runtime.viewerSnapshot?.activeProvider || null,
        proofCount: runtime.viewerSnapshot?.proofCount || 0,
        viewport: runtime.viewerSnapshot?.viewport || null,
        qrCode,
      };
    }

    return {
      ...status,
      provider: providerType,
    };
  }

  @Get('session/diagnostics')
  async getDiagnostics(@Req() req: any) {
    return this.getSessionDiagnostics(req.workspaceId);
  }

  @Post('session/force-check')
  async forceCheck(@Req() req: any) {
    const workspace = await this.workspaces.getWorkspace(req.workspaceId);
    await this.watchdog.checkWorkspaceSession(
      req.workspaceId,
      workspace?.name || req.workspaceId,
    );

    return {
      success: true,
      diagnostics: await this.getSessionDiagnostics(req.workspaceId),
    };
  }

  @Post('session/force-reconnect')
  async forceReconnect(@Req() req: any) {
    const diagnosticsBefore = await this.getSessionDiagnostics(req.workspaceId);
    const providerType = await this.providerRegistry.getProviderType(
      req.workspaceId,
    );
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
  async repairConfig(@Req() req: any) {
    const providerType = await this.providerRegistry.getProviderType(
      req.workspaceId,
    );
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
  async bootstrapSession(@Req() req: any) {
    return this.ciaRuntime.bootstrap(req.workspaceId);
  }

  /**
   * POST /whatsapp-api/session/link
   * Vincula uma sessionName existente no WAHA ao workspace atual.
   */
  @Post('session/link')
  async linkSession(@Req() req: any, @Body() body: { sessionName?: string; session?: string }) {
    if (this.isBrowserOnlyMode()) {
      return {
        success: false,
        message: 'waha_link_disabled_in_browser_only_mode',
      };
    }

    const workspaceId = req.workspaceId;
    const sessionName = String(body?.sessionName || body?.session || '').trim();

    if (!sessionName) {
      return {
        success: false,
        message: 'sessionName is required',
      };
    }

    const workspace = await this.workspaces.getWorkspace(workspaceId);
    const currentSettings =
      (workspace?.providerSettings as Record<string, any>) || {};
    const currentSession = currentSettings?.whatsappApiSession || {};

    await this.workspaces.patchSettings(workspaceId, {
      whatsappProvider: 'whatsapp-api',
      whatsappApiSession: {
        ...currentSession,
        sessionName,
        linkedAt: new Date().toISOString(),
      },
    });

    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    const bootstrap =
      status?.connected === true
        ? await this.ciaRuntime.bootstrap(workspaceId)
        : null;

    return {
      success: true,
      workspaceId,
      sessionName,
      status,
      bootstrap,
    };
  }

  /**
   * POST /whatsapp-api/session/claim
   * Reivindica uma sessão conectada criada em um workspace guest/anônimo
   * e a vincula permanentemente ao workspace autenticado atual.
   */
  @Post('session/claim')
  async claimSession(@Req() req: any, @Body() body: { sourceWorkspaceId?: string }) {
    if (this.isBrowserOnlyMode()) {
      return {
        success: false,
        message: 'waha_claim_disabled_in_browser_only_mode',
      };
    }

    const targetWorkspaceId = req.workspaceId;
    const sourceWorkspaceId = String(body?.sourceWorkspaceId || '').trim();

    if (!sourceWorkspaceId) {
      return {
        success: false,
        message: 'sourceWorkspaceId is required',
      };
    }

    if (sourceWorkspaceId === targetWorkspaceId) {
      const status =
        await this.providerRegistry.getSessionStatus(targetWorkspaceId);
      return {
        success: true,
        sourceWorkspaceId,
        targetWorkspaceId,
        status,
        bootstrap: status.connected
          ? await this.ciaRuntime.bootstrap(targetWorkspaceId)
          : null,
      };
    }

    const sourceWorkspace = await this.workspaces
      .getWorkspace(sourceWorkspaceId)
      .catch(() => null);

    if (!sourceWorkspace) {
      return {
        success: false,
        message: 'source_workspace_not_found',
      };
    }

    const sourceSettings =
      (sourceWorkspace.providerSettings as Record<string, any>) || {};
    const sourceIsAnonymous =
      sourceSettings?.guestMode === true ||
      sourceSettings?.anonymousGuest === true ||
      sourceSettings?.authMode === 'anonymous' ||
      sourceSettings?.auth?.anonymous === true;

    if (!sourceIsAnonymous) {
      return {
        success: false,
        message: 'source_workspace_not_claimable',
      };
    }

    const sourceStatus =
      await this.providerRegistry.getSessionStatus(sourceWorkspaceId);
    const refreshedSourceWorkspace = await this.workspaces
      .getWorkspace(sourceWorkspaceId)
      .catch(() => null);
    const refreshedSourceSettings =
      (refreshedSourceWorkspace?.providerSettings as Record<string, any>) ||
      sourceSettings;
    const sourceSession = refreshedSourceSettings?.whatsappApiSession || {};
    const claimedSessionName = String(sourceSession?.sessionName || '').trim();

    if (!claimedSessionName) {
      return {
        success: false,
        message: 'source_session_not_found',
        status: sourceStatus,
      };
    }

    const targetWorkspace =
      await this.workspaces.getWorkspace(targetWorkspaceId);
    const targetSettings =
      (targetWorkspace?.providerSettings as Record<string, any>) || {};
    const targetSession = targetSettings?.whatsappApiSession || {};
    const claimedAt = new Date().toISOString();

    await this.workspaces.patchSettings(targetWorkspaceId, {
      whatsappProvider: 'whatsapp-api',
      whatsappApiSession: {
        ...targetSession,
        ...sourceSession,
        sessionName: claimedSessionName,
        linkedAt: claimedAt,
        claimedAt,
        claimedFromWorkspaceId: sourceWorkspaceId,
      },
    });

    await this.workspaces.patchSettings(sourceWorkspaceId, {
      connectionStatus: sourceStatus.connected ? 'claimed' : 'disconnected',
      whatsappApiSession: {
        ...sourceSession,
        status: sourceStatus.connected ? 'claimed' : 'disconnected',
        sessionName: null,
        qrCode: null,
        connectedAt: null,
        claimedAt,
        claimedByWorkspaceId: targetWorkspaceId,
        disconnectReason: `claimed_by:${targetWorkspaceId}`,
      },
    });

    const status =
      await this.providerRegistry.getSessionStatus(targetWorkspaceId);
    const bootstrap =
      status?.connected === true
        ? await this.ciaRuntime.bootstrap(targetWorkspaceId)
        : null;

    return {
      success: true,
      sourceWorkspaceId,
      targetWorkspaceId,
      sessionName: claimedSessionName,
      status,
      bootstrap,
    };
  }

  /**
   * POST /whatsapp-api/session/backlog/start
   * Owner aprova a execução do backlog ou ativa apenas o live mode.
   */
  @Post('session/backlog/start')
  async startBacklog(@Req() req: any, @Body() body: { mode?: string; limit?: number }) {
    if (body?.mode === 'pause_autonomy') {
      return this.ciaRuntime.pauseAutonomy(req.workspaceId);
    }
    return this.ciaRuntime.startBacklogRun(
      req.workspaceId,
      body?.mode as any,
      body?.limit,
    );
  }

  @Post('cia/conversations/:conversationId/resume')
  async resumeConversationAutonomy(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
  ) {
    return this.ciaRuntime.resumeConversationAutonomy(
      req.workspaceId,
      conversationId,
    );
  }

  @Get('cia/intelligence')
  async getOperationalIntelligence(@Req() req: any) {
    return this.ciaRuntime.getOperationalIntelligence(req.workspaceId);
  }

  /**
   * GET /whatsapp-api/agent/stream
   * Stream SSE dos pensamentos/eventos operacionais do CIA.
   */
  @Get('agent/stream')
  async streamAgent(@Req() req: any, @Res() res: Response) {
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
  async streamLive(@Req() req: any, @Res() res: Response) {
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
  async getQrCode(@Req() req: any) {
    const workspaceId = req.workspaceId;
    const providerType =
      await this.providerRegistry.getProviderType(workspaceId);
    const result =
      providerType === 'whatsapp-web-agent'
        ? await this.whatsappWebAgent.getQrCode(workspaceId)
        : await this.whatsappApi.getQrCode(workspaceId);

    if (result.qr) {
      return {
        available: true,
        qr: result.qr, // base64 data URL
      };
    }

    const sessionStatus =
      await this.providerRegistry.getSessionStatus(workspaceId);
    const fallbackQr = sessionStatus?.qrCode || null;

    if (fallbackQr) {
      return {
        available: true,
        qr: fallbackQr,
        message: 'QR Code recuperado do snapshot da sessão.',
      };
    }

    return {
      available: false,
      message:
        result.message ||
        'QR Code não disponível. Verifique se a sessão foi iniciada.',
    };
  }

  @Get('session/view')
  async getSessionView(@Req() req: any) {
    const workspaceId = req.workspaceId;
    const providerType =
      await this.providerRegistry.getProviderType(workspaceId);
    const status = await this.providerRegistry.getSessionStatus(workspaceId);

    if (providerType !== 'whatsapp-web-agent') {
      return {
        success: true,
        provider: providerType,
        snapshot: {
          workspaceId,
          state: status.connected ? 'CONNECTED' : 'DISCONNECTED',
          connected: status.connected,
          screenshotDataUrl: status.qrCode || null,
          viewerAvailable: Boolean(status.qrCode),
          takeoverActive: false,
          viewport: { width: 0, height: 0 },
        },
        image: status.qrCode || null,
      };
    }

    try {
      const viewer = await this.workerBrowserRuntime.getViewer(workspaceId);
      return {
        success: true,
        provider: providerType,
        workerAvailable: true,
        degraded: false,
        qrAvailable: Boolean(
          viewer?.image || viewer?.snapshot?.screenshotDataUrl || status.qrCode,
        ),
        ...viewer,
      };
    } catch (error: any) {
      return {
        success: true,
        provider: providerType,
        workerAvailable: false,
        degraded: true,
        error: this.workerBrowserRuntime.getErrorCode(error),
        qrAvailable: Boolean(status.qrCode),
        snapshot: {
          workspaceId,
          state: this.normalizeBrowserSnapshotState(status),
          connected: status.connected,
          screenshotDataUrl: status.qrCode || null,
          viewerAvailable: false,
          takeoverActive: false,
          agentPaused: false,
          viewport: { width: 0, height: 0 },
        },
        image: status.qrCode || null,
      };
    }
  }

  @Post('session/action')
  async performSessionAction(@Req() req: any, @Body() body: { action?: Record<string, unknown> }) {
    try {
      return await this.workerBrowserRuntime.performAction({
        workspaceId: req.workspaceId,
        action: body?.action || {},
      });
    } catch (error: any) {
      return this.buildWorkerUnavailableResponse(error);
    }
  }

  @Post('session/takeover')
  async takeover(@Req() req: any) {
    try {
      const snapshot = await this.workerBrowserRuntime.takeover(
        req.workspaceId,
      );
      return { success: true, workerAvailable: true, snapshot };
    } catch (error: any) {
      return this.buildWorkerUnavailableResponse(error);
    }
  }

  @Post('session/resume-agent')
  async resumeAgent(@Req() req: any) {
    try {
      const snapshot = await this.workerBrowserRuntime.resumeAgent(
        req.workspaceId,
      );
      return { success: true, workerAvailable: true, snapshot };
    } catch (error: any) {
      return this.buildWorkerUnavailableResponse(error);
    }
  }

  @Post('session/pause-agent')
  async pauseAgent(@Req() req: any, @Body() body: { paused?: boolean }) {
    try {
      const snapshot = await this.workerBrowserRuntime.pauseAgent(
        req.workspaceId,
        body?.paused !== false,
      );
      return { success: true, workerAvailable: true, snapshot };
    } catch (error: any) {
      return this.buildWorkerUnavailableResponse(error);
    }
  }

  @Post('session/reconcile')
  async reconcileSession(@Req() req: any, @Body() body: { objective?: string }) {
    try {
      const result = await this.workerBrowserRuntime.reconcileSession(
        req.workspaceId,
        body?.objective,
      );
      return {
        ...result,
        workerAvailable: true,
        degraded: false,
      };
    } catch (error: any) {
      return this.buildWorkerUnavailableResponse(error);
    }
  }

  @Get('session/proofs')
  async getSessionProofs(@Req() req: any) {
    const limit = Number(req?.query?.limit || 25) || 25;
    try {
      return {
        success: true,
        workerAvailable: true,
        degraded: false,
        proofs: await this.workerBrowserRuntime.getProofs(
          req.workspaceId,
          limit,
        ),
      };
    } catch (error: any) {
      return {
        success: true,
        workerAvailable: false,
        degraded: true,
        error: this.workerBrowserRuntime.getErrorCode(error),
        proofs: [],
      };
    }
  }

  @Post('session/stream-token')
  async getSessionStreamToken(@Req() req: any) {
    const ttlSeconds = Math.max(
      30,
      parseInt(process.env.SCREENCAST_TOKEN_TTL_SECONDS || '120', 10) || 120,
    );
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      workspaceId: req.workspaceId,
      userId: req.user?.id || req.user?.sub || null,
      iat: now,
      exp: now + ttlSeconds,
      nonce: randomBytes(12).toString('hex'),
    };
    const payloadPart = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = this.signScreencastPayload(payloadPart);

    return {
      success: true,
      token: signature ? `${payloadPart}.${signature}` : 'guest',
      expiresAt: new Date((now + ttlSeconds) * 1000).toISOString(),
      workspaceId: req.workspaceId,
      requireToken: Boolean(signature),
    };
  }

  @Get('session/stream-health')
  async getSessionStreamHealth(@Req() req: any) {
    const providerType = await this.providerRegistry.getProviderType(
      req.workspaceId,
    );

    if (providerType !== 'whatsapp-web-agent') {
      return {
        success: true,
        provider: providerType,
        workerAvailable: false,
        degraded: true,
        health: { enabled: false, reason: 'provider_not_browser_runtime' },
      };
    }

    const runtime = await this.getBrowserRuntimeState(req.workspaceId);

    return {
      success: true,
      provider: providerType,
      workerAvailable: runtime.workerAvailable,
      degraded: !runtime.workerAvailable,
      error: runtime.workerError,
      health: runtime.screencastHealth || {
        enabled: false,
        reason: runtime.workerError || 'worker_unavailable',
      },
    };
  }

  @Post('session/action-turn')
  async runSessionActionTurn(@Req() req: any, @Body() body: { objective?: string; dryRun?: boolean; mode?: string }) {
    try {
      const result = await this.workerBrowserRuntime.runActionTurn({
        workspaceId: req.workspaceId,
        objective: String(body?.objective || '').trim(),
        dryRun: body?.dryRun === true,
        mode: String(body?.mode || '').trim() || undefined,
      });
      return {
        ...result,
        workerAvailable: true,
        degraded: false,
      };
    } catch (error: any) {
      return this.buildWorkerUnavailableResponse(error);
    }
  }

  /**
   * DELETE /whatsapp-api/session/disconnect
   * Encerra sessão do WhatsApp
   */
  @Delete('session/disconnect')
  async disconnect(@Req() req: any) {
    const workspaceId = req.workspaceId;
    return this.providerRegistry.disconnect(workspaceId);
  }

  /**
   * POST /whatsapp-api/session/logout
   * Faz logout/reset completo da sessão do WhatsApp
   */
  @Post('session/logout')
  async logout(@Req() req: any) {
    const workspaceId = req.workspaceId;
    return this.providerRegistry.logout(workspaceId);
  }

  @Get('contacts')
  async getContacts(@Req() req: any) {
    return this.whatsappService.listContacts(req.workspaceId);
  }

  @Post('contacts')
  async createContact(@Req() req: any, @Body() body: { phone: string; name?: string; email?: string }) {
    return this.whatsappService.createContact(req.workspaceId, body);
  }

  @Get('chats')
  async getChats(@Req() req: any) {
    return this.whatsappService.listChats(req.workspaceId);
  }

  @Get('chats/:chatId/messages')
  async getChatMessages(@Req() req: any, @Param('chatId') chatId: string) {
    const limit = Number(req.query?.limit || req.body?.limit || 100) || 100;
    const offset = Number(req.query?.offset || req.body?.offset || 0) || 0;
    const downloadMedia =
      String(req.query?.downloadMedia || '').toLowerCase() === 'true';

    return this.whatsappService.getChatMessages(
      req.workspaceId,
      decodeURIComponent(chatId),
      {
        limit,
        offset,
        downloadMedia,
      },
    );
  }

  @Post('chats/:chatId/presence')
  async setPresence(
    @Req() req: any,
    @Param('chatId') chatId: string,
    @Body() body: { presence?: 'typing' | 'paused' | 'seen' | 'available' | 'offline' },
  ) {
    return this.whatsappService.setPresence(
      req.workspaceId,
      decodeURIComponent(chatId),
      body?.presence,
    );
  }

  @Get('backlog/report')
  async getOperationalBacklogReport(@Req() req: any) {
    return this.whatsappService.getOperationalBacklogReport(req.workspaceId, {
      limit: this.readNumberQuery(req.query?.limit, 100, 1, 500),
      includeResolved: this.readBooleanQuery(req.query?.includeResolved, false),
    });
  }

  @Get('backlog')
  async getBacklog(@Req() req: any) {
    return this.whatsappService.getBacklog(req.workspaceId);
  }

  @Get('catalog/contacts')
  async getCatalogContacts(@Req() req: any) {
    return this.whatsappService.listCatalogContacts(req.workspaceId, {
      days: this.readNumberQuery(req.query?.days, 30, 1, 365),
      page: this.readNumberQuery(req.query?.page, 1, 1, 10000),
      limit: this.readNumberQuery(req.query?.limit, 50, 1, 200),
      onlyCataloged: this.readBooleanQuery(req.query?.onlyCataloged, true),
    });
  }

  @Get('catalog/ranking')
  async getCatalogRanking(@Req() req: any) {
    return this.whatsappService.listPurchaseProbabilityRanking(
      req.workspaceId,
      {
        days: this.readNumberQuery(req.query?.days, 30, 1, 365),
        limit: this.readNumberQuery(req.query?.limit, 50, 1, 200),
        minLeadScore: this.readNumberQuery(req.query?.minLeadScore, 0, 0, 100),
        minProbabilityScore: this.readNumberQuery(
          req.query?.minProbabilityScore,
          0,
          0,
          1,
        ),
        onlyCataloged: this.readBooleanQuery(req.query?.onlyCataloged, true),
        excludeBuyers: this.readBooleanQuery(req.query?.excludeBuyers, false),
      },
    );
  }

  @Post('catalog/refresh')
  async triggerCatalogRefresh(@Req() req: any, @Body() body: { days?: number; reason?: string }) {
    return this.whatsappService.triggerCatalogRefresh(req.workspaceId, {
      days: this.readNumberQuery(body?.days, 30, 1, 365),
      reason: String(body?.reason || 'manual_catalog_refresh'),
    });
  }

  @Post('catalog/score')
  async triggerCatalogScore(@Req() req: any, @Body() body: { contactId?: string; days?: number; limit?: number; reason?: string }) {
    return this.whatsappService.triggerCatalogRescore(req.workspaceId, {
      contactId: body?.contactId ? String(body.contactId) : undefined,
      days: this.readNumberQuery(body?.days, 30, 1, 365),
      limit: this.readNumberQuery(body?.limit, 100, 1, 500),
      reason: String(body?.reason || 'manual_catalog_rescore'),
    });
  }

  @Post('backlog/rebuild')
  async rebuildBacklog(@Req() req: any, @Body() body: { limit?: number; reason?: string }) {
    return this.whatsappService.triggerBacklogRebuild(req.workspaceId, {
      limit: this.readNumberQuery(body?.limit, 500, 1, 2000),
      reason: String(body?.reason || 'manual_backlog_rebuild'),
    });
  }

  @Post('session/recreate-if-invalid')
  async recreateSessionIfInvalid(@Req() req: any) {
    return this.whatsappService.recreateSessionIfInvalid(req.workspaceId);
  }

  @Post('sync')
  async sync(@Req() req: any, @Body() body: { reason?: string }) {
    return this.whatsappService.triggerSync(
      req.workspaceId,
      body?.reason || 'manual_sync',
    );
  }

  /**
   * POST /whatsapp-api/send/:phone
   * Envia mensagem de texto para o número especificado
   */
  @Post('send/:phone')
  async sendMessage(@Req() req: any, @Param('phone') phone: string) {
    const workspaceId = req.workspaceId;
    const { message, mediaUrl, caption, mediaType } = req.body || {};
    const providerType =
      await this.providerRegistry.getProviderType(workspaceId);

    if (mediaUrl) {
      return providerType === 'whatsapp-web-agent'
        ? this.whatsappWebAgent.sendMediaFromUrl(
            workspaceId,
            phone,
            mediaUrl,
            caption,
            mediaType,
          )
        : this.whatsappApi.sendMediaFromUrl(
            workspaceId,
            phone,
            mediaUrl,
            caption,
            mediaType,
          );
    }

    return providerType === 'whatsapp-web-agent'
      ? this.whatsappWebAgent.sendMessage(workspaceId, phone, message)
      : this.whatsappApi.sendMessage(workspaceId, phone, message);
  }

  /**
   * GET /whatsapp-api/check/:phone
   * Verifica se número está registrado no WhatsApp
   */
  @Get('check/:phone')
  async checkRegistration(@Req() req: any, @Param('phone') phone: string) {
    const workspaceId = req.workspaceId;
    const providerType =
      await this.providerRegistry.getProviderType(workspaceId);
    const isRegistered =
      providerType === 'whatsapp-web-agent'
        ? await this.whatsappWebAgent.isRegisteredUser(workspaceId, phone)
        : await this.whatsappApi.isRegisteredUser(workspaceId, phone);
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
      healthy: health.whatsappApi || health.whatsappWebAgent,
      providers: health,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /whatsapp-api/provider-status
   * Status unificado do provider registry para o workspace
   */
  @Get('provider-status')
  async getProviderStatus(@Req() req: any) {
    const workspaceId = req.workspaceId;
    const workspace = await this.workspaces
      .getWorkspace(workspaceId)
      .catch(() => null);
    const settings = (workspace?.providerSettings as Record<string, any>) || {};
    const sessionMeta = (settings?.whatsappWebSession ||
      settings?.whatsappApiSession ||
      {}) as Record<string, any>;
    const providerType =
      await this.providerRegistry.getProviderType(workspaceId);
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    const health = await this.providerRegistry.healthCheck();
    if (providerType === 'whatsapp-web-agent') {
      const viewer = await this.workerBrowserRuntime
        .getViewer(workspaceId)
        .catch(() => null);

      return {
        providerType,
        status,
        health,
        workspaceId,
        workspaceName: workspace?.name || null,
        sessionMeta,
        browserSnapshot: viewer?.snapshot || null,
        degradedReasons: [],
      };
    }

    const runtimeDiagnostics = this.whatsappApi.getRuntimeConfigDiagnostics();
    const sessionDiagnostics =
      await this.whatsappApi.getSessionConfigDiagnostics(workspaceId);
    const backlog = await this.whatsappService
      .getBacklog(workspaceId)
      .catch(() => null);

    const degradedReasons: string[] = [];
    if (!runtimeDiagnostics.webhookConfigured) {
      degradedReasons.push('waha_webhook_missing');
    } else if (!runtimeDiagnostics.inboundEventsConfigured) {
      degradedReasons.push('waha_webhook_events_missing_inbound');
    }

    if (!runtimeDiagnostics.storeEnabled) {
      degradedReasons.push('waha_store_disabled_in_runtime');
    }
    if (!runtimeDiagnostics.storeFullSync) {
      degradedReasons.push('waha_store_full_sync_disabled_in_runtime');
    }

    if (sessionDiagnostics.available) {
      if (!sessionDiagnostics.configPresent) {
        degradedReasons.push('waha_session_config_missing');
      }
      if (!sessionDiagnostics.webhookConfigured) {
        degradedReasons.push('waha_session_webhook_missing');
      } else if (!sessionDiagnostics.inboundEventsConfigured) {
        degradedReasons.push('waha_session_webhook_events_missing_inbound');
      }
      if (sessionDiagnostics.storeEnabled === false) {
        degradedReasons.push('waha_session_store_disabled');
      }
      if (sessionDiagnostics.storeFullSync === false) {
        degradedReasons.push('waha_session_store_full_sync_disabled');
      }
    } else if (status.connected) {
      degradedReasons.push('waha_session_config_unavailable');
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
          lastCatchupImportedMessages:
            sessionMeta?.lastCatchupImportedMessages ?? null,
          lastCatchupTouchedChats: sessionMeta?.lastCatchupTouchedChats ?? null,
          lastCatchupProcessedChats:
            sessionMeta?.lastCatchupProcessedChats ?? null,
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

  private readNumberQuery(
    value: any,
    fallback: number,
    min: number,
    max: number,
  ) {
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
