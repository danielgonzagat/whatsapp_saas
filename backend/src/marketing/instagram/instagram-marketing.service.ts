import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InstagramService } from '../../meta/instagram/instagram.service';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptMetaToken } from '../../meta/meta-token-crypto';

type InstagramConnection = {
  accessToken: string;
  instagramAccountId: string | null;
  instagramUsername: string | null;
};

function resolveInstagramConnection(connection: unknown): InstagramConnection {
  const row = connection as Record<string, unknown> | null;
  return {
    accessToken: String(decryptMetaToken(typeof row?.accessToken === 'string' ? row.accessToken : null) || process.env.META_ACCESS_TOKEN || '').trim(),
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
  ) {}

  async listAccounts(workspaceId: string) {
    const connection = await this.prisma.metaConnection.findFirst({
      where: { workspaceId, channel: 'instagram' },
      select: {
        instagramAccountId: true,
        instagramUsername: true,
        pageName: true,
        status: true,
      },
    });

    if (!connection?.instagramAccountId) {
      return { accounts: [] };
    }

    return {
      accounts: [
        {
          instagramAccountId: connection.instagramAccountId,
          username: connection.instagramUsername,
          pageName: connection.pageName,
          status: connection.status,
        },
      ],
    };
  }

  async publishPost(workspaceId: string, imageUrl: string, caption?: string) {
    const row = await this.prisma.metaConnection.findFirst({
      where: { workspaceId, channel: 'instagram' },
    });
    const connection = resolveInstagramConnection(row);

    if (!connection.instagramAccountId) {
      throw new BadRequestException('instagram_account_not_connected');
    }

    const igAccountId = connection.instagramAccountId;
    const accessToken = connection.accessToken;

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
    const connection = resolveInstagramConnection(row);

    if (!connection.instagramAccountId) {
      throw new BadRequestException('instagram_account_not_connected');
    }

    const igAccountId = connection.instagramAccountId;
    const accessToken = connection.accessToken;

    const result = await this.instagramService.getAccountInsights(
      igAccountId,
      metrics,
      period,
      accessToken,
    );

    const insightData = result?.data ?? [];
    const normalized = Array.isArray(insightData) ? insightData : [];

    const metricMap: Record<string, number> = {};
    for (const item of normalized) {
      if (item && typeof item === 'object') {
        const itemName = typeof item.name === 'string' ? item.name : '';
        const totalValue = Array.isArray(item.values)
          ? item.values.reduce(
              (sum: number, v: Record<string, unknown>) =>
                sum + (typeof v?.value === 'number' ? v.value : 0),
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
}
