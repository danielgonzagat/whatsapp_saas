import { describe, expect, it } from 'vitest';

import { buildAdPlatformConnectRequest, readOfficialConnectUrl } from './AnunciosConnect.helpers';

describe('Anuncios connect helpers', () => {
  it('routes ad platform CTAs to official OAuth URL endpoints', () => {
    expect(buildAdPlatformConnectRequest('meta').endpoint).toBe(
      '/meta/auth/url?channel=facebook&returnTo=%2Fanuncios',
    );
    expect(buildAdPlatformConnectRequest('google').endpoint).toBe('/marketing/connect/google-ads/url');
    expect(buildAdPlatformConnectRequest('tiktok').endpoint).toBe(
      '/marketing/connect/tiktok/url?kind=advertiser',
    );
  });

  it('accepts only trusted external provider URLs', () => {
    const request = buildAdPlatformConnectRequest('google');

    expect(
      readOfficialConnectUrl({ data: { url: 'https://accounts.google.com/o/oauth2/v2/auth' } }, request),
    ).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(() =>
      readOfficialConnectUrl({ data: { url: 'https://evil.example.test/oauth' } }, request),
    ).toThrow('URL oficial do Google Ads indisponivel.');
  });

  it('explains when a provider is not configured in the environment', () => {
    const request = buildAdPlatformConnectRequest('tiktok');
    const errorEnvelope = { error: 'tiktok_client_key_not_configured', status: 503 } as unknown as Parameters<
      typeof readOfficialConnectUrl
    >[0];

    expect(() => readOfficialConnectUrl(errorEnvelope, request)).toThrow(
      'TikTok Ads nao configurado neste ambiente.',
    );
  });
});
