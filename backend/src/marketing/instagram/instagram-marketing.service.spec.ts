import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { partialMatch } from '../../../test/helpers/match-instance';
import { InstagramMarketingService } from './instagram-marketing.service';
import { InstagramService } from '../channels/instagram/instagram.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelMessageDispatchService } from '../channel-message-dispatch.service';

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

  describe('sendDirectMessage — canonical dispatch flag (KLOEL_INSTAGRAM_CANONICAL_DISPATCH)', () => {
    const FLAG = 'KLOEL_INSTAGRAM_CANONICAL_DISPATCH';
    const canonicalDispatch = jest.fn();
    let priorFlag: string | undefined;
    let flaggedService: InstagramMarketingService;

    beforeEach(() => {
      priorFlag = process.env[FLAG];
      canonicalDispatch.mockReset();
      flaggedService = new InstagramMarketingService(
        { metaConnection: { findFirst: metaConnectionFindFirst } } as never,
        { sendMessage } as never,
        { dispatch: canonicalDispatch } as never,
      );
    });

    afterEach(() => {
      if (priorFlag === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = priorFlag;
      }
    });

    function connectedRow() {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        accessToken: 'user-token',
        pageAccessToken: 'page-token',
      });
    }

    describe('flag OFF (default)', () => {
      it('runs the existing InstagramService.sendMessage path and never touches the canonical service', async () => {
        delete process.env[FLAG];
        connectedRow();
        sendMessage.mockResolvedValue({ message_id: 'mid-raw' });

        const result = await flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi');

        expect(sendMessage).toHaveBeenCalledWith('ig-123', 'igsid-1', 'hi', 'page-token');
        expect(canonicalDispatch).not.toHaveBeenCalled();
        expect(result.messageId).toBe('mid-raw');
      });

      it('treats a literal non-true flag value as OFF', async () => {
        process.env[FLAG] = 'false';
        connectedRow();
        sendMessage.mockResolvedValue({ message_id: 'mid-raw' });

        await flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi');

        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(canonicalDispatch).not.toHaveBeenCalled();
      });
    });

    describe('flag ON', () => {
      it('delegates to ChannelMessageDispatchService.dispatch with credential overrides and maps messageId', async () => {
        process.env[FLAG] = 'true';
        connectedRow();
        canonicalDispatch.mockResolvedValue({
          success: true,
          messageId: 'mid-canonical',
          provider: 'meta-instagram',
          delivery: 'direct',
        });

        const result = await flaggedService.sendDirectMessage('ws-1', 'igsid-1', '  hello  ');

        expect(canonicalDispatch).toHaveBeenCalledWith('ws-1', 'instagram', 'igsid-1', 'hello', {
          igAccountId: 'ig-123',
          accessToken: 'page-token',
        });
        // The raw provider path is NOT used when delegating.
        expect(sendMessage).not.toHaveBeenCalled();
        expect(result.messageId).toBe('mid-canonical');
        expect(result.metaResponse).toEqual(
          expect.objectContaining({ success: true, messageId: 'mid-canonical' }),
        );
      });

      it('falls back to externalId when messageId is absent on the canonical result', async () => {
        process.env[FLAG] = 'true';
        connectedRow();
        canonicalDispatch.mockResolvedValue({
          success: true,
          externalId: 'ext-9',
          provider: 'meta-instagram',
        });

        const result = await flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi');

        expect(result.messageId).toBe('ext-9');
      });

      it('falls back to the raw path when the canonical service is not injected', async () => {
        process.env[FLAG] = 'true';
        // No canonical service provided (third ctor arg omitted).
        const noCanonical = new InstagramMarketingService(
          { metaConnection: { findFirst: metaConnectionFindFirst } } as never,
          { sendMessage } as never,
        );
        connectedRow();
        sendMessage.mockResolvedValue({ message_id: 'mid-fallback' });

        const result = await noCanonical.sendDirectMessage('ws-1', 'igsid-1', 'hi');

        expect(sendMessage).toHaveBeenCalledWith('ig-123', 'igsid-1', 'hi', 'page-token');
        expect(result.messageId).toBe('mid-fallback');
      });

      it('falls back to the raw path when the canonical dispatch throws', async () => {
        process.env[FLAG] = 'true';
        connectedRow();
        canonicalDispatch.mockRejectedValue(new Error('di_build_failure'));
        sendMessage.mockResolvedValue({ message_id: 'mid-after-fallback' });

        const result = await flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi');

        expect(canonicalDispatch).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledWith('ig-123', 'igsid-1', 'hi', 'page-token');
        expect(result.messageId).toBe('mid-after-fallback');
      });

      it('still enforces the existing validation/connection guards before delegating', async () => {
        process.env[FLAG] = 'true';
        metaConnectionFindFirst.mockResolvedValue(null);

        await expect(
          flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(canonicalDispatch).not.toHaveBeenCalled();
      });
    });
  });

  describe('Meta-connection resolver unification flag (KLOEL_INSTAGRAM_RESOLVER_UNIFY)', () => {
    const FLAG = 'KLOEL_INSTAGRAM_RESOLVER_UNIFY';
    const resolveConnection = jest.fn();
    let priorFlag: string | undefined;
    let unifiedService: InstagramMarketingService;

    beforeEach(() => {
      priorFlag = process.env[FLAG];
      resolveConnection.mockReset();
      unifiedService = new InstagramMarketingService(
        {
          metaConnection: { findFirst: metaConnectionFindFirst },
          igPost: { create: igPostCreate },
          igInsight: { upsert: igInsightUpsert },
        } as never,
        { publishPhoto, getAccountInsights } as never,
        undefined,
        { resolveConnection } as never,
      );
    });

    afterEach(() => {
      if (priorFlag === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = priorFlag;
      }
    });

    describe('flag OFF (default)', () => {
      it('publishPost reads the raw prisma metaConnection path and never touches resolveConnection', async () => {
        delete process.env[FLAG];
        metaConnectionFindFirst.mockResolvedValue({
          instagramAccountId: 'ig-123',
          accessToken: 'token-abc',
        });
        publishPhoto.mockResolvedValue({ id: 'ig-media-1' });
        igPostCreate.mockResolvedValue({ id: 'post-1', status: 'published' });

        await unifiedService.publishPost('ws-1', 'https://img.test/photo.jpg', 'cap');

        expect(metaConnectionFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { workspaceId: 'ws-1', channel: 'instagram' } }),
        );
        expect(resolveConnection).not.toHaveBeenCalled();
        expect(publishPhoto).toHaveBeenCalledWith(
          'ig-123',
          'https://img.test/photo.jpg',
          'cap',
          'token-abc',
        );
      });

      it('getInsights reads the raw prisma metaConnection path and never touches resolveConnection', async () => {
        process.env[FLAG] = 'false';
        metaConnectionFindFirst.mockResolvedValue({
          instagramAccountId: 'ig-123',
          accessToken: 'token-abc',
        });
        getAccountInsights.mockResolvedValue({ data: [] });
        igInsightUpsert.mockResolvedValue({ id: 'insight-1' });

        await unifiedService.getInsights('ws-1', ['impressions'], 'day');

        expect(metaConnectionFindFirst).toHaveBeenCalled();
        expect(resolveConnection).not.toHaveBeenCalled();
        expect(getAccountInsights).toHaveBeenCalledWith(
          'ig-123',
          ['impressions'],
          'day',
          'token-abc',
        );
      });
    });

    describe('flag ON', () => {
      it('publishPost resolves credentials via MetaWhatsAppService.resolveConnection(ws, instagram) and skips the raw findFirst', async () => {
        process.env[FLAG] = 'true';
        resolveConnection.mockResolvedValue({
          accessToken: 'token-canonical',
          instagramAccountId: 'ig-canonical',
        });
        publishPhoto.mockResolvedValue({ id: 'ig-media-2' });
        igPostCreate.mockResolvedValue({ id: 'post-2', status: 'published' });

        await unifiedService.publishPost('ws-1', 'https://img.test/p.jpg', 'cap');

        expect(resolveConnection).toHaveBeenCalledWith('ws-1', 'instagram');
        expect(metaConnectionFindFirst).not.toHaveBeenCalled();
        expect(publishPhoto).toHaveBeenCalledWith(
          'ig-canonical',
          'https://img.test/p.jpg',
          'cap',
          'token-canonical',
        );
      });

      it('getInsights resolves credentials via resolveConnection and skips the raw findFirst', async () => {
        process.env[FLAG] = 'true';
        resolveConnection.mockResolvedValue({
          accessToken: 'token-canonical',
          instagramAccountId: 'ig-canonical',
        });
        getAccountInsights.mockResolvedValue({ data: [] });
        igInsightUpsert.mockResolvedValue({ id: 'insight-2' });

        await unifiedService.getInsights('ws-1', ['reach'], 'day');

        expect(resolveConnection).toHaveBeenCalledWith('ws-1', 'instagram');
        expect(metaConnectionFindFirst).not.toHaveBeenCalled();
        expect(getAccountInsights).toHaveBeenCalledWith(
          'ig-canonical',
          ['reach'],
          'day',
          'token-canonical',
        );
      });

      it('throws the same connection guard when resolveConnection yields no instagram account', async () => {
        process.env[FLAG] = 'true';
        resolveConnection.mockResolvedValue({
          accessToken: 'token-canonical',
          instagramAccountId: null,
        });

        await expect(
          unifiedService.publishPost('ws-1', 'https://img.test/p.jpg', 'cap'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(publishPhoto).not.toHaveBeenCalled();
      });

      it('falls back to the raw prisma path when the canonical resolver is not injected', async () => {
        process.env[FLAG] = 'true';
        const noResolver = new InstagramMarketingService(
          {
            metaConnection: { findFirst: metaConnectionFindFirst },
            igPost: { create: igPostCreate },
          } as never,
          { publishPhoto } as never,
        );
        metaConnectionFindFirst.mockResolvedValue({
          instagramAccountId: 'ig-123',
          accessToken: 'token-abc',
        });
        publishPhoto.mockResolvedValue({ id: 'ig-media-3' });
        igPostCreate.mockResolvedValue({ id: 'post-3', status: 'published' });

        await noResolver.publishPost('ws-1', 'https://img.test/p.jpg', 'cap');

        expect(resolveConnection).not.toHaveBeenCalled();
        expect(metaConnectionFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { workspaceId: 'ws-1', channel: 'instagram' } }),
        );
        expect(publishPhoto).toHaveBeenCalledWith(
          'ig-123',
          'https://img.test/p.jpg',
          'cap',
          'token-abc',
        );
      });
    });
  });

  describe('listConversations', () => {
    it('throws when instagram account is not connected', async () => {
      metaConnectionFindFirst.mockResolvedValue(null);

      await expect(service.listConversations('ws-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when pageId is missing', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        accessToken: 'user-token',
        pageAccessToken: 'page-token',
        pageId: null,
      });

      await expect(service.listConversations('ws-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('delegates to InstagramService.getConversations and returns payload with igAccountId', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        accessToken: 'user-token',
        pageAccessToken: 'page-token',
        pageId: 'page-77',
      });
      getConversations.mockResolvedValue({ data: [{ id: 'thread-1' }] });

      const result = await service.listConversations('ws-1');

      expect(getConversations).toHaveBeenCalledWith('page-77', 'page-token');
      expect(result).toEqual({
        conversations: { data: [{ id: 'thread-1' }] },
        igAccountId: 'ig-123',
      });
    });
  });

  describe('listMessages', () => {
    it('returns instagram_account_not_connected when no connection row exists', async () => {
      metaConnectionFindFirst.mockResolvedValue(null);

      const result = await service.listMessages('ws-1');

      expect(result).toEqual({
        messages: [],
        total: 0,
        reason: 'instagram_account_not_connected',
      });
    });

    it('returns instagram_messaging_pending when account is connected', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        status: 'connected',
      });

      const result = await service.listMessages('ws-1', 'thread-9');

      expect(result).toEqual({
        messages: [],
        total: 0,
        reason: 'instagram_messaging_pending',
      });
    });
  });

  describe('boot smoke — module resolves without a DI cycle', () => {
    it('constructs InstagramMarketingService with the canonical dispatch service injected', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InstagramMarketingService,
          { provide: PrismaService, useValue: { metaConnection: { findFirst: jest.fn() } } },
          { provide: InstagramService, useValue: { sendMessage: jest.fn() } },
          { provide: ChannelMessageDispatchService, useValue: { dispatch: jest.fn() } },
        ],
      }).compile();

      const resolved = module.get<InstagramMarketingService>(InstagramMarketingService);
      expect(resolved).toBeInstanceOf(InstagramMarketingService);
      await module.close();
    });
  });
});
