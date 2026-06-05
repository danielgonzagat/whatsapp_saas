import { BadRequestException, forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InstagramService } from '../channels/instagram/instagram.service';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptMetaToken } from '../../meta/meta-token-crypto';
import { ChannelMessageDispatchService } from '../channel-message-dispatch.service';
import { isInstagramCanonicalDispatchEnabled } from './instagram-canonical-dispatch.flag';

type InstagramConnection = {
  accessToken: string;
  pageAccessToken: string;
  pageId: string | null;
  instagramAccountId: string | null;
  instagramUsername: string | null;
};

function resolveInstagramConnection(channelSession: unknown): InstagramConnection {
  const row = channelSession as Record<string, unknown> | null;
  const userAccessToken = String(
    decryptMetaToken(typeof row?.accessToken === 'string' ? row.accessToken : null) ||
      process.env.META_ACCESS_TOKEN ||
      '',
  ).trim();
  const decryptedPageToken = String(
    decryptMetaToken(typeof row?.pageAccessToken === 'string' ? row.pageAccessToken : null) || '',
  ).trim();
  return {
    accessToken: userAccessToken,
    pageAccessToken: decryptedPageToken || userAccessToken,
    pageId: (row?.pageId as string) || null,
    instagramAccountId: (row?.instagramAccountId as string) || null,
    instagramUsername: (row?.instagramUsername as string) || null,
  };
}

@Injectable()
export class InstagramMarketingService {
  private readonly logger = new Logger(InstagramMarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instagramService: InstagramService,
    @Optional()
    @Inject(forwardRef(() => ChannelMessageDispatchService))
    private readonly canonicalDispatch?: ChannelMessageDispatchService,
  ) {}

  async listAccounts(workspaceId: string) {
    const channelSession = await this.prisma.metaConnection.findFirst({
      where: { workspaceId, channel: 'instagram' },
      select: {
        instagramAccountId: true,
        instagramUsername: true,
        pageName: true,
        status: true,
      },
    });

    if (!channelSession?.instagramAccountId) {
      return { accounts: [] };
    }

    return {
      accounts: [
        {
          instagramAccountId: channelSession.instagramAccountId,
          username: channelSession.instagramUsername,
          pageName: channelSession.pageName,
          status: channelSession.status,
        },
      ],
    };
  }

  async publishPost(workspaceId: string, imageUrl: string, caption?: string) {
    const row = await this.prisma.metaConnection.findFirst({
      where: { workspaceId, channel: 'instagram' },
    });
    const channelSession = resolveInstagramConnection(row);

    if (!channelSession.instagramAccountId) {
      throw new BadRequestException('instagram_account_not_connected');
    }

    const igAccountId = channelSession.instagramAccountId;
    const accessToken = channelSession.accessToken;

    const result = await this.instagramService.publishPhoto(
      igAccountId,
      imageUrl,
      caption ?? '',
      accessToken,
    );

    const igMediaId = typeof result?.id === 'string' ? result.id : null;

    const post = await this.prisma.igPost.create({
      data: {
        workspaceId,
        igAccountId,
        igMediaId,
        imageUrl,
        caption: caption ?? null,
        permalink: igMediaId ? `https://www.instagram.com/p/${igMediaId}` : null,
        status: igMediaId ? 'published' : 'failed',
      },
    });

    this.logger.log(
      `Instagram post published for workspace ${workspaceId}: ${igMediaId ?? 'unknown'}`,
    );

    return { post, metaResponse: result };
  }

  async getInsights(workspaceId: string, metrics: string[], period: string) {
    const row = await this.prisma.metaConnection.findFirst({
      where: { workspaceId, channel: 'instagram' },
    });
    const channelSession = resolveInstagramConnection(row);

    if (!channelSession.instagramAccountId) {
      throw new BadRequestException('instagram_account_not_connected');
    }

    const igAccountId = channelSession.instagramAccountId;
    const accessToken = channelSession.accessToken;

    const result = await this.instagramService.getAccountInsights(
      igAccountId,
      metrics,
      period,
      accessToken,
    );

    const insightData = result?.data ?? [];
    const normalized: unknown[] = Array.isArray(insightData) ? insightData : [];

    const metricMap: Record<string, number> = {};
    for (const rawItem of normalized) {
      if (rawItem && typeof rawItem === 'object') {
        const item = rawItem as {
          name?: unknown;
          values?: unknown;
          total_value?: unknown;
        };
        const itemName = typeof item.name === 'string' ? item.name : '';
        const totalValue = Array.isArray(item.values)
          ? (item.values as Array<{ value?: unknown }>).reduce(
              (sum: number, v) => sum + (typeof v?.value === 'number' ? v.value : 0),
              0,
            )
          : typeof item.total_value === 'number'
            ? item.total_value
            : 0;
        metricMap[itemName] = totalValue;
      }
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const onlineFollowers = metricMap['online_followers']
      ? (metricMap['online_followers'] as Prisma.InputJsonValue)
      : undefined;

    const insight = await this.prisma.igInsight.upsert({
      where: {
        workspaceId_igAccountId_date: {
          workspaceId,
          igAccountId,
          date: today,
        },
      },
      create: {
        workspaceId,
        igAccountId,
        date: today,
        impressions: metricMap['impressions'] ?? 0,
        reach: metricMap['reach'] ?? 0,
        followerCount: metricMap['follower_count'] ?? 0,
        profileViews: metricMap['profile_views'] ?? 0,
        websiteClicks: metricMap['website_clicks'] ?? 0,
        emailContacts: metricMap['email_contacts'] ?? 0,
        phoneCallClicks: metricMap['phone_call_clicks'] ?? 0,
        textMessageClicks: metricMap['text_message_clicks'] ?? 0,
        getDirectionsClicks: metricMap['get_directions_clicks'] ?? 0,
        ...(onlineFollowers !== undefined ? { onlineFollowers } : {}),
      },
      update: {
        impressions: metricMap['impressions'] ?? 0,
        reach: metricMap['reach'] ?? 0,
        followerCount: metricMap['follower_count'] ?? 0,
        profileViews: metricMap['profile_views'] ?? 0,
        websiteClicks: metricMap['website_clicks'] ?? 0,
        emailContacts: metricMap['email_contacts'] ?? 0,
        phoneCallClicks: metricMap['phone_call_clicks'] ?? 0,
        textMessageClicks: metricMap['text_message_clicks'] ?? 0,
        getDirectionsClicks: metricMap['get_directions_clicks'] ?? 0,
        ...(onlineFollowers !== undefined ? { onlineFollowers } : {}),
      },
    });

    this.logger.log(`Instagram insights fetched for workspace ${workspaceId}`);

    return { insight, metaResponse: result };
  }

  async listPosts(workspaceId: string, limit: number, offset: number) {
    const [posts, total] = await Promise.all([
      this.prisma.igPost.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.igPost.count({ where: { workspaceId } }),
    ]);

    return { posts, total };
  }

  async listInsights(workspaceId: string, igAccountId?: string, since?: string, until?: string) {
    const where: Prisma.IgInsightWhereInput = { workspaceId };

    if (igAccountId) {
      where.igAccountId = igAccountId;
    }

    if (since || until) {
      where.date = {};
      if (since) {
        where.date.gte = new Date(since);
      }
      if (until) {
        where.date.lte = new Date(until);
      }
    }

    const insights = await this.prisma.igInsight.findMany({
      where: { workspaceId, ...where },
      orderBy: { date: 'desc' },
      take: 90,
    });

    return { insights };
  }

  /**
   * Send a direct message via the Instagram Messaging API.
   *
   * Uses the IG-scoped Graph endpoint `${igAccountId}/messages`. Requires the
   * workspace to have a connected Instagram business account and a valid
   * page access token (linked Facebook page) per Meta's Messaging policy.
   */
  async sendDirectMessage(workspaceId: string, recipientId: string, text: string) {
    const trimmed = (text ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('message_text_required');
    }
    const trimmedRecipient = (recipientId ?? '').trim();
    if (!trimmedRecipient) {
      throw new BadRequestException('recipient_id_required');
    }

    const row = await this.prisma.metaConnection.findFirst({
      where: { workspaceId, channel: 'instagram' },
    });
    const channelSession = resolveInstagramConnection(row);

    if (!channelSession.instagramAccountId) {
      throw new BadRequestException('instagram_account_not_connected');
    }
    if (!channelSession.pageAccessToken) {
      throw new BadRequestException('instagram_messaging_token_missing');
    }

    const igAccountId = channelSession.instagramAccountId;
    const accessToken = channelSession.pageAccessToken;

    if (isInstagramCanonicalDispatchEnabled()) {
      const delegated = await this.sendViaCanonical(
        workspaceId,
        igAccountId,
        trimmedRecipient,
        trimmed,
        accessToken,
      );
      if (delegated) {
        return delegated;
      }
      // Fall through to the existing raw path on any build/DI failure.
    }

    const result = await this.instagramService.sendMessage(
      igAccountId,
      trimmedRecipient,
      trimmed,
      accessToken,
    );

    const resultObj = (result ?? {}) as Record<string, unknown>;
    const messageId =
      typeof resultObj['message_id'] === 'string'
        ? resultObj['message_id']
        : typeof resultObj['id'] === 'string'
          ? resultObj['id']
          : null;

    this.logger.log(
      `Instagram DM sent for workspace ${workspaceId} to ${trimmedRecipient}: ${messageId ?? 'no_id'}`,
    );

    return { messageId, metaResponse: result };
  }

  /**
   * Delegate an Instagram DM through the canonical
   * {@link ChannelMessageDispatchService.dispatch} (census P2-3) — the single
   * cross-channel send front door, which routes via the pure
   * {@link ChannelDispatchRegistry} → {@link InstagramDispatchAdapter} →
   * {@link InstagramService.sendMessage}. The already-resolved `igAccountId` and
   * page `accessToken` are passed as explicit credential overrides so the
   * canonical path uses the EXACT same credentials this service resolved (no
   * double Meta-connection resolution, no behavior drift).
   *
   * The canonical `ChannelSendResult` is mapped back to this service's existing
   * `{ messageId, metaResponse }` return shape. Returns `null` on any failure
   * (canonical service not injected, build/dispatch throw) so the caller falls
   * back to the existing raw `instagramService.sendMessage` path unchanged.
   */
  private async sendViaCanonical(
    workspaceId: string,
    igAccountId: string,
    recipientId: string,
    text: string,
    accessToken: string,
  ): Promise<{ messageId: string | null; metaResponse: unknown } | null> {
    if (!this.canonicalDispatch) {
      return null;
    }
    try {
      const result = await this.canonicalDispatch.dispatch(
        workspaceId,
        'instagram',
        recipientId,
        text,
        { igAccountId, accessToken },
      );
      const messageId =
        typeof result.messageId === 'string'
          ? result.messageId
          : typeof result.externalId === 'string'
            ? result.externalId
            : null;
      this.logger.log(
        `Instagram DM dispatched (canonical) for workspace ${workspaceId} to ${recipientId}: ${messageId ?? 'no_id'}`,
      );
      return { messageId, metaResponse: result };
    } catch (error) {
      this.logger.warn(
        `Instagram canonical dispatch failed for workspace ${workspaceId}; falling back to raw path: ${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
      return null;
    }
  }

  /**
   * Fetch Instagram conversations from the Meta Graph API.
   *
   * Delegates to the page-scoped `${pageId}/conversations?platform=instagram`
   * endpoint, which is the canonical way to list IG DM threads for a connected
   * IG business account.
   */
  async listConversations(workspaceId: string) {
    const row = await this.prisma.metaConnection.findFirst({
      where: { workspaceId, channel: 'instagram' },
    });
    const channelSession = resolveInstagramConnection(row);

    if (!channelSession.instagramAccountId) {
      throw new BadRequestException('instagram_account_not_connected');
    }
    if (!channelSession.pageId) {
      throw new BadRequestException('instagram_messaging_page_missing');
    }
    if (!channelSession.pageAccessToken) {
      throw new BadRequestException('instagram_messaging_token_missing');
    }

    const result = await this.instagramService.getConversations(
      channelSession.pageId,
      channelSession.pageAccessToken,
    );

    return { conversations: result, igAccountId: channelSession.instagramAccountId };
  }

  /**
   * List persisted Instagram DM messages.
   *
   * Honest empty state: there is no `IgMessage` model yet — webhook-driven
   * persistence will land in a follow-up migration. Returns a typed reason so
   * the frontend can render a `setup-required`/`coming-soon` state instead of
   * showing fake messages.
   */
  async listMessages(workspaceId: string, _conversationId?: string) {
    const channelSession = await this.prisma.metaConnection.findFirst({
      where: { workspaceId, channel: 'instagram' },
      select: { instagramAccountId: true, status: true },
    });

    if (!channelSession?.instagramAccountId) {
      return {
        messages: [],
        total: 0,
        reason: 'instagram_account_not_connected' as const,
      };
    }

    return {
      messages: [],
      total: 0,
      reason: 'instagram_messaging_pending' as const,
    };
  }
}
