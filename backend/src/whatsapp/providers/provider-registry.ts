import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppApiProvider } from './whatsapp-api.provider';

/**
 * =====================================================================
 * WhatsApp Provider Registry
 * 
 * Gerencia múltiplos providers de WhatsApp e roteia chamadas para o
 * provider correto baseado na configuração do workspace.
 * 
 * Providers suportados:
 * - whatsapp-api: chrishubert/whatsapp-api (RECOMENDADO)
 * - wpp: WPPConnect (legado)
 * - meta: Meta Cloud API (oficial)
 * - evolution: Evolution API
 * =====================================================================
 */

export type WhatsAppProviderType =
  | 'auto'
  | 'hybrid'
  | 'whatsapp-api'
  | 'wpp'
  | 'meta'
  | 'evolution'
  | 'ultrawa';

export interface SendMessageOptions {
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  quotedMessageId?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SessionStatus {
  connected: boolean;
  status: string;
  phoneNumber?: string;
  qrCode?: string;
}

@Injectable()
export class WhatsAppProviderRegistry {
  private readonly logger = new Logger(WhatsAppProviderRegistry.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly whatsappApi: WhatsAppApiProvider,
  ) {}

  /**
   * Obtém o provider configurado para o workspace
   */
  async getProviderType(workspaceId: string): Promise<WhatsAppProviderType> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) {
      this.logger.warn(`Workspace ${workspaceId} not found while resolving provider`);
      throw new Error('workspace_not_found');
    }

    const settings = workspace?.providerSettings as any;
    const provider = settings?.whatsappProvider || 'auto';

    // Validar provider
    const validProviders: WhatsAppProviderType[] = [
      'auto',
      'hybrid',
      'whatsapp-api',
      'wpp',
      'meta',
      'evolution',
      'ultrawa',
    ];
    if (!validProviders.includes(provider)) {
      this.logger.warn(`Invalid provider ${provider} for workspace ${workspaceId}, defaulting to auto`);
      return 'auto';
    }

    return provider;
  }

  /**
   * Inicia sessão no provider apropriado
   */
  async startSession(workspaceId: string): Promise<{ success: boolean; qrCode?: string; message?: string }> {
    let provider: WhatsAppProviderType;
    try {
      provider = await this.getProviderType(workspaceId);
    } catch (err: any) {
      return { success: false, message: err?.message || 'workspace_not_found' };
    }
    
    switch (provider) {
      case 'whatsapp-api':
      case 'auto':
      case 'hybrid':
        const result = await this.whatsappApi.startSession(workspaceId);
        if (result.success) {
          // Aguardar um pouco e tentar obter QR
          await new Promise(resolve => setTimeout(resolve, 2000));
          const qr = await this.whatsappApi.getQrCode(workspaceId);
          return { success: true, qrCode: qr.qr, message: result.message };
        }
        return result;

      case 'wpp':
        // WPPConnect é gerenciado pelo WhatsappService legado
        return { success: false, message: 'Use WhatsappService.createSession() for WPP provider' };

      case 'meta':
        // Meta Cloud API não precisa de sessão (usa tokens)
        return { success: true, message: 'Meta Cloud API does not require session initialization' };

      case 'evolution':
        // Evolution API - implementação futura
        return { success: false, message: 'Evolution API not yet implemented' };

      case 'ultrawa':
        return { success: false, message: 'UltraWA session flow not implemented' };

      default:
        return { success: false, message: `Unknown provider: ${provider}` };
    }
  }

  /**
   * Obtém status da sessão
   */
  async getSessionStatus(workspaceId: string): Promise<SessionStatus> {
    let provider: WhatsAppProviderType;
    try {
      provider = await this.getProviderType(workspaceId);
    } catch {
      return { connected: false, status: 'workspace_not_found', qrCode: undefined };
    }

    switch (provider) {
      case 'whatsapp-api':
      case 'auto':
      case 'hybrid':
        try {
          const status = await this.whatsappApi.getSessionStatus(workspaceId);
          const qr = status.state !== 'CONNECTED' ? await this.whatsappApi.getQrCode(workspaceId) : null;
          
          return {
            connected: status.state === 'CONNECTED',
            status: status.state || 'unknown',
            qrCode: qr?.qr,
          };
        } catch (err: any) {
          return { connected: false, status: 'error', qrCode: undefined };
        }

      case 'wpp':
        // Delegado ao WhatsappService
        return { connected: false, status: 'use_legacy_service' };

      case 'meta':
        // Meta está sempre "conectado" se tokens configurados
        const workspace = await this.prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { providerSettings: true },
        });
        const settings = workspace?.providerSettings as any;
        const hasTokens = !!(settings?.meta?.token && settings?.meta?.phoneId);
        return { connected: hasTokens, status: hasTokens ? 'connected' : 'not_configured' };

      case 'ultrawa':
        return { connected: false, status: 'not_implemented' };

      default:
        return { connected: false, status: 'unknown_provider' };
    }
  }

  /**
   * Envia mensagem de texto
   */
  async sendMessage(
    workspaceId: string,
    to: string,
    message: string,
    options?: SendMessageOptions,
  ): Promise<SendResult> {
    let provider: WhatsAppProviderType;
    try {
      provider = await this.getProviderType(workspaceId);
    } catch (err: any) {
      return { success: false, error: err?.message || 'workspace_not_found' };
    }
    this.logger.log(`Sending message via ${provider} to ${to}`);

    try {
      switch (provider) {
        case 'whatsapp-api':
        case 'auto':
        case 'hybrid':
          if (options?.mediaUrl) {
            const mediaResult = await this.whatsappApi.sendMediaFromUrl(
              workspaceId,
              to,
              options.mediaUrl,
              options.caption || message,
              options.mediaType || 'image',
            );
            return { success: mediaResult.success, messageId: mediaResult.message?.id?._serialized };
          }

          const textResult = await this.whatsappApi.sendMessage(workspaceId, to, message, {
            quotedMessageId: options?.quotedMessageId,
          });
          return { success: textResult.success, messageId: textResult.message?.id?._serialized };

        case 'wpp':
          // Delegado ao WhatsappService legado
          return { success: false, error: 'Use WhatsappService.sendMessage() for WPP provider' };

        case 'meta':
          // Meta Cloud API - implementado em outro lugar
          return { success: false, error: 'Use MetaCloudProvider for Meta API' };

        case 'evolution':
          return { success: false, error: 'Evolution API not yet implemented' };

        default:
          return { success: false, error: `Unknown provider: ${provider}` };
      }
    } catch (err: any) {
      this.logger.error(`Send message failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Envia mídia via URL
   */
  async sendMedia(
    workspaceId: string,
    to: string,
    mediaUrl: string,
    options?: { caption?: string; mediaType?: 'image' | 'video' | 'audio' | 'document' },
  ): Promise<SendResult> {
    return this.sendMessage(workspaceId, to, options?.caption || '', {
      mediaUrl,
      caption: options?.caption,
      mediaType: options?.mediaType,
    });
  }

  /**
   * Desconecta sessão
   */
  async disconnect(workspaceId: string): Promise<{ success: boolean; message?: string }> {
    let provider: WhatsAppProviderType;
    try {
      provider = await this.getProviderType(workspaceId);
    } catch (err: any) {
      return { success: false, message: err?.message || 'workspace_not_found' };
    }

    switch (provider) {
      case 'whatsapp-api':
      case 'auto':
      case 'hybrid':
        return this.whatsappApi.terminateSession(workspaceId);

      case 'wpp':
        return { success: false, message: 'Use WhatsappService.disconnect() for WPP provider' };

      case 'meta':
        return { success: true, message: 'Meta Cloud API session cleared' };

      default:
        return { success: false, message: `Unknown provider: ${provider}` };
    }
  }

  /**
   * Verifica se número está registrado no WhatsApp
   */
  async isRegistered(workspaceId: string, phone: string): Promise<boolean> {
    let provider: WhatsAppProviderType;
    try {
      provider = await this.getProviderType(workspaceId);
    } catch {
      return false;
    }

    switch (provider) {
      case 'whatsapp-api':
      case 'auto':
      case 'hybrid':
        return this.whatsappApi.isRegisteredUser(workspaceId, phone);

      default:
        // Para outros providers, assumir que está registrado
        return true;
    }
  }

  /**
   * Health check do provider
   */
  async healthCheck(): Promise<{ whatsappApi: boolean }> {
    const whatsappApiOk = await this.whatsappApi.ping();
    return { whatsappApi: whatsappApiOk };
  }
}
