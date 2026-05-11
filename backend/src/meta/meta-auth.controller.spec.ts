import type { PrismaService } from '../prisma/prisma.service';
import { MetaAuthController } from './meta-auth.controller';

describe('MetaAuthController', () => {
  let controller: MetaAuthController;
  let mockMetaSdk: { exchangeToken: jest.Mock; graphApiGet: jest.Mock; graphApiDelete: jest.Mock };
  let mockMetaWhatsApp: {
    buildEmbeddedSignupUrl: jest.Mock;
    getOAuthRedirectUri: jest.Mock;
    discoverWhatsAppAssets: jest.Mock;
  };
  let mockPrisma: {
    metaConnection: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };

  const authReq = { user: { workspaceId: 'ws-1' } };
  const missingAuthReq = { user: { workspaceId: 'ws-none' } };

  beforeEach(() => {
    mockMetaSdk = {
      exchangeToken: jest.fn().mockResolvedValue({
        access_token: 'long-lived-token-xxx',
        expires_in: 5184000,
      }),
      graphApiGet: jest.fn().mockResolvedValue({
        data: [{ id: 'page-1', name: 'Test Page', access_token: 'page-token' }],
      }),
      graphApiDelete: jest.fn().mockResolvedValue({ success: true }),
    };

    mockMetaWhatsApp = {
      buildEmbeddedSignupUrl: jest.fn().mockReturnValue('https://fb.com/oauth?state=ws-1'),
      getOAuthRedirectUri: jest.fn().mockReturnValue('https://app.kloel.com/meta/auth/callback'),
      discoverWhatsAppAssets: jest.fn().mockResolvedValue({
        whatsappPhoneNumberId: null,
        whatsappBusinessId: null,
      }),
    };

    mockPrisma = {
      metaConnection: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({
          workspaceId: 'ws-1',
          accessToken: 'encrypted-token',
          status: 'connected',
          pageId: 'page-1',
          pageName: 'Test Page',
          instagramAccountId: null,
          instagramUsername: null,
          adAccountId: null,
          pixelId: null,
          catalogId: null,
          tokenExpiresAt: new Date(Date.now() + 86400000),
          connectedAt: new Date(),
          updatedAt: new Date(),
        }),
        delete: jest.fn().mockResolvedValue({}),
      },
    };

    controller = new MetaAuthController(
      mockMetaSdk as never,
      mockMetaWhatsApp as never,
      mockPrisma as never as PrismaService,
      undefined,
    );
  });

  describe('parseState', () => {
    it('parses JSON state from encoded URI', () => {
      const result = (
        controller as unknown as {
          parseState: (s: string) => {
            workspaceId: string;
            channel?: string | null;
            returnTo?: string | null;
          };
        }
      ).parseState(
        encodeURIComponent(JSON.stringify({ workspaceId: 'ws-1', channel: 'whatsapp' })),
      );

      expect(result.workspaceId).toBe('ws-1');
      expect(result.channel).toBe('whatsapp');
    });

    it('falls back to raw string when not JSON', () => {
      const result = (
        controller as unknown as {
          parseState: (s: string) => { workspaceId: string };
        }
      ).parseState('plain-state');

      expect(result.workspaceId).toBe('plain-state');
    });

    it('returns empty workspaceId for empty state', () => {
      const result = (
        controller as unknown as {
          parseState: (s: string) => { workspaceId: string };
        }
      ).parseState('');

      expect(result.workspaceId).toBe('');
    });
  });

  describe('getAuthUrl', () => {
    it('returns OAuth URL from metaWhatsApp service', () => {
      const result = controller.getAuthUrl(authReq as never, undefined, undefined);

      expect(result.url).toBeDefined();
      expect(mockMetaWhatsApp.buildEmbeddedSignupUrl).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns connected status when MetaConnection exists', async () => {
      const result = await controller.getStatus(authReq as never);

      expect(result.connected).toBe(true);
      expect(result).toHaveProperty('channels');
      if ('channels' in result) {
        expect(result.channels.facebook).toEqual(
          expect.objectContaining({
            connected: true,
            pageId: 'page-1',
            status: 'connected',
          }),
        );
      }
    });

    it('returns disconnected when no MetaConnection', async () => {
      mockPrisma.metaConnection.findUnique.mockResolvedValue(null);

      const result = await controller.getStatus(missingAuthReq as never);

      expect(result.connected).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('removes MetaConnection and returns disconnected', async () => {
      const result = await controller.disconnect(authReq as never);

      expect(result.status).toBe('disconnected');
      expect(mockPrisma.metaConnection.delete).toHaveBeenCalled();
    });

    it('throws 404 when no MetaConnection exists', async () => {
      mockPrisma.metaConnection.findUnique.mockResolvedValue(null);

      await expect(controller.disconnect(missingAuthReq as never)).rejects.toThrow(
        'No Meta connection found',
      );
    });
  });
});
