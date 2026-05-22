import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { InstagramService } from './instagram.service';
import { MetaSdkService } from '../meta-sdk.service';

function createMockMetaSdk() {
  return {
    graphApiGet: jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(),
    graphApiPost: jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(),
  };
}

describe('InstagramService', () => {
  let service: InstagramService;
  let metaSdk: ReturnType<typeof createMockMetaSdk>;

  beforeEach(async () => {
    metaSdk = createMockMetaSdk();

    const module: TestingModule = await Test.createTestingModule({
      providers: [InstagramService, { provide: MetaSdkService, useValue: metaSdk }],
    }).compile();

    service = module.get<InstagramService>(InstagramService);
  });

  describe('sendMessage', () => {
    it('delegates to metaSdk.graphApiPost with recipient and message', async () => {
      const mockResponse = { message_id: 'msg_123' };
      metaSdk.graphApiPost.mockResolvedValue(mockResponse);

      const result = await service.sendMessage('ig_1', 'recip_1', 'Hello!', 'token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiPost).toHaveBeenCalledWith(
        'ig_1/messages',
        { recipient: { id: 'recip_1' }, message: { text: 'Hello!' } },
        'token',
      );
    });
  });

  describe('getProfile', () => {
    it('delegates to metaSdk.graphApiGet with profile fields', async () => {
      const mockResponse = {
        id: 'ig_1',
        username: 'testuser',
        name: 'Test User',
        followers_count: 1000,
      };
      metaSdk.graphApiGet.mockResolvedValue(mockResponse);

      const result = await service.getProfile('ig_1', 'token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
        'ig_1',
        expect.objectContaining({
          fields: expect.stringContaining('username'),
        }),
        'token',
      );
    });

    it('includes all expected profile fields', async () => {
      metaSdk.graphApiGet.mockResolvedValue({});

      await service.getProfile('ig_1', 'token');

      const [, params] = metaSdk.graphApiGet.mock.calls[0] as [string, Record<string, string>];
      const fields = params.fields.split(',');
      expect(fields).toContain('username');
      expect(fields).toContain('followers_count');
      expect(fields).toContain('profile_picture_url');
    });
  });

  describe('getMedia', () => {
    it('delegates to metaSdk.graphApiGet with media fields and limit', async () => {
      const mockResponse = { data: [{ id: 'media_1', caption: 'Hello' }] };
      metaSdk.graphApiGet.mockResolvedValue(mockResponse);

      const result = await service.getMedia('ig_1', 10, 'token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
        'ig_1/media',
        expect.objectContaining({
          fields: expect.stringContaining('caption'),
          limit: '10',
        }),
        'token',
      );
    });
  });

  describe('getAccountInsights', () => {
    it('delegates to metaSdk.graphApiGet with metrics and period', async () => {
      const mockResponse = {
        data: [{ name: 'impressions', values: [{ value: 5000 }] }],
      };
      metaSdk.graphApiGet.mockResolvedValue(mockResponse);

      const result = await service.getAccountInsights(
        'ig_1',
        ['impressions', 'reach'],
        'day',
        'token',
      );

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
        'ig_1/insights',
        { metric: 'impressions,reach', period: 'day' },
        'token',
      );
    });

    it('joins multiple metrics with comma', async () => {
      metaSdk.graphApiGet.mockResolvedValue({});

      await service.getAccountInsights(
        'ig_1',
        ['impressions', 'reach', 'profile_views'],
        'week',
        'token',
      );

      const [, params] = metaSdk.graphApiGet.mock.calls[0] as [string, Record<string, string>];
      expect(params.metric).toBe('impressions,reach,profile_views');
    });
  });

  describe('publishPhoto', () => {
    it('creates a media container and then publishes it', async () => {
      const containerResponse = { id: 'container_1' };
      const publishResponse = { id: 'published_1' };
      metaSdk.graphApiPost
        .mockResolvedValueOnce(containerResponse)
        .mockResolvedValueOnce(publishResponse);

      const result = await service.publishPhoto(
        'ig_1',
        'https://img.example.com/photo.jpg',
        'My caption',
        'token',
      );

      expect(result).toEqual(publishResponse);
      expect(metaSdk.graphApiPost).toHaveBeenCalledTimes(2);
      expect(metaSdk.graphApiPost).toHaveBeenNthCalledWith(
        1,
        'ig_1/media',
        { image_url: 'https://img.example.com/photo.jpg', caption: 'My caption' },
        'token',
      );
      expect(metaSdk.graphApiPost).toHaveBeenNthCalledWith(
        2,
        'ig_1/media_publish',
        { creation_id: 'container_1' },
        'token',
      );
    });
  });

  describe('getComments', () => {
    it('delegates to metaSdk.graphApiGet with comment fields', async () => {
      const mockResponse = {
        data: [{ id: 'comment_1', text: 'Great post!', username: 'fan' }],
      };
      metaSdk.graphApiGet.mockResolvedValue(mockResponse);

      const result = await service.getComments('media_1', 'token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
        'media_1/comments',
        { fields: 'id,text,username,timestamp' },
        'token',
      );
    });
  });

  describe('replyToComment', () => {
    it('delegates to metaSdk.graphApiPost with comment ID and text', async () => {
      const mockResponse = { id: 'reply_1' };
      metaSdk.graphApiPost.mockResolvedValue(mockResponse);

      const result = await service.replyToComment('comment_1', 'Thanks!', 'token');

      expect(result).toEqual(mockResponse);
      expect(metaSdk.graphApiPost).toHaveBeenCalledWith(
        'comment_1/replies',
        { message: 'Thanks!' },
        'token',
      );
    });
  });
});
