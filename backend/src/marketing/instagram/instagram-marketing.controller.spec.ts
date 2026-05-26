import { BadRequestException } from '@nestjs/common';
import { InstagramMarketingController } from './instagram-marketing.controller';

describe('InstagramMarketingController', () => {
  const listAccounts = jest.fn();
  const publishPost = jest.fn();
  const listPosts = jest.fn();
  const getInsights = jest.fn();
  const listInsights = jest.fn();

  let controller: InstagramMarketingController;

  const req = {
    user: { sub: 'u-1', workspaceId: 'ws-1', email: 'owner@test.com', role: 'admin' },
    headers: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new InstagramMarketingController({
      listAccounts,
      publishPost,
      listPosts,
      getInsights,
      listInsights,
    } as never);
  });

  describe('listAccounts', () => {
    it('calls service with workspaceId resolved from req', async () => {
      const mockAccounts = { accounts: [{ instagramAccountId: 'ig-1', username: 'test' }] };
      listAccounts.mockResolvedValueOnce(mockAccounts);

      const result = await controller.listAccounts(req);

      expect(listAccounts).toHaveBeenCalledWith('ws-1');
      expect(result).toBe(mockAccounts);
    });
  });

  describe('publishPost', () => {
    it('calls service with workspaceId, imageUrl and caption from body', async () => {
      const body = { imageUrl: 'https://img.com/photo.jpg', caption: 'My post' };
      const mockResult = { post: { id: 'p-1', status: 'published' }, metaResponse: { id: 'm-1' } };
      publishPost.mockResolvedValueOnce(mockResult);

      const result = await controller.publishPost(req, body);

      expect(publishPost).toHaveBeenCalledWith('ws-1', 'https://img.com/photo.jpg', 'My post');
      expect(result).toBe(mockResult);
    });
  });

  describe('listPosts', () => {
    it('clamps limit and offset to safe defaults when query params are absent', async () => {
      const mockResult = { posts: [{ id: 'p-1' }], total: 1 };
      listPosts.mockResolvedValueOnce(mockResult);

      const result = await controller.listPosts(req, undefined, undefined);

      expect(listPosts).toHaveBeenCalledWith('ws-1', 25, 0);
      expect(result).toBe(mockResult);
    });

    it('falls back to default 25 when limit is 0 (Number||25), and clamps offset >= 0', async () => {
      const mockResult = { posts: [], total: 0 };
      listPosts.mockResolvedValueOnce(mockResult);

      await controller.listPosts(req, '0', '-5');

      // controller uses `Number(limit) || 25` so '0' becomes default 25; offset clamped to 0
      expect(listPosts).toHaveBeenCalledWith('ws-1', 25, 0);
    });

    it('clamps limit at 100 when overflow value supplied', async () => {
      const mockResult = { posts: [], total: 0 };
      listPosts.mockResolvedValueOnce(mockResult);

      await controller.listPosts(req, '500', '0');

      expect(listPosts).toHaveBeenCalledWith('ws-1', 100, 0);
    });
  });

  describe('getInsights', () => {
    it('uses default metrics and period when query is empty', async () => {
      const mockResult = { insight: { id: 'i-1', impressions: 100 }, metaResponse: {} };
      getInsights.mockResolvedValueOnce(mockResult);

      const result = await controller.getInsights(req, {});

      expect(getInsights).toHaveBeenCalledWith('ws-1', ['impressions', 'reach', 'follower_count'], 'day');
      expect(result).toBe(mockResult);
    });

    it('filters invalid metrics and passes only valid ones to service', async () => {
      const mockResult = { insight: { id: 'i-2' }, metaResponse: {} };
      getInsights.mockResolvedValueOnce(mockResult);

      await controller.getInsights(req, { metrics: 'impressions,invalid_metric,reach', period: 'week' } as never);

      expect(getInsights).toHaveBeenCalledWith('ws-1', ['impressions', 'reach'], 'week');
    });

    it('throws BadRequestException when no valid metrics remain', async () => {
      await expect(
        controller.getInsights(req, { metrics: 'invalid,also_invalid', period: 'day' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propagates error when service rejects', async () => {
      getInsights.mockRejectedValueOnce(new Error('Meta API failure'));

      await expect(
        controller.getInsights(req, { period: 'day' } as never),
      ).rejects.toThrow('Meta API failure');
    });
  });

  describe('listInsights', () => {
    it('passes workspaceId and optional query filters to service', async () => {
      const mockResult = { insights: [{ id: 'i-1' }] };
      listInsights.mockResolvedValueOnce(mockResult);

      const result = await controller.listInsights(req, 'ig-acc-1', '2026-01-01', '2026-05-01');

      expect(listInsights).toHaveBeenCalledWith('ws-1', 'ig-acc-1', '2026-01-01', '2026-05-01');
      expect(result).toBe(mockResult);
    });

    it('passes undefined for omitted optional query params', async () => {
      const mockResult = { insights: [] };
      listInsights.mockResolvedValueOnce(mockResult);

      await controller.listInsights(req, undefined, undefined, undefined);

      expect(listInsights).toHaveBeenCalledWith('ws-1', undefined, undefined, undefined);
    });
  });
});
