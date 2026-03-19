import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  InboundMessage,
  InboundProcessorService,
} from '../whatsapp/inbound-processor.service';
import { CiaRuntimeService } from '../whatsapp/cia-runtime.service';
import { WhatsAppCatchupService } from '../whatsapp/whatsapp-catchup.service';
import { AgentEventsService } from '../whatsapp/agent-events.service';

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

interface ResolvedWorkspace {
  id: string;
  providerSettings?: Prisma.JsonValue;
}

@Controller('webhooks/whatsapp-api')
export class WhatsAppApiWebhookController {
  private readonly logger = new Logger(WhatsAppApiWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboundProcessor: InboundProcessorService,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly agentEvents: AgentEventsService,
    private readonly ciaRuntime: CiaRuntimeService,
    @InjectRedis() private readonly redis: Redis,
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
          await this.handleSessionStatus(workspace, sessionId, payload);
          break;

        case 'message':
          await this.handleIncomingMessage(workspace, payload);
          break;

        case 'message.ack':
          await this.handleMessageAck(workspace.id, payload);
          break;

        case 'message.any':
          // message.any includes both sent and received
          if (payload && !payload.fromMe) {
            await this.handleIncomingMessage(workspace, payload);
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

  private async handleSessionStatus(
    workspace: ResolvedWorkspace,
    sessionId: string,
    data: any,
  ) {
    const status = data?.status || 'unknown';
    this.logger.log(
      `Session status change: ${sessionId} -> ${status} (workspace=${workspace.id})`,
    );

    await this.updateWorkspaceSession(workspace.id, sessionId, {
      status: status === 'WORKING' ? 'connected' : status.toLowerCase(),
      qrCode: null,
      phoneNumber: data?.me?.id || data?.phone || data?.phoneNumber || null,
      pushName: data?.me?.pushName || data?.pushName || data?.name || null,
      connectedAt:
        status === 'WORKING' ? new Date().toISOString() : undefined,
    });

    if (status === 'WORKING' || status === 'CONNECTED') {
      await this.agentEvents.publish({
        type: 'status',
        workspaceId: workspace.id,
        phase: 'session_connected',
        persistent: true,
        message: 'Consegui acessar seu WhatsApp. Vou iniciar a sincronização agora.',
        meta: {
          phoneNumber: data?.me?.id || data?.phone || data?.phoneNumber || null,
          pushName:
            data?.me?.pushName || data?.pushName || data?.name || null,
        },
      });
      await this.catchupService.triggerCatchup(
        workspace.id,
        'session_status_connected',
      );
      await this.tryBootstrapAutonomy(workspace);
    } else if (status === 'FAILED' || status === 'DISCONNECTED') {
      await this.agentEvents.publish({
        type: 'error',
        workspaceId: workspace.id,
        phase: 'session_error',
        persistent: true,
        message: `A sessão do WhatsApp mudou para ${String(status).toLowerCase()}.`,
        meta: {
          status,
        },
      });
    }
  }

  private async handleIncomingMessage(workspace: ResolvedWorkspace, msg: any) {
    if (!msg) return;
    if (msg.fromMe) return;
    const inbound = this.mapWebhookMessage(workspace.id, msg);
    if (!inbound) return;

    const result = await this.inboundProcessor.process(inbound);
    if (!result.deduped) {
      this.logger.log(
        `Incoming message processed from ${inbound.from} in workspace ${workspace.id}`,
      );
    }
  }

  private async tryBootstrapAutonomy(workspace: ResolvedWorkspace) {
    const autonomy = (workspace.providerSettings as any)?.autonomy || {};
    if (autonomy.autoBootstrapOnConnected === false) {
      return;
    }

    try {
      const lockKey = `cia:bootstrap:${workspace.id}`;
      const locked = await this.redis.set(lockKey, '1', 'EX', 120, 'NX');
      if (locked !== 'OK') {
        return;
      }

      await this.ciaRuntime.bootstrap(workspace.id);
    } catch (err: any) {
      this.logger.warn(
        `Failed to auto-bootstrap autonomy for workspace ${workspace.id}: ${err.message}`,
      );
    }
  }

  private async handleMessageAck(workspaceId: string, data: any) {
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
        where: { workspaceId, externalId: messageId },
        data: { status: ackMap[ack] || 'unknown' },
      });
    } catch {
      // Silently ignore
    }
  }

  private async updateWorkspaceSession(
    workspaceId: string,
    sessionName: string,
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
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      if (!workspace) return;

      const settings = (workspace.providerSettings as any) || {};
      const sessionMeta = settings.whatsappApiSession || {};

      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: {
            ...settings,
            connectionStatus: update.status || settings.connectionStatus || null,
            whatsappApiSession: {
              ...sessionMeta,
              sessionName,
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

  private async resolveWorkspaceForSession(
    sessionId: string,
  ): Promise<ResolvedWorkspace | null> {
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
