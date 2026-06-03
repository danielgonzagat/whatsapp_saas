import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mutate } from 'swr';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { instagramMarketingApi, metaAdsApi } from './meta';

const apiFetchMock = vi.mocked(apiFetch);
const mutateMock = vi.mocked(mutate);

describe('Meta API mutation adapters', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
  });

  it('does not invalidate Meta campaigns when campaign status update returns an API error envelope', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Meta rejected campaign status', status: 400 });

    await expect(metaAdsApi.updateCampaignStatus('campaign-1', 'ACTIVE')).rejects.toThrow(
      'Meta rejected campaign status',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('invalidates Meta campaigns after a confirmed campaign status update', async () => {
    apiFetchMock.mockResolvedValue({ data: { success: true }, status: 200 });

    await expect(metaAdsApi.updateCampaignStatus('campaign-1', 'PAUSED')).resolves.toEqual({
      data: { success: true },
      status: 200,
    });
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate Instagram marketing posts when publish returns an API error envelope', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Instagram publish rejected', status: 502 });

    await expect(
      instagramMarketingApi.publishPost('https://cdn.kloel.com/post.jpg', 'Post'),
    ).rejects.toThrow('Instagram publish rejected');
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
