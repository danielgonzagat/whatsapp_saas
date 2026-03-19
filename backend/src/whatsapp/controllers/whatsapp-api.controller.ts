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
    const status = await this.providerRegistry.getSessionStatus(workspaceId);

    if (status.connected) {
      await this.catchupService.triggerCatchup(
        workspaceId,
        'session_status_poll_connected',
      );
    }

    return status;
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
   * GET /whatsapp-api/session/qr
   * Retorna QR Code como base64 para autenticação
   */
  @Get('session/qr')
  async getQrCode(@Req() req: any) {
    const workspaceId = req.workspaceId;
    const result = await this.whatsappApi.getQrCode(workspaceId);

    if (!result.qr) {
      return {
        available: false,
        message: 'QR Code não disponível. Verifique se a sessão foi iniciada.',
      };
    }

    return {
      available: true,
      qr: result.qr, // base64 data URL
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
    const providerType =
      await this.providerRegistry.getProviderType(workspaceId);
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    const health = await this.providerRegistry.healthCheck();

    return {
      workspaceId,
      configuredProvider: providerType,
      session: status,
      health,
    };
  }
}
