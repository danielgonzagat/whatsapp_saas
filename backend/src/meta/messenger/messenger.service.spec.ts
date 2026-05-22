import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { MessengerService } from './messenger.service';
import { MetaSdkService } from '../meta-sdk.service';

function createMockMetaSdk() {
  return {
    graphApiGet: jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(),
    graphApiPost: jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(),
  };
}

describe('MessengerService', () => {
  let service: MessengerService;
  let metaSdk: ReturnType<typeof createMockMetaSdk>;

  beforeEach(async () => {
    metaSdk = createMockMetaSdk();

    const module: TestingModule = await Test.createTestingModule({
      providers: [MessengerService, { provide: MetaSdkService, useValue: metaSdk }],
    }).compile();

    service = module.get<MessengerService>(MessengerService);
  });

  describe('sendTextMessage', () => {
    it('delegates to metaSdk.graphApiPost with recipient and text message', async () => {
      const mockResponse = { message_id: 'msg_abc' };
      metaSdk.graphApiPost.mockResolvedValue(mockResponse);

      const result = await service.sendTextMessage('page_1', 'user_1', 'Hello!', 'page_token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiPost).toHaveBeenCalledWith(
        'page_1/messages',
        { recipient: { id: 'user_1' }, message: { text: 'Hello!' } },
        'page_token',
      );
    });

    it('passes the pageAccessToken as the third argument', async () => {
      metaSdk.graphApiPost.mockResolvedValue({});

      await service.sendTextMessage('page_1', 'user_1', 'Hi', 'token_secret');

      const [, , accessToken] = metaSdk.graphApiPost.mock.calls[0] as [
        string,
        Record<string, unknown>,
        string,
      ];
      expect(accessToken).toBe('token_secret');
    });
  });

  describe('sendMediaMessage', () => {
    it('delegates to metaSdk.graphApiPost with attachment payload', async () => {
      const mockResponse = { message_id: 'msg_media' };
      metaSdk.graphApiPost.mockResolvedValue(mockResponse);

      const result = await service.sendMediaMessage(
        'page_1',
        'user_1',
        'image',
        'https://img.example.com/photo.jpg',
        'page_token',
      );

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiPost).toHaveBeenCalledWith(
        'page_1/messages',
        {
          recipient: { id: 'user_1' },
          message: {
            attachment: {
              type: 'image',
              payload: { url: 'https://img.example.com/photo.jpg' },
            },
          },
        },
        'page_token',
      );
    });

    it('handles video type attachment', async () => {
      metaSdk.graphApiPost.mockResolvedValue({ message_id: 'vid_1' });

      await service.sendMediaMessage(
        'page_1',
        'user_1',
        'video',
        'https://vid.example.com/video.mp4',
        'page_token',
      );

      const [, body] = metaSdk.graphApiPost.mock.calls[0] as [string, Record<string, unknown>];
      const message = body.message as Record<string, unknown>;
      const attachment = message.attachment as Record<string, unknown>;
      expect(attachment.type).toBe('video');
    });
  });

  describe('getUserProfile', () => {
    it('delegates to metaSdk.graphApiGet with profile fields', async () => {
      const mockResponse = {
        first_name: 'John',
        last_name: 'Doe',
        profile_pic: 'https://...',
      };
      metaSdk.graphApiGet.mockResolvedValue(mockResponse);

      const result = await service.getUserProfile('user_1', 'page_token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
        'user_1',
        { fields: 'first_name,last_name,profile_pic' },
        'page_token',
      );
    });
  });

  describe('getConversations', () => {
    it('delegates to metaSdk.graphApiGet with nested messages fields', async () => {
      const mockResponse = {
        data: [{ id: 'conv_1', senders: { data: [] }, message_count: 5 }],
      };
      metaSdk.graphApiGet.mockResolvedValue(mockResponse);

      const result = await service.getConversations('page_1', 'page_token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
        'page_1/conversations',
        {
          fields: 'id,senders,message_count,updated_time,messages{message,from,created_time}',
        },
        'page_token',
      );
    });

    it('includes the messages subfield expansion', async () => {
      metaSdk.graphApiGet.mockResolvedValue({});

      await service.getConversations('page_1', 'page_token');

      const [, params] = metaSdk.graphApiGet.mock.calls[0] as [string, Record<string, string>];
      expect(params.fields).toContain('messages{');
      expect(params.fields).toContain('message,from,created_time');
    });
  });
});
