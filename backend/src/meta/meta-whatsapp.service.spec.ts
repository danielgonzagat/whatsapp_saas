import type { PrismaService } from '../prisma/prisma.service';
import { MetaWhatsAppService } from './meta-whatsapp.service';

describe('MetaWhatsAppService', () => {
  let prisma: {
    metaConnection: {
      findUnique: jest.Mock;
    };
    workspace: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let metaSdk: { graphApiGet: jest.Mock };
  let service: MetaWhatsAppService;

  beforeEach(() => {
    delete process.env.META_APP_ID;
    delete process.env.META_CONFIG_ID;
    delete process.env.META_CONFIG_ID_FACEBOOK;
    delete process.env.META_CONFIG_ID_MESSENGER;
    delete process.env.META_CONFIG_ID_INSTAGRAM;
    delete process.env.META_GRAPH_API_VERSION;
    delete process.env.PUBLIC_BACKEND_URL;
    delete process.env.API_PUBLIC_URL;
    delete process.env.API_URL;
    delete process.env.APP_URL;
    delete process.env.BACKEND_PUBLIC_URL;
    delete process.env.BACKEND_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    delete process.env.SERVICE_BASE_URL;

    prisma = {
      metaConnection: {
        findUnique: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    metaSdk = {
      graphApiGet: jest.fn(),
    };

    service = new MetaWhatsAppService(prisma as never as PrismaService, metaSdk as never);
  });

  it('uses the Messenger config id when the operator opens the Facebook channel tab', () => {
    process.env.META_APP_ID = 'meta-app';
    process.env.META_CONFIG_ID = 'generic-config';
    process.env.META_CONFIG_ID_FACEBOOK = 'wrong-facebook-config';
    process.env.META_CONFIG_ID_MESSENGER = 'messenger-config';
    process.env.PUBLIC_BACKEND_URL = 'https://api.kloel.com';

    const url = service.buildEmbeddedSignupUrl('ws-1', { channel: 'facebook' });
    const params = new URL(url).searchParams;

    expect(params.get('config_id')).toBe('messenger-config');
  });

  it('keeps using the Instagram config id for Instagram channel setup', () => {
    process.env.META_APP_ID = 'meta-app';
    process.env.META_CONFIG_ID = 'generic-config';
    process.env.META_CONFIG_ID_INSTAGRAM = 'instagram-config';
    process.env.PUBLIC_BACKEND_URL = 'https://api.kloel.com';

    const url = service.buildEmbeddedSignupUrl('ws-1', { channel: 'instagram' });
    const params = new URL(url).searchParams;

    expect(params.get('config_id')).toBe('instagram-config');
  });

  it('uses explicit backend URL for Meta OAuth callbacks even when frontend URLs are configured', () => {
    process.env.APP_URL = 'https://app.kloel.com';
    process.env.NEXT_PUBLIC_API_URL = 'https://app.kloel.com/api';
    process.env.BACKEND_PUBLIC_URL = 'https://api.kloel.com';

    expect(service.getPublicBackendBaseUrl()).toBe('https://api.kloel.com');
    expect(service.getOAuthRedirectUri()).toBe('https://api.kloel.com/meta/auth/callback');
  });

  it('does not use frontend app URLs as Meta OAuth callbacks', () => {
    process.env.APP_URL = 'https://app.kloel.com';
    process.env.NEXT_PUBLIC_API_URL = 'https://app.kloel.com/api';

    expect(service.getPublicBackendBaseUrl()).toBe('http://localhost:3001');
    expect(service.getOAuthRedirectUri()).toBe('http://localhost:3001/meta/auth/callback');
  });

  it('normalizes backend domains without protocols for Meta callbacks', () => {
    process.env.BACKEND_URL = 'api.kloel.com';

    expect(service.getPublicBackendBaseUrl()).toBe('https://api.kloel.com');
  });

  it('keeps localhost backend callbacks on http', () => {
    process.env.BACKEND_URL = 'localhost:3001';

    expect(service.getPublicBackendBaseUrl()).toBe('http://localhost:3001');
  });

  it('accepts legacy frontend env names only when they point to a backend host', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.kloel.com';

    expect(service.getPublicBackendBaseUrl()).toBe('https://api.kloel.com');
  });

  it('ignores malformed legacy callback URLs', () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://[bad';

    expect(service.getPublicBackendBaseUrl()).toBe('http://localhost:3001');
  });

  it('builds the Meta signup URL with the backend OAuth callback', () => {
    process.env.META_APP_ID = '2208402546567386';
    process.env.META_CONFIG_ID = 'config-1';
    process.env.META_GRAPH_API_VERSION = 'v22.0';
    process.env.BACKEND_PUBLIC_URL = 'https://api.kloel.com';

    const authUrl = new URL(
      service.buildEmbeddedSignupUrl('workspace-1', {
        channel: 'whatsapp',
        returnTo: '/marketing/whatsapp',
      }),
    );

    expect(authUrl.origin).toBe('https://www.facebook.com');
    expect(authUrl.searchParams.get('client_id')).toBe('2208402546567386');
    expect(authUrl.searchParams.get('config_id')).toBe('config-1');
    expect(authUrl.searchParams.get('redirect_uri')).toBe(
      'https://api.kloel.com/meta/auth/callback',
    );
    expect(JSON.parse(authUrl.searchParams.get('state') || '{}')).toEqual({
      workspaceId: 'workspace-1',
      channel: 'whatsapp',
      returnTo: '/marketing/whatsapp',
    });
  });

  it('falls back to connected when webhook heartbeat sees malformed persisted status', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        whatsappApiSession: {
          status: { broken: true },
          phoneNumber: '5511999999999',
        },
      },
    });

    await service.touchWebhookHeartbeat('ws-1');

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            connectionStatus: 'connected',
            whatsappApiSession: expect.objectContaining({
              phoneNumber: '5511999999999',
              provider: 'meta-cloud',
              lastWebhookAt: expect.any(String),
            }),
          }),
        }),
      }),
    );
  });

  it('ignores malformed heartbeat patches instead of persisting object status values', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        whatsappApiSession: {
          status: 'connected',
        },
      },
    });

    await service.touchWebhookHeartbeat('ws-1', {
      status: { broken: true },
      phoneNumber: '5511888888888',
    });

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            connectionStatus: 'connected',
            whatsappApiSession: expect.objectContaining({
              status: 'connected',
              phoneNumber: '5511888888888',
            }),
          }),
        }),
      }),
    );
  });

  it('ignores malformed Meta phone details instead of stringifying objects', async () => {
    prisma.metaConnection.findUnique.mockResolvedValue({
      accessToken: 'meta-token',
      tokenExpiresAt: null,
      pageId: 'page-1',
      pageName: 'Pagina Teste',
      pageAccessToken: null,
      instagramAccountId: null,
      instagramUsername: null,
      whatsappPhoneNumberId: 'pnid-1',
      whatsappBusinessId: 'waba-1',
    });
    metaSdk.graphApiGet.mockResolvedValue({
      display_phone_number: { broken: true },
      verified_name: { broken: true },
    });

    const result = await service.getPhoneNumberDetails('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        status: 'CONNECTED',
        phoneNumber: null,
        pushName: 'Pagina Teste',
        selfIds: [],
      }),
    );
  });
});
