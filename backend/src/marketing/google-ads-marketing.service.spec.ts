import { GoogleAdsMarketingService } from './google-ads-marketing.service';

describe('GoogleAdsMarketingService', () => {
  const originalEnv = { ...process.env };

  function buildService(providerSettings: Record<string, unknown> = {}) {
    const prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ providerSettings }),
        update: jest.fn().mockResolvedValue({ id: 'ws-1' }),
      },
    };
    return { service: new GoogleAdsMarketingService(prisma as never), prisma };
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GOOGLE_ADS_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_ADS_CLIENT_SECRET = 'google-client-secret';
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'developer-token';
    process.env.GOOGLE_ADS_STATE_SECRET = 'state-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.kloel.com';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('builds a Google Ads OAuth URL with the readonly adwords scope', () => {
    const { service } = buildService();

    const result = service.generateAuthUrl('ws-1');
    const url = new URL(result.url);

    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('google-client-id');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/adwords');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://app.kloel.com/integrations/google-ads/callback',
    );
  });

  it('lists accessible customers through the current Google Ads API version', async () => {
    const { service, prisma } = buildService({
      googleAds: { connected: true, accessToken: 'access-token' },
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ resourceNames: ['customers/1234567890'] }), { status: 200 }),
      );

    const result = await service.listAccessibleCustomers('ws-1');

    expect(result).toEqual({ status: 'ok', customers: ['1234567890'] });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v24/customers:listAccessibleCustomers',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'developer-token': 'developer-token',
        }),
      }),
    );
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            googleAds: expect.objectContaining({ customerIds: ['1234567890'] }),
          }),
        }),
      }),
    );
  });
});
