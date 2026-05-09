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
