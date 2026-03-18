import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  InboundMessage,
  InboundProcessorService,
} from '../whatsapp/inbound-processor.service';
import { WhatsAppCatchupService } from '../whatsapp/whatsapp-catchup.service';

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
    private readonly prisma: PrismaService,
    private readonly inboundProcessor: InboundProcessorService,
    private readonly catchupService: WhatsAppCatchupService,
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

    const workspace = await this.resolveWorkspaceForSession(sessionId);

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
      phoneNumber: data?.me?.id || data?.phone || data?.phoneNumber || null,
      pushName: data?.me?.pushName || data?.pushName || data?.name || null,
      connectedAt:
        status === 'WORKING' ? new Date().toISOString() : undefined,
    });

    if (status === 'WORKING' || status === 'CONNECTED') {
      await this.catchupService.triggerCatchup(
        sessionId,
        'session_status_connected',
      );
    }
  }

  private async handleIncomingMessage(sessionId: string, msg: any) {
    if (!msg) return;
    if (msg.fromMe) return;
    const inbound = this.mapWebhookMessage(sessionId, msg);
    if (!inbound) return;

    const result = await this.inboundProcessor.process(inbound);
    if (!result.deduped) {
      this.logger.log(
        `Incoming message processed from ${inbound.from} in workspace ${sessionId}`,
      );
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
      phoneNumber?: string | null;
      pushName?: string | null;
      connectedAt?: string;
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

  private async resolveWorkspaceForSession(sessionId: string) {
    const direct = await this.prisma.workspace.findUnique({
      where: { id: sessionId },
      select: { id: true, providerSettings: true },
    });
    if (direct) {
      return direct;
    }

    const candidates = await this.prisma.workspace.findMany({
      where: {
        providerSettings: { not: Prisma.DbNull },
      },
      select: { id: true, providerSettings: true },
    });

    const wahaCandidates = candidates.filter((workspace) => {
      const settings = (workspace.providerSettings as any) || {};
      return (
        settings?.whatsappProvider === 'whatsapp-api' ||
        settings?.whatsappApiSession
      );
    });

    const bySessionName = wahaCandidates.find((workspace) => {
      const settings = (workspace.providerSettings as any) || {};
      return settings?.whatsappApiSession?.sessionName === sessionId;
    });
    if (bySessionName) {
      return bySessionName;
    }

    const singleSessionOverride = (process.env.WAHA_SESSION_ID || '').trim();
    const explicitSingleSession =
      process.env.WAHA_SINGLE_SESSION === 'true' ||
      process.env.WAHA_MULTISESSION === 'false' ||
      process.env.WAHA_USE_WORKSPACE_SESSION === 'false';
    const defaultSingleSessionName = singleSessionOverride || 'default';

    if (
      explicitSingleSession &&
      sessionId === defaultSingleSessionName &&
      wahaCandidates.length === 1
    ) {
      return wahaCandidates[0];
    }

    if (
      explicitSingleSession &&
      sessionId === defaultSingleSessionName &&
      wahaCandidates.length > 1
    ) {
      this.logger.warn(
        `Single-session webhook for ${sessionId} is ambiguous across ${wahaCandidates.length} workspaces`,
      );
    }

    return null;
  }

  private mapWebhookMessage(
    workspaceId: string,
    message: any,
  ): InboundMessage | null {
    const providerMessageId =
      message?.id?._serialized ||
      message?.id?.id ||
      message?.key?.id ||
      message?.id;
    const from = message?.from || message?.chatId;

    if (!providerMessageId || !from) {
      return null;
    }

    return {
      workspaceId,
      provider: 'whatsapp-api',
      providerMessageId,
      from,
      to: message?.to,
      type: this.mapInboundType(message?.type),
      text: message?.body || message?.text?.body || '',
      mediaUrl: message?.mediaUrl || message?.media?.url,
      mediaMime: message?.mimetype || message?.media?.mimetype,
      raw: message,
    };
  }

  private mapInboundType(type?: string): InboundMessage['type'] {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'chat' || normalized === 'text') return 'text';
    if (normalized === 'audio' || normalized === 'ptt') return 'audio';
    if (normalized === 'image') return 'image';
    if (normalized === 'document') return 'document';
    if (normalized === 'video') return 'video';
    if (normalized === 'sticker') return 'sticker';
    return 'unknown';
  }
}
