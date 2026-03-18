import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { InboxService } from '../inbox/inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue, autopilotQueue, voiceQueue } from '../queue/queue';

/**
 * =====================================================================
 * WAHA Webhook Controller
 *
 * Recebe webhooks do WAHA (WhatsApp HTTP API)
 * Eventos: message, session.status, message.ack, etc.
 * Docs: https://waha.devlike.pro/docs/overview/webhooks/
 * =====================================================================
 */

interface WahaWebhookPayload {
  event: string;
  session: string;
  payload: any;
  engine?: string;
  environment?: any;
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
  async handleWebhook(
    @Body() body: WahaWebhookPayload,
    @Headers('x-api-key') apiKey?: string,
    @Headers('x-webhook-secret') webhookSecret?: string,
  ) {
    const expected =
      process.env.WHATSAPP_API_WEBHOOK_SECRET ||
      process.env.WAHA_WEBHOOK_SECRET;
    if (expected) {
      const provided = apiKey || webhookSecret;
      if (!provided || provided !== expected) {
        this.logger.warn('Webhook rejected: invalid secret');
        throw new ForbiddenException('Invalid webhook secret');
      }
    }

    const { event, session: sessionId, payload } = body;
    this.logger.log(`WAHA webhook: ${event} for session ${sessionId}`);

    // sessionId = workspaceId
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: sessionId },
      select: { id: true, providerSettings: true },
    });

    if (!workspace) {
      this.logger.warn(`Ignoring webhook for unknown workspace ${sessionId}`);
      return { received: true, error: 'workspace_not_found' };
    }

    try {
      switch (event) {
        case 'session.status':
          await this.handleSessionStatus(sessionId, payload);
          break;

        case 'message':
          await this.handleIncomingMessage(sessionId, payload);
          break;

        case 'message.ack':
          await this.handleMessageAck(sessionId, payload);
          break;

        case 'message.any':
          // message.any includes both sent and received
          if (payload && !payload.fromMe) {
            await this.handleIncomingMessage(sessionId, payload);
          }
          break;

        default:
          this.logger.debug(`Unhandled WAHA event: ${event}`);
      }

      return { received: true, event };
    } catch (err: any) {
      this.logger.error(`Webhook processing error: ${err.message}`);
      return { received: true, error: err.message };
    }
  }

  private async handleSessionStatus(sessionId: string, data: any) {
    const status = data?.status || 'unknown';
    this.logger.log(`Session status change: ${sessionId} -> ${status}`);

    await this.updateWorkspaceSession(sessionId, {
      status: status === 'WORKING' ? 'connected' : status.toLowerCase(),
      qrCode: null,
    });
  }

  private async handleIncomingMessage(sessionId: string, msg: any) {
    if (!msg) return;
    if (msg.fromMe) return;

    const externalId = msg.id;
    if (externalId) {
      const already = await this.prisma.message.findFirst({
        where: { workspaceId: sessionId, externalId },
        select: { id: true },
      });
      if (already) return;
    }

    const workspaceId = sessionId;
    const from = (msg.from || '')
      .replace(/@c\.us$/, '')
      .replace(/@s\.whatsapp\.net$/, '');
    const body = msg.body || '';
    const hasMedia = msg.hasMedia || !!msg.mediaUrl;

    this.logger.log(
      `Incoming message from ${from} in workspace ${workspaceId}`,
    );

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
      if (hasMedia) {
        await voiceQueue.add('transcribe-audio', {
          workspaceId,
          phone: from,
          messageId: externalId,
          messageType: msg.type,
        });
      }
    } else if (msg.type === 'document') {
      messageType = 'DOCUMENT';
      processedContent = body || '[Documento recebido]';
    }

    try {
      await this.inbox.saveMessageByPhone({
        workspaceId,
        phone: from,
        content: processedContent,
        direction: 'INBOUND',
        type: messageType,
        externalId,
        channel: 'WHATSAPP',
      });
    } catch (err: any) {
      this.logger.warn(`Inbox save failed: ${err.message}`);
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (workspace?.providerSettings as any) || {};
    if (settings?.autopilot?.enabled) {
      await autopilotQueue.add('scan-message', {
        workspaceId,
        phone: from,
        messageContent: processedContent,
      });
    }

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

  private async handleMessageAck(sessionId: string, data: any) {
    const messageId = data?.id;
    const ack = data?.ack;
    if (!messageId) return;

    const ackMap: Record<number, string> = {
      1: 'sent',
      2: 'delivered',
      3: 'read',
      4: 'played',
    };

    try {
      await this.prisma.message.updateMany({
        where: { workspaceId: sessionId, externalId: messageId },
        data: { status: ackMap[ack] || 'unknown' },
      });
    } catch {
      // Silently ignore
    }
  }

  private async updateWorkspaceSession(
    sessionId: string,
    update: {
      status?: string;
      qrCode?: string | null;
      disconnectReason?: string;
    },
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
