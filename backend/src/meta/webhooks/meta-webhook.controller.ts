import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  Req,
  HttpCode,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { createHmac } from 'crypto';
import { MetaWhatsAppService } from '../meta-whatsapp.service';
import { InboundProcessorService } from '../../whatsapp/inbound-processor.service';
import { OmnichannelService } from '../../inbox/omnichannel.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Meta Graph API webhookEvent receiver (Instagram, Messenger, WhatsApp Cloud).
 * Deduplication: each message carries a unique externalId (msg.id/mid);
 * InboundProcessorService skips isDuplicate providerMessageId entries.
 */
@Controller('webhooks/meta')
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  constructor(
    private readonly metaWhatsApp: MetaWhatsAppService,
    private readonly inboundProcessor: InboundProcessorService,
    private readonly omnichannelService: OmnichannelService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const VERIFY_TOKEN =
      process.env.META_WEBHOOK_VERIFY_TOKEN || 'kloel_meta_verify_2026';
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      this.logger.log('Meta webhook verified');
      return String(challenge ?? '');
    }
    throw new ForbiddenException('Verification failed');
  }

  @Public()
  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req?: any,
  ) {
    // Validate signature
    const appSecret = process.env.META_APP_SECRET;
    if (appSecret && signature) {
      const expected =
        'sha256=' +
        createHmac('sha256', appSecret)
          .update(
            Buffer.isBuffer(req?.rawBody)
              ? req.rawBody
              : Buffer.from(JSON.stringify(body || {})),
          )
          .digest('hex');
      if (signature !== expected) {
        this.logger.warn('Invalid Meta webhook signature');
        return 'ok';
      }
    }

    const object = body.object;
    this.logger.log(
      `Meta webhook: object=${object}, entries=${body.entry?.length || 0}`,
    );

    for (const entry of body.entry || []) {
      try {
        switch (object) {
          case 'instagram':
            await this.handleInstagram(entry);
            break;
          case 'page':
            await this.handlePage(entry);
            break;
          case 'whatsapp_business_account':
            await this.handleWhatsAppCloud(entry);
            break;
        }
      } catch (err) {
        // PULSE:OK — Per-entry webhook error must not block other entries; returns 200 to Meta
        this.logger.error(`Meta webhook processing error: ${err}`);
      }
    }

    return 'ok';
  }

  private async handleInstagram(entry: any) {
    const workspaceId = await this.resolveMetaWorkspaceFromEntry(entry);
    if (!workspaceId) {
      this.logger.warn(
        '[IG] Could not resolve workspace for Instagram webhook',
      );
      return;
    }

    await this.omnichannelService.processInstagramWebhook(workspaceId, {
      entry: [entry],
    });
  }

  private async handlePage(entry: any) {
    const workspaceId = await this.resolveMetaWorkspaceFromEntry(entry);
    if (!workspaceId) {
      this.logger.warn(
        '[Messenger] Could not resolve workspace for page webhook',
      );
      return;
    }

    for (const msg of entry.messaging || []) {
      if (msg.message) {
        await this.omnichannelService.handleIncomingMessage({
          workspaceId,
          channel: 'MESSENGER',
          externalId: String(msg.message?.mid || msg.sender?.id || 'unknown'),
          from: String(msg.sender?.id || 'unknown'),
          fromName: String(msg.sender?.name || '').trim() || undefined,
          content: String(msg.message?.text || '').trim(),
          metadata: {
            raw: msg,
            recipientId: msg.recipient?.id,
            timestamp: msg.timestamp,
          },
        });
      }
    }
  }

  private async handleWhatsAppCloud(entry: any) {
    for (const change of entry.changes || []) {
      if (change.field === 'messages') {
        const phoneNumberId = String(
          change.value?.metadata?.phone_number_id || '',
        ).trim();
        const workspaceId =
          await this.metaWhatsApp.resolveWorkspaceIdByPhoneNumberId(
            phoneNumberId,
          );

        if (!workspaceId) {
          this.logger.warn(
            `[WA Cloud] Could not resolve workspace for phone_number_id=${phoneNumberId}`,
          );
          continue;
        }

        await this.metaWhatsApp.touchWebhookHeartbeat(workspaceId, {
          status: 'connected',
          phoneNumberId,
          lastWebhookObject: 'whatsapp_business_account',
        });

        const contacts = Array.isArray(change.value?.contacts)
          ? change.value.contacts
          : [];
        const contactIndex = new Map(
          contacts.map((contact: any) => [
            String(contact?.wa_id || '').trim(),
            String(contact?.profile?.name || '').trim(),
          ]),
        );

        for (const msg of change.value?.messages || []) {
          const senderPhone = String(msg?.from || '').trim();
          const messageType = this.normalizeWhatsAppMessageType(msg?.type);
          const messageText = this.extractWhatsAppMessageText(msg);
          const providerMessageId = String(msg?.id || '').trim();
          const senderName = [
            contactIndex.get(senderPhone),
            String(msg?.profile?.name || '').trim(),
          ].find(
            (value): value is string =>
              typeof value === 'string' && value.length > 0,
          );

          if (!providerMessageId || !senderPhone) {
            continue;
          }

          await this.inboundProcessor.process({
            workspaceId,
            provider: 'meta-cloud',
            ingestMode: 'live',
            providerMessageId,
            from: senderPhone,
            to: String(
              change.value?.metadata?.display_phone_number || '',
            ).trim(),
            senderName,
            type: messageType,
            text: messageText,
            raw: msg,
            createdAt: msg?.timestamp
              ? new Date(Number(msg.timestamp) * 1000)
              : new Date(),
          });
        }

        for (const status of change.value?.statuses || []) {
          const externalId = String(status?.id || '').trim();
          if (!externalId) {
            continue;
          }

          await this.prisma.message.updateMany({
            where: {
              workspaceId,
              externalId,
            },
            data: {
              status: this.normalizeOutboundStatus(status?.status),
              errorCode: String(status?.errors?.[0]?.code || '').trim() || null,
            },
          });
        }
      }
    }
  }

  private async resolveMetaWorkspaceFromEntry(
    entry: any,
  ): Promise<string | null> {
    const pageId = String(
      entry?.id || entry?.messaging?.[0]?.recipient?.id || '',
    ).trim();

    if (!pageId) {
      return null;
    }

    const connection = await this.prisma.metaConnection.findFirst({
      where: { pageId },
      select: { workspaceId: true },
    });

    return connection?.workspaceId || null;
  }

  private normalizeWhatsAppMessageType(
    type: unknown,
  ): 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker' | 'unknown' {
    switch (
      String(type || '')
        .trim()
        .toLowerCase()
    ) {
      case 'text':
        return 'text';
      case 'audio':
      case 'voice':
        return 'audio';
      case 'image':
        return 'image';
      case 'document':
        return 'document';
      case 'video':
        return 'video';
      case 'sticker':
        return 'sticker';
      default:
        return 'unknown';
    }
  }

  private extractWhatsAppMessageText(msg: any): string {
    const text =
      msg?.text?.body ||
      msg?.button?.text ||
      msg?.interactive?.button_reply?.title ||
      msg?.interactive?.list_reply?.title ||
      msg?.caption ||
      '';

    if (text) {
      return String(text).trim();
    }

    const type = String(msg?.type || '')
      .trim()
      .toUpperCase();
    return type ? `[${type}]` : '';
  }

  private normalizeOutboundStatus(status: unknown): string {
    switch (
      String(status || '')
        .trim()
        .toLowerCase()
    ) {
      case 'sent':
        return 'SENT';
      case 'delivered':
        return 'DELIVERED';
      case 'read':
        return 'READ';
      case 'failed':
        return 'FAILED';
      default:
        return 'DELIVERED';
    }
  }
}
