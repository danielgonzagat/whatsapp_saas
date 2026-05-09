import { Injectable, Logger } from '@nestjs/common';
import { MetaSdkService } from '../meta-sdk.service';

/** Instagram service. */
@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(private readonly metaSdk: MetaSdkService) {}

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  async sendMessage(igAccountId: string, recipientId: string, text: string, accessToken: string) {
    this.logger.log('Calling Instagram API', { context: 'InstagramService.sendMessage', igAccountId, endpoint: 'messages' });
    return this.metaSdk.graphApiPost(
      `${igAccountId}/messages`,
      { recipient: { id: recipientId }, message: { text } },
      accessToken,
    );
  }

  /** Get profile. */
  async getProfile(igAccountId: string, accessToken: string) {
    this.logger.log('Calling Instagram API', { context: 'InstagramService.getProfile', igAccountId, endpoint: 'profile' });
    return this.metaSdk.graphApiGet(
      `${igAccountId}`,
      {
        fields:
          'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url',
      },
      accessToken,
    );
  }

  /** Get media. */
  async getMedia(igAccountId: string, limit: number, accessToken: string) {
    this.logger.log('Calling Instagram API', { context: 'InstagramService.getMedia', igAccountId, limit, endpoint: 'media' });
    return this.metaSdk.graphApiGet(
      `${igAccountId}/media`,
      {
        fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count',
        limit: String(limit),
      },
      accessToken,
    );
  }

  /** Get account insights. */
  async getAccountInsights(
    igAccountId: string,
    metrics: string[],
    period: string,
    accessToken: string,
  ) {
    this.logger.log('Calling Instagram API', { context: 'InstagramService.getAccountInsights', igAccountId, endpoint: 'insights' });
    return this.metaSdk.graphApiGet(
      `${igAccountId}/insights`,
      { metric: metrics.join(','), period },
      accessToken,
    );
  }

  /** Publish photo. */
  async publishPhoto(igAccountId: string, imageUrl: string, caption: string, accessToken: string) {
    this.logger.log('Calling Instagram API', { context: 'InstagramService.publishPhoto', igAccountId, endpoint: 'media/create' });
    const container = await this.metaSdk.graphApiPost(
      `${igAccountId}/media`,
      { image_url: imageUrl, caption },
      accessToken,
    );
    this.logger.log('Calling Instagram API', { context: 'InstagramService.publishPhoto', igAccountId, endpoint: 'media_publish' });
    return this.metaSdk.graphApiPost(
      `${igAccountId}/media_publish`,
      { creation_id: container.id },
      accessToken,
    );
  }

  /** Get comments. */
  async getComments(mediaId: string, accessToken: string) {
    this.logger.log('Calling Instagram API', { context: 'InstagramService.getComments', mediaId, endpoint: 'comments' });
    return this.metaSdk.graphApiGet(
      `${mediaId}/comments`,
      { fields: 'id,text,username,timestamp' },
      accessToken,
    );
  }

  /** Reply to comment. */
  async replyToComment(commentId: string, text: string, accessToken: string) {
    this.logger.log('Calling Instagram API', { context: 'InstagramService.replyToComment', commentId, endpoint: 'replies' });
    return this.metaSdk.graphApiPost(`${commentId}/replies`, { message: text }, accessToken);
  }
}
