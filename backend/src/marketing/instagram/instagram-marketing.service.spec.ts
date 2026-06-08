import { BadRequestException } from '@nestjs/common';
import { partialMatch } from '../../../test/helpers/match-instance';
import { InstagramMarketingService } from './instagram-marketing.service';

jest.mock('../../meta/meta-token-crypto', () => ({
  decryptMetaToken: jest.fn((token: string | null | undefined) => token || null),
}));

describe('InstagramMarketingService', () => {
  const metaConnectionFindFirst = jest.fn();
  const publishPhoto = jest.fn();
  const getAccountInsights = jest.fn();
  const sendMessage = jest.fn();
  const getConversations = jest.fn();
  const igPostCreate = jest.fn();
  const igPostFindMany = jest.fn();
  const igPostCount = jest.fn();
  const igInsightFindMany = jest.fn();
  const igInsightUpsert = jest.fn();

  let service: InstagramMarketingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InstagramMarketingService(
      {
        metaConnection: { findFirst: metaConnectionFindFirst },
        igPost: {
          create: igPostCreate,
          findMany: igPostFindMany,
          count: igPostCount,
        },
        igInsight: {
          findMany: igInsightFindMany,
          upsert: igInsightUpsert,
        },
      } as never,
      { publishPhoto, getAccountInsights, sendMessage, getConversations } as never,
    );
  });

  describe('listAccounts', () => {
    it('returns connected accounts list when ig account exists', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        instagramUsername: 'kloel_official',
        pageName: 'Kloel Page',
        status: 'active',
      });

      const result = await service.listAccounts('ws-1');

      expect(metaConnectionFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1', channel: 'instagram' },
        }),
      );
      expect(result).toEqual({
        accounts: [
          {
            instagramAccountId: 'ig-123',
            username: 'kloel_official',
            pageName: 'Kloel Page',
            status: 'active',
          },
        ],
      });
    });

    it('returns empty accounts when no instagram account is connected', async () => {
      metaConnectionFindFirst.mockResolvedValue(null);

      const result = await service.listAccounts('ws-1');

      expect(result).toEqual({ accounts: [] });
    });

    it('returns empty accounts when connection exists but no instagramAccountId', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: null,
        instagramUsername: null,
        pageName: 'Kloel Page',
        status: 'active',
      });

      const result = await service.listAccounts('ws-1');

      expect(result).toEqual({ accounts: [] });
    });
  });

  describe('publishPost', () => {
    it('publishes a photo and creates an igPost record', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        accessToken: 'token-abc',
      });
      publishPhoto.mockResolvedValue({ id: 'ig-media-1' });
      igPostCreate.mockResolvedValue({
        id: 'post-1',
        workspaceId: 'ws-1',
        igAccountId: 'ig-123',
        igMediaId: 'ig-media-1',
        imageUrl: 'https://img.test/photo.jpg',
        caption: 'Summer sale',
        permalink: 'https://www.instagram.com/p/ig-media-1',
        status: 'published',
      });

      const result = await service.publishPost('ws-1', 'https://img.test/photo.jpg', 'Summer sale');

      expect(publishPhoto).toHaveBeenCalledWith(
        'ig-123',
        'https://img.test/photo.jpg',
        'Summer sale',
        'token-abc',
      );
      expect(igPostCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: partialMatch({
            workspaceId: 'ws-1',
            igAccountId: 'ig-123',
            status: 'published',
          }),
        }),
      );
      expect(result.post.status).toBe('published');
    });

    it('throws BadRequestException when no instagram account is connected', async () => {
      metaConnectionFindFirst.mockResolvedValue(null);

      await expect(
        service.publishPost('ws-1', 'https://img.test/photo.jpg', 'Caption'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(publishPhoto).not.toHaveBeenCalled();
    });

    it('records post as failed when no media id is returned', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        accessToken: 'token-abc',
      });
      publishPhoto.mockResolvedValue({});
      igPostCreate.mockResolvedValue({
        id: 'post-2',
        workspaceId: 'ws-1',
        igAccountId: 'ig-123',
        igMediaId: null,
        caption: 'Test',
        status: 'failed',
      });

      const result = await service.publishPost('ws-1', 'https://img.test/photo.jpg');

      expect(igPostCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: partialMatch({ status: 'failed' }),
        }),
      );
      expect(result.post.status).toBe('failed');
    });
  });

  describe('getInsights', () => {
    it('fetches insights and upserts the daily record', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        accessToken: 'token-abc',
      });
      getAccountInsights.mockResolvedValue({
        data: [
          { name: 'impressions', values: [{ value: 1000 }, { value: 500 }], period: 'day' },
          { name: 'reach', values: [{ value: 800 }], period: 'day' },
          { name: 'follower_count', values: [{ value: 55 }], period: 'day' },
        ],
      });
      igInsightUpsert.mockResolvedValue({
        id: 'insight-1',
        workspaceId: 'ws-1',
        date: new Date(),
        impressions: 1500,
        reach: 800,
        followerCount: 55,
      });

      const result = await service.getInsights('ws-1', ['impressions', 'reach'], 'day');

      expect(getAccountInsights).toHaveBeenCalledWith(
        'ig-123',
        ['impressions', 'reach'],
        'day',
        'token-abc',
      );
      expect(igInsightUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: partialMatch({
            impressions: 1500,
            reach: 800,
            followerCount: 55,
          }),
        }),
      );
      expect(result.insight.id).toBe('insight-1');
    });

    it('throws BadRequestException when no instagram account is connected', async () => {
      metaConnectionFindFirst.mockResolvedValue(null);

      await expect(service.getInsights('ws-1', ['impressions'], 'day')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('handles empty insight data gracefully', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        accessToken: 'token-abc',
      });
      getAccountInsights.mockResolvedValue({ data: [] });
      igInsightUpsert.mockResolvedValue({
        id: 'insight-2',
        workspaceId: 'ws-1',
        date: new Date(),
        impressions: 0,
        reach: 0,
        followerCount: 0,
      });

      const result = await service.getInsights('ws-1', ['impressions'], 'day');

      expect(igInsightUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: partialMatch({
            impressions: 0,
            reach: 0,
          }),
        }),
      );
      expect(result.insight.id).toBe('insight-2');
    });
  });

  describe('listPosts', () => {
    it('returns paginated posts with total count', async () => {
      igPostFindMany.mockResolvedValue([
        { id: 'post-1', caption: 'First post' },
        { id: 'post-2', caption: 'Second post' },
      ]);
      igPostCount.mockResolvedValue(10);

      const result = await service.listPosts('ws-1', 2, 0);

      expect(igPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
          orderBy: { createdAt: 'desc' },
          take: 2,
          skip: 0,
        }),
      );
      expect(result.posts).toHaveLength(2);
      expect(result.total).toBe(10);
    });
  });

  describe('listInsights', () => {
    it('filters insights by workspaceId and account', async () => {
      igInsightFindMany.mockResolvedValue([
        { id: 'insight-1', impressions: 100 },
        { id: 'insight-2', impressions: 200 },
      ]);

      const result = await service.listInsights('ws-1', 'ig-123');

      expect(igInsightFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: partialMatch({
            workspaceId: 'ws-1',
            igAccountId: 'ig-123',
          }),
        }),
      );
      expect(result.insights).toHaveLength(2);
    });

    it('filters insights by workspace and date range', async () => {
      igInsightFindMany.mockResolvedValue([]);

      await service.listInsights('ws-1', undefined, '2026-01-01', '2026-01-31');

      const findManyArgs = (
        igInsightFindMany.mock.calls as Array<
          [{ where: { workspaceId: string; date: { gte: Date; lte: Date } } }]
        >
      )[0][0];
      expect(findManyArgs.where.workspaceId).toBe('ws-1');
      expect(findManyArgs.where.date.gte).toBeInstanceOf(Date);
      expect(findManyArgs.where.date.lte).toBeInstanceOf(Date);
    });

    it('returns insights without account filter when igAccountId not provided', async () => {
      igInsightFindMany.mockResolvedValue([]);

      await service.listInsights('ws-1');

      expect(igInsightFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
        }),
      );
    });
  });

  describe('sendDirectMessage', () => {
    it('throws when text is empty after trim', async () => {
      await expect(service.sendDirectMessage('ws-1', 'igsid-1', '   ')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(metaConnectionFindFirst).not.toHaveBeenCalled();
    });

    it('throws when recipientId is empty', async () => {
      await expect(service.sendDirectMessage('ws-1', '', 'hi')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when instagram account is not connected', async () => {
      metaConnectionFindFirst.mockResolvedValue(null);

      await expect(service.sendDirectMessage('ws-1', 'igsid-1', 'hi')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when page access token is missing', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        accessToken: '',
        pageAccessToken: '',
      });
      const prevEnv = process.env.META_ACCESS_TOKEN;
      delete process.env.META_ACCESS_TOKEN;

      try {
        await expect(service.sendDirectMessage('ws-1', 'igsid-1', 'hi')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      } finally {
        if (prevEnv !== undefined) {
          process.env.META_ACCESS_TOKEN = prevEnv;
        }
      }
    });

    it('delegates to InstagramService.sendMessage with resolved page token and returns messageId', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        accessToken: 'user-token',
        pageAccessToken: 'page-token',
      });
      sendMessage.mockResolvedValue({ message_id: 'mid-9' });

      const result = await service.sendDirectMessage('ws-1', 'igsid-1', '  hello  ');

      expect(sendMessage).toHaveBeenCalledWith('ig-123', 'igsid-1', 'hello', 'page-token');
      expect(result.messageId).toBe('mid-9');
    });

    it('falls back to id field when message_id is absent', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        accessToken: 'user-token',
        pageAccessToken: 'page-token',
      });
      sendMessage.mockResolvedValue({ id: 'mid-fallback' });

      const result = await service.sendDirectMessage('ws-1', 'igsid-1', 'hi');

      expect(result.messageId).toBe('mid-fallback');
    });
  });
});
