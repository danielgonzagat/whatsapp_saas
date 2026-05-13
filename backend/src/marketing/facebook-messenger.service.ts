import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetaSdkService } from '../meta/meta-sdk.service';

interface FbWebhookMessagingEvent {
  sender?: { id?: string; name?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    attachments?: Array<{
      type?: string;
      payload?: { url?: string; title?: string };
    }>;
  };
  delivery?: {
    mids?: string[];
    watermark?: number;
  };
  read?: {
    watermark?: number;
  };
}

interface FbSendResult {
  message_id?: string;
  error?: { message: string; type: string; code: number };
}

@Injectable()
export class FacebookMessengerService {
  private readonly logger = new Logger(FacebookMessengerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaSdk: MetaSdkService,
  ) {}

  async sendMessage(
    workspaceId: string,
    pageId: string,
    recipientPsid: string,
    text: string,
    pageAccessToken: string,
  ): Promise<{ mid: string | null; error: string | null }> {
    const result = await this.metaSdk.graphApiPost(
      `${pageId}/messages`,
      {
        recipient: { id: recipientPsid },
        message: { text },
        messaging_type: 'RESPONSE',
      },
      pageAccessToken,
    );

    const typed: FbSendResult =
      typeof result === 'object' && result !== null
        ? result
        : { error: { code: -1, message: 'Invalid response', type: 'invalid_response' } };

    if (typed.error) {
      await this.prisma.fbMessage.create({
        data: {
          workspaceId,
          pageId,
          direction: 'OUTBOUND',
          senderPsid: pageId,
          recipientPsid,
          text,
          deliveryStatus: 'FAILED',
          errorCode: String(typed.error.code),
          errorMessage: typed.error.message,
        },
      });

      this.logger.warn(
        `FbMessage send failed for workspace=${workspaceId} page=${pageId}: ${typed.error.message}`,
      );

      return { mid: null, error: typed.error.message };
    }

    const mid = typed.message_id || null;

    if (mid) {
      await this.prisma.fbMessage.create({
        data: {
          workspaceId,
          mid,
          pageId,
          direction: 'OUTBOUND',
          senderPsid: pageId,
          recipientPsid,
          text,
          deliveryStatus: 'SENT',
        },
      });
    }

    return { mid, error: null };
  }

  processIncomingMessage(
    workspaceId: string,
    entryId: string,
    msg: FbWebhookMessagingEvent,
  ): Promise<unknown> {
    const mid = String(msg.message?.mid || '');
    const text = String(msg.message?.text || '');
    const senderPsid = String(msg.sender?.id || '');
    const recipientPsid = String(msg.recipient?.id || '');

    if (!mid) {
      return Promise.resolve();
    }

    return this.prisma.fbMessage.upsert({
      where: { workspaceId_mid: { workspaceId, mid } },
      create: {
        workspaceId,
        mid,
        pageId: entryId,
        direction: 'INBOUND',
        senderPsid,
        recipientPsid,
        text: text || null,
        deliveryStatus: 'DELIVERED',
        metadata: JSON.parse(JSON.stringify(msg)) as Prisma.InputJsonValue,
      },
      update: {
        ...(text ? { text } : {}),
        deliveryStatus: 'DELIVERED',
        metadata: JSON.parse(JSON.stringify(msg)) as Prisma.InputJsonValue,
      },
    });
  }

  async processDeliveryReceipt(workspaceId: string, msg: FbWebhookMessagingEvent): Promise<void> {
    const mids = msg.delivery?.mids;
    if (!mids || mids.length === 0) {
      return;
    }

    await this.prisma.fbMessage.updateMany({
      where: {
        workspaceId,
        mid: { in: mids },
        direction: 'OUTBOUND',
      },
      data: {
        deliveryStatus: 'DELIVERED',
        deliveredAt: new Date(),
      },
    });
  }

  async processReadReceipt(workspaceId: string, msg: FbWebhookMessagingEvent): Promise<void> {
    const watermark = msg.read?.watermark;
    if (!watermark) {
      return;
    }

    const senderPsid = String(msg.sender?.id || '');

    await this.prisma.fbMessage.updateMany({
      where: {
        workspaceId,
        senderPsid,
        deliveryStatus: 'DELIVERED',
      },
      data: {
        deliveryStatus: 'READ',
        readAt: new Date(),
      },
    });
  }

  async processMessageEcho(
    workspaceId: string,
    entryId: string,
    msg: FbWebhookMessagingEvent,
  ): Promise<void> {
    const mid = String(msg.message?.mid || '');
    const senderPsid = String(msg.sender?.id || '');
    const recipientPsid = String(msg.recipient?.id || '');

    if (!mid) {
      return;
    }

    await this.prisma.fbMessage.upsert({
      where: { workspaceId_mid: { workspaceId, mid } },
      create: {
        workspaceId,
        mid,
        pageId: entryId,
        direction: 'OUTBOUND',
        senderPsid,
        recipientPsid,
        text: String(msg.message?.text || ''),
        deliveryStatus: 'SENT',
        metadata: JSON.parse(JSON.stringify(msg)) as Prisma.InputJsonValue,
      },
      update: {
        deliveryStatus: 'SENT',
      },
    });
  }

  async processWebhookEvent(
    workspaceId: string,
    entryId: string,
    msg: FbWebhookMessagingEvent,
  ): Promise<void> {
    try {
      if (msg.message && !msg.delivery && !msg.read) {
        const mid = String(msg.message.mid || '');
        if (mid) {
          const existing = await this.prisma.fbMessage.findUnique({
            where: { workspaceId_mid: { workspaceId, mid } },
            select: { id: true },
          });

          if (!existing) {
            await this.processIncomingMessage(workspaceId, entryId, msg);
          }
        }
      }

      if (msg.delivery) {
        await this.processDeliveryReceipt(workspaceId, msg);
      }

      if (msg.read) {
        await this.processReadReceipt(workspaceId, msg);
      }
    } catch (err: unknown) {
      this.logger.error(
        `FbMessage webhook processing error for workspace=${workspaceId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  async getMessages(
    workspaceId: string,
    pageId: string,
    options?: { limit?: number; before?: string },
  ): Promise<unknown> {
    return this.prisma.fbMessage.findMany({
      where: { workspaceId, pageId },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      ...(options?.before ? { cursor: { id: options.before }, skip: 1 } : {}),
    });
  }

  async getConversations(pageId: string, pageAccessToken: string): Promise<unknown> {
    return this.metaSdk.graphApiGet(
      `${pageId}/conversations`,
      {
        fields: 'id,senders,message_count,updated_time,messages{id,message,from,created_time}',
      },
      pageAccessToken,
    );
  }

  async getStatus(workspaceId: string): Promise<{
    connected: boolean;
    pageId: string | null;
    pageName: string | null;
  }> {
    const connection = await this.prisma.metaConnection.findFirst({
      where: { workspaceId, channel: 'facebook' },
      select: { pageId: true, pageName: true },
    });

    return {
      connected: Boolean(connection?.pageId),
      pageId: connection?.pageId || null,
      pageName: connection?.pageName || null,
    };
  }

  async reconcileDelivery(workspaceId: string, mid: string): Promise<void> {
    const fbMessage = await this.prisma.fbMessage.findUnique({
      where: { workspaceId_mid: { workspaceId, mid } },
      select: { direction: true, deliveryStatus: true, pageId: true },
    });

    if (!fbMessage || fbMessage.direction !== 'OUTBOUND') {
      return;
    }

    if (fbMessage.deliveryStatus === 'SENT' || fbMessage.deliveryStatus === 'FAILED') {
      await this.prisma.fbMessage.updateMany({
        where: { workspaceId, mid },
        data: {
          deliveryStatus: 'SENT',
        },
      });
    }
  }
}
