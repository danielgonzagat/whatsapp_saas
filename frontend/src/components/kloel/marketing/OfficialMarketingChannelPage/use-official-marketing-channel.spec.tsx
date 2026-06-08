import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  apiFetchMock,
  completeChannelSetupMock,
  getChannelSetupMock,
  saveChannelConfigMock,
  useProductsMock,
} = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  completeChannelSetupMock: vi.fn(),
  getChannelSetupMock: vi.fn(),
  saveChannelConfigMock: vi.fn(),
  useProductsMock: vi.fn(),
}));

vi.mock('@/hooks/useProducts', () => ({
  useProducts: useProductsMock,
}));

vi.mock('@/lib/api', () => ({
  apiFetch: apiFetchMock,
}));

vi.mock('@/lib/api/channel-setup', () => ({
  addChannelArsenal: vi.fn(),
  completeChannelSetup: completeChannelSetupMock,
  getChannelSetup: getChannelSetupMock,
  saveChannelConfig: saveChannelConfigMock,
  saveChannelProducts: vi.fn(),
}));

import { useOfficialMarketingChannel } from './use-official-marketing-channel';

const emptySetup = {
  channel: 'tiktok',
  completed: false,
  products: [],
  selectedProductIds: [],
  arsenal: [],
  config: null,
};

describe('useOfficialMarketingChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProductsMock.mockReturnValue({ products: [] });
    getChannelSetupMock.mockResolvedValue(emptySetup);
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url === '/marketing/connect/status') {
        return { data: { channels: {}, meta: { connected: false, status: 'disconnected' } } };
      }
      if (url === '/marketing/connect/google-ads/status') {
        return {
          data: {
            connected: false,
            status: 'not_configured',
            clientConfigured: false,
            secretConfigured: false,
            developerTokenConfigured: false,
          },
        };
      }
      if (url === '/marketing/connect/channel-setup?channel=tiktok') {
        return { data: { setup: null, completedAt: null } };
      }
      if (url === '/marketing/connect/tiktok/status') {
        return {
          data: {
            connected: false,
            status: 'config_missing',
            configReady: false,
            clientConfigured: false,
            secretConfigured: false,
          },
        };
      }
      if (url === '/marketing/tiktok/mode') {
        return {
          data: {
            mode: 'blocked',
            details: {
              clientConfigured: false,
              secretConfigured: false,
              outboundApproved: false,
              tokenValid: false,
              recentOutbound: false,
              missingVariables: ['TIKTOK_CLIENT_KEY'],
              requiredSteps: ['Configure TikTok OAuth'],
            },
          },
        };
      }
      return { error: `unexpected request: ${url}` };
    });
  });

  it('deduplicates concurrent initial channel refreshes for the same channel', async () => {
    getChannelSetupMock.mockResolvedValue({ ...emptySetup, channel: 'whatsapp' });
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url === '/marketing/connect/status') {
        return { data: { channels: {}, meta: { connected: false, status: 'disconnected' } } };
      }
      if (url === '/marketing/connect/channel-setup?channel=whatsapp') {
        return { data: { setup: null, completedAt: null } };
      }
      return { error: `unexpected request: ${url}` };
    });

    const first = renderHook(() =>
      useOfficialMarketingChannel({ channel: 'whatsapp', initialStep: undefined }),
    );
    const second = renderHook(() =>
      useOfficialMarketingChannel({ channel: 'whatsapp', initialStep: undefined }),
    );

    await waitFor(() => {
      expect(first.result.current.isLoading).toBe(false);
      expect(second.result.current.isLoading).toBe(false);
    });

    const callCount = (url: string) =>
      apiFetchMock.mock.calls.filter(([requestUrl]) => requestUrl === url).length;

    expect(callCount('/marketing/connect/status')).toBe(1);
    expect(callCount('/marketing/connect/channel-setup?channel=whatsapp')).toBe(1);
    expect(getChannelSetupMock).toHaveBeenCalledTimes(1);

    first.unmount();
    second.unmount();
  });

  it('keeps a deep-link initialStep local until the user saves setup', async () => {
    getChannelSetupMock.mockResolvedValue({ ...emptySetup, channel: 'whatsapp' });
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url === '/marketing/connect/status') {
        return { data: { channels: {}, meta: { connected: false, status: 'disconnected' } } };
      }
      if (url === '/marketing/connect/channel-setup?channel=whatsapp') {
        return { data: { setup: null, completedAt: null } };
      }
      if (url === '/marketing/connect/channel-setup') {
        return { data: { setup: { currentStep: 1 } } };
      }
      return { error: `unexpected request: ${url}` };
    });

    const { result } = renderHook(() =>
      useOfficialMarketingChannel({ channel: 'whatsapp', initialStep: 1 }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.setup.currentStep).toBe(1));

    const automaticPosts = apiFetchMock.mock.calls.filter(([url, options]) => {
      const request = options as { method?: string } | undefined;
      return url === '/marketing/connect/channel-setup' && request?.method === 'POST';
    });
    expect(automaticPosts).toHaveLength(0);
  });

  it('loads Google Ads from its dedicated status endpoint instead of generic channel setup', async () => {
    const { result } = renderHook(() =>
      useOfficialMarketingChannel({ channel: 'google-ads', initialStep: undefined }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.loadError).toBeNull();
    expect(result.current.setupLoaded).toBe(true);
    expect(apiFetchMock).toHaveBeenCalledWith('/marketing/connect/status');
    expect(apiFetchMock).toHaveBeenCalledWith('/marketing/connect/google-ads/status');
    expect(apiFetchMock).not.toHaveBeenCalledWith(
      '/marketing/connect/channel-setup?channel=google-ads',
    );
    expect(getChannelSetupMock).not.toHaveBeenCalledWith('google-ads');
  });

  it('does not request a Google Ads OAuth URL when credentials are missing', async () => {
    const { result } = renderHook(() =>
      useOfficialMarketingChannel({ channel: 'google-ads', initialStep: undefined }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.setupUnavailable).toBe(true);
    apiFetchMock.mockClear();

    await act(async () => {
      await result.current.openGoogleAds();
    });

    expect(apiFetchMock).not.toHaveBeenCalledWith('/marketing/connect/google-ads/url');
    expect(result.current.message).toBe('Google Ads nao configurado neste ambiente.');
  });

  it('does not request a TikTok OAuth URL when credentials are missing', async () => {
    const { result } = renderHook(() =>
      useOfficialMarketingChannel({ channel: 'tiktok', initialStep: undefined }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.setupUnavailable).toBe(true);
    apiFetchMock.mockClear();

    await act(async () => {
      await result.current.openTikTok('advertiser');
    });

    expect(apiFetchMock).not.toHaveBeenCalledWith('/marketing/connect/tiktok/url?kind=advertiser');
    expect(result.current.message).toBe('TikTok nao configurado neste ambiente.');
  });

  it('does not request a Meta OAuth URL when Meta configuration is unavailable', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url === '/marketing/connect/status') {
        return {
          data: {
            channels: {
              instagram: {
                connected: false,
                status: 'meta_oauth_configuration_missing',
              },
            },
          },
        };
      }
      if (url === '/marketing/connect/channel-setup?channel=instagram') {
        return { data: { setup: null, completedAt: null } };
      }
      return { error: `unexpected request: ${url}` };
    });

    const { result } = renderHook(() =>
      useOfficialMarketingChannel({ channel: 'instagram', initialStep: undefined }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.setupUnavailable).toBe(true);
    apiFetchMock.mockClear();

    await act(async () => {
      await result.current.openMeta();
    });

    expect(apiFetchMock).not.toHaveBeenCalledWith(
      '/meta/auth/url?channel=instagram&returnTo=%2Fmarketing%2Finstagram',
    );
    expect(result.current.message).toBe('Meta nao configurado neste ambiente.');
  });

  it('does not complete setup when provider configuration is unavailable', async () => {
    getChannelSetupMock.mockResolvedValue({ ...emptySetup, channel: 'whatsapp', completed: true });
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url === '/marketing/connect/status') {
        return {
          data: {
            channels: {
              whatsapp: {
                connected: false,
                status: 'meta_oauth_configuration_missing',
              },
            },
          },
        };
      }
      if (url === '/marketing/connect/channel-setup?channel=whatsapp') {
        return { data: { setup: null, completedAt: '2026-06-07T00:00:00.000Z' } };
      }
      return { error: `unexpected request: ${url}` };
    });

    const { result } = renderHook(() =>
      useOfficialMarketingChannel({ channel: 'whatsapp', initialStep: undefined }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.setupUnavailable).toBe(true);

    apiFetchMock.mockClear();
    completeChannelSetupMock.mockClear();
    saveChannelConfigMock.mockClear();

    let completed = true;
    await act(async () => {
      completed = await result.current.handleComplete();
    });

    expect(completed).toBe(false);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(saveChannelConfigMock).not.toHaveBeenCalled();
    expect(completeChannelSetupMock).not.toHaveBeenCalled();
    expect(result.current.completed).toBe(false);
    expect(result.current.completeMessage).toBe(
      'Canal nao configurado neste ambiente. Conecte o provedor antes de concluir.',
    );
  });
});
