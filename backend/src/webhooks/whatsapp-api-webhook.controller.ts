import { Controller, Post, Body, Logger, HttpCode } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue, autopilotQueue, voiceQueue } from '../queue/queue';

/**
 * =====================================================================
 * WhatsApp API Webhook Controller
 * 
 * Recebe webhooks do chrishubert/whatsapp-api
 * Eventos: message, message_create, qr, ready, authenticated, disconnected, etc.
 * =====================================================================
 */

interface WebhookPayload {
  sessionId: string;
  dataType: string;
  data: any;
}

@Controller('webhooks/whatsapp-api')
export class WhatsAppApiWebhookController {
  private readonly logger = new Logger(WhatsAppApiWebhookController.name);

  constructor(
    private readonly inbox: InboxService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() payload: WebhookPayload) {
    const { sessionId, dataType, data } = payload;
    this.logger.log(`Webhook received: ${dataType} for session ${sessionId}`);

    // Garantir workspace válido e provider habilitado
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: sessionId },
      select: { id: true, providerSettings: true },
    });

    if (!workspace) {
      this.logger.warn(`Ignoring webhook for unknown workspace ${sessionId}`);
      return { received: true, error: 'workspace_not_found' };
    }

    const provider = (workspace.providerSettings as any)?.whatsappProvider || 'whatsapp-api';
    if (!['whatsapp-api', 'auto', 'hybrid'].includes(provider)) {
      this.logger.warn(`Ignoring webhook for workspace ${sessionId} with provider ${provider}`);
      return { received: true, error: 'provider_mismatch' };
    }

    try {
      switch (dataType) {
        case 'qr':
          await this.handleQrCode(sessionId, data);
          break;

        case 'ready':
          await this.handleReady(sessionId, data);
          break;

        case 'authenticated':
          await this.handleAuthenticated(sessionId);
          break;

        case 'disconnected':
          await this.handleDisconnected(sessionId, data);
          break;

        case 'message':
          await this.handleIncomingMessage(sessionId, data);
          break;

        case 'message_create':
          await this.handleMessageCreate(sessionId, data);
          break;

        case 'message_ack':
          await this.handleMessageAck(sessionId, data);
          break;

        case 'media':
          await this.handleMedia(sessionId, data);
          break;

        default:
          this.logger.debug(`Unhandled webhook type: ${dataType}`);
      }

      return { received: true, dataType };
    } catch (err: any) {
      this.logger.error(`Webhook processing error: ${err.message}`);
      return { received: true, error: err.message };
    }
  }

  /**
   * Novo QR Code gerado - atualizar status da sessão
   */
  private async handleQrCode(sessionId: string, data: { qr: string }) {
    this.logger.log(`QR Code generated for session: ${sessionId}`);
    
    // Atualizar workspace com QR code
    await this.updateWorkspaceSession(sessionId, {
      status: 'qr_pending',
      qrCode: data.qr,
    });
  }

  /**
   * Sessão pronta e conectada
   */
  private async handleReady(sessionId: string, _data: any) {
    this.logger.log(`Session ready: ${sessionId}`);
    
    await this.updateWorkspaceSession(sessionId, {
      status: 'connected',
      qrCode: null, // Limpa QR após conexão
    });
  }

  /**
   * Autenticado com sucesso
   */
  private async handleAuthenticated(sessionId: string) {
    this.logger.log(`Session authenticated: ${sessionId}`);
    
    await this.updateWorkspaceSession(sessionId, {
      status: 'authenticated',
    });
  }

  /**
   * Desconectado
   */
  private async handleDisconnected(sessionId: string, data: { reason?: string }) {
    this.logger.warn(`Session disconnected: ${sessionId}, reason: ${data.reason}`);
    
    await this.updateWorkspaceSession(sessionId, {
      status: 'disconnected',
      disconnectReason: data.reason,
    });
  }

  /**
   * Mensagem recebida (INBOUND)
   */
  private async handleIncomingMessage(sessionId: string, data: { message: any }) {
    const msg = data.message;
    if (!msg) return;

    // Ignorar mensagens enviadas pelo próprio bot
    if (msg.fromMe) return;

    const workspaceId = sessionId; // sessionId = workspaceId
    const from = msg.from?.replace('@c.us', '') || '';
    const body = msg.body || '';
    const hasMedia = msg.hasMedia || false;

    this.logger.log(`Incoming message from ${from} in workspace ${workspaceId}`);

    // Determinar tipo de mensagem
    let messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' = 'TEXT';
    let processedContent = body;

    if (msg.type === 'image') {
      messageType = 'IMAGE';
      processedContent = body || '[Imagem recebida]';
    } else if (msg.type === 'video') {
      messageType = 'VIDEO';
      processedContent = body || '[Vídeo recebido]';
    } else if (msg.type === 'audio' || msg.type === 'ptt') {
      messageType = 'AUDIO';
      processedContent = '[Áudio recebido]';

      // Enfileirar para transcrição
      if (hasMedia) {
        await voiceQueue.add('transcribe-audio', {
          workspaceId,
          phone: from,
          messageId: msg.id?._serialized,
          messageType: msg.type,
        });
      }
    } else if (msg.type === 'document') {
      messageType = 'DOCUMENT';
      processedContent = body || '[Documento recebido]';
    }

    // Persistir no Inbox
    try {
      await this.inbox.saveMessageByPhone({
        workspaceId,
        phone: from,
        content: processedContent,
        direction: 'INBOUND',
        type: messageType,
        externalId: msg.id?._serialized,
        channel: 'WHATSAPP',
      });
    } catch (err: any) {
      this.logger.warn(`Inbox save failed: ${err.message}`);
    }

    // Verificar se autopilot está habilitado
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings = workspace?.providerSettings as any;
    if (settings?.autopilot?.enabled) {
      await autopilotQueue.add('scan-message', {
        workspaceId,
        phone: from,
        messageContent: processedContent,
      });
    }

    // Verificar se há flow ativo para este contato
    const contact = await this.prisma.contact.findFirst({
      where: { workspaceId, phone: from },
      select: { id: true },
    });

    if (contact) {
      const activeExecution = await this.prisma.flowExecution.findFirst({
        where: {
          workspaceId,
          contactId: contact.id,
          status: 'WAITING',
        },
        select: { id: true },
      });

      if (activeExecution) {
        await flowQueue.add('continue-flow', {
          executionId: activeExecution.id,
          userMessage: processedContent,
          workspaceId,
        });
      }
    }
  }

  /**
   * Mensagem criada (inclui OUTBOUND)
   */
  private async handleMessageCreate(sessionId: string, data: { message: any }) {
    const msg = data.message;
    if (!msg) return;

    // Apenas logamos mensagens enviadas pelo bot
    if (msg.fromMe) {
      this.logger.debug(`Outbound message confirmed: ${msg.id?._serialized}`);
    }
  }

  /**
   * ACK de mensagem (enviada, recebida, lida)
   */
  private async handleMessageAck(sessionId: string, data: { message: any; ack: number }) {
    const { message, ack } = data;
    if (!message?.id?._serialized) return;

    // ACK levels: -1 = error, 0 = pending, 1 = sent, 2 = received, 3 = read, 4 = played
    const ackMap: Record<number, string> = {
      '-1': 'error',
      '0': 'pending',
      '1': 'sent',
      '2': 'delivered',
      '3': 'read',
      '4': 'played',
    };

    this.logger.debug(`Message ACK: ${message.id._serialized} -> ${ackMap[ack] || ack}`);

    // Atualizar status da mensagem no banco
    try {
      await this.prisma.message.updateMany({
        where: { externalId: message.id._serialized },
        data: { status: ackMap[ack] || 'unknown' },
      });
    } catch {
      // Silently ignore if message not found
    }
  }

  /**
   * Mídia recebida
   */
  private async handleMedia(sessionId: string, data: { message: any; messageMedia: any }) {
    this.logger.debug(`Media received for session: ${sessionId}`);
    // Mídia já é tratada no handleIncomingMessage com hasMedia flag
  }

  /**
   * Helper: Atualiza metadados da sessão no workspace
   */
  private async updateWorkspaceSession(
    sessionId: string,
    update: { status?: string; qrCode?: string | null; disconnectReason?: string },
  ) {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: sessionId },
        select: { providerSettings: true },
      });

      if (!workspace) return;

      const settings = (workspace.providerSettings as any) || {};
      const sessionMeta = settings.whatsappApiSession || {};

      await this.prisma.workspace.update({
        where: { id: sessionId },
        data: {
          providerSettings: {
            ...settings,
            whatsappApiSession: {
              ...sessionMeta,
              ...update,
              lastUpdated: new Date().toISOString(),
            },
          },
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to update workspace session: ${err.message}`);
    }
  }
}
