import { trustedExternalUrl } from '../marketing/OfficialMarketingChannelPage.helpers';
import type { PlatformData, PlatformKey } from './anuncios-types';

export interface AdPlatformConnectRequest {
  endpoint: string;
  trustedHosts: string[];
  unavailableMessage: string;
  notConfiguredMessage: string;
}

interface AdPlatformConnectResponse {
  data?: { url?: string };
  error?: string;
  message?: string;
}

export function buildAdPlatformConnectRequest(platformKey: PlatformKey): AdPlatformConnectRequest {
  if (platformKey === 'meta') {
    return {
      endpoint: '/meta/auth/url?channel=facebook&returnTo=%2Fanuncios',
      trustedHosts: ['facebook.com', 'www.facebook.com', 'business.facebook.com'],
      unavailableMessage: 'URL oficial da Meta indisponivel.',
      notConfiguredMessage: 'Meta Ads nao configurado neste ambiente.',
    };
  }
  if (platformKey === 'google') {
    return {
      endpoint: '/marketing/connect/google-ads/url',
      trustedHosts: ['accounts.google.com'],
      unavailableMessage: 'URL oficial do Google Ads indisponivel.',
      notConfiguredMessage: 'Google Ads nao configurado neste ambiente.',
    };
  }
  return {
    endpoint: '/marketing/connect/tiktok/url?kind=advertiser',
    trustedHosts: ['business-api.tiktok.com', 'www.tiktok.com', 'tiktok.com'],
    unavailableMessage: 'URL oficial do TikTok Ads indisponivel.',
    notConfiguredMessage: 'TikTok Ads nao configurado neste ambiente.',
  };
}

export function getAdPlatformConnectUnavailableMessage(
  platformKey: PlatformKey,
  platform: Pick<PlatformData, 'clientConfigured'> | null | undefined,
): string | null {
  if (platform?.clientConfigured === false) {
    return buildAdPlatformConnectRequest(platformKey).notConfiguredMessage;
  }
  return null;
}

export function readOfficialConnectUrl(
  response: AdPlatformConnectResponse | null | undefined,
  request: AdPlatformConnectRequest,
): string {
  const backendMessage = String(response?.message || response?.error || '').trim();
  if (backendMessage.includes('_not_configured')) {
    throw new Error(request.notConfiguredMessage);
  }

  const url = String(response?.data?.url || '').trim();
  if (!url || !trustedExternalUrl(url, request.trustedHosts)) {
    throw new Error(request.unavailableMessage);
  }
  return url;
}
