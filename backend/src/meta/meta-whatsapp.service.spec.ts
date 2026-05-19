import type { PrismaService } from '../prisma/prisma.service';
import { MetaWhatsAppService } from './meta-whatsapp.service';

describe('MetaWhatsAppService', () => {
  let prisma: {
    metaConnection: {
      findFirst: jest.Mock;
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
    delete process.env.META_WHATSAPP_CONFIG_ID;
    delete process.env.META_INSTAGRAM_CONFIG_ID;
    delete process.env.META_FACEBOOK_CONFIG_ID;
    delete process.env.META_CONFIG_ID_FACEBOOK;
    delete process.env.META_CONFIG_ID_MESSENGER;
    delete process.env.META_CONFIG_ID_INSTAGRAM;
    delete process.env.META_CONFIG_ID_WHATSAPP;
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
        findFirst: jest.fn(),
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

  afterEach(() => {
    delete process.env.META_APP_ID;
    delete process.env.META_CONFIG_ID;
    delete process.env.META_WHATSAPP_CONFIG_ID;
    delete process.env.META_INSTAGRAM_CONFIG_ID;
    delete process.env.META_FACEBOOK_CONFIG_ID;
    delete process.env.META_CONFIG_ID_FACEBOOK;
    delete process.env.META_CONFIG_ID_MESSENGER;
    delete process.env.META_CONFIG_ID_INSTAGRAM;
    delete process.env.META_CONFIG_ID_WHATSAPP;
    delete process.env.META_GRAPH_API_VERSION;
    delete process.env.BACKEND_PUBLIC_URL;
  });

  it('builds WhatsApp Embedded Signup with channel-specific config and minimal scopes', () => {
    process.env.META_APP_ID = 'meta-app-id';
    process.env.META_CONFIG_ID = 'generic-config';
    process.env.META_WHATSAPP_CONFIG_ID = 'whatsapp-config';
    process.env.META_GRAPH_API_VERSION = 'v21.0';
    process.env.BACKEND_PUBLIC_URL = 'https://api.kloel.test/';

    const authUrl = new URL(
      service.buildEmbeddedSignupUrl('ws-1', {
        channel: 'whatsapp',
        returnTo: '/marketing/whatsapp',
      }),
    );

    expect(authUrl.origin + authUrl.pathname).toBe('https://www.facebook.com/v21.0/dialog/oauth');
    expect(authUrl.searchParams.get('config_id')).toBe('whatsapp-config');
    expect(authUrl.searchParams.get('redirect_uri')).toBe(
      'https://api.kloel.test/meta/auth/callback',
    );
    expect(authUrl.searchParams.get('extras')).toContain('sessionInfoVersion');
    const scopes = String(authUrl.searchParams.get('scope') || '').split(',');
    expect(scopes).toEqual(
      expect.arrayContaining([
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_metadata',
        'business_management',
        'whatsapp_business_management',
        'whatsapp_business_messaging',
      ]),
    );
    expect(scopes).not.toContain('instagram_content_publish');
    expect(scopes).not.toContain('catalog_management');
  });

  it('uses Instagram-specific config and scopes for Instagram OAuth', () => {
    process.env.META_APP_ID = 'meta-app-id';
    process.env.META_CONFIG_ID = 'generic-config';
    process.env.META_INSTAGRAM_CONFIG_ID = 'instagram-config';
    process.env.BACKEND_PUBLIC_URL = 'api.kloel.test';

    const authUrl = new URL(
      service.buildEmbeddedSignupUrl('ws-1', {
        channel: 'instagram',
        returnTo: '/marketing/instagram',
      }),
    );

    expect(authUrl.searchParams.get('config_id')).toBe('instagram-config');
    expect(authUrl.searchParams.get('redirect_uri')).toBe(
      'https://api.kloel.test/meta/auth/callback',
    );
    const scopes = String(authUrl.searchParams.get('scope') || '').split(',');
    expect(scopes).toEqual(
      expect.arrayContaining([
        'instagram_basic',
        'instagram_manage_messages',
        'instagram_manage_comments',
      ]),
    );
    expect(scopes).not.toContain('whatsapp_business_management');
    expect(authUrl.searchParams.get('extras')).toBeNull();
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
    prisma.metaConnection.findFirst.mockResolvedValue({
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
