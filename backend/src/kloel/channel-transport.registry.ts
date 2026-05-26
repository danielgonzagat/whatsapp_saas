import { Injectable, Optional  } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import {
  EmailChannelTransport,
  InstagramChannelTransport,
  MessengerChannelTransport,
  TikTokChannelTransport,
  WhatsAppChannelTransport,
} from './channel-transport.providers';
import type {
  ChannelCapability,
  ChannelName,
  ChannelSendRequest,
  ChannelSendResult,
  ChannelTransportProvider,
} from './channel-transport.types';
import { MindGuardsService } from './mind-guards.service';
import { MindGuardContextBuilderService } from './mind-guard-context-builder.service';
import type { MindActionContext } from './mind-code-native.types';

@Injectable()
export class ChannelTransportRegistry {
  private readonly logger = StructuredLogger.from(ChannelTransportRegistry.name);
  private readonly providers = new Map<ChannelName, ChannelTransportProvider>();

  constructor(
    @Optional() instagram?: InstagramChannelTransport,
    @Optional() messenger?: MessengerChannelTransport,
    @Optional() tiktok?: TikTokChannelTransport,
    @Optional() email?: EmailChannelTransport,
    @Optional() whatsapp?: WhatsAppChannelTransport,
    @Optional() private readonly guards?: MindGuardsService,
    @Optional() private readonly guardContextBuilder?: MindGuardContextBuilderService,
  ) {
    [instagram, messenger, tiktok, email, whatsapp].forEach((provider) => {
      if (provider) {this.register(provider);}
    });
  }

  register(provider: ChannelTransportProvider): void {
    if (this.providers.has(provider.channel)) {
      this.logger.warn(`Provider duplicado para canal ${provider.channel} — substituindo anterior`);
    }
    this.providers.set(provider.channel, provider);
    this.logger.log(
      `Provider registrado para canal ${provider.channel} — configurado=${provider.isConfigured()}`,
    );
  }

  getAllCapabilities(workspaceId: string): Promise<ChannelCapability[]> {
    const channels: ChannelName[] = ['whatsapp', 'instagram', 'messenger', 'tiktok', 'email'];

    return Promise.all(channels.map((channel) => this.getCapability(workspaceId, channel)));
  }

  async getCapability(workspaceId: string, channel: ChannelName): Promise<ChannelCapability> {
    const provider = this.providers.get(channel);
    if (!provider) {
      return {
        channel,
        sendAvailable: false,
        sendBlockedReason: `Nenhum provider registrado para o canal ${channel}`,
        requiredSetup: [],
      };
    }
    return provider.capability(workspaceId);
  }

  async send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult> {
    const provider = this.providers.get(request.channel);
    if (!provider) {
      return {
        success: false,
        blocked: true,
        blockedReason: `Nenhum provider registrado para o canal ${request.channel}`,
      };
    }

    if (!provider.isConfigured()) {
      return {
        success: false,
        blocked: true,
        blockedReason: `Provider para ${request.channel} nao esta configurado`,
      };
    }

    const guardContext = await this.buildGuardContext(workspaceId, request);
    const guard = await this.guards?.evaluate({
      workspaceId,
      decisionType: 'send_message',
      action: this.guardAction(request),
      context: guardContext,
    });
    if (guard && !guard.allowed) {
      this.logger.warn(
        `Envio bloqueado por guarda ${guard.guardName} workspace=${workspaceId} channel=${request.channel}`,
      );
      return {
        success: false,
        blocked: true,
        blockedReason: guard.reason,
      };
    }

    this.logger.log(
      `Enviando mensagem via ${request.channel} workspace=${workspaceId} recipient=${request.recipientId}`,
    );

    return provider.send(workspaceId, request);
  }

  getRegisteredChannels(): ChannelName[] {
    return Array.from(this.providers.keys());
  }

  private guardAction(request: ChannelSendRequest): string {
    if (request.mediaType === 'audio') {
      return 'send_audio_message';
    }
    if (request.mediaType === 'document') {
      return 'send_document_message';
    }
    return 'send_message';
  }

  private guardContext(request: ChannelSendRequest): MindActionContext {
    return {
      ...request.guardContext,
      channel: request.channel,
      supportsAudio: request.channel !== 'email' && request.channel !== 'tiktok',
      supportsDocument: request.channel === 'whatsapp' || request.channel === 'email',
    };
  }

  private async buildGuardContext(
    workspaceId: string,
    request: ChannelSendRequest,
  ): Promise<MindActionContext> {
    const baseContext = this.guardContext(request);
    return (
      (await this.guardContextBuilder?.buildForSend(workspaceId, request, baseContext)) ??
      baseContext
    );
  }
}
