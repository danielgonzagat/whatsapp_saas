import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { WhatsAppProviderRegistry } from '../providers/provider-registry';
import { WhatsAppApiProvider } from '../providers/whatsapp-api.provider';

/**
 * =====================================================================
 * WhatsApp API Session Controller
 * 
 * Endpoints para gerenciar sessões do whatsapp-api (chrishubert/whatsapp-api)
 * Preferência: usar este controller para novos projetos
 * =====================================================================
 */
@Controller('whatsapp-api')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class WhatsAppApiController {
  constructor(
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
  ) {}

  /**
   * POST /whatsapp-api/session/start
   * Inicia nova sessão WhatsApp para o workspace
   */
  @Post('session/start')
  async startSession(@Req() req: any) {
    const workspaceId = req.workspaceId;
    const provider = await this.providerRegistry.getProviderType(workspaceId);
    if (!['whatsapp-api', 'auto', 'hybrid'].includes(provider)) {
      return {
        success: false,
        message: `workspace ${workspaceId} não está configurado para whatsapp-api (atual: ${provider})`,
      };
    }
    return this.providerRegistry.startSession(workspaceId);
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
   * GET /whatsapp-api/session/qr
   * Retorna QR Code como base64 para autenticação
   */
  @Get('session/qr')
  async getQrCode(@Req() req: any) {
    const workspaceId = req.workspaceId;
    const provider = await this.providerRegistry.getProviderType(workspaceId);
    if (!['whatsapp-api', 'auto', 'hybrid'].includes(provider)) {
      return {
        available: false,
        message: `workspace ${workspaceId} não está configurado para whatsapp-api (atual: ${provider})`,
      };
    }

    const result = await this.whatsappApi.getQrCode(workspaceId);
    
    if (!result.qr) {
      return { 
        available: false, 
        message: 'QR Code não disponível. Verifique se a sessão foi iniciada.' 
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
   * POST /whatsapp-api/send/:phone
   * Envia mensagem de texto para o número especificado
   */
  @Post('send/:phone')
  async sendMessage(
    @Req() req: any,
    @Param('phone') phone: string,
  ) {
    const workspaceId = req.workspaceId;
    const { message, mediaUrl, caption } = req.body || {};

    const provider = await this.providerRegistry.getProviderType(workspaceId);
    if (!['whatsapp-api', 'auto', 'hybrid'].includes(provider)) {
      return {
        success: false,
        message: `workspace ${workspaceId} não está configurado para whatsapp-api (atual: ${provider})`,
      };
    }

    if (mediaUrl) {
      return this.whatsappApi.sendMediaFromUrl(workspaceId, phone, mediaUrl, caption);
    }

    return this.whatsappApi.sendMessage(workspaceId, phone, message);
  }

  /**
   * GET /whatsapp-api/check/:phone
   * Verifica se número está registrado no WhatsApp
   */
  @Get('check/:phone')
  async checkRegistration(
    @Req() req: any,
    @Param('phone') phone: string,
  ) {
    const workspaceId = req.workspaceId;
    const provider = await this.providerRegistry.getProviderType(workspaceId);
    if (!['whatsapp-api', 'auto', 'hybrid'].includes(provider)) {
      return {
        phone,
        registered: false,
        message: `workspace ${workspaceId} não está configurado para whatsapp-api (atual: ${provider})`,
      };
    }

    const isRegistered = await this.whatsappApi.isRegisteredUser(workspaceId, phone);
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
    const providerType = await this.providerRegistry.getProviderType(workspaceId);
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
