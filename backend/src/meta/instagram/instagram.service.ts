import { Injectable } from '@nestjs/common';
import { MetaSdkService } from '../meta-sdk.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InstagramService {
  constructor(
    private readonly metaSdk: MetaSdkService,
    private readonly prisma: PrismaService,
  ) {}

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  async sendMessage(igAccountId: string, recipientId: string, text: string, accessToken: string) {
    return this.metaSdk.graphApiPost(
      `${igAccountId}/messages`,
      { recipient: { id: recipientId }, message: { text } },
      accessToken,
    );
  }

  async getProfile(igAccountId: string, accessToken: string) {
    return this.metaSdk.graphApiGet(
      `${igAccountId}`,
      {
        fields:
          'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url',
      },
      accessToken,
    );
  }

  async getMedia(igAccountId: string, limit: number, accessToken: string) {
    return this.metaSdk.graphApiGet(
      `${igAccountId}/media`,
      {
        fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count',
        limit: String(limit),
      },
      accessToken,
    );
  }

  async getAccountInsights(
    igAccountId: string,
    metrics: string[],
    period: string,
    accessToken: string,
  ) {
    return this.metaSdk.graphApiGet(
      `${igAccountId}/insights`,
      { metric: metrics.join(','), period },
      accessToken,
    );
  }

  async publishPhoto(igAccountId: string, imageUrl: string, caption: string, accessToken: string) {
    const container = await this.metaSdk.graphApiPost(
      `${igAccountId}/media`,
      { image_url: imageUrl, caption },
      accessToken,
    );
    return this.metaSdk.graphApiPost(
      `${igAccountId}/media_publish`,
      { creation_id: container.id },
      accessToken,
    );
  }

  async getComments(mediaId: string, accessToken: string) {
    return this.metaSdk.graphApiGet(
      `${mediaId}/comments`,
      { fields: 'id,text,username,timestamp' },
      accessToken,
    );
  }

  async replyToComment(commentId: string, text: string, accessToken: string) {
    return this.metaSdk.graphApiPost(`${commentId}/replies`, { message: text }, accessToken);
  }
}
