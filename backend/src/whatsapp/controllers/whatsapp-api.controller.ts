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
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { WhatsAppProviderRegistry } from '../providers/provider-registry';
import { WhatsAppApiProvider } from '../providers/whatsapp-api.provider';
import { WhatsAppCatchupService } from '../whatsapp-catchup.service';
import { AgentEventsService } from '../agent-events.service';
import { CiaRuntimeService } from '../cia-runtime.service';
import { WhatsappService } from '../whatsapp.service';
import { AccountAgentService } from '../account-agent.service';
import { WorkspaceService } from '../../workspaces/workspace.service';

/**
 * =====================================================================
 * WhatsApp API Session Controller
 *
 * Endpoints para gerenciar sessões do WhatsApp via WAHA
 * Preferência: usar este controller para novos projetos
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
  ) {}

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
    return this.providerRegistry.getSessionStatus(workspaceId);
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
  async linkSession(@Req() req: any, @Body() body: any) {
    const workspaceId = req.workspaceId;
    const sessionName = String(body?.sessionName || body?.session || '').trim();

    if (!sessionName) {
      return {
        success: false,
        message: 'sessionName is required',
      };
    }

    const workspace = await this.workspaces.getWorkspace(workspaceId);
    const currentSettings = (workspace?.providerSettings as any) || {};
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
  async claimSession(@Req() req: any, @Body() body: any) {
    const targetWorkspaceId = req.workspaceId;
    const sourceWorkspaceId = String(body?.sourceWorkspaceId || '').trim();

    if (!sourceWorkspaceId) {
      return {
        success: false,
        message: 'sourceWorkspaceId is required',
      };
    }

    if (sourceWorkspaceId === targetWorkspaceId) {
      const status = await this.providerRegistry.getSessionStatus(targetWorkspaceId);
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

    const sourceSettings = (sourceWorkspace.providerSettings as any) || {};
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
      (refreshedSourceWorkspace?.providerSettings as any) || sourceSettings;
    const sourceSession = refreshedSourceSettings?.whatsappApiSession || {};
    const claimedSessionName = String(sourceSession?.sessionName || '').trim();

    if (!claimedSessionName) {
      return {
        success: false,
        message: 'source_session_not_found',
        status: sourceStatus,
      };
    }

    const targetWorkspace = await this.workspaces.getWorkspace(targetWorkspaceId);
    const targetSettings = (targetWorkspace?.providerSettings as any) || {};
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

    const status = await this.providerRegistry.getSessionStatus(targetWorkspaceId);
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
  async startBacklog(@Req() req: any, @Body() body: any) {
    if (body?.mode === 'pause_autonomy') {
      return this.ciaRuntime.pauseAutonomy(req.workspaceId);
    }
    return this.ciaRuntime.startBacklogRun(
      req.workspaceId,
      body?.mode,
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

    req.on('close', () => {
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

    req.on('close', () => {
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
    const result = await this.whatsappApi.getQrCode(workspaceId);

    if (result.qr) {
      return {
        available: true,
        qr: result.qr, // base64 data URL
      };
    }

    const sessionStatus = await this.providerRegistry.getSessionStatus(workspaceId);
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
  async createContact(@Req() req: any, @Body() body: any) {
    return this.whatsappService.createContact(req.workspaceId, body || {});
  }

  @Get('chats')
  async getChats(@Req() req: any) {
    return this.whatsappService.listChats(req.workspaceId);
  }

  @Get('chats/:chatId/messages')
  async getChatMessages(
    @Req() req: any,
    @Param('chatId') chatId: string,
  ) {
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
    @Body() body: any,
  ) {
    return this.whatsappService.setPresence(
      req.workspaceId,
      decodeURIComponent(chatId),
      body?.presence,
    );
  }

  @Get('backlog')
  async getBacklog(@Req() req: any) {
    return this.whatsappService.getBacklog(req.workspaceId);
  }

  @Post('sync')
  async sync(@Req() req: any, @Body() body: any) {
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

    if (mediaUrl) {
      return this.whatsappApi.sendMediaFromUrl(
        workspaceId,
        phone,
        mediaUrl,
        caption,
        mediaType,
      );
    }

    return this.whatsappApi.sendMessage(workspaceId, phone, message);
  }

  /**
   * GET /whatsapp-api/check/:phone
   * Verifica se número está registrado no WhatsApp
   */
  @Get('check/:phone')
  async checkRegistration(@Req() req: any, @Param('phone') phone: string) {
    const workspaceId = req.workspaceId;
    const isRegistered = await this.whatsappApi.isRegisteredUser(
      workspaceId,
      phone,
    );
    return { phone, registered: isRegistered };
  }

  /**
   * GET /whatsapp-api/health
   * Health check da API whatsapp-api
   */
  @Get('health')
  async healthCheck() {
    const isHealthy = await this.whatsappApi.ping();
    return {
      service: 'whatsapp-api',
      healthy: isHealthy,
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
    const workspace = await this.workspaces.getWorkspace(workspaceId).catch(() => null);
    const settings = (workspace?.providerSettings as any) || {};
    const sessionMeta = (settings?.whatsappApiSession || {}) as Record<string, any>;
    const providerType =
      await this.providerRegistry.getProviderType(workspaceId);
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    const health = await this.providerRegistry.healthCheck();
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
          lastCatchupTouchedChats:
            sessionMeta?.lastCatchupTouchedChats ?? null,
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
}
