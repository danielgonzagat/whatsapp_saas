import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetchMock, mutateMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock('../api/core', () => ({
  apiFetch: apiFetchMock,
}));

vi.mock('swr', () => ({
  mutate: mutateMock,
}));

import { instagramApi, messengerApi, metaAdsApi } from '../api/meta';

describe('meta api client', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
    apiFetchMock.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not send access tokens in Meta ads requests', async () => {
    await metaAdsApi.getCampaigns('123456');
    await metaAdsApi.updateCampaignStatus('campaign-1', 'PAUSED');

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, '/meta/ads/campaigns', {
      params: { adAccountId: '123456' },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      '/meta/ads/campaigns/campaign-1/status',
      {
        method: 'PATCH',
        body: { status: 'PAUSED' },
      },
    );
  });

  it('does not send access tokens in Instagram requests', async () => {
    await instagramApi.publishPhoto('ig-1', 'https://cdn.kloel.test/photo.jpg', 'Legenda');
    await instagramApi.replyToComment('comment-1', 'Resposta');

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, '/meta/instagram/publish/photo', {
      method: 'POST',
      body: {
        igAccountId: 'ig-1',
        imageUrl: 'https://cdn.kloel.test/photo.jpg',
        caption: 'Legenda',
      },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      '/meta/instagram/comments/comment-1/reply',
      {
        method: 'POST',
        body: { text: 'Resposta' },
      },
    );
  });

  it('does not send page access tokens in Messenger requests', async () => {
    await messengerApi.send({
      pageId: 'page-1',
      recipientId: 'user-1',
      text: 'Oi',
    });
    await messengerApi.getConversations('page-1');

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, '/meta/messenger/send', {
      method: 'POST',
      body: {
        pageId: 'page-1',
        recipientId: 'user-1',
        text: 'Oi',
      },
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/meta/messenger/conversations', {
      params: { pageId: 'page-1' },
    });
  });
});
