import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Metrics } from '../../observability/metrics';
import { PrismaService } from '../../prisma/prisma.service';
import { OmnichannelService } from '../../inbox/omnichannel.service';
import { GmailClientService } from './gmail-client.service';
import { normalizeGmailMessage } from './message-parser';
import {
  mergeSyncMetadata,
  readSyncedMessageIds,
} from './metadata-helpers';
import type { GmailMailboxRecord } from './types';

@Injectable()
export class GmailSyncService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OmnichannelService))
    private readonly omnichannel: OmnichannelService,
    private readonly gmailClient: GmailClientService,
  ) {}

  async syncLatestInbox(
    connection: GmailMailboxRecord,
    requestedLimit?: number,
  ) {
    try {
      const accessToken =
        await this.gmailClient.resolveAccessToken(connection);
      const limit = Math.min(
        25,
        Math.max(1, Number(requestedLimit || 10) || 10),
      );
      const list = await this.gmailClient.listMessages(accessToken, limit);
      const syncedIds = readSyncedMessageIds(connection.metadata);
      const nextSyncedIds = new Set(syncedIds);
      let imported = 0;

      for (const item of list.messages || []) {
        const messageId = String(item.id || '').trim();
        if (!messageId || nextSyncedIds.has(messageId)) {
          continue;
        }

        const message = await this.gmailClient.getMessage(
          accessToken,
          messageId,
        );
        const normalized = normalizeGmailMessage(connection, message);
        if (!normalized.content || normalized.from === connection.email) {
          nextSyncedIds.add(messageId);
          continue;
        }

        await this.omnichannel.handleIncomingMessage(normalized);
        nextSyncedIds.add(messageId);
        imported += 1;
      }

      await this.prisma.mailboxConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncAt: new Date(),
          lastErrorAt: null,
          lastError: null,
          metadata: mergeSyncMetadata(
            connection.metadata,
            Array.from(nextSyncedIds),
          ),
        },
      });

      const seen = list.messages?.length || 0;
      Metrics.mailbox.syncCompleted('gmail', imported, seen, {
        workspace_id: connection.workspaceId,
        status: 'synced',
      });
      return {
        provider: 'gmail',
        status: 'synced',
        email: connection.email,
        imported,
        seen,
      };
    } catch (error: unknown) {
      Metrics.mailbox.syncFailed(
        'gmail',
        this.metricReason(error),
        { workspace_id: connection.workspaceId },
      );
      throw error;
    }
  }

  private metricReason(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message: unknown }).message;
        return Array.isArray(message)
          ? String(message[0] || 'bad_request')
          : String(message);
      }
      return 'bad_request';
    }
    return error instanceof Error ? error.message.slice(0, 80) : 'unknown';
  }
}
