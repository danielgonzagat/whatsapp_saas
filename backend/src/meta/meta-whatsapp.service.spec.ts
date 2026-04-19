import { MetaWhatsAppService } from './meta-whatsapp.service';
import { encryptMetaConnectionToken } from './meta-token-crypto';

describe('MetaWhatsAppService', () => {
  let prisma: any;
  let metaSdk: { graphApiGet: jest.Mock };
  let service: MetaWhatsAppService;
  const originalMetaAppId = process.env.META_APP_ID;
  const originalMetaGraphApiVersion = process.env.META_GRAPH_API_VERSION;
  const originalMetaEmbeddedSignupConfigId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
  const originalMetaConfigId = process.env.META_CONFIG_ID;
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
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

    service = new MetaWhatsAppService(prisma, metaSdk as any);
  });

  afterEach(() => {
    if (typeof originalMetaAppId === 'string') {
      process.env.META_APP_ID = originalMetaAppId;
    } else {
      delete process.env.META_APP_ID;
    }

    if (typeof originalMetaGraphApiVersion === 'string') {
      process.env.META_GRAPH_API_VERSION = originalMetaGraphApiVersion;
    } else {
      delete process.env.META_GRAPH_API_VERSION;
    }

    if (typeof originalMetaEmbeddedSignupConfigId === 'string') {
      process.env.META_EMBEDDED_SIGNUP_CONFIG_ID = originalMetaEmbeddedSignupConfigId;
    } else {
      delete process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
    }

    if (typeof originalMetaConfigId === 'string') {
      process.env.META_CONFIG_ID = originalMetaConfigId;
    } else {
      delete process.env.META_CONFIG_ID;
    }

    if (typeof originalEncryptionKey === 'string') {
      process.env.ENCRYPTION_KEY = originalEncryptionKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  it('prefers META_EMBEDDED_SIGNUP_CONFIG_ID in the Embedded Signup URL', () => {
    process.env.META_APP_ID = 'meta-app-id';
    process.env.META_GRAPH_API_VERSION = 'v21.0';
    process.env.META_EMBEDDED_SIGNUP_CONFIG_ID = 'embedded-config-id';
    process.env.META_CONFIG_ID = 'legacy-config-id';

    const url = service.buildEmbeddedSignupUrl('ws-1', {
      channel: 'whatsapp',
      returnTo: '/marketing/whatsapp',
    });

    expect(url).toContain('config_id=embedded-config-id');
    expect(url).not.toContain('config_id=legacy-config-id');
  });

  it('falls back to META_CONFIG_ID when the embedded-signup config env is absent', () => {
    process.env.META_APP_ID = 'meta-app-id';
    process.env.META_GRAPH_API_VERSION = 'v21.0';
    delete process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
    process.env.META_CONFIG_ID = 'legacy-config-id';

    const url = service.buildEmbeddedSignupUrl('ws-1');

    expect(url).toContain('config_id=legacy-config-id');
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
        qualityRating: null,
        codeVerificationStatus: null,
        nameStatus: null,
        selfIds: [],
      }),
    );
  });

  it('returns Meta phone health fields when the Graph API reports them', async () => {
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
      display_phone_number: '+55 11 99999-0000',
      verified_name: 'Kloel',
      quality_rating: 'GREEN',
      code_verification_status: 'VERIFIED',
      name_status: 'APPROVED',
    });

    const result = await service.getPhoneNumberDetails('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        status: 'CONNECTED',
        phoneNumber: '+55 11 99999-0000',
        pushName: 'Kloel',
        qualityRating: 'GREEN',
        codeVerificationStatus: 'VERIFIED',
        nameStatus: 'APPROVED',
        selfIds: ['5511999990000@c.us', '5511999990000@s.whatsapp.net'],
      }),
    );
  });

  it('decrypts persisted Meta access tokens before using them at runtime', async () => {
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    prisma.metaConnection.findUnique.mockResolvedValue({
      accessToken: encryptMetaConnectionToken('meta-token'),
      tokenExpiresAt: null,
      adAccountId: 'act-1',
      pageId: 'page-1',
      pageName: 'Pagina Teste',
      pageAccessToken: encryptMetaConnectionToken('meta-page-token'),
      instagramAccountId: 'ig-1',
      instagramUsername: 'kloel',
      whatsappPhoneNumberId: 'pnid-1',
      whatsappBusinessId: 'waba-1',
    });

    const result = await service.resolveConnection('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'meta-token',
        adAccountId: 'act-1',
        pageAccessToken: 'meta-page-token',
        instagramAccountId: 'ig-1',
        instagramUsername: 'kloel',
      }),
    );
  });
});
