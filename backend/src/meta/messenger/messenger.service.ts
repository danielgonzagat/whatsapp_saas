import { Injectable } from '@nestjs/common';
import { MetaSdkService } from '../meta-sdk.service';

@Injectable()
export class MessengerService {
  constructor(private readonly metaSdk: MetaSdkService) {}

  async sendTextMessage(
    pageId: string,
    recipientId: string,
    text: string,
    pageAccessToken: string,
  ) {
    return this.metaSdk.graphApiPost(
      `${pageId}/messages`,
      { recipient: { id: recipientId }, message: { text } },
      pageAccessToken,
    );
  }

  async sendMediaMessage(
    pageId: string,
    recipientId: string,
    type: string,
    url: string,
    pageAccessToken: string,
  ) {
    return this.metaSdk.graphApiPost(
      `${pageId}/messages`,
      {
        recipient: { id: recipientId },
        message: { attachment: { type, payload: { url } } },
      },
      pageAccessToken,
    );
  }

  async getUserProfile(userId: string, pageAccessToken: string) {
    return this.metaSdk.graphApiGet(
      userId,
      { fields: 'first_name,last_name,profile_pic' },
      pageAccessToken,
    );
  }

  async getConversations(pageId: string, pageAccessToken: string) {
    return this.metaSdk.graphApiGet(
      `${pageId}/conversations`,
      {
        fields:
          'id,senders,message_count,updated_time,messages{message,from,created_time}',
      },
      pageAccessToken,
    );
  }
}
