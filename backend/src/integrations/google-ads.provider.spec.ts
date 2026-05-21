import type { PrismaService } from '../prisma/prisma.service';
import { GoogleAdsProvider } from './google-ads.provider';

type IntegrationCredentialUpsertPayload = {
  where: unknown;
  create: { status?: string };
  update?: unknown;
};

describe('GoogleAdsProvider', () => {
  let provider: GoogleAdsProvider;
  let mockPrisma: {
    integrationCredential: {
      findUnique: jest.Mock;
      upsert: jest.MockedFunction<
        (payload: IntegrationCredentialUpsertPayload) => Promise<unknown>
      >;
      delete: jest.Mock;
      update: jest.Mock;
    };
    adAccount: {
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      integrationCredential: {
        findUnique: jest.fn(),
        upsert: jest.fn(async () => ({})),
        delete: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      adAccount: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    provider = new GoogleAdsProvider(mockPrisma as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('platform', () => {
    it('returns google', () => {
      expect(provider.platform).toBe('google');
    });
  });

  describe('connect', () => {
    it('returns not configured when GOOGLE_ADS_CLIENT_ID is missing', async () => {
      const original = process.env.GOOGLE_ADS_CLIENT_ID;
      delete process.env.GOOGLE_ADS_CLIENT_ID;
      const result = await provider.connect('ws-1', 'https://app.kloel.com/callback');
      expect(result.connected).toBe(false);
      expect(result.status).toBe('google_ads_client_id_not_configured');
      if (original) {
        process.env.GOOGLE_ADS_CLIENT_ID = original;
      }
    });

    it('returns authUrl with PKCE when configured', async () => {
      process.env.GOOGLE_ADS_CLIENT_ID = 'test-client-id';
      const result = await provider.connect('ws-1', 'https://app.kloel.com/callback');
      expect(result.connected).toBe(false);
      expect(result.status).toBe('pending_oauth');
      expect(result.authUrl).toContain('accounts.google.com');
      expect(result.authUrl).toContain('code_challenge_method=S256');
      expect(result.authUrl).toContain('code_challenge=');
      const upsertPayload = mockPrisma.integrationCredential.upsert.mock.calls[0]?.[0];
      expect(upsertPayload?.where).toEqual({
        workspaceId_platform: { workspaceId: 'ws-1', platform: 'google' },
      });
      expect(upsertPayload?.create.status).toBe('pending_oauth');
      delete process.env.GOOGLE_ADS_CLIENT_ID;
    });
  });

  describe('getStatus', () => {
    it('returns disconnected when no credential exists', async () => {
      mockPrisma.integrationCredential.findUnique.mockResolvedValue(null);
      const result = await provider.getStatus('ws-1');
      expect(result.connected).toBe(false);
      expect(result.status).toBe('disconnected');
    });

    it('returns connected when credential is active', async () => {
      mockPrisma.integrationCredential.findUnique.mockResolvedValue({
        status: 'connected',
        loginCustomerId: 'cid-123',
      });
      const result = await provider.getStatus('ws-1');
      expect(result.connected).toBe(true);
      expect(result.status).toBe('connected');
      expect(result.accountId).toBe('cid-123');
    });
  });

  describe('disconnect', () => {
    it('returns already_disconnected when no credential exists', async () => {
      mockPrisma.integrationCredential.findUnique.mockResolvedValue(null);
      const result = await provider.disconnect('ws-1');
      expect(result.status).toBe('already_disconnected');
    });

    it('deletes credential and returns disconnected', async () => {
      mockPrisma.integrationCredential.findUnique.mockResolvedValue({
        accessToken: 'plaintext-token',
      });
      const result = await provider.disconnect('ws-1');
      expect(result.status).toBe('disconnected');
      expect(mockPrisma.integrationCredential.delete).toHaveBeenCalledWith({
        where: { workspaceId_platform: { workspaceId: 'ws-1', platform: 'google' } },
      });
    });
  });

  describe('refreshToken', () => {
    it('returns null when no credential exists', async () => {
      mockPrisma.integrationCredential.findUnique.mockResolvedValue(null);
      const result = await provider.refreshToken('ws-1');
      expect(result).toBeNull();
    });

    it('returns null when no refresh token stored', async () => {
      mockPrisma.integrationCredential.findUnique.mockResolvedValue({
        refreshToken: null,
      });
      const result = await provider.refreshToken('ws-1');
      expect(result).toBeNull();
    });
  });

  describe('syncAccounts', () => {
    it('throws when no credential exists', async () => {
      mockPrisma.integrationCredential.findUnique.mockResolvedValue(null);
      await expect(provider.syncAccounts('ws-1')).rejects.toThrow('OAuth tokens missing');
    });
  });

  describe('syncCampaigns', () => {
    it('returns empty when no ad accounts exist', async () => {
      const result = await provider.syncCampaigns('ws-1');
      expect(result.campaigns).toEqual([]);
    });
  });

  describe('syncInsights', () => {
    it('returns empty when no ad accounts exist', async () => {
      const now = new Date();
      const result = await provider.syncInsights('ws-1', now, now);
      expect(result.insights).toEqual([]);
    });
  });
});
