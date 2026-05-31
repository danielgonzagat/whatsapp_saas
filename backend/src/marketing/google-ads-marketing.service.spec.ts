import { createHmac } from 'crypto';
import type { PrismaService } from '../prisma/prisma.service';
import { GoogleAdsMarketingService } from './google-ads-marketing.service';

interface WorkspaceUpdateCall {
  where: { id: string };
  data: {
    providerSettings: {
      googleAds?: {
        customerIds?: string[];
        accessToken?: string;
        refreshToken?: string;
      };
    };
  };
}

interface CredentialUpsertCall {
  where: { workspaceId_platform: { workspaceId: string; platform: string } };
  create: {
    workspaceId: string;
    platform: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: Date;
    status: string;
    loginCustomerId: string | null;
  };
  update: {
    accessToken: string;
    refreshToken: string | null;
    status: string;
  };
}

type CanonicalCredential = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  loginCustomerId: string | null;
  status: string;
};

describe('GoogleAdsMarketingService', () => {
  const originalEnv = { ...process.env };

  function buildService(
    providerSettings: Record<string, unknown> = {},
    credential: CanonicalCredential | null = null,
  ) {
    const workspaceFindUnique = jest
      .fn<Promise<{ providerSettings: Record<string, unknown> }>, []>()
      .mockResolvedValue({ providerSettings });
    const workspaceUpdate = jest
      .fn<Promise<{ id: string }>, [WorkspaceUpdateCall]>()
      .mockResolvedValue({ id: 'ws-1' });
    const credentialFindUnique = jest
      .fn<Promise<CanonicalCredential | null>, []>()
      .mockResolvedValue(credential);
    const credentialUpsert = jest
      .fn<Promise<{ id: string }>, [CredentialUpsertCall]>()
      .mockResolvedValue({ id: 'cred-1' });
    const prisma = {
      workspace: {
        findUnique: workspaceFindUnique,
        update: workspaceUpdate,
      },
      integrationCredential: {
        findUnique: credentialFindUnique,
        upsert: credentialUpsert,
      },
    };
    return {
      service: new GoogleAdsMarketingService(prisma as unknown as PrismaService),
      workspaceUpdate,
      credentialFindUnique,
      credentialUpsert,
    };
  }

  function signState(workspaceId: string): string {
    // Mirror the service signing so completeOAuth state passes verification.
    const payload = { workspaceId, ts: Date.now() };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', 'state-secret').update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GOOGLE_ADS_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_ADS_CLIENT_SECRET = 'google-client-secret';
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'developer-token';
    process.env.GOOGLE_ADS_STATE_SECRET = 'state-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.kloel.com';
    // No token-encryption key in tests → crypto helpers pass tokens through verbatim.
    delete process.env.GOOGLE_ADS_TOKEN_ENCRYPTION_KEY;
    delete process.env.META_TOKEN_ENCRYPTION_KEY;
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

  it('persists OAuth tokens into the canonical IntegrationCredential model, not providerSettings', async () => {
    const { service, credentialUpsert, workspaceUpdate } = buildService();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/adwords',
        }),
        { status: 200 },
      ),
    );

    const result = await service.completeOAuth('ws-1', {
      code: 'auth-code',
      state: signState('ws-1'),
    });

    expect(result).toEqual({ connected: true, status: 'connected' });

    // Tokens land in the typed IntegrationCredential store (single source of truth).
    const upsertCall = credentialUpsert.mock.calls[0]?.[0];
    expect(upsertCall?.where).toEqual({
      workspaceId_platform: { workspaceId: 'ws-1', platform: 'google' },
    });
    expect(upsertCall?.create.accessToken).toBe('fresh-access');
    expect(upsertCall?.create.refreshToken).toBe('fresh-refresh');
    expect(upsertCall?.create.status).toBe('connected');
    expect(upsertCall?.update.accessToken).toBe('fresh-access');

    // providerSettings must NOT carry the access/refresh tokens anymore.
    const wsUpdate = workspaceUpdate.mock.calls[0]?.[0];
    expect(wsUpdate?.data.providerSettings.googleAds?.accessToken).toBeUndefined();
    expect(wsUpdate?.data.providerSettings.googleAds?.refreshToken).toBeUndefined();
  });

  it('reports connected status from the canonical credential', async () => {
    const expiresAt = new Date('2026-01-01T00:00:00.000Z');
    const { service } = buildService(
      { googleAds: { customerIds: ['111'] } },
      {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt,
        loginCustomerId: '999',
        status: 'connected',
      },
    );

    const status = await service.getStatus('ws-1');

    expect(status.connected).toBe(true);
    expect(status.status).toBe('connected');
    expect(status.loginCustomerId).toBe('999');
    expect(status.expiresAt).toBe(expiresAt.toISOString());
    expect(status.customerIds).toEqual(['111']);
  });

  it('falls back to legacy providerSettings tokens for pre-unification workspaces', async () => {
    // No canonical credential → must read the legacy providerSettings token.
    const { service, workspaceUpdate } = buildService({
      googleAds: { connected: true, accessToken: 'legacy-access-token' },
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ resourceNames: ['customers/1234567890'] }), { status: 200 }),
      );

    const result = await service.listAccessibleCustomers('ws-1');

    expect(result).toEqual({ status: 'ok', customers: ['1234567890'] });
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall?.[0]).toBe(
      'https://googleads.googleapis.com/v24/customers:listAccessibleCustomers',
    );
    const headers = fetchCall?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer legacy-access-token');
    expect(headers?.['developer-token']).toBe('developer-token');

    const updateCall = workspaceUpdate.mock.calls[0]?.[0];
    expect(updateCall?.where).toEqual({ id: 'ws-1' });
    expect(updateCall?.data.providerSettings.googleAds?.customerIds).toEqual(['1234567890']);
  });

  it('prefers the canonical credential token over the legacy providerSettings token', async () => {
    const { service } = buildService(
      { googleAds: { connected: true, accessToken: 'legacy-access-token' } },
      {
        accessToken: 'canonical-access-token',
        refreshToken: 'refresh',
        expiresAt: null,
        loginCustomerId: null,
        status: 'connected',
      },
    );
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ resourceNames: ['customers/1234567890'] }), { status: 200 }),
      );

    await service.listAccessibleCustomers('ws-1');

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer canonical-access-token');
  });
});
