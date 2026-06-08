import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
